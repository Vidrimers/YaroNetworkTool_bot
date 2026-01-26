#!/usr/bin/env node
/**
 * Traffic Reset
 * Ежемесячный сброс счетчика трафика для всех клиентов
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

if (!TELEGRAM_BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN не установлен в .env");
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN);
const apiClient = new APIClient();

// Основная функция сброса трафика
async function resetTraffic() {
  console.log(`\n[${new Date().toISOString()}] Запуск ежемесячного сброса трафика...`);

  try {
    // Получаем всех клиентов
    const response = await apiClient.getClients();
    const clients = response.clients || [];

    if (clients.length === 0) {
      console.log("Нет клиентов для сброса трафика");
      return;
    }

    let successCount = 0;
    let errorCount = 0;
    const resetClients = [];

    // Сбрасываем трафик для каждого клиента
    for (const client of clients) {
      try {
        const oldTraffic = client.traffic_used_gb || 0;
        
        // Сбрасываем трафик через API
        await apiClient.updateClient(client.uuid, {
          traffic_used_gb: 0,
          traffic_reset_date: new Date().toISOString()
        });

        successCount++;
        resetClients.push({
          name: client.name,
          uuid: client.uuid,
          oldTraffic: oldTraffic.toFixed(2)
        });

        console.log(`✅ ${client.name}: ${oldTraffic.toFixed(2)} GB → 0 GB`);
      } catch (err) {
        errorCount++;
        console.error(`❌ Ошибка сброса трафика для ${client.name}:`, err.message);
      }
    }

    console.log(`\nИтого:`);
    console.log(`- Всего клиентов: ${clients.length}`);
    console.log(`- Успешно сброшено: ${successCount}`);
    console.log(`- Ошибок: ${errorCount}`);

    // Отправляем отчет админу
    if (TELEGRAM_ADMIN_ID && successCount > 0) {
      let adminMessage = `📊 <b>Ежемесячный сброс трафика</b>\n\n`;
      adminMessage += `✅ Трафик сброшен для ${successCount} клиентов\n\n`;
      
      if (resetClients.length > 0) {
        adminMessage += `<b>Детали:</b>\n`;
        resetClients.slice(0, 10).forEach((c, i) => {
          adminMessage += `${i + 1}. ${c.name}: ${c.oldTraffic} GB → 0 GB\n`;
        });
        
        if (resetClients.length > 10) {
          adminMessage += `\n... и еще ${resetClients.length - 10} клиентов`;
        }
      }
      
      if (errorCount > 0) {
        adminMessage += `\n\n⚠️ Ошибок: ${errorCount}`;
      }

      bot.sendMessage(TELEGRAM_ADMIN_ID, adminMessage, { parse_mode: "HTML" })
        .catch(err => console.error("Ошибка отправки уведомления админу:", err));
    }

    console.log(`Сброс трафика завершен\n`);

  } catch (error) {
    console.error("Ошибка сброса трафика:", error);
    
    // Уведомляем админа об ошибке
    if (TELEGRAM_ADMIN_ID) {
      bot.sendMessage(
        TELEGRAM_ADMIN_ID,
        `❌ <b>Ошибка ежемесячного сброса трафика</b>\n\n` +
          `<code>${error.message}</code>`,
        { parse_mode: "HTML" }
      ).catch(err => console.error("Ошибка отправки уведомления об ошибке:", err));
    }
  }

  // Даем время на отправку всех сообщений
  setTimeout(() => {
    process.exit(0);
  }, 3000);
}

// Запускаем сброс
resetTraffic();
