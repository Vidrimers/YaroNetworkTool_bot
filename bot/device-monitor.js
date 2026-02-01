#!/usr/bin/env node
/**
 * Device Monitor
 * Отслеживает количество активных устройств для каждого клиента
 * Отправляет уведомления админу при превышении лимита (>2 устройств)
 */

import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import { exec } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import APIClient from "./utils/api-client.js";
import TrafficLogModel from "../../database/models/traffic-log.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const execAsync = promisify(exec);

// Загружаем .env из корня проекта
dotenv.config({ path: join(__dirname, '..', '.env') });

// Конфигурация
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_ADMIN_ID = parseInt(process.env.TELEGRAM_ADMIN_ID);
const XRAY_LOG_PATH = process.env.XRAY_LOG_PATH || "/var/log/xray/access.log";
const DEVICE_LIMIT = 2; // Лимит устройств по умолчанию
const ACTIVE_WINDOW_MINUTES = 5; // Считаем устройство активным, если было подключение за последние 5 минут

if (!TELEGRAM_BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN не установлен в .env");
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN);
const apiClient = new APIClient();

// Инициализируем модель для записи трафика
const DB_PATH = process.env.DB_PATH || join(__dirname, '..', '..', 'database', 'vpn.db');
const trafficLogModel = new TrafficLogModel(DB_PATH);

// Функция для парсинга логов X-Ray и подсчета активных устройств
async function getActiveDevices() {
  try {
    // Проверяем, запущен ли бот локально (Windows) или на сервере (Linux)
    const isWindows = process.platform === 'win32';
    
    if (isWindows) {
      // Локальный запуск на Windows - возвращаем пустой объект
      // На сервере Linux все будет работать нормально
      console.log('[getActiveDevices] Локальный запуск на Windows - мониторинг устройств недоступен');
      console.log('[getActiveDevices] На сервере Linux мониторинг будет работать');
      return {};
    }
    
    // Получаем всех клиентов из API для маппинга имя -> UUID
    const clientsResponse = await apiClient.getClients();
    const clients = clientsResponse.clients || [];
    const nameToUuid = new Map();
    
    clients.forEach(client => {
      nameToUuid.set(client.name, client.uuid);
    });
    
    console.log(`[getActiveDevices] Загружено клиентов из API: ${clients.length}`);
    
    // Запуск на сервере Linux - читаем логи напрямую
    const isRoot = process.getuid && process.getuid() === 0;
    const sudoPrefix = isRoot ? "" : "sudo ";
    const { stdout } = await execAsync(`${sudoPrefix}tail -n 1000 ${XRAY_LOG_PATH}`);
    
    console.log(`[getActiveDevices] Прочитано строк лога: ${stdout.split('\n').length}`);
    
    const now = Date.now();
    const activeWindowMs = ACTIVE_WINDOW_MINUTES * 60 * 1000;
    const devicesByClient = new Map();
    const trafficByClient = new Map(); // Для подсчета трафика

    // Парсим каждую строку лога
    const lines = stdout.split('\n');
    let acceptedLines = 0;
    let parsedLines = 0;
    
    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        // Формат лога X-Ray: 2026/01/27 11:36:04.531652 from 85.172.103.228:2951 accepted tcp:1.1.1.1:853 [direct] email: Бим
        // Ищем строки с accepted connection
        if (!line.includes('accepted')) continue;
        acceptedLines++;
        
        // Логируем первые 3 строки для отладки
        if (acceptedLines <= 3) {
          console.log(`[getActiveDevices] Пример строки лога: ${line.substring(0, 200)}`);
        }

        // Извлекаем имя клиента (формат: email: Имя)
        const nameMatch = line.match(/email:\s*(.+?)$/);
        if (!nameMatch) {
          if (acceptedLines <= 3) console.log(`[getActiveDevices] Имя клиента не найдено`);
          continue;
        }

        const clientName = nameMatch[1].trim();
        
        // Получаем UUID по имени
        const uuid = nameToUuid.get(clientName);
        if (!uuid) {
          if (acceptedLines <= 3) console.log(`[getActiveDevices] UUID не найден для клиента: ${clientName}`);
          continue;
        }

        // Извлекаем IP адрес (формат: from IP:port)
        const ipMatch = line.match(/from\s+(\d+\.\d+\.\d+\.\d+)/);
        if (!ipMatch) {
          if (acceptedLines <= 3) console.log(`[getActiveDevices] IP не найден`);
          continue;
        }

        const ip = ipMatch[1];

        // Извлекаем timestamp (формат: 2026/01/27 11:36:04.531652)
        const timeMatch = line.match(/^(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})/);
        if (!timeMatch) {
          if (acceptedLines <= 3) console.log(`[getActiveDevices] Timestamp не найден`);
          continue;
        }

        const timestamp = new Date(timeMatch[1].replace(/\//g, '-')).getTime();

        // Проверяем, что подключение было в пределах активного окна
        if (now - timestamp > activeWindowMs) {
          if (acceptedLines <= 3) console.log(`[getActiveDevices] Подключение слишком старое: ${new Date(timestamp).toISOString()}`);
          continue;
        }

        parsedLines++;
        
        // Добавляем устройство (IP) к клиенту
        if (!devicesByClient.has(uuid)) {
          devicesByClient.set(uuid, new Set());
        }
        devicesByClient.get(uuid).add(ip);

        // Подсчитываем трафик (примерно 1KB на соединение, так как в логах нет точных данных)
        // Это приблизительная оценка для статистики
        if (!trafficByClient.has(uuid)) {
          trafficByClient.set(uuid, 0);
        }
        trafficByClient.set(uuid, trafficByClient.get(uuid) + 1024); // +1KB на соединение

      } catch (err) {
        // Пропускаем строки с ошибками парсинга
        continue;
      }
    }
    
    console.log(`[getActiveDevices] Строк с 'accepted': ${acceptedLines}`);
    console.log(`[getActiveDevices] Успешно распарсено: ${parsedLines}`);
    console.log(`[getActiveDevices] Найдено клиентов с устройствами: ${devicesByClient.size}`);

    // Записываем трафик в БД
    const today = new Date().toISOString().split('T')[0];
    for (const [uuid, bytes] of trafficByClient.entries()) {
      try {
        await trafficLogModel.add({
          client_uuid: uuid,
          date: today,
          bytes_uploaded: Math.floor(bytes / 2), // Примерно половина upload
          bytes_downloaded: Math.floor(bytes / 2), // Примерно половина download
          connections_count: 1
        });
      } catch (err) {
        console.error(`[getActiveDevices] Ошибка записи трафика для ${uuid}:`, err.message);
      }
    }

    // Преобразуем Map в объект с количеством устройств
    const result = {};
    for (const [uuid, ips] of devicesByClient.entries()) {
      result[uuid] = {
        count: ips.size,
        ips: Array.from(ips)
      };
      console.log(`[getActiveDevices] ${uuid}: ${ips.size} устройств (${Array.from(ips).join(', ')})`);
    }

    return result;

  } catch (error) {
    console.error("[getActiveDevices] Ошибка чтения логов X-Ray:", error.message);
    return {};
  }
}

// Основная функция мониторинга устройств
async function monitorDevices() {
  console.log(`\n[${new Date().toISOString()}] Запуск мониторинга устройств...`);

  try {
    // Получаем всех активных клиентов
    const response = await apiClient.getClients();
    const clients = response.clients || [];
    const activeClients = clients.filter(c => c.status === "active");

    if (activeClients.length === 0) {
      console.log("Нет активных клиентов для мониторинга");
      return;
    }

    // Получаем информацию об активных устройствах
    const deviceInfo = await getActiveDevices();

    const warnings = [];

    // Проверяем каждого клиента
    for (const client of activeClients) {
      const devices = deviceInfo[client.uuid];
      
      if (!devices) {
        // Клиент не подключался в последние 5 минут
        continue;
      }

      const deviceCount = devices.count;

      // Проверяем превышение лимита
      if (deviceCount > DEVICE_LIMIT) {
        warnings.push({
          client,
          deviceCount,
          ips: devices.ips
        });

        console.log(`⚠️ Превышение лимита устройств: ${client.name} - ${deviceCount} устройств (лимит: ${DEVICE_LIMIT})`);
        console.log(`   IP адреса: ${devices.ips.join(', ')}`);
      }
    }

    // Отправляем уведомления админу
    for (const warning of warnings) {
      const { client, deviceCount, ips } = warning;

      if (TELEGRAM_ADMIN_ID) {
        const adminMessage =
          `⚠️ <b>Превышен лимит устройств</b>\n\n` +
          `👤 <b>Клиент:</b> ${client.name}\n` +
          `🆔 <b>UUID:</b> <code>${client.uuid}</code>\n` +
          `📱 <b>Telegram:</b> ${client.telegram_id ? `@${client.telegram_id}` : "не указан"}\n\n` +
          `📊 <b>Активных устройств:</b> ${deviceCount} (лимит: ${DEVICE_LIMIT})\n` +
          `🌐 <b>IP адреса:</b>\n${ips.map(ip => `   • ${ip}`).join('\n')}\n\n` +
          `💡 <i>Возможно, клиент передал ключ другим лицам</i>`;

        bot.sendMessage(TELEGRAM_ADMIN_ID, adminMessage, { parse_mode: "HTML" })
          .catch(err => console.error("Ошибка отправки уведомления админу:", err));
      }
    }

    console.log(`\nИтого:`);
    console.log(`- Всего активных клиентов: ${activeClients.length}`);
    console.log(`- Клиентов с активными подключениями: ${Object.keys(deviceInfo).length}`);
    console.log(`- Превысили лимит устройств: ${warnings.length}`);
    
    if (warnings.length > 0) {
      console.log(`\nКлиенты с превышением:`);
      warnings.forEach((w, i) => {
        console.log(`${i + 1}. ${w.client.name} - ${w.deviceCount} устройств`);
      });
    }
    
    console.log(`Проверка завершена\n`);

  } catch (error) {
    console.error("Ошибка мониторинга устройств:", error);
    
    // Уведомляем админа об ошибке
    if (TELEGRAM_ADMIN_ID) {
      bot.sendMessage(
        TELEGRAM_ADMIN_ID,
        `❌ <b>Ошибка мониторинга устройств</b>\n\n` +
          `<code>${error.message}</code>`,
        { parse_mode: "HTML" }
      ).catch(err => console.error("Ошибка отправки уведомления об ошибке:", err));
    }
  }

  // Даем время на отправку всех сообщений
  setTimeout(() => {
    process.exit(0);
  }, 5000);
}

// Экспортируем функцию для использования в боте
export { getActiveDevices };

// Запускаем мониторинг, если скрипт запущен напрямую
if (import.meta.url === `file://${process.argv[1]}`) {
  monitorDevices();
}
