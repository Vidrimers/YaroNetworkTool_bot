#!/usr/bin/env node
/**
 * Torrent Detector
 * Упрощенное обнаружение торрентов на основе аномального трафика
 * Отправляет предупреждения при подозрительной активности
 */

import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import APIClient from "./utils/api-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем .env из корня проекта
dotenv.config({ path: join(__dirname, '..', '.env') });

// Конфигурация
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_ADMIN_ID = parseInt(process.env.TELEGRAM_ADMIN_ID);
const DAILY_TRAFFIC_THRESHOLD_GB = 30; // Порог подозрительного трафика в день (30 GB)
const MAX_WARNINGS = 3; // Максимальное количество предупреждений перед блокировкой

if (!TELEGRAM_BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN не установлен в .env");
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN);
const apiClient = new APIClient();

// Вспомогательная функция для форматирования размера
function formatBytes(bytes) {
  if (bytes === 0) return '0 GB';
  const gb = bytes / (1024 * 1024 * 1024);
  return gb.toFixed(2) + ' GB';
}

// Основная функция обнаружения торрентов
async function detectTorrents() {
  console.log(`\n[${new Date().toISOString()}] Запуск обнаружения торрентов...`);

  try {
    // Получаем всех активных клиентов
    const response = await apiClient.getClients();
    const clients = response.clients || [];
    const activeClients = clients.filter(c => c.status === "active");

    if (activeClients.length === 0) {
      console.log("Нет активных клиентов для проверки");
      return;
    }

    const suspiciousClients = [];
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Проверяем каждого клиента
    for (const client of activeClients) {
      // Получаем трафик за последние 24 часа
      // Примечание: это упрощенная проверка на основе общего трафика
      // В реальности нужно отслеживать дневной прирост трафика
      
      const trafficUsedGB = client.traffic_used_gb || 0;
      const trafficResetDate = new Date(client.traffic_reset_date);
      
      // Вычисляем дни с момента сброса трафика
      const daysSinceReset = Math.max(1, Math.ceil((now - trafficResetDate) / (1000 * 60 * 60 * 24)));
      
      // Средний дневной трафик
      const avgDailyTraffic = trafficUsedGB / daysSinceReset;

      // Проверяем превышение порога
      if (avgDailyTraffic > DAILY_TRAFFIC_THRESHOLD_GB) {
        // Получаем количество предупреждений (из поля в БД или создаем новое)
        const warningCount = client.torrent_warnings || 0;

        suspiciousClients.push({
          client,
          avgDailyTraffic: avgDailyTraffic.toFixed(2),
          warningCount
        });

        console.log(`⚠️ Подозрительная активность: ${client.name} - ${avgDailyTraffic.toFixed(2)} GB/день (порог: ${DAILY_TRAFFIC_THRESHOLD_GB} GB)`);
      }
    }

    // Обрабатываем подозрительных клиентов
    for (const suspicious of suspiciousClients) {
      const { client, avgDailyTraffic, warningCount } = suspicious;
      const newWarningCount = warningCount + 1;

      // Обновляем счетчик предупреждений в БД
      try {
        await apiClient.updateClient(client.uuid, {
          torrent_warnings: newWarningCount
        });
      } catch (err) {
        console.error(`Ошибка обновления счетчика предупреждений для ${client.name}:`, err);
      }

      // Проверяем, нужно ли блокировать клиента
      if (newWarningCount >= MAX_WARNINGS) {
        console.log(`🚫 Блокировка клиента ${client.name} за превышение лимита предупреждений (${newWarningCount}/${MAX_WARNINGS})`);

        // Блокируем клиента
        try {
          await apiClient.updateClient(client.uuid, { status: "blocked" });
          console.log(`Клиент ${client.name} заблокирован в БД`);
        } catch (err) {
          console.error(`Ошибка блокировки клиента ${client.name}:`, err);
        }

        // Уведомляем клиента о блокировке
        if (client.telegram_id) {
          const clientMessage =
            `🚫 <b>Доступ заблокирован</b>\n\n` +
            `Твой аккаунт заблокирован за нарушение правил использования VPN.\n\n` +
            `<b>Причина:</b> Подозрение на использование торрентов\n` +
            `<b>Средний трафик:</b> ${avgDailyTraffic} GB/день\n` +
            `<b>Предупреждений:</b> ${newWarningCount}/${MAX_WARNINGS}\n\n` +
            `⚠️ <b>Напоминаем:</b> Использование торрентов через VPN запрещено правилами сервиса.\n\n` +
            `Для разблокировки обратись к администратору.`;

          bot.sendMessage(client.telegram_id, clientMessage, { parse_mode: "HTML" })
            .catch(err => console.error(`Ошибка отправки уведомления клиенту ${client.telegram_id}:`, err));
        }

        // Уведомляем админа о блокировке
        if (TELEGRAM_ADMIN_ID) {
          const adminMessage =
            `🚫 <b>Клиент заблокирован за торренты</b>\n\n` +
            `👤 <b>Клиент:</b> ${client.name}\n` +
            `🆔 <b>UUID:</b> <code>${client.uuid}</code>\n` +
            `📱 <b>Telegram:</b> ${client.telegram_id ? `@${client.telegram_id}` : "не указан"}\n\n` +
            `📊 <b>Средний трафик:</b> ${avgDailyTraffic} GB/день\n` +
            `⚠️ <b>Предупреждений:</b> ${newWarningCount}/${MAX_WARNINGS}\n\n` +
            `✅ Клиент автоматически заблокирован`;

          bot.sendMessage(TELEGRAM_ADMIN_ID, adminMessage, { parse_mode: "HTML" })
            .catch(err => console.error("Ошибка отправки уведомления админу:", err));
        }

      } else {
        // Отправляем предупреждение клиенту
        if (client.telegram_id) {
          const clientMessage =
            `⚠️ <b>Предупреждение ${newWarningCount}/${MAX_WARNINGS}</b>\n\n` +
            `Обнаружена подозрительная активность на твоем аккаунте.\n\n` +
            `📊 <b>Средний трафик:</b> ${avgDailyTraffic} GB/день\n` +
            `🚨 <b>Порог:</b> ${DAILY_TRAFFIC_THRESHOLD_GB} GB/день\n\n` +
            `⚠️ <b>Возможная причина:</b> Использование торрентов\n\n` +
            `📋 <b>Правила:</b>\n` +
            `• Торренты через VPN запрещены\n` +
            `• При ${MAX_WARNINGS} предупреждениях аккаунт будет заблокирован\n\n` +
            `💡 <b>Рекомендация:</b> Прекрати использование торрентов, чтобы избежать блокировки.`;

          bot.sendMessage(client.telegram_id, clientMessage, { parse_mode: "HTML" })
            .catch(err => console.error(`Ошибка отправки предупреждения клиенту ${client.telegram_id}:`, err));
        }

        // Уведомляем админа о предупреждении
        if (TELEGRAM_ADMIN_ID) {
          const adminMessage =
            `⚠️ <b>Предупреждение клиенту о торрентах</b>\n\n` +
            `👤 <b>Клиент:</b> ${client.name}\n` +
            `🆔 <b>UUID:</b> <code>${client.uuid}</code>\n` +
            `📱 <b>Telegram:</b> ${client.telegram_id ? `@${client.telegram_id}` : "не указан"}\n\n` +
            `📊 <b>Средний трафик:</b> ${avgDailyTraffic} GB/день\n` +
            `⚠️ <b>Предупреждение:</b> ${newWarningCount}/${MAX_WARNINGS}\n\n` +
            `${newWarningCount === MAX_WARNINGS - 1 ? '🚨 <b>Следующее нарушение приведет к блокировке!</b>' : ''}`;

          bot.sendMessage(TELEGRAM_ADMIN_ID, adminMessage, { parse_mode: "HTML" })
            .catch(err => console.error("Ошибка отправки уведомления админу:", err));
        }
      }
    }

    console.log(`\nИтого:`);
    console.log(`- Всего активных клиентов: ${activeClients.length}`);
    console.log(`- Подозрительная активность: ${suspiciousClients.length}`);
    
    if (suspiciousClients.length > 0) {
      console.log(`\nКлиенты с подозрительной активностью:`);
      suspiciousClients.forEach((s, i) => {
        const status = s.warningCount + 1 >= MAX_WARNINGS ? 'ЗАБЛОКИРОВАН' : `Предупреждение ${s.warningCount + 1}/${MAX_WARNINGS}`;
        console.log(`${i + 1}. ${s.client.name} - ${s.avgDailyTraffic} GB/день (${status})`);
      });
    }
    
    console.log(`Проверка завершена\n`);

  } catch (error) {
    console.error("Ошибка обнаружения торрентов:", error);
    
    // Уведомляем админа об ошибке
    if (TELEGRAM_ADMIN_ID) {
      bot.sendMessage(
        TELEGRAM_ADMIN_ID,
        `❌ <b>Ошибка обнаружения торрентов</b>\n\n` +
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

// Запускаем обнаружение
detectTorrents();
