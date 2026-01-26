#!/usr/bin/env node
/**
 * Traffic Checker
 * Проверяет использование трафика клиентами и отправляет уведомления при превышении 80% лимита
 * Запускается через cron несколько раз в день
 */

import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import APIClient from "./utils/api-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем .env из корня проекта (на уровень выше)
dotenv.config({ path: join(__dirname, '..', '.env') });

// Конфигурация
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_ADMIN_ID = parseInt(process.env.TELEGRAM_ADMIN_ID);
const TRAFFIC_WARNING_THRESHOLD = 0.8; // 80%

if (!TELEGRAM_BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN не установлен в .env");
  console.error("Путь к .env:", join(__dirname, '..', '.env'));
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

// Основная функция проверки трафика
async function checkTraffic() {
  console.log(`\n[${new Date().toISOString()}] Запуск проверки трафика...`);

  try {
    // Получаем всех клиентов
    const response = await apiClient.getClients();
    const clients = response.clients || [];

    if (clients.length === 0) {
      console.log("Нет клиентов для проверки");
      return;
    }

    const warnings = [];

    // Проверяем каждого клиента
    for (const client of clients) {
      if (client.status !== "active") {
        continue; // Пропускаем заблокированных
      }

      const trafficUsedGB = client.traffic_used_gb || 0;
      const trafficLimitGB = client.traffic_limit_gb || 100;
      const usagePercent = (trafficUsedGB / trafficLimitGB) * 100;

      // Проверяем, превышен ли порог 80%
      if (usagePercent >= (TRAFFIC_WARNING_THRESHOLD * 100)) {
        const remainingGB = trafficLimitGB - trafficUsedGB;
        
        warnings.push({
          client,
          trafficUsedGB,
          trafficLimitGB,
          usagePercent: usagePercent.toFixed(1),
          remainingGB: remainingGB.toFixed(2)
        });

        console.log(`⚠️ Превышение лимита: ${client.name} - ${usagePercent.toFixed(1)}% (${formatBytes(trafficUsedGB * 1024 * 1024 * 1024)} из ${trafficLimitGB} GB)`);
      }
    }

    // Отправляем уведомления
    for (const warning of warnings) {
      const { client, trafficUsedGB, trafficLimitGB, usagePercent, remainingGB } = warning;

      // Уведомляем клиента
      if (client.telegram_id) {
        const clientMessage = 
          `⚠️ <b>Предупреждение о трафике</b>\n\n` +
          `Ты использовал <b>${usagePercent}%</b> от лимита трафика!\n\n` +
          `📊 <b>Использовано:</b> ${formatBytes(trafficUsedGB * 1024 * 1024 * 1024)}\n` +
          `📈 <b>Лимит:</b> ${trafficLimitGB} GB\n` +
          `📉 <b>Осталось:</b> ${remainingGB} GB\n\n` +
          `${usagePercent >= 95 ? 
            '🚨 <b>Внимание!</b> При превышении лимита доступ будет заблокирован!' : 
            '💡 <b>Совет:</b> Следи за расходом трафика, чтобы избежать блокировки.'}`;

        bot.sendMessage(client.telegram_id, clientMessage, { parse_mode: "HTML" })
          .catch(err => console.error(`Ошибка отправки уведомления клиенту ${client.telegram_id}:`, err));
      }

      // Уведомляем админа
      if (TELEGRAM_ADMIN_ID) {
        const adminMessage =
          `⚠️ <b>Клиент превысил ${TRAFFIC_WARNING_THRESHOLD * 100}% лимита трафика</b>\n\n` +
          `👤 <b>Клиент:</b> ${client.name}\n` +
          `🆔 <b>UUID:</b> <code>${client.uuid}</code>\n` +
          `📱 <b>Telegram:</b> ${client.telegram_id ? `@${client.telegram_id}` : "не указан"}\n\n` +
          `📊 <b>Использовано:</b> ${formatBytes(trafficUsedGB * 1024 * 1024 * 1024)} (<b>${usagePercent}%</b>)\n` +
          `📈 <b>Лимит:</b> ${trafficLimitGB} GB\n` +
          `📉 <b>Осталось:</b> ${remainingGB} GB`;

        bot.sendMessage(TELEGRAM_ADMIN_ID, adminMessage, { parse_mode: "HTML" })
          .catch(err => console.error("Ошибка отправки уведомления админу:", err));
      }
    }

    console.log(`\nИтого:`);
    console.log(`- Всего клиентов: ${clients.filter(c => c.status === "active").length}`);
    console.log(`- Превысили ${TRAFFIC_WARNING_THRESHOLD * 100}% лимита: ${warnings.length}`);
    
    if (warnings.length > 0) {
      console.log(`\nКлиенты с превышением:`);
      warnings.forEach((w, i) => {
        console.log(`${i + 1}. ${w.client.name} - ${w.usagePercent}% (${formatBytes(w.trafficUsedGB * 1024 * 1024 * 1024)} из ${w.trafficLimitGB} GB)`);
      });
    }
    
    console.log(`Проверка завершена\n`);

  } catch (error) {
    console.error("Ошибка проверки трафика:", error);
    
    // Уведомляем админа об ошибке
    if (TELEGRAM_ADMIN_ID) {
      bot.sendMessage(
        TELEGRAM_ADMIN_ID,
        `❌ <b>Ошибка проверки трафика</b>\n\n` +
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

// Запускаем проверку
checkTraffic();
