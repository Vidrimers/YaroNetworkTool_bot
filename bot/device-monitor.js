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

// Функция для парсинга логов X-Ray и подсчета активных устройств
async function getActiveDevices() {
  try {
    const isRoot = process.getuid && process.getuid() === 0;
    const sudoPrefix = isRoot ? "" : "sudo ";

    // Читаем последние 1000 строк лога (достаточно для анализа последних 5 минут)
    const { stdout } = await execAsync(`${sudoPrefix}tail -n 1000 ${XRAY_LOG_PATH}`);
    
    const now = Date.now();
    const activeWindowMs = ACTIVE_WINDOW_MINUTES * 60 * 1000;
    const devicesByClient = new Map();

    // Парсим каждую строку лога
    const lines = stdout.split('\n');
    
    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        // Формат лога X-Ray: timestamp [level] message
        // Ищем строки с accepted connection
        if (!line.includes('accepted')) continue;

        // Извлекаем UUID клиента (формат: email:uuid@domain или просто uuid)
        const uuidMatch = line.match(/email:([a-f0-9-]{36})|([a-f0-9-]{36})/i);
        if (!uuidMatch) continue;

        const uuid = uuidMatch[1] || uuidMatch[2];

        // Извлекаем IP адрес (формат: from IP:port)
        const ipMatch = line.match(/from\s+(\d+\.\d+\.\d+\.\d+)/);
        if (!ipMatch) continue;

        const ip = ipMatch[1];

        // Извлекаем timestamp (формат: 2026/01/26 12:00:00)
        const timeMatch = line.match(/(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})/);
        if (!timeMatch) continue;

        const timestamp = new Date(timeMatch[1].replace(/\//g, '-')).getTime();

        // Проверяем, что подключение было в пределах активного окна
        if (now - timestamp > activeWindowMs) continue;

        // Добавляем устройство (IP) к клиенту
        if (!devicesByClient.has(uuid)) {
          devicesByClient.set(uuid, new Set());
        }
        devicesByClient.get(uuid).add(ip);

      } catch (err) {
        // Пропускаем строки с ошибками парсинга
        continue;
      }
    }

    // Преобразуем Map в объект с количеством устройств
    const result = {};
    for (const [uuid, ips] of devicesByClient.entries()) {
      result[uuid] = {
        count: ips.size,
        ips: Array.from(ips)
      };
    }

    return result;

  } catch (error) {
    console.error("Ошибка чтения логов X-Ray:", error.message);
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
