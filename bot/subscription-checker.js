#!/usr/bin/env node
/**
 * Subscription Checker
 * Проверяет истекающие подписки и автоматически блокирует клиентов
 * Запускается через cron раз в день
 */

import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import { exec } from "child_process";
import { promisify } from "util";
import APIClient from "./utils/api-client.js";

const execAsync = promisify(exec);
dotenv.config();

// Конфигурация
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_ADMIN_ID = parseInt(process.env.TELEGRAM_ADMIN_ID);
const XRAY_CONFIG_PATH = process.env.XRAY_CONFIG_PATH || "/usr/local/etc/xray/config.json";

if (!TELEGRAM_BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN не установлен в .env");
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN);
const apiClient = new APIClient();

// Вспомогательная функция для форматирования даты
function formatDate(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// Функция для удаления клиента из конфига X-Ray и перезапуска
async function removeClientFromXray(uuid) {
  try {
    const isRoot = process.getuid && process.getuid() === 0;
    const sudoPrefix = isRoot ? "" : "sudo ";

    // Читаем конфиг
    const { stdout: configContent } = await execAsync(`${sudoPrefix}cat ${XRAY_CONFIG_PATH}`);
    const config = JSON.parse(configContent);

    // Находим и удаляем клиента
    let removed = false;
    if (config.inbounds) {
      for (const inbound of config.inbounds) {
        if (inbound.settings && inbound.settings.clients) {
          const initialLength = inbound.settings.clients.length;
          inbound.settings.clients = inbound.settings.clients.filter(c => c.id !== uuid);
          if (inbound.settings.clients.length < initialLength) {
            removed = true;
          }
        }
      }
    }

    if (!removed) {
      console.log(`UUID ${uuid} не найден в конфиге X-Ray`);
      return false;
    }

    // Сохраняем обновленный конфиг
    const updatedConfig = JSON.stringify(config, null, 2);
    await execAsync(`echo '${updatedConfig.replace(/'/g, "'\\''")}' | ${sudoPrefix}tee ${XRAY_CONFIG_PATH} > /dev/null`);

    // Перезапускаем X-Ray
    await execAsync(`${sudoPrefix}systemctl restart xray`);

    console.log(`UUID ${uuid} удален из конфига и X-Ray перезапущен`);
    return true;
  } catch (error) {
    console.error(`Ошибка удаления клиента из X-Ray:`, error);
    return false;
  }
}

// Основная функция проверки подписок
async function checkSubscriptions() {
  console.log(`\n[${new Date().toISOString()}] Запуск проверки подписок...`);

  try {
    // Получаем всех клиентов
    const response = await apiClient.getClients();
    const clients = response.clients || [];

    if (clients.length === 0) {
      console.log("Нет клиентов для проверки");
      return;
    }

    const now = new Date();
    const expiringSoon = [];
    const expired = [];

    // Проверяем каждого клиента
    for (const client of clients) {
      if (client.status !== "active") {
        continue; // Пропускаем уже заблокированных
      }

      const endDate = new Date(client.subscription_end);
      const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

      if (daysLeft <= 0) {
        // Подписка истекла
        expired.push(client);
      } else if (daysLeft <= 3) {
        // Истекает через 3 дня или меньше
        expiringSoon.push({ client, daysLeft });
      }
    }

    // Обрабатываем истекшие подписки
    for (const client of expired) {
      console.log(`Подписка истекла: ${client.name} (${client.uuid})`);

      try {
        // Блокируем клиента в базе данных
        await apiClient.updateClient(client.uuid, { status: "blocked" });
        console.log(`Клиент ${client.name} заблокирован в БД`);

        // Удаляем из конфига X-Ray
        const removed = await removeClientFromXray(client.uuid);

        // Уведомляем админа
        if (TELEGRAM_ADMIN_ID) {
          bot.sendMessage(
            TELEGRAM_ADMIN_ID,
            `⚠️ <b>Подписка истекла</b>\n\n` +
              `👤 <b>Клиент:</b> ${client.name}\n` +
              `🆔 <b>UUID:</b> <code>${client.uuid}</code>\n` +
              `📅 <b>Дата окончания:</b> ${formatDate(client.subscription_end)}\n\n` +
              `${removed ? "✅ Клиент автоматически заблокирован и удален из X-Ray" : "⚠️ Клиент заблокирован в БД, но не удален из X-Ray"}`,
            { parse_mode: "HTML" }
          ).catch(err => console.error("Ошибка отправки уведомления админу:", err));
        }

        // Уведомляем клиента
        if (client.telegram_id) {
          bot.sendMessage(
            client.telegram_id,
            `⚠️ <b>Подписка истекла</b>\n\n` +
              `Твоя подписка на VPN истекла ${formatDate(client.subscription_end)}.\n\n` +
              `Доступ к VPN заблокирован.\n\n` +
              `Для продления подписки обратись к администратору.`,
            { parse_mode: "HTML" }
          ).catch(err => console.error(`Ошибка отправки уведомления клиенту ${client.telegram_id}:`, err));
        }
      } catch (error) {
        console.error(`Ошибка обработки истекшей подписки для ${client.name}:`, error);
      }
    }

    // Обрабатываем истекающие подписки
    for (const { client, daysLeft } of expiringSoon) {
      console.log(`Подписка истекает через ${daysLeft} дней: ${client.name} (${client.uuid})`);

      // Уведомляем клиента
      if (client.telegram_id) {
        bot.sendMessage(
          client.telegram_id,
          `⚠️ <b>Подписка истекает</b>\n\n` +
            `Твоя подписка на VPN истекает через <b>${daysLeft} ${daysLeft === 1 ? 'день' : daysLeft <= 4 ? 'дня' : 'дней'}</b>.\n\n` +
            `📅 <b>Дата окончания:</b> ${formatDate(client.subscription_end)}\n\n` +
            `Для продления подписки обратись к администратору или используй команду /my_requests.`,
          { parse_mode: "HTML" }
        ).catch(err => console.error(`Ошибка отправки уведомления клиенту ${client.telegram_id}:`, err));
      }

      // Уведомляем админа
      if (TELEGRAM_ADMIN_ID) {
        bot.sendMessage(
          TELEGRAM_ADMIN_ID,
          `⏰ <b>Подписка истекает</b>\n\n` +
            `👤 <b>Клиент:</b> ${client.name}\n` +
            `🆔 <b>UUID:</b> <code>${client.uuid}</code>\n` +
            `📱 <b>Telegram:</b> ${client.telegram_id ? `@${client.telegram_id}` : "не указан"}\n` +
            `📅 <b>Истекает:</b> ${formatDate(client.subscription_end)} (через ${daysLeft} ${daysLeft === 1 ? 'день' : daysLeft <= 4 ? 'дня' : 'дней'})`,
          { parse_mode: "HTML" }
        ).catch(err => console.error("Ошибка отправки уведомления админу:", err));
      }
    }

    console.log(`\nИтого:`);
    console.log(`- Истекших подписок: ${expired.length}`);
    console.log(`- Истекающих подписок (≤3 дней): ${expiringSoon.length}`);
    console.log(`Проверка завершена\n`);

  } catch (error) {
    console.error("Ошибка проверки подписок:", error);
    
    // Уведомляем админа об ошибке
    if (TELEGRAM_ADMIN_ID) {
      bot.sendMessage(
        TELEGRAM_ADMIN_ID,
        `❌ <b>Ошибка проверки подписок</b>\n\n` +
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
checkSubscriptions();
