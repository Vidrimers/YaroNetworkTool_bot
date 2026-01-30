#!/usr/bin/env node
/**
 * YaroNetworkTool VPN Bot
 * Telegram бот для управления VPN сервером
 */

import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import { exec } from "child_process";
import { promisify } from "util";
import QRCode from "qrcode";
import APIClient from "./utils/api-client.js";
import { generateVlessLink } from "./utils/vless-link-generator.js";
import { getActiveDevices } from "./device-monitor.js";
import { showPaymentMethods, showSubscriptionPlans, handlePaymentPlan } from "./payments/payment-handler.js";

const execAsync = promisify(exec);

dotenv.config();

// Конфигурация
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_ADMIN_ID = parseInt(process.env.TELEGRAM_ADMIN_ID);
const SERVER_IP = process.env.SERVER_IP || "localhost";
const XRAY_PORT = parseInt(process.env.XRAY_PORT) || 8443;
const XRAY_PUBLIC_KEY = process.env.XRAY_PUBLIC_KEY;
const XRAY_SHORT_ID = process.env.XRAY_SHORT_ID;
const XRAY_SNI = process.env.XRAY_SNI || "www.microsoft.com";

if (!TELEGRAM_BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN не установлен в .env");
  process.exit(1);
}

// Инициализация бота и API клиента
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
const apiClient = new APIClient();

// Вспомогательная функция для получения клиента по Telegram ID через API
async function getClientByTelegramId(telegramId) {
  try {
    const response = await apiClient.getClients();
    const clients = response.clients || [];
    return clients.find(c => c.telegram_id === telegramId) || null;
  } catch (error) {
    console.error("Ошибка получения клиента по Telegram ID:", error);
    return null;
  }
}

// Вспомогательная функция для форматирования даты в формате DD/MM/YYYY
function formatDate(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// Вспомогательная функция для форматирования трафика (округление до 2 знаков)
function formatTraffic(gb) {
  return typeof gb === 'number' ? gb.toFixed(2) : '0.00';
}

// Состояния пользователей для интерактивных команд
const userStates = new Map();

// Проверка прав администратора
function isAdmin(userId) {
  if (!TELEGRAM_ADMIN_ID) {
    return true; // Для разработки
  }
  return userId === TELEGRAM_ADMIN_ID;
}

// Главная клавиатура
function getMainKeyboard(isAdminUser = false) {
  if (isAdminUser) {
    return {
      keyboard: [
        [{ text: '👶 Малютки' }, { text: '📊 Статистика' }],
        [{ text: '📝 Запросы' }, { text: '⚙️ Сервер' }],
        [{ text: '🔧 Xray' }, { text: '📊 Мой VPN' }],
        [{ text: '❓ Помощь' }]
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    };
  } else {
    return {
      keyboard: [
        [{ text: '📊 Мой VPN' }, { text: '🔗 Моя ссылка' }],
        [{ text: '🔑 Запросить ключ' }, { text: '📝 Мои запросы' }],
        [{ text: '💳 Оплата' }, { text: '📥 Скачать VPN' }],
        [{ text: '❓ Помощь' }]
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    };
  }
}

console.log("\n[YaroNetworkTool VPN Bot] Запущен\n");
console.log(`Admin ID: ${TELEGRAM_ADMIN_ID}`);
console.log(`Server IP: ${SERVER_IP}`);
console.log(`API URL: ${apiClient.baseURL}\n`);

// ============================================================================
// ОБРАБОТЧИКИ КОМАНД
// ============================================================================

// Команда /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || msg.from.first_name;

  try {
    if (isAdmin(userId)) {
      // Админ меню
      bot.sendMessage(
        chatId,
        `👋 Добро пожаловать, <b>Администратор</b>!\n\n` +
          `🎛️ <b>Панель управления VPN сервером</b>\n\n` +
          `Используй кнопки ниже для управления:\n\n` +
          `👥 <b>Клиенты</b> - Управление VPN клиентами\n` +
          `📊 <b>Статистика</b> - Статистика сервера и клиентов\n` +
          `📝 <b>Запросы</b> - Запросы на продление подписки\n` +
          `⚙️ <b>Сервер</b> - Статус и управление сервером\n` +
          `❓ <b>Помощь</b> - Справка по командам`,
        {
          parse_mode: "HTML",
          reply_markup: getMainKeyboard(true),
        }
      );
    } else {
      // Проверяем, зарегистрирован ли клиент
      const client = await getClientByTelegramId(userId);

      if (client) {
        // Клиент зарегистрирован
        
        // Проверить, видел ли клиент правила (можно добавить поле в БД)
        // Пока отправляем правила каждый раз при первом /start
        
        bot.sendMessage(
          chatId,
          `👋 Добро пожаловать, <b>${client.name}</b>!\n\n` +
            `📊 <b>Твой личный кабинет VPN</b>\n\n` +
            `Используй кнопки ниже:\n\n` +
            `📊 <b>Мой VPN</b> - Статистика использования\n` +
            `🔗 <b>Моя ссылка</b> - Ссылка подключения и QR код\n` +
            `🔑 <b>Запросить ключ</b> - Продлить подписку\n` +
            `📝 <b>Мои запросы</b> - История запросов\n` +
            `❓ <b>Помощь</b> - Справка`,
          {
            parse_mode: "HTML",
            reply_markup: getMainKeyboard(false),
          }
        );
        
        // Отправить правила использования
        setTimeout(() => {
          bot.sendMessage(
            chatId,
            `📋 <b>Правила использования VPN</b>\n\n` +
              `<b>❌ ЗАПРЕЩЕНО:</b>\n` +
              `• Использование торрентов и P2P (BitTorrent, uTorrent)\n` +
              `• Передача ключа другим лицам\n` +
              `• Незаконная деятельность, DDoS атаки\n` +
              `• Злоупотребление ресурсами (майнинг, прокси)\n\n` +
              `<b>✅ РАЗРЕШЕНО:</b>\n` +
              `• Просмотр сайтов и видео\n` +
              `• Мессенджеры и соцсети\n` +
              `• Онлайн игры и стриминг\n\n` +
              `<b>⚠️ Система предупреждений:</b>\n` +
              `1️⃣ Первое нарушение - предупреждение + блокировка на 24ч\n` +
              `2️⃣ Второе нарушение - финальное предупреждение + блокировка на 7 дней\n` +
              `3️⃣ Третье нарушение - полная блокировка без возврата\n\n` +
              `<i>Используя VPN, вы соглашаетесь с правилами.</i>\n\n` +
              `Подробнее: /terms`,
            { parse_mode: "HTML" }
          );
        }, 1000);
      } else {
        // Клиент не зарегистрирован
        const keyboard = {
          inline_keyboard: [
            [{ text: "📝 Отправить заявку", callback_data: "request_access" }]
          ]
        };

        bot.sendMessage(
          chatId,
          `👋 Привет, ${username}!\n\n` +
            `❌ <b>Ты не зарегистрирован в системе</b>\n\n` +
            `Для получения доступа к VPN нажми кнопку ниже.\n\n` +
            `Твой Telegram ID: <code>${userId}</code>`,
          { 
            parse_mode: "HTML",
            reply_markup: keyboard
          }
        );
      }
    }
  } catch (error) {
    console.error("Ошибка в /start:", error);
    bot.sendMessage(
      chatId,
      "❌ Произошла ошибка. Попробуйте позже."
    );
  }
});

// Команда /help
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (isAdmin(userId)) {
    const keyboard = {
      inline_keyboard: [
        [{ text: "🔒 Безопасность и шифрование", callback_data: "security_info" }]
      ]
    };
    
    bot.sendMessage(
      chatId,
      `📚 <b>Справка для администратора</b>\n\n` +
        `<b>Команды:</b>\n` +
        `/start - Главное меню\n` +
        `/add_client - Добавить клиента\n` +
        `/remove_client - Удалить клиента\n` +
        `/list_clients - Список всех клиентов\n` +
        `/client_info &lt;uuid&gt; - Информация о клиенте\n` +
        `/server_status - Статус сервера\n` +
        `/help - Эта справка\n\n` +
        `<b>Кнопки:</b>\n` +
        `👥 Клиенты - Управление клиентами\n` +
        `📊 Статистика - Статистика сервера\n` +
        `📝 Запросы - Запросы на продление\n` +
        `⚙️ Сервер - Статус сервера`,
      { 
        parse_mode: "HTML",
        reply_markup: keyboard
      }
    );
  } else {
    const keyboard = {
      inline_keyboard: [
        [{ text: "🔒 Безопасность и шифрование", callback_data: "security_info" }]
      ]
    };
    
    bot.sendMessage(
      chatId,
      `📚 <b>Справка для клиента</b>\n\n` +
        `<b>Команды:</b>\n` +
        `/start - Личный кабинет\n` +
        `/my_vpn - Моя статистика VPN\n` +
        `/my_link - Ссылка подключения\n` +
        `/my_requests - Мои запросы\n` +
        `/download - Скачать VPN клиент\n` +
        `/terms - Правила использования\n` +
        `/help - Эта справка\n\n` +
        `<b>Кнопки:</b>\n` +
        `📊 Мой VPN - Статистика использования\n` +
        `🔗 Моя ссылка - Ссылка и QR код\n` +
        `🔑 Запросить ключ - Продлить подписку\n` +
        `📝 Мои запросы - История запросов\n` +
        `📥 Скачать VPN - Инструкция по установке`,
      { 
        parse_mode: "HTML",
        reply_markup: keyboard
      }
    );
  }
});

// Команда /download - Скачать VPN клиент
bot.onText(/\/download/, async (msg) => {
  const chatId = msg.chat.id;
  
  const keyboard = {
    inline_keyboard: [
      [{ text: "📱 v2rayNG (Android)", url: "https://github.com/2dust/v2rayNG/releases" }],
      [{ text: "📱 V2Box (Android)", url: "https://play.google.com/store/apps/details?id=dev.hexasoftware.v2box" }],
      [{ text: "🍎 Streisand (iOS)", url: "https://apps.apple.com/app/streisand/id6450534064" }],
      [{ text: "💻 v2rayN (Windows)", url: "https://github.com/2dust/v2rayN/releases" }],
      [{ text: "💻 Amnezia (ПК)", url: "https://m-1-12-3w5hsuiikq-ez.a.run.app/ru/downloads" }],
      [{ text: "💻 Amnezia GitHub", url: "https://github.com/amnezia-vpn/amnezia-client/releases" }]
    ]
  };
  
  bot.sendMessage(
    chatId,
    `📥 <b>Скачать VPN клиент</b>\n\n` +
      `<b>Android:</b>\n` +
      `• <b>v2rayNG</b> (рекомендуем) - GitHub Releases\n` +
      `• <b>V2Box</b> - Google Play Store\n` +
      `• <b>Hiddify</b> - Google Play Store\n\n` +
      `<b>iOS:</b>\n` +
      `• <b>Streisand</b> - App Store\n` +
      `• <b>FoXray</b> - App Store\n\n` +
      `<b>Windows/Mac/Linux:</b>\n` +
      `• <b>v2rayN</b> (Windows) - GitHub Releases\n` +
      `• <b>v2rayNG</b> (Linux) - GitHub Releases\n` +
      `• <b>Amnezia VPN</b> (только для ПК!) - Официальный сайт или GitHub\n\n` +
      `<b>Как подключиться:</b>\n` +
      `1. Установи приложение\n` +
      `2. Получи ключ: /my_link или кнопка "🔗 Моя ссылка"\n` +
      `3. В приложении нажми "+" → "Import from Clipboard"\n` +
      `4. Вставь vless:// ссылку\n` +
      `5. Подключись\n\n` +
      `<i>⚠️ Amnezia работает ТОЛЬКО на ПК (Windows/Mac/Linux)!</i>\n` +
      `<i>⚠️ На телефонах (Android/iOS) используй v2rayNG, V2Box или Streisand!</i>`,
    { 
      parse_mode: "HTML",
      reply_markup: keyboard
    }
  );
});

// Команда /terms - Правила использования
bot.onText(/\/terms/, async (msg) => {
  const chatId = msg.chat.id;
  
  bot.sendMessage(
    chatId,
    `📋 <b>Правила использования VPN</b>\n\n` +
      `<b>❌ ЗАПРЕЩЕНО:</b>\n\n` +
      `<b>1. Торренты и P2P</b>\n` +
      `• BitTorrent, uTorrent и другие P2P клиенты\n` +
      `• Загрузка и раздача файлов через торренты\n` +
      `• DHT и другие P2P протоколы\n\n` +
      `<b>2. Передача доступа</b>\n` +
      `• Передача ключа другим лицам\n` +
      `• Публикация ключа в открытом доступе\n` +
      `• Один ключ = один пользователь\n\n` +
      `<b>3. Незаконная деятельность</b>\n` +
      `• Любая незаконная деятельность\n` +
      `• DDoS атаки и другие виды атак\n` +
      `• Спам и массовые рассылки\n\n` +
      `<b>4. Злоупотребление ресурсами</b>\n` +
      `• Чрезмерное использование трафика\n` +
      `• Майнинг криптовалют\n` +
      `• Использование для прокси-серверов\n\n` +
      `<b>✅ РАЗРЕШЕНО:</b>\n` +
      `• Просмотр веб-сайтов и видео\n` +
      `• Мессенджеры и социальные сети\n` +
      `• Работа с почтой и облачными сервисами\n` +
      `• Онлайн игры (без читов и ботов)\n` +
      `• Стриминг музыки и видео\n\n` +
      `<b>⚠️ Система предупреждений:</b>\n\n` +
      `<b>1️⃣ Первое нарушение:</b>\n` +
      `• Предупреждение в Telegram\n` +
      `• Приостановка доступа на 24 часа\n\n` +
      `<b>2️⃣ Второе нарушение:</b>\n` +
      `• Финальное предупреждение\n` +
      `• Приостановка доступа на 7 дней\n\n` +
      `<b>3️⃣ Третье нарушение:</b>\n` +
      `• Полная блокировка без возврата\n` +
      `• Удаление ключа доступа\n\n` +
      `<i>Используя VPN сервис, вы автоматически соглашаетесь с данными правилами.</i>`,
    { parse_mode: "HTML" }
  );
});

// ============================================================================
// КОМАНДЫ АДМИНИСТРАТОРА
// ============================================================================

// Команда /list_clients - Список всех клиентов
bot.onText(/\/list_clients/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!isAdmin(userId)) {
    bot.sendMessage(chatId, "❌ Доступ запрещен");
    return;
  }

  try {
    const response = await apiClient.getClients();
    const clients = response.clients || [];

    if (clients.length === 0) {
      bot.sendMessage(chatId, "📭 Клиенты не найдены");
      return;
    }

    // Получаем информацию об активных устройствах
    const deviceInfo = await getActiveDevices();

    let message = `👥 <b>Список клиентов (${clients.length}):</b>\n\n`;
    
    clients.forEach((client, i) => {
      const status = client.status === "active" ? "✅" : "❌";
      const endDate = new Date(client.subscription_end);
      const daysLeft = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));
      const isExpiringSoon = daysLeft > 0 && daysLeft <= 7;
      
      // Информация об устройствах
      const devices = deviceInfo[client.uuid];
      const deviceCount = devices ? devices.count : 0;
      const maxDevices = client.max_devices || 2;
      
      message += `${i + 1}. ${status} <b>${client.name}</b>\n`;
      message += `   UUID: <code>${client.uuid}</code>\n`;
      message += `   Telegram: ${client.telegram_id || "не связан"}\n`;
      message += `   Подписка: ${daysLeft > 0 ? `${daysLeft} дней` : "истекла"}${isExpiringSoon ? ' ⏰ (скоро истекает!)' : ''}\n`;
      message += `   Трафик: ${formatTraffic(client.traffic_used_gb)}/${client.traffic_limit_gb} GB\n`;
      message += `   Устройств: ${deviceCount}/${maxDevices}`;
      if (deviceCount > maxDevices) {
        message += ` ⚠️ (превышен лимит!)`;
      }
      message += `\n\n`;
    });

    bot.sendMessage(chatId, message, { parse_mode: "HTML" });
  } catch (error) {
    console.error("Ошибка /list_clients:", error);
    bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
  }
});

// Команда /client_info <uuid> - Информация о клиенте
bot.onText(/\/client_info (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const uuid = match[1].trim();

  if (!isAdmin(userId)) {
    bot.sendMessage(chatId, "❌ Доступ запрещен");
    return;
  }

  try {
    const response = await apiClient.getClient(uuid);
    const client = response.client;

    const endDate = new Date(client.subscription_end);
    const daysLeft = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));
    const status = client.status === "active" ? "✅ Активен" : "❌ Заблокирован";
    const isExpiringSoon = daysLeft > 0 && daysLeft <= 7;

    // Получаем информацию об активных устройствах
    const deviceInfo = await getActiveDevices();
    const devices = deviceInfo[uuid];
    const deviceCount = devices ? devices.count : 0;
    const deviceIPs = devices ? devices.ips : [];
    const maxDevices = client.max_devices || 2;

    let message = `👤 <b>Информация о клиенте</b>\n\n`;
    message += `<b>Имя:</b> ${client.name}\n`;
    message += `<b>UUID:</b> <code>${client.uuid}</code>\n`;
    message += `<b>Telegram ID:</b> ${client.telegram_id || "не связан"}\n`;
    message += `<b>Email:</b> ${client.email || "не указан"}\n\n`;
    message += `<b>Статус:</b> ${status}\n`;
    message += `<b>Подписка:</b> ${daysLeft > 0 ? `${daysLeft} дней` : "истекла"}${isExpiringSoon ? ' ⏰ (скоро истекает!)' : ''}\n`;
    message += `<b>Начало:</b> ${formatDate(client.subscription_start)}\n`;
    message += `<b>Конец:</b> ${formatDate(endDate)}\n\n`;
    message += `<b>Трафик:</b> ${formatTraffic(client.traffic_used_gb)}/${client.traffic_limit_gb} GB\n`;
    message += `<b>Сброс трафика:</b> ${formatDate(client.traffic_reset_date)}\n\n`;
    message += `<b>📱 Активных устройств:</b> ${deviceCount} / ${maxDevices}`;
    
    if (deviceCount > maxDevices) {
      message += ` ⚠️ (превышен лимит!)`;
    }
    
    if (deviceCount > 0) {
      message += `\n<b>IP адреса:</b>\n${deviceIPs.map(ip => `   • ${ip}`).join('\n')}`;
    }

    const keyboard = {
      inline_keyboard: [
        [
          { text: "🔗 Показать VLESS ссылку", callback_data: `show_vless_${uuid}` }
        ],
        [
          { text: "📱 Изменить лимит устройств", callback_data: `change_device_limit_${uuid}` }
        ]
      ]
    };

    bot.sendMessage(chatId, message, { parse_mode: "HTML", reply_markup: keyboard });
  } catch (error) {
    console.error("Ошибка /client_info:", error);
    bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
  }
});

// Команда /add_client - Добавить клиента
bot.onText(/\/add_client/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!isAdmin(userId)) {
    bot.sendMessage(chatId, "❌ Доступ запрещен");
    return;
  }

  userStates.set(userId, { action: "add_client", step: "name" });
  
  bot.sendMessage(
    chatId,
    "➕ <b>Добавление нового клиента</b>\n\n" +
      "Введи имя клиента:",
    { 
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "❌ Отмена", callback_data: "cancel_add_client" }]
        ]
      }
    }
  );
});

// Команда /remove_client - Удалить клиента
bot.onText(/\/remove_client/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!isAdmin(userId)) {
    bot.sendMessage(chatId, "❌ Доступ запрещен");
    return;
  }

  try {
    const response = await apiClient.getClients();
    const clients = response.clients || [];

    if (clients.length === 0) {
      bot.sendMessage(chatId, "📭 Клиенты не найдены");
      return;
    }

    let message = "🗑️ <b>Удаление клиента</b>\n\n";
    message += "Выбери клиента для удаления:\n\n";

    const keyboard = {
      inline_keyboard: clients.map(client => [{
        text: `${client.name} (${client.uuid.substring(0, 8)}...)`,
        callback_data: `remove_${client.uuid}`
      }])
    };

    keyboard.inline_keyboard.push([{ text: "❌ Отмена", callback_data: "remove_cancel" }]);

    bot.sendMessage(chatId, message, {
      parse_mode: "HTML",
      reply_markup: keyboard
    });
  } catch (error) {
    console.error("Ошибка /remove_client:", error);
    bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
  }
});

// Команда /server_status - Статус сервера
bot.onText(/\/server_status/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!isAdmin(userId)) {
    bot.sendMessage(chatId, "❌ Доступ запрещен");
    return;
  }

  try {
    const clientsResponse = await apiClient.getClients();
    const clients = clientsResponse.clients || [];
    
    const activeClients = clients.filter(c => c.status === "active").length;
    const blockedClients = clients.filter(c => c.status === "blocked").length;

    let message = `⚙️ <b>Статус сервера</b>\n\n`;
    message += `✅ Сервер: Онлайн\n`;
    message += `🌐 VPN: <code>${SERVER_IP}:443</code>\n`;
    message += `🔧 API: <code>${SERVER_IP}:333</code>\n`;
    message += `📊 База данных: Подключена\n\n`;
    message += `👥 <b>Клиенты:</b>\n`;
    message += `   Всего: ${clients.length}\n`;
    message += `   Активных: ${activeClients}\n`;
    message += `   Заблокированных: ${blockedClients}\n`;

    bot.sendMessage(chatId, message, { parse_mode: "HTML" });
  } catch (error) {
    console.error("Ошибка /server_status:", error);
    bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
  }
});

// ============================================================================
// КОМАНДЫ КЛИЕНТА
// ============================================================================

// Команда /my_vpn - Моя статистика VPN
bot.onText(/\/my_vpn/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (isAdmin(userId)) {
    bot.sendMessage(chatId, "ℹ️ Эта команда доступна только для клиентов");
    return;
  }

  try {
    const client = await getClientByTelegramId(userId);

    if (!client) {
      bot.sendMessage(chatId, "❌ Ты не зарегистрирован в системе");
      return;
    }

    const response = await apiClient.getClient(client.uuid);
    const clientData = response.client;

    // Получаем общий трафик за период
    let totalTrafficData = null;
    try {
      const trafficResponse = await apiClient.getClientTotalTraffic(client.uuid);
      totalTrafficData = trafficResponse.traffic;
    } catch (error) {
      // Игнорируем ошибку если endpoint не найден (старая версия API)
      if (!error.message.includes('Not Found')) {
        console.error("Ошибка получения общего трафика:", error);
      }
    }

    const endDate = new Date(clientData.subscription_end);
    const daysLeft = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));
    const status = clientData.status === "active" ? "✅ Активен" : "❌ Заблокирован";
    const trafficPercent = Math.round((clientData.traffic_used_gb / clientData.traffic_limit_gb) * 100);

    let message = `📊 <b>Моя статистика VPN</b>\n\n`;
    message += `👤 <b>Имя:</b> ${clientData.name}\n`;
    message += `🆔 <b>UUID:</b> <code>${clientData.uuid}</code>\n\n`;
    message += `<b>Статус:</b> ${status}\n`;
    message += `<b>Подписка:</b> ${daysLeft > 0 ? `${daysLeft} дней` : "истекла ⚠️"}\n`;
    message += `<b>Конец подписки:</b> ${formatDate(endDate)}\n\n`;
    message += `<b>Трафик:</b> ${formatTraffic(clientData.traffic_used_gb)}/${clientData.traffic_limit_gb} GB (${trafficPercent}%)\n`;
    
    // Добавляем общий трафик за месяц
    if (totalTrafficData && totalTrafficData.total_gb > 0) {
      message += `<b>Всего за месяц:</b> ${formatTraffic(totalTrafficData.total_gb)} GB\n`;
    }
    
    message += `<b>Сброс трафика:</b> ${formatDate(clientData.traffic_reset_date)}\n`;

    if (daysLeft <= 7 && daysLeft > 0) {
      message += `\n⚠️ <b>Внимание:</b> Подписка истекает через ${daysLeft} дней!`;
    }

    bot.sendMessage(chatId, message, { parse_mode: "HTML" });
  } catch (error) {
    console.error("Ошибка /my_vpn:", error);
    bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
  }
});

// Команда /my_link - Ссылка подключения
bot.onText(/\/my_link/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (isAdmin(userId)) {
    bot.sendMessage(chatId, "ℹ️ Эта команда доступна только для клиентов");
    return;
  }

  try {
    const client = await getClientByTelegramId(userId);

    if (!client) {
      bot.sendMessage(chatId, "❌ Ты не зарегистрирован в системе");
      return;
    }

    let message = `🔗 <b>Ссылка подключения</b>\n\n`;
    message += `Твой UUID: <code>${client.uuid}</code>\n\n`;
    message += `Для получения ссылки подключения обратись к администратору.\n`;
    message += `Администратор сгенерирует для тебя vless:// ссылку и QR код.`;

    bot.sendMessage(chatId, message, { parse_mode: "HTML" });
  } catch (error) {
    console.error("Ошибка /my_link:", error);
    bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
  }
});

// Команда /my_requests - Мои запросы на продление
bot.onText(/\/my_requests/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (isAdmin(userId)) {
    bot.sendMessage(chatId, "ℹ️ Эта команда доступна только для клиентов");
    return;
  }

  try {
    const client = await getClientByTelegramId(userId);

    if (!client) {
      bot.sendMessage(chatId, "❌ Ты не зарегистрирован в системе");
      return;
    }

    const response = await apiClient.getClientExtensionRequests(client.uuid);
    const requests = response.requests || [];

    if (requests.length === 0) {
      bot.sendMessage(chatId, "📭 У тебя нет запросов на продление");
      return;
    }

    let message = `📝 <b>Мои запросы на продление (${requests.length}):</b>\n\n`;

    requests.forEach((req, i) => {
      const statusEmoji = req.status === "pending" ? "⏳" : req.status === "approved" ? "✅" : "❌";
      const statusText = req.status === "pending" ? "Ожидает" : req.status === "approved" ? "Одобрен" : "Отклонен";
      
      message += `${i + 1}. ${statusEmoji} <b>${statusText}</b>\n`;
      message += `   Запрошено: ${req.requested_months} мес. (${req.requested_days} дней)\n`;
      
      if (req.status === "approved") {
        message += `   Одобрено: ${req.approved_days} дней\n`;
      } else if (req.status === "denied" && req.denial_reason) {
        message += `   Причина: ${req.denial_reason}\n`;
      }
      
      message += `   Дата: ${formatDate(req.created_at)}\n\n`;
    });

    bot.sendMessage(chatId, message, { parse_mode: "HTML" });
  } catch (error) {
    console.error("Ошибка /my_requests:", error);
    bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
  }
});

// ============================================================================
// ОБРАБОТЧИКИ КНОПОК
// ============================================================================

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  // Пропускаем команды (они обрабатываются отдельно)
  if (text && text.startsWith("/")) {
    return;
  }

  // Обработка состояний пользователя
  const userState = userStates.get(userId);
  if (userState) {
    // Обработка создания доступа из заявки
    if (userState.action === "create_access") {
      if (userState.step === "name") {
        userState.name = text;
        userState.step = "days";
        userStates.set(userId, userState);
        
        bot.sendMessage(
          chatId,
          "Введи количество дней подписки (по умолчанию 30):"
        );
        return;
      } else if (userState.step === "days") {
        const days = parseInt(text);
        
        if (isNaN(days) || days <= 0) {
          bot.sendMessage(chatId, "❌ Неверный формат. Введи положительное число:");
          return;
        }
        
        try {
          const response = await apiClient.createClient({
            name: userState.name,
            telegram_id: userState.targetUserId,
            subscription_days: days,
            traffic_limit_gb: 100
          });
          
          const client = response.client;
          
          // Генерируем vless ссылку
          let vlessLink = '';
          try {
            if (XRAY_PUBLIC_KEY && XRAY_SHORT_ID) {
              vlessLink = generateVlessLink({
                uuid: client.uuid,
                serverIp: SERVER_IP,
                port: XRAY_PORT,
                publicKey: XRAY_PUBLIC_KEY,
                shortId: XRAY_SHORT_ID,
                sni: XRAY_SNI,
                clientName: client.name
              });
            }
          } catch (linkError) {
            console.error('Ошибка генерации vless ссылки:', linkError);
          }
          
          bot.sendMessage(
            chatId,
            `✅ <b>Доступ создан!</b>\n\n` +
              `👤 Имя: ${client.name}\n` +
              `🆔 UUID: <code>${client.uuid}</code>\n` +
              `📱 Telegram ID: ${client.telegram_id}\n` +
              `📅 Подписка: ${days} дней\n` +
              `📊 Лимит трафика: ${client.traffic_limit_gb} GB` +
              (vlessLink ? `\n\n🔗 <b>Ссылка для подключения:</b>\n<code>${vlessLink}</code>` : ''),
            { 
              parse_mode: "HTML",
              reply_markup: getMainKeyboard(true)
            }
          );
          
          // Уведомляем клиента
          const keyboard = {
            inline_keyboard: [
              [{ text: "🚀 Погнали!", callback_data: "start_vpn" }]
            ]
          };

          bot.sendMessage(
            userState.targetUserId,
            `🎉 <b>Твоя заявка одобрена!</b>\n\n` +
              `Тебе создан доступ к VPN серверу.\n\n` +
              `👤 <b>Имя:</b> ${client.name}\n` +
              `🆔 <b>UUID:</b> <code>${client.uuid}</code>\n` +
              `📅 <b>Подписка:</b> ${days} дней\n` +
              `📊 <b>Лимит трафика:</b> ${client.traffic_limit_gb} GB\n\n` +
              `Нажми кнопку ниже для доступа к личному кабинету.`,
            { 
              parse_mode: "HTML",
              reply_markup: keyboard
            }
          ).catch(err => {
            console.error("Не удалось отправить уведомление клиенту:", err);
          });
          
          userStates.delete(userId);
        } catch (error) {
          console.error("Ошибка создания доступа:", error);
          bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`, {
            reply_markup: getMainKeyboard(true)
          });
          userStates.delete(userId);
        }
        return;
      }
    }

    // Обработка добавления клиента
    if (userState.action === "add_client") {
      if (userState.step === "name") {
        userState.name = text;
        userState.step = "telegram_id";
        userStates.set(userId, userState);
        
        bot.sendMessage(
          chatId,
          "Введи Telegram ID клиента (или 0 если не известен):"
        );
        return;
      } else if (userState.step === "telegram_id") {
        const telegramId = parseInt(text);
        
        if (isNaN(telegramId)) {
          bot.sendMessage(chatId, "❌ Неверный формат. Введи число:");
          return;
        }
        
        userState.telegram_id = telegramId === 0 ? null : telegramId;
        userState.step = "subscription_days";
        userStates.set(userId, userState);
        
        bot.sendMessage(
          chatId,
          "Введи количество дней подписки (по умолчанию 30):"
        );
        return;
      } else if (userState.step === "subscription_days") {
        const days = parseInt(text);
        
        if (isNaN(days) || days <= 0) {
          bot.sendMessage(chatId, "❌ Неверный формат. Введи положительное число:");
          return;
        }
        
        // Создаем клиента через API
        try {
          const response = await apiClient.createClient({
            name: userState.name,
            telegram_id: userState.telegram_id,
            subscription_days: days,
            traffic_limit_gb: 100
          });
          
          const client = response.client;
          
          // Генерируем vless ссылку
          let vlessLink = '';
          try {
            if (XRAY_PUBLIC_KEY && XRAY_SHORT_ID) {
              vlessLink = generateVlessLink({
                uuid: client.uuid,
                serverIp: SERVER_IP,
                port: XRAY_PORT,
                publicKey: XRAY_PUBLIC_KEY,
                shortId: XRAY_SHORT_ID,
                sni: XRAY_SNI,
                clientName: client.name
              });
            }
          } catch (linkError) {
            console.error('Ошибка генерации vless ссылки:', linkError);
          }
          
          bot.sendMessage(
            chatId,
            `✅ <b>Клиент создан успешно!</b>\n\n` +
              `👤 Имя: ${client.name}\n` +
              `🆔 UUID: <code>${client.uuid}</code>\n` +
              `📱 Telegram ID: ${client.telegram_id || "не указан"}\n` +
              `📅 Подписка: ${days} дней\n` +
              `📊 Лимит трафика: ${client.traffic_limit_gb} GB` +
              (vlessLink ? `\n\n🔗 <b>Ссылка для подключения:</b>\n<code>${vlessLink}</code>` : ''),
            { 
              parse_mode: "HTML",
              reply_markup: getMainKeyboard(true)
            }
          );
          
          // Уведомляем клиента если указан Telegram ID
          if (client.telegram_id) {
            bot.sendMessage(
              client.telegram_id,
              `🎉 <b>Добро пожаловать в VPN сервис!</b>\n\n` +
                `Тебе создан доступ к VPN серверу.\n\n` +
                `👤 <b>Имя:</b> ${client.name}\n` +
                `🆔 <b>UUID:</b> <code>${client.uuid}</code>\n` +
                `📅 <b>Подписка:</b> ${days} дней\n` +
                `📊 <b>Лимит трафика:</b> ${client.traffic_limit_gb} GB` +
                (vlessLink ? `\n\n🔗 <b>Ссылка для подключения:</b>\n<code>${vlessLink}</code>\n\nСкопируй ссылку и вставь в VPN клиент (v2rayN, v2rayNG, Streisand)` : '') +
                `\n\nИспользуй /start для доступа к личному кабинету.`,
              { parse_mode: "HTML" }
            ).catch(err => {
              console.error("Не удалось отправить уведомление клиенту:", err);
            });
          }
          
          userStates.delete(userId);
        } catch (error) {
          console.error("Ошибка создания клиента:", error);
          bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`, {
            reply_markup: getMainKeyboard(true)
          });
          userStates.delete(userId);
        }
        return;
      }
    }
    
    // Обработка изменения периода запроса
    if (userState.action === "change_period") {
      const days = parseInt(text);
      
      if (isNaN(days) || days <= 0) {
        bot.sendMessage(chatId, "❌ Неверный формат. Введи положительное число:");
        return;
      }
      
      try {
        // Одобряем запрос с новым периодом
        const response = await apiClient.approveExtensionRequest(userState.requestId, days, userId);
        const request = response.request;
        
        bot.editMessageText(
          `✅ <b>Запрос одобрен с измененным периодом</b>\n\n` +
            `UUID: <code>${request.client_uuid}</code>\n` +
            `Период: ${days} дней\n\n` +
            `Подписка продлена автоматически.`,
          {
            chat_id: chatId,
            message_id: userState.messageId,
            parse_mode: "HTML",
          }
        );
        
        // Уведомляем клиента
        if (request.telegram_id) {
          bot.sendMessage(
            request.telegram_id,
            `✅ <b>Твой запрос одобрен!</b>\n\n` +
              `Подписка продлена на ${days} дней.\n` +
              `Используй /my_vpn для просмотра обновленной информации.`,
            { parse_mode: "HTML" }
          );
        }
        
        userStates.delete(userId);
      } catch (error) {
        console.error("Ошибка изменения периода:", error);
        bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
        userStates.delete(userId);
      }
      return;
    }
    
    // Обработка ввода своей причины предупреждения
    if (userState.action === "warn_custom") {
      const reason = text;
      
      try {
        const response = await apiClient.warnClient(userState.clientUuid, reason);
        const client = response.client;
        const warningsCount = response.warningsCount;

        let blockInfo = "";
        if (warningsCount === 1) {
          blockInfo = "\n🔒 Клиент заблокирован на 24 часа";
        } else if (warningsCount === 2) {
          blockInfo = "\n🔒 Клиент заблокирован на 7 дней";
        } else if (warningsCount >= 3) {
          blockInfo = "\n🔒 Клиент заблокирован навсегда";
        }

        bot.sendMessage(
          chatId,
          `✅ <b>Предупреждение выдано</b>\n\n` +
            `👤 Клиент: ${client.name}\n` +
            `⚠️ Предупреждение: ${warningsCount}/3\n` +
            `📝 Причина: ${reason}${blockInfo}`,
          { 
            parse_mode: "HTML",
            reply_markup: getMainKeyboard(true)
          }
        );

        // Уведомляем клиента
        if (client.telegram_id) {
          let clientMessage = `⚠️ <b>Предупреждение ${warningsCount}/3</b>\n\n`;
          clientMessage += `Причина: ${reason}\n\n`;
          
          if (warningsCount === 1) {
            clientMessage += `Твой доступ заблокирован на 24 часа.\n\n`;
            clientMessage += `При повторном нарушении блокировка составит 7 дней.`;
          } else if (warningsCount === 2) {
            clientMessage += `Твой доступ заблокирован на 7 дней.\n\n`;
            clientMessage += `⚠️ ВНИМАНИЕ: При следующем нарушении вы будете заблокированы навсегда!`;
          } else {
            clientMessage += `Твой доступ заблокирован навсегда.\n\n`;
            clientMessage += `Обратитесь к администратору для уточнения деталей.`;
          }

          bot.sendMessage(client.telegram_id, clientMessage, { parse_mode: "HTML" });
        }
        
        userStates.delete(userId);
      } catch (error) {
        console.error("Ошибка выдачи предупреждения:", error);
        bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`, {
          reply_markup: getMainKeyboard(true)
        });
        userStates.delete(userId);
      }
      return;
    }
    
    return;
  }

  // Обработка кнопок
  try {
    if (text === "❓ Помощь") {
      // Вызываем /help напрямую
      if (isAdmin(userId)) {
        const keyboard = {
          inline_keyboard: [
            [{ text: "🔒 Безопасность и шифрование", callback_data: "security_info" }]
          ]
        };
        
        bot.sendMessage(
          chatId,
          `📚 <b>Справка для администратора</b>\n\n` +
            `<b>Команды:</b>\n` +
            `/start - Главное меню\n` +
            `/add_client - Добавить клиента\n` +
            `/remove_client - Удалить клиента\n` +
            `/list_clients - Список всех клиентов\n` +
            `/client_info &lt;uuid&gt; - Информация о клиенте\n` +
            `/server_status - Статус сервера\n` +
            `/help - Эта справка\n\n` +
            `<b>Кнопки:</b>\n` +
            `👶 Малютки - Управление клиентами\n` +
            `📊 Статистика - Статистика сервера\n` +
            `📝 Запросы - Запросы на продление\n` +
            `⚙️ Сервер - Статус сервера\n` +
            `🔧 Xray - Управление Xray сервисом\n` +
            `📊 Мой VPN - Моя статистика VPN`,
          { 
            parse_mode: "HTML",
            reply_markup: keyboard
          }
        );
      } else {
        const keyboard = {
          inline_keyboard: [
            [{ text: "🔒 Безопасность и шифрование", callback_data: "security_info" }]
          ]
        };
        
        bot.sendMessage(
          chatId,
          `📚 <b>Справка для клиента</b>\n\n` +
            `<b>Команды:</b>\n` +
            `/start - Личный кабинет\n` +
            `/my_vpn - Моя статистика VPN\n` +
            `/my_link - Ссылка подключения\n` +
            `/my_requests - Мои запросы\n` +
            `/terms - Правила использования\n` +
            `/help - Эта справка\n\n` +
            `<b>Кнопки:</b>\n` +
            `📊 Мой VPN - Статистика использования\n` +
            `🔗 Моя ссылка - Ссылка и QR код\n` +
            `🔑 Запросить ключ - Продлить подписку\n` +
            `📝 Мои запросы - История запросов`,
          { 
            parse_mode: "HTML",
            reply_markup: keyboard
          }
        );
      }
      return;
    }

    if (text === "📥 Скачать VPN") {
      const keyboard = {
        inline_keyboard: [
          [{ text: "📱 v2rayNG (Android)", url: "https://github.com/2dust/v2rayNG/releases" }],
          [{ text: "📱 V2Box (Android)", url: "https://play.google.com/store/apps/details?id=dev.hexasoftware.v2box" }],
          [{ text: "🍎 Streisand (iOS)", url: "https://apps.apple.com/app/streisand/id6450534064" }],
          [{ text: "💻 v2rayN (Windows)", url: "https://github.com/2dust/v2rayN/releases" }],
          [{ text: "💻 Amnezia (ПК)", url: "https://m-1-12-3w5hsuiikq-ez.a.run.app/ru/downloads" }],
          [{ text: "💻 Amnezia GitHub", url: "https://github.com/amnezia-vpn/amnezia-client/releases" }]
        ]
      };
      
      bot.sendMessage(
        chatId,
        `📥 <b>Скачать VPN клиент</b>\n\n` +
          `<b>Android:</b>\n` +
          `• <b>v2rayNG</b> (рекомендуем) - GitHub Releases\n` +
          `• <b>V2Box</b> - Google Play Store\n` +
          `• <b>Hiddify</b> - Google Play Store\n\n` +
          `<b>iOS:</b>\n` +
          `• <b>Streisand</b> - App Store\n` +
          `• <b>FoXray</b> - App Store\n\n` +
          `<b>Windows/Mac/Linux:</b>\n` +
          `• <b>v2rayN</b> (Windows) - GitHub Releases\n` +
          `• <b>v2rayNG</b> (Linux) - GitHub Releases\n` +
          `• <b>Amnezia VPN</b> (только для ПК!) - Официальный сайт или GitHub\n\n` +
          `<b>Как подключиться:</b>\n` +
          `1. Установи приложение\n` +
          `2. Получи ключ: /my_link или кнопка "🔗 Моя ссылка"\n` +
          `3. В приложении нажми "+" → "Import from Clipboard"\n` +
          `4. Вставь vless:// ссылку\n` +
          `5. Подключись\n\n` +
          `<i>⚠️ Amnezia работает ТОЛЬКО на ПК (Windows/Mac/Linux)!</i>\n` +
          `<i>⚠️ На телефонах (Android/iOS) используй v2rayNG, V2Box или Streisand!</i>`,
        { 
          parse_mode: "HTML",
          reply_markup: keyboard
        }
      );
      return;
    }

    if (text === "💳 Оплата") {
      // Показываем методы оплаты
      showPaymentMethods(bot, chatId);
      return;
    }

    if (isAdmin(userId)) {
      // Кнопки администратора
      if (text === "👶 Малютки") {
        const response = await apiClient.getClients();
        const clients = response.clients || [];
        
        // Получаем информацию об активных устройствах
        const deviceInfo = await getActiveDevices();
        
        let message = `👥 <b>Список клиентов (${clients.length}):</b>\n\n`;
        
        if (clients.length === 0) {
          message += "📭 Клиенты не найдены\n\n";
        } else {
          clients.forEach((client, i) => {
            const status = client.status === "active" ? "✅" : "❌";
            const endDate = new Date(client.subscription_end);
            const daysLeft = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));
            const isExpiringSoon = daysLeft > 0 && daysLeft <= 7;
            
            // Информация об устройствах
            const devices = deviceInfo[client.uuid];
            const deviceCount = devices ? devices.count : 0;
            const maxDevices = client.max_devices || 2;
            
            message += `${i + 1}. ${status} <b>${client.name}</b>\n`;
            message += `   UUID: <code>${client.uuid}</code>\n`;
            message += `   Telegram: ${client.telegram_id || "не связан"}\n`;
            message += `   Подписка: ${daysLeft > 0 ? `${daysLeft} дней` : "истекла"}${isExpiringSoon ? ' ⏰ (скоро истекает!)' : ''}\n`;
            message += `   Устройств: ${deviceCount}/${maxDevices}`;
            if (deviceCount > maxDevices) {
              message += ` ⚠️ (превышен лимит!)`;
            }
            message += `\n\n`;
          });
        }

        const keyboard = {
          inline_keyboard: [
            [
              { text: "➕ Добавить клиента", callback_data: "admin_add_client" },
              { text: "🗑️ Удалить клиента", callback_data: "admin_remove_client" }
            ],
            [
              { text: "ℹ️ Информация о клиенте", callback_data: "admin_client_info" }
            ],
            [
              { text: "⚠️ Баны и предупреждения", callback_data: "admin_bans_warnings" }
            ],
            [
              { text: "🔔 Проверить подписки", callback_data: "admin_check_subscriptions" }
            ],
            [
              { text: "📊 Проверить трафик", callback_data: "admin_check_traffic" }
            ],
            [
              { text: "📱 Проверить устройства", callback_data: "admin_check_devices" }
            ],
            [
              { text: "🔍 Проверить торренты", callback_data: "admin_check_torrents" }
            ]
          ]
        };

        bot.sendMessage(chatId, message, { 
          parse_mode: "HTML",
          reply_markup: keyboard
        });
      } else if (text === "📊 Статистика") {
        const clientsResponse = await apiClient.getClients();
        const clients = clientsResponse.clients || [];
        
        const activeClients = clients.filter(c => c.status === "active");
        const blockedClients = clients.filter(c => c.status === "blocked");
        const totalTraffic = clients.reduce((sum, c) => sum + (c.traffic_used_gb || 0), 0);
        
        // Получаем статистику трафика за день/неделю/месяц для всех клиентов
        let dayTraffic = 0;
        let weekTraffic = 0;
        let monthTraffic = 0;
        
        for (const client of clients) {
          try {
            const statsResponse = await apiClient.getClientTrafficStats(client.uuid);
            const stats = statsResponse.stats;
            dayTraffic += stats.day || 0;
            weekTraffic += stats.week || 0;
            monthTraffic += stats.month || 0;
          } catch (err) {
            console.error(`Ошибка получения статистики для ${client.uuid}:`, err);
          }
        }
        
        // Топ 5 клиентов по трафику
        const topClients = [...clients]
          .sort((a, b) => (b.traffic_used_gb || 0) - (a.traffic_used_gb || 0))
          .slice(0, 5);
        
        // Клиенты с истекающими подписками (< 7 дней)
        const now = new Date();
        const expiringClients = activeClients.filter(c => {
          const endDate = new Date(c.subscription_end);
          const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
          return daysLeft > 0 && daysLeft <= 7;
        });
        
        // Клиенты с превышением трафика (> 80%)
        const highTrafficClients = activeClients.filter(c => {
          const percent = (c.traffic_used_gb / c.traffic_limit_gb) * 100;
          return percent >= 80;
        });
        
        let message = `📊 <b>Статистика сервера</b>\n\n`;
        message += `👥 <b>Клиенты:</b>\n`;
        message += `   Всего: ${clients.length}\n`;
        message += `   Активных: ${activeClients.length}\n`;
        message += `   Заблокированных: ${blockedClients.length}\n\n`;
        message += `📈 <b>Трафик:</b>\n`;
        message += `   За день: ${dayTraffic.toFixed(2)} GB\n`;
        message += `   За неделю: ${weekTraffic.toFixed(2)} GB\n`;
        message += `   За месяц: ${monthTraffic.toFixed(2)} GB\n`;
        message += `   Текущий (с сброса): ${totalTraffic.toFixed(2)} GB\n`;
        message += `   Средний на клиента: ${(totalTraffic / clients.length || 0).toFixed(2)} GB\n\n`;
        
        if (topClients.length > 0) {
          message += `🏆 <b>Топ клиентов по трафику:</b>\n`;
          topClients.forEach((c, i) => {
            message += `   ${i + 1}. ${c.name}: ${(c.traffic_used_gb || 0).toFixed(2)} GB\n`;
          });
          message += `\n`;
        }
        
        if (expiringClients.length > 0) {
          message += `⏰ <b>Истекающие подписки (&lt; 7 дней):</b> ${expiringClients.length}\n`;
          expiringClients.forEach(c => {
            const endDate = new Date(c.subscription_end);
            const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
            message += `   • ${c.name}: ${daysLeft} ${daysLeft === 1 ? 'день' : daysLeft < 5 ? 'дня' : 'дней'}\n`;
          });
          message += `\n`;
        }
        
        if (highTrafficClients.length > 0) {
          message += `⚠️ <b>Превышение трафика (&gt; 80%):</b> ${highTrafficClients.length}\n`;
        }
        
        bot.sendMessage(chatId, message, { parse_mode: "HTML" });
      } else if (text === "📝 Запросы") {
        const response = await apiClient.getExtensionRequests();
        const allRequests = response.requests || [];
        const pendingRequests = allRequests.filter(r => r.status === "pending");
        
        if (pendingRequests.length === 0) {
          bot.sendMessage(chatId, "📭 Нет ожидающих запросов");
          return;
        }
        
        let message = `📝 <b>Запросы на продление (${pendingRequests.length}):</b>\n\n`;
        
        pendingRequests.forEach((req, i) => {
          message += `${i + 1}. <b>${req.client_name}</b>\n`;
          message += `   UUID: <code>${req.client_uuid}</code>\n`;
          message += `   Запрошено: ${req.requested_months} мес. (${req.requested_days} дней)\n`;
          message += `   Дата: ${formatDate(req.created_at)}\n\n`;
        });
        
        // Сохраняем список запросов в состояние
        userStates.set(userId, { 
          action: "requests_list", 
          requests: pendingRequests 
        });
        
        const keyboard = {
          inline_keyboard: pendingRequests.map((req, index) => [{
            text: `${index + 1}. ${req.client_name} (${req.requested_months} мес.)`,
            callback_data: `req_idx_${index}`
          }])
        };
        
        bot.sendMessage(chatId, message, { 
          parse_mode: "HTML",
          reply_markup: keyboard
        });
      } else if (text === "⚙️ Сервер") {
        const clientsResponse = await apiClient.getClients();
        const clients = clientsResponse.clients || [];
        
        const activeClients = clients.filter(c => c.status === "active").length;
        const blockedClients = clients.filter(c => c.status === "blocked").length;

        const keyboard = {
          inline_keyboard: [
            [
              { text: "💾 Создать бэкап", callback_data: "admin_backup" }
            ],
            [
              { text: "📂 Список бэкапов", callback_data: "admin_list_backups" }
            ]
          ]
        };

        let message = `⚙️ <b>Статус сервера</b>\n\n`;
        message += `✅ Сервер: Онлайн\n`;
        message += `🌐 VPN: <code>${SERVER_IP}:443</code>\n`;
        message += `🔧 API: <code>${SERVER_IP}:333</code>\n`;
        message += `📊 База данных: Подключена\n\n`;
        message += `👥 <b>Клиенты:</b>\n`;
        message += `   Всего: ${clients.length}\n`;
        message += `   Активных: ${activeClients}\n`;
        message += `   Заблокированных: ${blockedClients}\n`;

        bot.sendMessage(chatId, message, { 
          parse_mode: "HTML",
          reply_markup: keyboard
        });
      } else if (text === "🔧 Xray") {
        const keyboard = {
          inline_keyboard: [
            [
              { text: "▶️ Запустить", callback_data: "xray_start" },
              { text: "⏹️ Остановить", callback_data: "xray_stop" }
            ],
            [
              { text: "🔄 Перезапустить", callback_data: "xray_restart" },
              { text: "📊 Статус", callback_data: "xray_status" }
            ]
          ]
        };

        bot.sendMessage(
          chatId,
          `🔧 <b>Управление Xray сервисом</b>\n\n` +
            `Выбери действие:`,
          {
            parse_mode: "HTML",
            reply_markup: keyboard
          }
        );
      } else if (text === "📊 Мой VPN") {
        // Для админа ищем клиента с именем "Админ"
        const response = await apiClient.getClients();
        const clients = response.clients || [];
        const adminClient = clients.find(c => c.name === "Админ");

        if (!adminClient) {
          bot.sendMessage(chatId, "❌ Клиент 'Админ' не найден в системе");
          return;
        }

        const clientResponse = await apiClient.getClient(adminClient.uuid);
        const clientData = clientResponse.client;

        // Получаем общий трафик за период
        let totalTrafficData = null;
        try {
          const trafficResponse = await apiClient.getClientTotalTraffic(adminClient.uuid);
          totalTrafficData = trafficResponse.traffic;
        } catch (error) {
          // Игнорируем ошибку если endpoint не найден (старая версия API)
          if (!error.message.includes('Not Found')) {
            console.error("Ошибка получения общего трафика:", error);
          }
        }

        const endDate = new Date(clientData.subscription_end);
        const daysLeft = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));
        const status = clientData.status === "active" ? "✅ Активен" : "❌ Заблокирован";
        const trafficPercent = Math.round((clientData.traffic_used_gb / clientData.traffic_limit_gb) * 100);

        // Получаем информацию об активных устройствах
        const deviceInfo = await getActiveDevices();
        const devices = deviceInfo[clientData.uuid];
        const deviceCount = devices ? devices.count : 0;
        const maxDevices = clientData.max_devices || 2;

        let message = `📊 <b>Моя статистика VPN</b>\n\n`;
        message += `👤 <b>Имя:</b> ${clientData.name}\n`;
        message += `🆔 <b>UUID:</b> <code>${clientData.uuid}</code>\n\n`;
        message += `<b>Статус:</b> ${status}\n`;
        message += `<b>Подписка:</b> ${daysLeft > 0 ? `${daysLeft} дней` : "истекла ⚠️"}\n`;
        message += `<b>Конец подписки:</b> ${formatDate(endDate)}\n\n`;
        message += `<b>Трафик:</b> ${formatTraffic(clientData.traffic_used_gb)}/${clientData.traffic_limit_gb} GB (${trafficPercent}%)\n`;
        
        // Добавляем общий трафик за месяц
        if (totalTrafficData && totalTrafficData.total_gb > 0) {
          message += `<b>Всего за месяц:</b> ${formatTraffic(totalTrafficData.total_gb)} GB\n`;
        }
        
        message += `<b>📱 Устройств:</b> ${deviceCount}/${maxDevices}`;
        
        if (deviceCount > maxDevices) {
          message += ` ⚠️ (превышен лимит!)`;
        }
        message += `\n`;

        if (daysLeft <= 7 && daysLeft > 0) {
          message += `\n⚠️ <b>Внимание:</b> Подписка истекает через ${daysLeft} дней!`;
        }

        const keyboard = {
          inline_keyboard: [
            [
              { text: "🔍 Проверка VPN", callback_data: "check_vpn_status" }
            ]
          ]
        };

        bot.sendMessage(chatId, message, { 
          parse_mode: "HTML",
          reply_markup: keyboard
        });
      }
    } else {
      // Кнопки клиента
      const client = await getClientByTelegramId(userId);

      if (!client) {
        bot.sendMessage(
          chatId,
          "❌ Ты не зарегистрирован в системе.\n" +
            "Обратитесь к администратору."
        );
        return;
      }

      if (text === "📊 Мой VPN") {
        const response = await apiClient.getClient(client.uuid);
        const clientData = response.client;

        // Получаем общий трафик за период
        let totalTrafficData = null;
        try {
          const trafficResponse = await apiClient.getClientTotalTraffic(client.uuid);
          totalTrafficData = trafficResponse.traffic;
        } catch (error) {
          // Игнорируем ошибку если endpoint не найден (старая версия API)
          if (!error.message.includes('Not Found')) {
            console.error("Ошибка получения общего трафика:", error);
          }
        }

        const endDate = new Date(clientData.subscription_end);
        const daysLeft = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));
        const status = clientData.status === "active" ? "✅ Активен" : "❌ Заблокирован";
        const trafficPercent = Math.round((clientData.traffic_used_gb / clientData.traffic_limit_gb) * 100);

        // Получаем информацию об активных устройствах
        const deviceInfo = await getActiveDevices();
        const devices = deviceInfo[clientData.uuid];
        const deviceCount = devices ? devices.count : 0;
        const maxDevices = clientData.max_devices || 2;

        let message = `📊 <b>Моя статистика VPN</b>\n\n`;
        message += `👤 <b>Имя:</b> ${clientData.name}\n`;
        message += `🆔 <b>UUID:</b> <code>${clientData.uuid}</code>\n\n`;
        message += `<b>Статус:</b> ${status}\n`;
        message += `<b>Подписка:</b> ${daysLeft > 0 ? `${daysLeft} дней` : "истекла ⚠️"}\n`;
        message += `<b>Конец подписки:</b> ${formatDate(endDate)}\n\n`;
        message += `<b>Трафик:</b> ${formatTraffic(clientData.traffic_used_gb)}/${clientData.traffic_limit_gb} GB (${trafficPercent}%)\n`;
        
        // Добавляем общий трафик за месяц
        if (totalTrafficData && totalTrafficData.total_gb > 0) {
          message += `<b>Всего за месяц:</b> ${formatTraffic(totalTrafficData.total_gb)} GB\n`;
        }
        
        message += `<b>📱 Устройств:</b> ${deviceCount}/${maxDevices}`;
        
        if (deviceCount > maxDevices) {
          message += ` ⚠️ (превышен лимит!)`;
        }
        message += `\n`;

        if (daysLeft <= 7 && daysLeft > 0) {
          message += `\n⚠️ <b>Внимание:</b> Подписка истекает через ${daysLeft} дней!`;
        }

        const keyboard = {
          inline_keyboard: [
            [
              { text: "🔍 Проверка VPN", callback_data: "check_vpn_status" }
            ]
          ]
        };

        bot.sendMessage(chatId, message, { 
          parse_mode: "HTML",
          reply_markup: keyboard
        });
      } else if (text === "🔗 Моя ссылка") {
        // Генерируем vless ссылку
        let vlessLink = '';
        try {
          if (XRAY_PUBLIC_KEY && XRAY_SHORT_ID) {
            vlessLink = generateVlessLink({
              uuid: client.uuid,
              serverIp: SERVER_IP,
              port: XRAY_PORT,
              publicKey: XRAY_PUBLIC_KEY,
              shortId: XRAY_SHORT_ID,
              sni: XRAY_SNI,
              clientName: client.name
            });
          }
        } catch (linkError) {
          console.error('Ошибка генерации vless ссылки:', linkError);
        }
        
        let message = `🔗 <b>Ссылка подключения</b>\n\n`;
        
        if (vlessLink) {
          message += `<b>Твоя ссылка для подключения:</b>\n`;
          message += `<code>${vlessLink}</code>\n\n`;
          message += `📱 <b>Как подключиться:</b>\n`;
          message += `1. Скопируй ссылку выше или отсканируй QR код ниже\n`;
          message += `2. Открой VPN клиент:\n`;
          message += `   • Windows: v2rayN или Amnezia VPN\n`;
          message += `   • Linux: v2rayN\n`;
          message += `   • Android: v2rayNG\n`;
          message += `   • iOS/macOS: Streisand\n`;
          message += `3. Вставь ссылку в клиент или отсканируй QR\n`;
          message += `4. Подключись к VPN\n\n`;
          message += `💡 <b>Совет:</b> Нажми на ссылку чтобы скопировать\n\n`;
          message += `<i>⚠️ Amnezia VPN работает только на ПК (Windows/Mac/Linux)</i>`;
          
          // Отправляем сообщение
          bot.sendMessage(chatId, message, { parse_mode: "HTML" });
          
          // Генерируем и отправляем QR код
          try {
            const qrBuffer = await QRCode.toBuffer(vlessLink, {
              errorCorrectionLevel: 'M',
              type: 'png',
              width: 512,
              margin: 2
            });
            
            bot.sendPhoto(chatId, qrBuffer, {
              caption: `📱 QR код для быстрого подключения\n\nОтсканируй этот код в VPN клиенте`
            });
          } catch (qrError) {
            console.error('Ошибка генерации QR кода:', qrError);
          }
        } else {
          message += `Твой UUID: <code>${client.uuid}</code>\n\n`;
          message += `⚠️ Автоматическая генерация ссылок временно недоступна.\n`;
          message += `Для получения ссылки подключения обратись к администратору.`;
          
          bot.sendMessage(chatId, message, { parse_mode: "HTML" });
        }
      } else if (text === "🔑 Запросить ключ") {
        // Показываем выбор периода
        const keyboard = {
          inline_keyboard: [
            [
              { text: "1 месяц", callback_data: "request_1" },
              { text: "2 месяца", callback_data: "request_2" },
              { text: "3 месяца", callback_data: "request_3" },
            ],
            [
              { text: "6 месяцев", callback_data: "request_6" },
              { text: "12 месяцев", callback_data: "request_12" },
            ],
            [{ text: "❌ Отмена", callback_data: "request_cancel" }],
          ],
        };

        bot.sendMessage(
          chatId,
          `🔑 <b>Запрос на продление подписки</b>\n\n` +
            `Выбери период продления:`,
          {
            parse_mode: "HTML",
            reply_markup: keyboard,
          }
        );
      } else if (text === "📝 Мои запросы") {
        const response = await apiClient.getClientExtensionRequests(client.uuid);
        const requests = response.requests || [];

        if (requests.length === 0) {
          bot.sendMessage(chatId, "📭 У тебя нет запросов на продление");
          return;
        }

        let message = `📝 <b>Мои запросы на продление (${requests.length}):</b>\n\n`;

        requests.forEach((req, i) => {
          const statusEmoji = req.status === "pending" ? "⏳" : req.status === "approved" ? "✅" : "❌";
          const statusText = req.status === "pending" ? "Ожидает" : req.status === "approved" ? "Одобрен" : "Отклонен";
          
          message += `${i + 1}. ${statusEmoji} <b>${statusText}</b>\n`;
          message += `   Запрошено: ${req.requested_months} мес. (${req.requested_days} дней)\n`;
          
          if (req.status === "approved") {
            message += `   Одобрено: ${req.approved_days} дней\n`;
          } else if (req.status === "denied" && req.denial_reason) {
            message += `   Причина: ${req.denial_reason}\n`;
          }
          
          message += `   Дата: ${formatDate(req.created_at)}\n\n`;
        });

        bot.sendMessage(chatId, message, { parse_mode: "HTML" });
      }
    }
  } catch (error) {
    console.error("Ошибка обработки кнопки:", error);
    bot.sendMessage(chatId, "❌ Произошла ошибка. Попробуйте позже.");
  }
});

// ============================================================================
// ОБРАБОТЧИКИ CALLBACK QUERY (inline кнопки)
// ============================================================================

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  console.log(`[CALLBACK] User ${userId} sent callback: "${data}"`);

  try {
    // ========================================================================
    // ОБРАБОТЧИКИ ПЛАТЕЖЕЙ
    // ========================================================================
    
    // Выбор метода оплаты
    if (data.startsWith('payment_method_')) {
      const method = data.replace('payment_method_', '');
      bot.answerCallbackQuery(query.id);
      
      bot.editMessageText(
        `💳 <b>Выбран метод оплаты</b>\n\nВыбери тарифный план:`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'HTML'
        }
      );
      
      showSubscriptionPlans(bot, chatId, method);
      return;
    }
    
    // Выбор тарифного плана
    if (data.startsWith('payment_plan_')) {
      const parts = data.replace('payment_plan_', '').split('_');
      const method = parts[0];
      const plan = parts.slice(1).join('_');
      
      bot.answerCallbackQuery(query.id);
      
      await handlePaymentPlan(bot, chatId, userId, method, plan);
      return;
    }
    
    // Назад к выбору методов
    if (data === 'payment_back_to_methods') {
      bot.answerCallbackQuery(query.id);
      
      bot.editMessageText(
        `💳 <b>Выбери способ оплаты</b>`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'HTML'
        }
      );
      
      showPaymentMethods(bot, chatId);
      return;
    }
    
    // Отмена оплаты
    if (data === 'payment_cancel') {
      bot.answerCallbackQuery(query.id);
      
      bot.editMessageText(
        `❌ Оплата отменена`,
        {
          chat_id: chatId,
          message_id: query.message.message_id
        }
      );
      return;
    }
    
    // Проверка оплаты Kaspa
    if (data.startsWith('kaspa_paid_')) {
      const paymentId = data.replace('kaspa_paid_', '');
      
      bot.answerCallbackQuery(query.id, {
        text: '⏳ Проверяем платеж...',
        show_alert: false
      });
      
      bot.editMessageText(
        `⏳ <b>Проверка платежа...</b>\n\n` +
          `Ищем транзакцию в блокчейне Kaspa.\n` +
          `Это может занять 1-2 минуты.`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'HTML'
        }
      );
      
      // Импортируем функцию проверки
      const { checkKaspaPayment } = await import('./payments/kaspa.js');
      
      // Проверяем платеж
      const result = await checkKaspaPayment(paymentId, apiClient, bot);
      
      if (result.success) {
        bot.editMessageText(
          `✅ <b>Платеж подтвержден!</b>\n\n` +
            `Твоя подписка успешно продлена.\n\n` +
            `<b>TX ID:</b> <code>${result.txId}</code>`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'HTML'
          }
        );
      } else {
        bot.editMessageText(
          `❌ <b>Платеж не найден</b>\n\n` +
            `Транзакция еще не подтверждена в блокчейне.\n\n` +
            `Попробуй еще раз через 1-2 минуты или обратись к администратору.\n\n` +
            `<i>Ошибка: ${result.error}</i>`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'HTML'
          }
        );
      }
      
      return;
    }
    
    // Проверка оплаты TON
    if (data.startsWith('ton_paid_')) {
      const paymentId = data.replace('ton_paid_', '');
      
      bot.answerCallbackQuery(query.id, {
        text: '⏳ Проверяем платеж...',
        show_alert: false
      });
      
      bot.editMessageText(
        `⏳ <b>Проверка платежа...</b>\n\n` +
          `Ищем транзакцию в блокчейне TON.\n` +
          `Это может занять 1-2 минуты.`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'HTML'
        }
      );
      
      // Импортируем функцию проверки
      const { checkTONPayment } = await import('./payments/ton-connect.js');
      
      // Проверяем платеж
      const result = await checkTONPayment(paymentId, apiClient, bot);
      
      if (result.success) {
        bot.editMessageText(
          `✅ <b>Платеж подтвержден!</b>\n\n` +
            `Твоя подписка успешно продлена.\n\n` +
            `<b>TX Hash:</b> <code>${result.txId}</code>`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'HTML'
          }
        );
      } else {
        bot.editMessageText(
          `❌ <b>Платеж не найден</b>\n\n` +
            `Транзакция еще не подтверждена в блокчейне.\n\n` +
            `Попробуй еще раз через 1-2 минуты или обратись к администратору.\n\n` +
            `<i>Ошибка: ${result.error}</i>`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'HTML'
          }
        );
      }
      
      return;
    }
    
    // Проверка оплаты USDT
    if (data.startsWith('usdt_paid_')) {
      const paymentId = data.replace('usdt_paid_', '');
      
      bot.answerCallbackQuery(query.id, {
        text: '⏳ Проверяем платеж...',
        show_alert: false
      });
      
      bot.editMessageText(
        `⏳ <b>Проверка платежа...</b>\n\n` +
          `Ищем транзакцию USDT в сети TRON.\n` +
          `Это может занять 1-2 минуты.`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'HTML'
        }
      );
      
      // Импортируем функцию проверки
      const { checkUSDTPayment } = await import('./payments/usdt.js');
      
      // Проверяем платеж
      const result = await checkUSDTPayment(paymentId, apiClient, bot);
      
      if (result.success) {
        bot.editMessageText(
          `✅ <b>Платеж подтвержден!</b>\n\n` +
            `Твоя подписка успешно продлена.\n\n` +
            `<b>TX ID:</b> <code>${result.txId}</code>`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'HTML'
          }
        );
      } else {
        bot.editMessageText(
          `❌ <b>Платеж не найден</b>\n\n` +
            `Транзакция еще не подтверждена в блокчейне.\n\n` +
            `Попробуй еще раз через 1-2 минуты или обратись к администратору.\n\n` +
            `<i>Ошибка: ${result.error}</i>`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'HTML'
          }
        );
      }
      
      return;
    }
    
    // ========================================================================
    // ОСТАЛЬНЫЕ ОБРАБОТЧИКИ
    // ========================================================================
    
    // Информация о безопасности
    if (data === "security_info") {
      bot.answerCallbackQuery(query.id);
      
      bot.sendMessage(
        chatId,
        `🔒 <b>Безопасность и шифрование</b>\n\n` +
          `<b>VLESS + Reality + XHTTP</b>\n\n` +
          `<b>Reality</b> - это и есть шифрование. Оно использует TLS 1.3 для шифрования всего трафика:\n\n` +
          `🔐 <b>TLS 1.3 шифрование</b>\n` +
          `Reality создает настоящее TLS соединение, которое выглядит как обычный HTTPS трафик к www.microsoft.com\n\n` +
          `🎭 <b>Маскировка</b>\n` +
          `Трафик неотличим от обычного HTTPS, поэтому DPI (Deep Packet Inspection) не может его заблокировать\n\n` +
          `📡 <b>XHTTP</b>\n` +
          `Это просто транспортный протокол поверх TLS, он не влияет на шифрование\n\n` +
          `<b>✅ Что шифруется:</b>\n` +
          `• Весь трафик между клиентом и сервером\n` +
          `• DNS запросы (если используешь VPN для DNS)\n` +
          `• Все данные приложений\n` +
          `• URL и содержимое сайтов\n\n` +
          `<b>❌ Что видит провайдер:</b>\n` +
          `• Только то, что ты подключаешься к www.microsoft.com по HTTPS\n` +
          `• Не видит реальные сайты, которые ты посещаешь\n` +
          `• Не видит содержимое трафика\n\n` +
          `<i>Reality - это один из самых современных и безопасных протоколов для обхода блокировок!</i>`,
        { parse_mode: "HTML" }
      );
      return;
    }
    
    // Кнопка "Погнали" - открыть личный кабинет
    if (data === "start_vpn") {
      const client = await getClientByTelegramId(userId);

      if (!client) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Ошибка: клиент не найден",
          show_alert: true,
        });
        return;
      }

      bot.editMessageText(
        `👋 Добро пожаловать, <b>${client.name}</b>!\n\n` +
          `📊 <b>Твой личный кабинет VPN</b>\n\n` +
          `Используй команду /start для доступа к меню.`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: "HTML"
        }
      );

      // Отправляем новое сообщение с клавиатурой
      bot.sendMessage(
        chatId,
        `Используй кнопки ниже:\n\n` +
          `📊 <b>Мой VPN</b> - Статистика использования\n` +
          `🔗 <b>Моя ссылка</b> - Ссылка подключения и QR код\n` +
          `🔑 <b>Запросить ключ</b> - Продлить подписку\n` +
          `📝 <b>Мои запросы</b> - История запросов\n` +
          `❓ <b>Помощь</b> - Справка`,
        {
          parse_mode: "HTML",
          reply_markup: getMainKeyboard(false),
        }
      );

      bot.answerCallbackQuery(query.id);
      return;
    }

    // Заявка на доступ
    if (data === "request_access") {
      const username = query.from.username || query.from.first_name;
      
      bot.editMessageText(
        `✅ <b>Заявка отправлена!</b>\n\n` +
          `Малютка, админ получил твою заявку и свяжется с тобой в ближайшее время ;-)\n\n` +
          `Твой Telegram ID: <code>${userId}</code>`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: "HTML"
        }
      );

      // Уведомляем админа
      if (TELEGRAM_ADMIN_ID) {
        const keyboard = {
          inline_keyboard: [
            [{ text: "✅ Создать доступ", callback_data: `create_access_${userId}` }],
            [{ text: "❌ Отклонить", callback_data: `deny_access_${userId}` }]
          ]
        };

        bot.sendMessage(
          TELEGRAM_ADMIN_ID,
          `📝 <b>Новая заявка на доступ</b>\n\n` +
            `👤 Имя: ${query.from.first_name || "Не указано"}\n` +
            `📱 Username: ${username ? "@" + username : "Не указан"}\n` +
            `🆔 Telegram ID: <code>${userId}</code>\n\n` +
            `Выбери действие:`,
          {
            parse_mode: "HTML",
            reply_markup: keyboard
          }
        );
      }

      bot.answerCallbackQuery(query.id, { text: "✅ Заявка отправлена" });
      return;
    }

    // Создать доступ для пользователя
    if (data.startsWith("create_access_")) {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      const targetUserId = parseInt(data.substring(14));

      userStates.set(userId, { 
        action: "create_access", 
        targetUserId: targetUserId,
        step: "name"
      });

      bot.editMessageText(
        `➕ <b>Создание доступа</b>\n\n` +
          `Telegram ID: <code>${targetUserId}</code>\n\n` +
          `Введи имя клиента:`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "❌ Отмена", callback_data: "cancel_create_access" }]
            ]
          }
        }
      );

      bot.answerCallbackQuery(query.id);
      return;
    }

    // Отклонить заявку
    if (data.startsWith("deny_access_")) {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      const targetUserId = parseInt(data.substring(12));

      bot.editMessageText(
        `❌ <b>Заявка отклонена</b>\n\n` +
          `Telegram ID: <code>${targetUserId}</code>`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: "HTML"
        }
      );

      // Уведомляем пользователя
      bot.sendMessage(
        targetUserId,
        `❌ <b>Заявка отклонена</b>\n\n` +
          `К сожалению, администратор отклонил твою заявку на доступ к VPN.\n` +
          `Для уточнения причины обратись к администратору.`,
        { parse_mode: "HTML" }
      ).catch(err => {
        console.error("Не удалось отправить уведомление пользователю:", err);
      });

      bot.answerCallbackQuery(query.id, { text: "❌ Заявка отклонена" });
      return;
    }

    // Админские кнопки управления клиентами
    if (data === "admin_add_client") {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      userStates.set(userId, { action: "add_client", step: "name" });
      
      bot.sendMessage(
        chatId,
        "➕ <b>Добавление нового клиента</b>\n\n" +
          "Введи имя клиента:",
        { 
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "❌ Отмена", callback_data: "cancel_add_client" }]
            ]
          }
        }
      );
      
      bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === "admin_remove_client") {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      const response = await apiClient.getClients();
      const clients = response.clients || [];

      if (clients.length === 0) {
        bot.answerCallbackQuery(query.id, {
          text: "📭 Клиенты не найдены",
          show_alert: true,
        });
        return;
      }

      let message = "🗑️ <b>Удаление клиента</b>\n\n";
      message += "Выбери клиента для удаления:\n\n";

      // Сохраняем список клиентов в состояние
      userStates.set(userId, { 
        action: "remove_client_list", 
        clients: clients 
      });

      const keyboard = {
        inline_keyboard: clients.map((client, index) => [{
          text: `${client.name} (${client.uuid.substring(0, 8)}...)`,
          callback_data: `remove_idx_${index}`
        }])
      };

      keyboard.inline_keyboard.push([{ text: "❌ Отмена", callback_data: "remove_cancel" }]);

      bot.sendMessage(chatId, message, {
        parse_mode: "HTML",
        reply_markup: keyboard
      });

      bot.answerCallbackQuery(query.id);
      return;
    }

    if (data === "admin_client_info") {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      const response = await apiClient.getClients();
      const clients = response.clients || [];

      if (clients.length === 0) {
        bot.answerCallbackQuery(query.id, {
          text: "📭 Клиенты не найдены",
          show_alert: true,
        });
        return;
      }

      let message = "ℹ️ <b>Информация о клиенте</b>\n\n";
      message += "Выбери клиента:\n\n";

      // Сохраняем список клиентов в состояние
      userStates.set(userId, { 
        action: "info_client_list", 
        clients: clients 
      });

      const keyboard = {
        inline_keyboard: clients.map((client, index) => [{
          text: `${client.name} (${client.uuid.substring(0, 8)}...)`,
          callback_data: `info_idx_${index}`
        }])
      };

      keyboard.inline_keyboard.push([
        { text: "🏠 Главное меню", callback_data: "back_to_main" },
        { text: "❌ Отмена", callback_data: "info_cancel" }
      ]);

      bot.sendMessage(chatId, message, {
        parse_mode: "HTML",
        reply_markup: keyboard
      });

      bot.answerCallbackQuery(query.id);
      return;
    }

    // Просмотр статистики VPN клиента (для админа)
    if (data.startsWith("admin_view_vpn_")) {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      const uuid = data.replace("admin_view_vpn_", "");
      
      try {
        const response = await apiClient.getClient(uuid);
        const clientData = response.client;

        // Получаем общий трафик за период
        let totalTrafficData = null;
        try {
          const trafficResponse = await apiClient.getClientTotalTraffic(uuid);
          totalTrafficData = trafficResponse.traffic;
        } catch (error) {
          // Игнорируем ошибку если endpoint не найден (старая версия API)
          if (!error.message.includes('Not Found')) {
            console.error("Ошибка получения общего трафика:", error);
          }
        }

        const endDate = new Date(clientData.subscription_end);
        const daysLeft = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));
        const status = clientData.status === "active" ? "✅ Активен" : "❌ Заблокирован";
        const trafficPercent = Math.round((clientData.traffic_used_gb / clientData.traffic_limit_gb) * 100);

        // Получаем информацию об активных устройствах
        const deviceInfo = await getActiveDevices();
        const devices = deviceInfo[clientData.uuid];
        const deviceCount = devices ? devices.count : 0;
        const maxDevices = clientData.max_devices || 2;

        let message = `📊 <b>Статистика VPN: ${clientData.name}</b>\n\n`;
        message += `👤 <b>Имя:</b> ${clientData.name}\n`;
        message += `🆔 <b>UUID:</b> <code>${clientData.uuid}</code>\n\n`;
        message += `<b>Статус:</b> ${status}\n`;
        message += `<b>Подписка:</b> ${daysLeft > 0 ? `${daysLeft} дней` : "истекла ⚠️"}\n`;
        message += `<b>Конец подписки:</b> ${formatDate(endDate)}\n\n`;
        message += `<b>Трафик:</b> ${formatTraffic(clientData.traffic_used_gb)}/${clientData.traffic_limit_gb} GB (${trafficPercent}%)\n`;
        
        // Добавляем общий трафик за месяц
        if (totalTrafficData && totalTrafficData.total_gb > 0) {
          message += `<b>Всего за месяц:</b> ${formatTraffic(totalTrafficData.total_gb)} GB\n`;
        }
        
        message += `<b>📱 Устройств:</b> ${deviceCount}/${maxDevices}`;
        
        if (deviceCount > maxDevices) {
          message += ` ⚠️ (превышен лимит!)`;
        }
        message += `\n`;

        if (daysLeft <= 7 && daysLeft > 0) {
          message += `\n⚠️ <b>Внимание:</b> Подписка истекает через ${daysLeft} дней!`;
        }

        bot.sendMessage(chatId, message, { 
          parse_mode: "HTML"
        });

        bot.answerCallbackQuery(query.id);
      } catch (error) {
        console.error("Ошибка получения статистики клиента:", error);
        bot.answerCallbackQuery(query.id, {
          text: "❌ Ошибка получения данных",
          show_alert: true,
        });
      }
      return;
    }

    if (data === "admin_bans_warnings") {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      const response = await apiClient.getClients();
      const clients = response.clients || [];

      if (clients.length === 0) {
        bot.answerCallbackQuery(query.id, {
          text: "📭 Клиенты не найдены",
          show_alert: true,
        });
        return;
      }

      // Фильтруем клиентов с предупреждениями или заблокированных
      const clientsWithIssues = clients.filter(c => 
        c.warnings_count > 0 || c.status === 'blocked'
      );

      let message = `⚠️ <b>Баны и предупреждения</b>\n\n`;
      
      if (clientsWithIssues.length === 0) {
        message += "✅ Нет клиентов с предупреждениями или банами";
        bot.sendMessage(chatId, message, { parse_mode: "HTML" });
        bot.answerCallbackQuery(query.id);
        return;
      }

      message += `Клиентов с проблемами: ${clientsWithIssues.length}\n\n`;

      clientsWithIssues.forEach((client, i) => {
        const status = client.status === "blocked" ? "🔒 Заблокирован" : "✅ Активен";
        message += `${i + 1}. <b>${client.name}</b>\n`;
        message += `   Статус: ${status}\n`;
        message += `   Предупреждения: ${client.warnings_count || 0}/3\n`;
        if (client.blocked_reason) {
          message += `   Причина: ${client.blocked_reason}\n`;
        }
        message += `\n`;
      });

      // Сохраняем список для выбора
      userStates.set(userId, { 
        action: "bans_list", 
        clients: clientsWithIssues 
      });

      const keyboard = {
        inline_keyboard: clientsWithIssues.map((client, index) => [{
          text: `${client.name} (⚠️${client.warnings_count || 0})`,
          callback_data: `ban_idx_${index}`
        }])
      };

      bot.sendMessage(chatId, message, {
        parse_mode: "HTML",
        reply_markup: keyboard
      });

      bot.answerCallbackQuery(query.id);
      return;
    }

    // Проверка подписок вручную
    if (data === "admin_check_subscriptions") {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      try {
        bot.editMessageText(
          `🔔 <b>Проверка подписок</b>\n\n` +
            `⏳ Запуск проверки...`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML"
          }
        );

        // Запускаем скрипт проверки подписок
        const { fileURLToPath } = await import('url');
        const { dirname, join } = await import('path');
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const scriptPath = join(__dirname, 'subscription-checker.js');
        
        const { stdout, stderr } = await execAsync(`node "${scriptPath}"`);
        
        // Парсим вывод скрипта
        let expiredCount = 0;
        let expiringCount = 0;
        const expiredList = [];
        const expiringList = [];
        
        // Ищем строки с результатами
        const expiredMatch = stdout.match(/Истекших подписок:\s*(\d+)/);
        const expiringMatch = stdout.match(/Истекающих подписок[^:]*:\s*(\d+)/);
        
        if (expiredMatch) {
          expiredCount = parseInt(expiredMatch[1]);
        }
        if (expiringMatch) {
          expiringCount = parseInt(expiringMatch[1]);
        }
        
        // Парсим список истекших подписок
        const expiredSection = stdout.match(/Истекшие подписки:\n([\s\S]*?)(?:Истекающие подписки:|Проверка завершена)/);
        if (expiredSection && expiredSection[1]) {
          const lines = expiredSection[1].trim().split('\n');
          lines.forEach(line => {
            const match = line.match(/\d+\.\s+(.+?)\s+-\s+истекла\s+(.+)/);
            if (match) {
              expiredList.push({
                name: match[1],
                date: match[2]
              });
            }
          });
        }
        
        // Парсим список истекающих подписок
        const expiringSection = stdout.match(/Истекающие подписки:\n([\s\S]*?)Проверка завершена/);
        if (expiringSection && expiringSection[1]) {
          const lines = expiringSection[1].trim().split('\n');
          lines.forEach(line => {
            const match = line.match(/\d+\.\s+(.+?)\s+-\s+через\s+(\d+)\s+(.+?)\s+\((.+?)\)/);
            if (match) {
              expiringList.push({
                name: match[1],
                days: match[2],
                daysWord: match[3],
                date: match[4]
              });
            }
          });
        }
        
        let resultMessage = `🔔 <b>Проверка подписок</b>\n\n`;
        resultMessage += `✅ Проверка завершена\n\n`;
        resultMessage += `📊 <b>Результаты:</b>\n`;
        resultMessage += `• Истекших подписок: ${expiredCount}\n`;
        resultMessage += `• Истекающих подписок (≤3 дней): ${expiringCount}\n\n`;
        
        if (expiredCount > 0) {
          resultMessage += `🔒 <b>Истекшие подписки:</b>\n`;
          expiredList.forEach((client, i) => {
            resultMessage += `${i + 1}. <b>${client.name}</b> - ${client.date}\n`;
          });
          resultMessage += `\n✅ Автоматически заблокированы\n\n`;
        }
        
        if (expiringCount > 0) {
          resultMessage += `⏰ <b>Истекающие подписки:</b>\n`;
          expiringList.forEach((client, i) => {
            resultMessage += `${i + 1}. <b>${client.name}</b> - через ${client.days} ${client.daysWord}\n`;
          });
          resultMessage += `\n📨 Уведомления отправлены клиентам\n\n`;
        }
        
        if (expiredCount === 0 && expiringCount === 0) {
          resultMessage += `✅ Все подписки в порядке\n\n`;
        }
        
        resultMessage += `<i>Автоматическая проверка: каждый день в 10:00</i>`;
        
        bot.editMessageText(resultMessage, {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: "HTML"
        });

        bot.answerCallbackQuery(query.id, {
          text: "✅ Проверка завершена",
          show_alert: false,
        });
      } catch (error) {
        console.error("Ошибка проверки подписок:", error);
        
        bot.editMessageText(
          `🔔 <b>Проверка подписок</b>\n\n` +
            `❌ Ошибка выполнения:\n<code>${error.message}</code>`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML"
          }
        );

        bot.answerCallbackQuery(query.id, {
          text: "❌ Ошибка проверки",
          show_alert: true,
        });
      }
      return;
    }

    // Проверка трафика вручную
    if (data === "admin_check_traffic") {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      try {
        bot.editMessageText(
          `📊 <b>Проверка трафика</b>\n\n` +
            `⏳ Запуск проверки...`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML"
          }
        );

        // Запускаем скрипт проверки трафика
        const { fileURLToPath } = await import('url');
        const { dirname, join } = await import('path');
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const scriptPath = join(__dirname, 'traffic-checker.js');
        
        const { stdout, stderr } = await execAsync(`node "${scriptPath}"`);
        
        // Парсим вывод скрипта
        let totalClients = 0;
        let warningCount = 0;
        const clientsList = [];
        
        // Ищем строки с результатами
        const totalMatch = stdout.match(/Всего клиентов:\s*(\d+)/);
        const warningMatch = stdout.match(/Превысили.*?:\s*(\d+)/);
        
        if (totalMatch) {
          totalClients = parseInt(totalMatch[1]);
        }
        if (warningMatch) {
          warningCount = parseInt(warningMatch[1]);
        }
        
        // Парсим список клиентов с превышением
        const clientsSection = stdout.match(/Клиенты с превышением:\n([\s\S]*?)Проверка завершена/);
        if (clientsSection && clientsSection[1]) {
          const lines = clientsSection[1].trim().split('\n');
          lines.forEach(line => {
            const match = line.match(/\d+\.\s+(.+?)\s+-\s+([\d.]+)%\s+\((.+?)\s+из\s+(.+?)\)/);
            if (match) {
              clientsList.push({
                name: match[1],
                percent: match[2],
                used: match[3],
                limit: match[4]
              });
            }
          });
        }
        
        let resultMessage = `📊 <b>Проверка трафика</b>\n\n`;
        resultMessage += `✅ Проверка завершена\n\n`;
        resultMessage += `📊 <b>Результаты:</b>\n`;
        resultMessage += `• Всего активных клиентов: ${totalClients}\n`;
        resultMessage += `• Превысили 80% лимита: ${warningCount}\n\n`;
        
        if (warningCount > 0) {
          resultMessage += `⚠️ <b>Клиенты с превышением:</b>\n`;
          clientsList.forEach((client, i) => {
            resultMessage += `${i + 1}. <b>${client.name}</b> - ${client.percent}%\n`;
            resultMessage += `   ${client.used} из ${client.limit}\n`;
          });
          resultMessage += `\n📨 Уведомления отправлены клиентам и админу\n`;
        } else {
          resultMessage += `✅ Все клиенты в пределах нормы\n`;
        }
        
        resultMessage += `\n<i>Автоматическая проверка: 3 раза в день (10:00, 15:00, 20:00)</i>`;
        
        bot.editMessageText(resultMessage, {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: "HTML"
        });

        bot.answerCallbackQuery(query.id, {
          text: "✅ Проверка завершена",
          show_alert: false,
        });
      } catch (error) {
        console.error("Ошибка проверки трафика:", error);
        
        bot.editMessageText(
          `📊 <b>Проверка трафика</b>\n\n` +
            `❌ Ошибка выполнения:\n<code>${error.message}</code>`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML"
          }
        );

        bot.answerCallbackQuery(query.id, {
          text: "❌ Ошибка проверки",
          show_alert: true,
        });
      }
      return;
    }

    // Проверка устройств вручную
    if (data === "admin_check_devices") {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      try {
        bot.editMessageText(
          `📱 <b>Проверка устройств</b>\n\n` +
            `⏳ Запуск проверки...`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML"
          }
        );

        // Запускаем скрипт проверки устройств
        const { fileURLToPath } = await import('url');
        const { dirname, join } = await import('path');
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const scriptPath = join(__dirname, 'device-monitor.js');
        
        const { stdout, stderr } = await execAsync(`node "${scriptPath}"`);
        
        // Парсим вывод скрипта
        let totalClients = 0;
        let activeConnections = 0;
        let warningCount = 0;
        const clientsList = [];
        
        // Ищем строки с результатами
        const totalMatch = stdout.match(/Всего активных клиентов:\s*(\d+)/);
        const activeMatch = stdout.match(/Клиентов с активными подключениями:\s*(\d+)/);
        const warningMatch = stdout.match(/Превысили лимит устройств:\s*(\d+)/);
        
        if (totalMatch) {
          totalClients = parseInt(totalMatch[1]);
        }
        if (activeMatch) {
          activeConnections = parseInt(activeMatch[1]);
        }
        if (warningMatch) {
          warningCount = parseInt(warningMatch[1]);
        }
        
        // Парсим список клиентов с превышением
        const clientsSection = stdout.match(/Клиенты с превышением:\n([\s\S]*?)Проверка завершена/);
        if (clientsSection && clientsSection[1]) {
          const lines = clientsSection[1].trim().split('\n');
          lines.forEach(line => {
            const match = line.match(/\d+\.\s+(.+?)\s+-\s+(\d+)\s+устройств/);
            if (match) {
              clientsList.push({
                name: match[1],
                count: match[2]
              });
            }
          });
        }
        
        let resultMessage = `📱 <b>Проверка устройств</b>\n\n`;
        resultMessage += `✅ Проверка завершена\n\n`;
        resultMessage += `📊 <b>Результаты:</b>\n`;
        resultMessage += `• Всего активных клиентов: ${totalClients}\n`;
        resultMessage += `• С активными подключениями: ${activeConnections}\n`;
        resultMessage += `• Превысили лимит (>2): ${warningCount}\n\n`;
        
        if (warningCount > 0) {
          resultMessage += `⚠️ <b>Клиенты с превышением:</b>\n`;
          clientsList.forEach((client, i) => {
            resultMessage += `${i + 1}. <b>${client.name}</b> - ${client.count} устройств\n`;
          });
          resultMessage += `\n📨 Уведомления отправлены админу\n\n`;
        } else {
          resultMessage += `✅ Все клиенты в пределах нормы\n\n`;
        }
        
        resultMessage += `<i>💡 Лимит: 2 устройства на клиента\nАктивное окно: последние 5 минут</i>`;
        
        bot.editMessageText(resultMessage, {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: "HTML"
        });

        bot.answerCallbackQuery(query.id, {
          text: "✅ Проверка завершена",
          show_alert: false,
        });
      } catch (error) {
        console.error("Ошибка проверки устройств:", error);
        
        bot.editMessageText(
          `📱 <b>Проверка устройств</b>\n\n` +
            `❌ Ошибка выполнения:\n<code>${error.message}</code>`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML"
          }
        );

        bot.answerCallbackQuery(query.id, {
          text: "❌ Ошибка проверки",
          show_alert: true,
        });
      }
      return;
    }

    // Проверка торрентов вручную
    if (data === "admin_check_torrents") {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      try {
        bot.editMessageText(
          `🔍 <b>Проверка торрентов</b>\n\n` +
            `⏳ Запуск проверки...`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML"
          }
        );

        // Запускаем скрипт обнаружения торрентов
        const { fileURLToPath } = await import('url');
        const { dirname, join } = await import('path');
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const scriptPath = join(__dirname, 'torrent-detector.js');
        
        const { stdout, stderr } = await execAsync(`node "${scriptPath}"`);
        
        // Парсим вывод скрипта
        let totalClients = 0;
        let suspiciousCount = 0;
        const clientsList = [];
        
        // Ищем строки с результатами
        const totalMatch = stdout.match(/Всего активных клиентов:\s*(\d+)/);
        const suspiciousMatch = stdout.match(/Подозрительная активность:\s*(\d+)/);
        
        if (totalMatch) {
          totalClients = parseInt(totalMatch[1]);
        }
        if (suspiciousMatch) {
          suspiciousCount = parseInt(suspiciousMatch[1]);
        }
        
        // Парсим список клиентов с подозрительной активностью
        const clientsSection = stdout.match(/Клиенты с подозрительной активностью:\n([\s\S]*?)Проверка завершена/);
        if (clientsSection && clientsSection[1]) {
          const lines = clientsSection[1].trim().split('\n');
          lines.forEach(line => {
            const match = line.match(/\d+\.\s+(.+?)\s+-\s+([\d.]+)\s+GB\/день\s+\((.+?)\)/);
            if (match) {
              clientsList.push({
                name: match[1],
                traffic: match[2],
                status: match[3]
              });
            }
          });
        }
        
        let resultMessage = `🔍 <b>Проверка торрентов</b>\n\n`;
        resultMessage += `✅ Проверка завершена\n\n`;
        resultMessage += `📊 <b>Результаты:</b>\n`;
        resultMessage += `• Всего активных клиентов: ${totalClients}\n`;
        resultMessage += `• Подозрительная активность: ${suspiciousCount}\n\n`;
        
        if (suspiciousCount > 0) {
          resultMessage += `⚠️ <b>Клиенты с подозрительной активностью:</b>\n`;
          clientsList.forEach((client, i) => {
            resultMessage += `${i + 1}. <b>${client.name}</b>\n`;
            resultMessage += `   📊 ${client.traffic} GB/день\n`;
            resultMessage += `   ⚠️ ${client.status}\n`;
          });
          resultMessage += `\n📨 Предупреждения отправлены клиентам\n\n`;
        } else {
          resultMessage += `✅ Подозрительной активности не обнаружено\n\n`;
        }
        
        resultMessage += `<i>💡 Порог: 30 GB/день\nМакс. предупреждений: 3\nДействие: автоблокировка</i>`;
        
        bot.editMessageText(resultMessage, {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: "HTML"
        });

        bot.answerCallbackQuery(query.id, {
          text: "✅ Проверка завершена",
          show_alert: false,
        });
      } catch (error) {
        console.error("Ошибка проверки торрентов:", error);
        
        bot.editMessageText(
          `🔍 <b>Проверка торрентов</b>\n\n` +
            `❌ Ошибка выполнения:\n<code>${error.message}</code>`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML"
          }
        );

        bot.answerCallbackQuery(query.id, {
          text: "❌ Ошибка проверки",
          show_alert: true,
        });
      }
      return;
    }

    // Создание бэкапа (для админа)
    if (data === "admin_backup") {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      try {
        bot.editMessageText(
          `💾 <b>Создание резервной копии</b>\n\n` +
            `⏳ Создание бэкапа...`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML"
          }
        );

        // Запускаем скрипт бэкапа
        const { fileURLToPath } = await import('url');
        const { dirname, join } = await import('path');
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const scriptPath = join(__dirname, 'backup.sh');
        
        const { stdout, stderr } = await execAsync(`bash "${scriptPath}"`);
        
        // Парсим вывод
        const archiveMatch = stdout.match(/Архив:\s*(.+\.tar\.gz)/);
        const sizeMatch = stdout.match(/Размер:\s*(\S+)/);
        
        const archiveName = archiveMatch ? archiveMatch[1].split('/').pop() : 'backup.tar.gz';
        const archiveSize = sizeMatch ? sizeMatch[1] : 'неизвестно';
        
        let resultMessage = `💾 <b>Резервная копия создана</b>\n\n`;
        resultMessage += `✅ Бэкап успешно создан\n\n`;
        resultMessage += `📦 <b>Архив:</b> <code>${archiveName}</code>\n`;
        resultMessage += `📊 <b>Размер:</b> ${archiveSize}\n\n`;
        resultMessage += `<i>💡 Бэкапы хранятся 30 дней\nАвтоматический бэкап: каждые 3 дня в 03:00</i>`;
        
        bot.editMessageText(resultMessage, {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: "HTML"
        });

        bot.answerCallbackQuery(query.id, {
          text: "✅ Бэкап создан",
          show_alert: false,
        });
      } catch (error) {
        console.error("Ошибка создания бэкапа:", error);
        
        bot.editMessageText(
          `💾 <b>Создание резервной копии</b>\n\n` +
            `❌ Ошибка:\n<code>${error.message}</code>`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML"
          }
        );

        bot.answerCallbackQuery(query.id, {
          text: "❌ Ошибка создания бэкапа",
          show_alert: true,
        });
      }
      return;
    }

    // Список бэкапов (для админа)
    if (data === "admin_list_backups") {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      try {
        bot.editMessageText(
          `📂 <b>Список резервных копий</b>\n\n` +
            `⏳ Загрузка...`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML"
          }
        );

        // Получаем список бэкапов
        const { fileURLToPath } = await import('url');
        const { dirname, join } = await import('path');
        const { mkdir } = await import('fs/promises');
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const backupDir = join(dirname(__dirname), 'backups');
        
        // Создаем директорию если не существует
        try {
          await mkdir(backupDir, { recursive: true });
        } catch (err) {
          // Игнорируем если уже существует
        }
        
        const { stdout } = await execAsync(`ls -lht "${backupDir}"/backup_*.tar.gz 2>/dev/null | head -10 || echo ""`);
        
        if (!stdout.trim()) {
          bot.editMessageText(
            `📂 <b>Список резервных копий</b>\n\n` +
              `📭 Резервные копии не найдены\n\n` +
              `<i>Создай первый бэкап кнопкой "💾 Создать бэкап"</i>`,
            {
              chat_id: chatId,
              message_id: query.message.message_id,
              parse_mode: "HTML"
            }
          );
          
          bot.answerCallbackQuery(query.id);
          return;
        }
        
        // Парсим список файлов
        const lines = stdout.trim().split('\n');
        let resultMessage = `📂 <b>Список резервных копий</b>\n\n`;
        resultMessage += `Последние 10 бэкапов:\n\n`;
        
        lines.forEach((line, i) => {
          const parts = line.split(/\s+/);
          if (parts.length >= 9) {
            const size = parts[4];
            const date = `${parts[5]} ${parts[6]} ${parts[7]}`;
            const filename = parts[8].split('/').pop();
            
            resultMessage += `${i + 1}. <code>${filename}</code>\n`;
            resultMessage += `   📊 ${size} | 📅 ${date}\n\n`;
          }
        });
        
        resultMessage += `<i>💡 Для восстановления используй скрипт restore.sh на сервере</i>`;
        
        bot.editMessageText(resultMessage, {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: "HTML"
        });

        bot.answerCallbackQuery(query.id, {
          text: "✅ Список загружен",
          show_alert: false,
        });
      } catch (error) {
        console.error("Ошибка получения списка бэкапов:", error);
        
        bot.editMessageText(
          `📂 <b>Список резервных копий</b>\n\n` +
            `❌ Ошибка:\n<code>${error.message}</code>`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML"
          }
        );

        bot.answerCallbackQuery(query.id, {
          text: "❌ Ошибка",
          show_alert: true,
        });
      }
      return;
    }

    // Проверка VPN статуса (для клиентов)
    if (data === "check_vpn_status") {
      try {
        const checkMessage = 
          `🔍 <b>Как проверить VPN</b>\n\n` +
          `<b>Проверка через браузер:</b>\n` +
          `1. Открой сайт: <code>2ip.io</code>\n` +
          `2. Посмотри свой IP адрес\n\n` +
          `✅ <b>Если VPN подключен:</b>\n` +
          `IP: <code>${SERVER_IP}</code>\n` +
          `Страна: Нидерланды 🇳🇱\n\n` +
          `⚠️ <b>Если VPN не подключен:</b>\n` +
          `Увидишь свой реальный IP и страну`;

        bot.editMessageText(checkMessage, {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🌐 Открыть 2ip.io", url: "https://2ip.io" }
              ]
            ]
          }
        });

        bot.answerCallbackQuery(query.id, {
          text: "📱 Выбери способ проверки",
          show_alert: false,
        });
      } catch (error) {
        console.error("Ошибка:", error);
        
        bot.editMessageText(
          `🔍 <b>Проверка VPN</b>\n\n` +
            `❌ Ошибка.\n` +
            `Попробуй позже.\n\n` +
            `<i>Детали: ${error.message}</i>`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML"
          }
        );

        bot.answerCallbackQuery(query.id, {
          text: "❌ Ошибка",
          show_alert: true,
        });
      }
      return;
    }

    // Запросы на продление от клиента
    if (data.startsWith("request_")) {
      if (data === "request_cancel") {
        bot.editMessageText("❌ Запрос отменен", {
          chat_id: chatId,
          message_id: query.message.message_id,
        });
        bot.answerCallbackQuery(query.id);
        return;
      }

      const months = parseInt(data.split("_")[1]);
      const client = await getClientByTelegramId(userId);

      if (!client) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Ты не зарегистрирован",
          show_alert: true,
        });
        return;
      }

      // Создаем запрос через API
      try {
        const response = await apiClient.createExtensionRequest({
          client_uuid: client.uuid,
          telegram_id: userId,
          requested_months: months
        });

        bot.editMessageText(
          `✅ <b>Запрос отправлен!</b>\n\n` +
            `Период: ${months} ${months === 1 ? "месяц" : "месяцев"}\n\n` +
            `Администратор получил твой запрос и рассмотрит его в ближайшее время.\n` +
            `Ты получите уведомление о решении.`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML",
          }
        );

        // Отправляем уведомление админу
        if (TELEGRAM_ADMIN_ID) {
          const keyboard = {
            inline_keyboard: [
              [
                { text: "✅ Разрешить", callback_data: `approve_${response.request.id}_${months}` },
                { text: "❌ Отказать", callback_data: `deny_${response.request.id}` },
              ],
              [
                { text: "📝 Другой период", callback_data: `change_req_${response.request.id}` },
              ],
            ],
          };

          bot.sendMessage(
            TELEGRAM_ADMIN_ID,
            `🔔 <b>Новый запрос на продление</b>\n\n` +
              `👤 Клиент: ${client.name}\n` +
              `🆔 UUID: <code>${client.uuid}</code>\n` +
              `📅 Запрошено: ${months} ${months === 1 ? "месяц" : "месяцев"} (${response.request.requested_days} дней)\n\n` +
              `Выбери действие:`,
            {
              parse_mode: "HTML",
              reply_markup: keyboard,
            }
          );
        }

        bot.answerCallbackQuery(query.id);
      } catch (error) {
        console.error("Ошибка создания запроса:", error);
        
        let errorMessage = error.message;
        if (errorMessage.includes("already has a pending request")) {
          errorMessage = "У тебя уже есть активный запрос на продление. Дождитесь решения администратора.";
        }
        
        bot.editMessageText(
          `❌ <b>Ошибка</b>\n\n${errorMessage}`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML",
          }
        );
        
        bot.answerCallbackQuery(query.id);
      }
    }

    // Одобрение запроса админом
    else if (data.startsWith("approve_")) {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      const parts = data.split("_");
      const requestId = parts[1];
      const months = parseInt(parts[2]);

      try {
        // Одобряем запрос через API
        const response = await apiClient.approveExtensionRequest(requestId, null, userId);
        const request = response.request;

        bot.editMessageText(
          `✅ <b>Запрос одобрен</b>\n\n` +
            `UUID: <code>${request.client_uuid}</code>\n` +
            `Период: ${months} ${months === 1 ? "месяц" : "месяцев"} (${request.approved_days} дней)\n\n` +
            `Подписка продлена автоматически.`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML",
          }
        );

        // Уведомляем клиента
        if (request.telegram_id) {
          bot.sendMessage(
            request.telegram_id,
            `✅ <b>Твой запрос одобрен!</b>\n\n` +
              `Подписка продлена на ${request.approved_days} дней.\n` +
              `Используй /my_vpn для просмотра обновленной информации.`,
            { parse_mode: "HTML" }
          );
        }

        bot.answerCallbackQuery(query.id, { text: "✅ Запрос одобрен" });
      } catch (error) {
        console.error("Ошибка одобрения запроса:", error);
        bot.answerCallbackQuery(query.id, {
          text: `❌ Ошибка: ${error.message}`,
          show_alert: true,
        });
      }
    }

    // Отказ в запросе
    else if (data.startsWith("deny_")) {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      const requestId = data.split("_")[1];

      try {
        // Отклоняем запрос через API
        const response = await apiClient.denyExtensionRequest(requestId, "Отклонено администратором", userId);
        const request = response.request;

        bot.editMessageText(
          `❌ <b>Запрос отклонен</b>\n\n` +
            `UUID: <code>${request.client_uuid}</code>`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML",
          }
        );

        // Уведомляем клиента
        if (request.telegram_id) {
          bot.sendMessage(
            request.telegram_id,
            `❌ <b>Твой запрос отклонен</b>\n\n` +
              `К сожалению, администратор отклонил твой запрос на продление.\n` +
              `Для уточнения причины обратись к администратору.`,
            { parse_mode: "HTML" }
          );
        }

        bot.answerCallbackQuery(query.id, { text: "❌ Запрос отклонен" });
      } catch (error) {
        console.error("Ошибка отклонения запроса:", error);
        bot.answerCallbackQuery(query.id, {
          text: `❌ Ошибка: ${error.message}`,
          show_alert: true,
        });
      }
    }

    // Изменение периода
    else if (data.startsWith("change_")) {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      if (data.startsWith("change_req_")) {
        const requestId = data.split("_")[2];

        // Устанавливаем состояние для ввода нового периода
        userStates.set(userId, {
          action: "change_period",
          requestId: requestId,
          messageId: query.message.message_id,
        });

        const keyboard = {
          inline_keyboard: [
            [
              { text: "1 месяц", callback_data: `period_${requestId}_30` },
              { text: "2 месяца", callback_data: `period_${requestId}_60` },
              { text: "3 месяца", callback_data: `period_${requestId}_90` }
            ],
            [
              { text: "6 месяцев", callback_data: `period_${requestId}_180` },
              { text: "12 месяцев", callback_data: `period_${requestId}_365` }
            ],
            [
              { text: "✏️ Свой вариант", callback_data: `period_custom_${requestId}` }
            ]
          ]
        };

        bot.sendMessage(
          chatId,
          `📝 <b>Выбери период продления:</b>\n\n` +
            `Или введи количество дней вручную.`,
          {
            parse_mode: "HTML",
            reply_markup: keyboard
          }
        );

        bot.answerCallbackQuery(query.id);
      }
    }

    // Выбор периода из кнопок
    if (data.startsWith("period_")) {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      if (data.startsWith("period_custom_")) {
        const requestId = data.split("_")[2];
        
        userStates.set(userId, {
          action: "change_period",
          requestId: requestId,
          messageId: query.message.message_id,
        });

        bot.sendMessage(
          chatId,
          `✏️ Введи количество дней для продления:\n\n` +
            `Например: 45, 120, 200`,
          {
            reply_markup: {
              force_reply: true,
              selective: true,
            },
          }
        );

        bot.answerCallbackQuery(query.id);
        return;
      }

      const parts = data.split("_");
      const requestId = parts[1];
      const days = parseInt(parts[2]);

      try {
        // Одобряем запрос с новым периодом
        const response = await apiClient.approveExtensionRequest(requestId, days, userId);
        const request = response.request;
        
        bot.sendMessage(
          chatId,
          `✅ <b>Запрос одобрен с измененным периодом</b>\n\n` +
            `UUID: <code>${request.client_uuid}</code>\n` +
            `Период: ${days} дней\n\n` +
            `Подписка продлена автоматически.`,
          {
            parse_mode: "HTML",
          }
        );
        
        // Уведомляем клиента
        if (request.telegram_id) {
          bot.sendMessage(
            request.telegram_id,
            `✅ <b>Твой запрос одобрен!</b>\n\n` +
              `Подписка продлена на ${days} дней.\n` +
              `Используй /my_vpn для просмотра обновленной информации.`,
            { parse_mode: "HTML" }
          );
        }
        
        userStates.delete(userId);
        bot.answerCallbackQuery(query.id, { text: "✅ Запрос одобрен" });
      } catch (error) {
        console.error("Ошибка изменения периода:", error);
        bot.answerCallbackQuery(query.id, {
          text: `❌ Ошибка: ${error.message}`,
          show_alert: true,
        });
      }
      return;
    }

    // Удаление клиента
    else if (data.startsWith("remove_")) {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      if (data === "remove_cancel") {
        bot.editMessageText("❌ Удаление отменено", {
          chat_id: chatId,
          message_id: query.message.message_id,
        });
        userStates.delete(userId);
        bot.answerCallbackQuery(query.id);
        return;
      }

      if (data.startsWith("remove_idx_")) {
        const index = parseInt(data.split("_")[2]);
        const userState = userStates.get(userId);
        
        if (!userState || !userState.clients || !userState.clients[index]) {
          bot.answerCallbackQuery(query.id, {
            text: "❌ Ошибка: клиент не найден",
            show_alert: true,
          });
          return;
        }

        const client = userState.clients[index];
        const clientUuid = client.uuid;

        try {
          // Удаляем клиента через API
          await apiClient.deleteClient(clientUuid);

          bot.editMessageText(
            `✅ <b>Клиент удален</b>\n\n` +
              `👤 Имя: ${client.name}\n` +
              `🆔 UUID: <code>${clientUuid}</code>`,
            {
              chat_id: chatId,
              message_id: query.message.message_id,
              parse_mode: "HTML",
            }
          );

          userStates.delete(userId);
          bot.answerCallbackQuery(query.id, { text: "✅ Клиент удален" });
        } catch (error) {
          console.error("Ошибка удаления клиента:", error);
          bot.answerCallbackQuery(query.id, {
            text: `❌ Ошибка: ${error.message}`,
            show_alert: true,
          });
        }
      }
    }

    // Выбор клиента из списка банов
    if (data.startsWith("ban_idx_")) {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      const index = parseInt(data.split("_")[2]);
      const userState = userStates.get(userId);
      
      if (!userState || !userState.clients || !userState.clients[index]) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Ошибка: клиент не найден",
          show_alert: true,
        });
        return;
      }

      const client = userState.clients[index];

      try {
        // Получаем свежие данные клиента через API
        const response = await apiClient.getClient(client.uuid);
        const clientData = response.client;
        const status = clientData.status === "blocked" ? "🔒 Заблокирован" : "✅ Активен";

        // Сохраняем UUID клиента для последующих действий
        userStates.set(userId, {
          action: "ban_client_selected",
          clientUuid: clientData.uuid
        });

        let message = `⚠️ <b>Управление банами</b>\n\n`;
        message += `👤 <b>Клиент:</b> ${clientData.name}\n`;
        message += `🆔 <b>UUID:</b> <code>${clientData.uuid}</code>\n`;
        message += `📊 <b>Статус:</b> ${status}\n`;
        message += `⚠️ <b>Предупреждения:</b> ${clientData.warnings_count || 0}/3\n`;
        if (clientData.blocked_reason) {
          message += `📝 <b>Причина:</b> ${clientData.blocked_reason}\n`;
        }

        const keyboard = {
          inline_keyboard: []
        };

        if (clientData.status === "blocked") {
          keyboard.inline_keyboard.push([
            { text: "🔓 Разблокировать", callback_data: `unban_client` }
          ]);
        }

        if (clientData.warnings_count > 0) {
          keyboard.inline_keyboard.push([
            { text: "🔄 Сбросить предупреждения", callback_data: `reset_warn_client` }
          ]);
        }

        keyboard.inline_keyboard.push([
          { text: "📱 Изменить лимит устройств", callback_data: `change_device_limit_${clientData.uuid}` }
        ]);

        keyboard.inline_keyboard.push([
          { text: "⚠️ Выдать предупреждение", callback_data: `warn_client` }
        ]);

        bot.editMessageText(message, {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: "HTML",
          reply_markup: keyboard
        });

        bot.answerCallbackQuery(query.id);
      } catch (error) {
        console.error("Ошибка получения данных клиента:", error);
        bot.answerCallbackQuery(query.id, {
          text: `❌ Ошибка: ${error.message}`,
          show_alert: true,
        });
      }
      return;
    }

    // Разблокировать клиента
    if (data === "unban_client") {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      const userState = userStates.get(userId);
      if (!userState || !userState.clientUuid) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Ошибка: клиент не найден",
          show_alert: true,
        });
        return;
      }

      const clientUuid = userState.clientUuid;

      try {
        const response = await apiClient.unblockClient(clientUuid);
        const client = response.client;

        bot.editMessageText(
          `✅ <b>Клиент разблокирован</b>\n\n` +
            `👤 Клиент: ${client.name}\n` +
            `📊 Статус: ✅ Активен`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML"
          }
        );

        // Уведомляем клиента
        if (client.telegram_id) {
          bot.sendMessage(
            client.telegram_id,
            `✅ <b>Твой доступ разблокирован</b>\n\n` +
              `Ты снова можете пользоваться VPN.\n` +
              `Пожалуйста, соблюдайте правила использования.`,
            { parse_mode: "HTML" }
          );
        }

        userStates.delete(userId);
        bot.answerCallbackQuery(query.id, { text: "✅ Клиент разблокирован" });
      } catch (error) {
        console.error("Ошибка разблокировки:", error);
        bot.answerCallbackQuery(query.id, {
          text: `❌ Ошибка: ${error.message}`,
          show_alert: true
        });
      }
      return;
    }

    // Выдать предупреждение
    if (data === "warn_client") {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      const userState = userStates.get(userId);
      if (!userState || !userState.clientUuid) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Ошибка: клиент не найден",
          show_alert: true,
        });
        return;
      }

      const clientUuid = userState.clientUuid;

      // Сохраняем UUID в состояние для выбора причины
      userStates.set(userId, {
        action: "warn_select_reason",
        clientUuid: clientUuid
      });

      const keyboard = {
        inline_keyboard: [
          [{ text: "🚫 Торренты/P2P", callback_data: `warn_reason_torrents` }],
          [{ text: "🔑 Передача ключа", callback_data: `warn_reason_sharing` }],
          [{ text: "⚡ Злоупотребление", callback_data: `warn_reason_abuse` }],
          [{ text: "✏️ Другая причина", callback_data: `warn_custom` }],
          [{ text: "❌ Отмена", callback_data: "warn_cancel" }]
        ]
      };

      bot.editMessageText(
        "⚠️ <b>Выбери причину предупреждения:</b>",
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: "HTML",
          reply_markup: keyboard
        }
      ).catch(err => {
        // Игнорируем ошибку "message is not modified"
        if (!err.message.includes("message is not modified")) {
          console.error("Ошибка редактирования сообщения:", err);
        }
      });

      bot.answerCallbackQuery(query.id);
      return;
    }

    // Выбор причины предупреждения
    if (data.startsWith("warn_reason_")) {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      const userState = userStates.get(userId);
      if (!userState || !userState.clientUuid) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Ошибка: клиент не найден",
          show_alert: true,
        });
        return;
      }

      const clientUuid = userState.clientUuid;
      const reasonType = data.split("_")[2];

      const reasons = {
        torrents: "Использование торрентов/P2P",
        sharing: "Передача ключа другим лицам",
        abuse: "Злоупотребление ресурсами"
      };

      const reason = reasons[reasonType];

      try {
        const response = await apiClient.warnClient(clientUuid, reason);
        const client = response.client;
        const warningsCount = response.warningsCount;

        let blockInfo = "";
        if (warningsCount === 1) {
          blockInfo = "\n🔒 Клиент заблокирован на 24 часа";
        } else if (warningsCount === 2) {
          blockInfo = "\n🔒 Клиент заблокирован на 7 дней";
        } else if (warningsCount >= 3) {
          blockInfo = "\n🔒 Клиент заблокирован навсегда";
        }

        bot.editMessageText(
          `✅ <b>Предупреждение выдано</b>\n\n` +
            `👤 Клиент: ${client.name}\n` +
            `⚠️ Предупреждение: ${warningsCount}/3\n` +
            `📝 Причина: ${reason}${blockInfo}`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML"
          }
        ).catch(err => {
          // Игнорируем ошибку "message is not modified"
          if (!err.message.includes("message is not modified")) {
            console.error("Ошибка редактирования сообщения:", err);
          }
        });

        // Уведомляем клиента
        if (client.telegram_id) {
          let clientMessage = `⚠️ <b>Предупреждение ${warningsCount}/3</b>\n\n`;
          clientMessage += `Причина: ${reason}\n\n`;
          
          if (warningsCount === 1) {
            clientMessage += `Твой доступ заблокирован на 24 часа.\n\n`;
            clientMessage += `При повторном нарушении блокировка составит 7 дней.`;
          } else if (warningsCount === 2) {
            clientMessage += `Твой доступ заблокирован на 7 дней.\n\n`;
            clientMessage += `⚠️ ВНИМАНИЕ: При следующем нарушении вы будете заблокированы навсегда!`;
          } else {
            clientMessage += `Твой доступ заблокирован навсегда.\n\n`;
            clientMessage += `Обратитесь к администратору для уточнения деталей.`;
          }

          bot.sendMessage(client.telegram_id, clientMessage, { parse_mode: "HTML" });
        }

        userStates.delete(userId);
        bot.answerCallbackQuery(query.id, { text: "✅ Предупреждение выдано" });
      } catch (error) {
        console.error("Ошибка выдачи предупреждения:", error);
        bot.answerCallbackQuery(query.id, {
          text: `❌ Ошибка: ${error.message}`,
          show_alert: true
        });
      }
      return;
    }

    // Своя причина предупреждения
    if (data === "warn_custom") {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      const userState = userStates.get(userId);
      if (!userState || !userState.clientUuid) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Ошибка: клиент не найден",
          show_alert: true,
        });
        return;
      }

      userStates.set(userId, {
        action: "warn_custom",
        clientUuid: userState.clientUuid,
        messageId: query.message.message_id
      });

      bot.sendMessage(
        chatId,
        "✏️ Введи причину предупреждения:",
        {
          reply_markup: {
            force_reply: true,
            selective: true
          }
        }
      );

      bot.answerCallbackQuery(query.id);
      return;
    }

    // Отмена предупреждения
    if (data === "warn_cancel") {
      bot.editMessageText("❌ Отменено", {
        chat_id: chatId,
        message_id: query.message.message_id
      });
      bot.answerCallbackQuery(query.id);
      return;
    }

    // Сброс предупреждений
    if (data === "reset_warn_client") {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      const userState = userStates.get(userId);
      if (!userState || !userState.clientUuid) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Ошибка: клиент не найден",
          show_alert: true,
        });
        return;
      }

      const clientUuid = userState.clientUuid;

      try {
        const response = await apiClient.resetClientWarnings(clientUuid);
        const client = response.client;

        bot.editMessageText(
          `✅ <b>Предупреждения сброшены</b>\n\n` +
            `👤 Клиент: ${client.name}\n` +
            `⚠️ Предупреждения: 0/3`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML"
          }
        );

        userStates.delete(userId);
        bot.answerCallbackQuery(query.id, { text: "✅ Предупреждения сброшены" });
      } catch (error) {
        console.error("Ошибка сброса предупреждений:", error);
        bot.answerCallbackQuery(query.id, {
          text: `❌ Ошибка: ${error.message}`,
          show_alert: true
        });
      }
      return;
    }

    // Выбор запроса из списка
    if (data.startsWith("req_idx_")) {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      const index = parseInt(data.split("_")[2]);
      const userState = userStates.get(userId);
      
      if (!userState || !userState.requests || !userState.requests[index]) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Ошибка: запрос не найден",
          show_alert: true,
        });
        return;
      }

      const req = userState.requests[index];
      
      let message = `📝 <b>Запрос на продление</b>\n\n`;
      message += `👤 <b>Клиент:</b> ${req.client_name}\n`;
      message += `🆔 <b>UUID:</b> <code>${req.client_uuid}</code>\n`;
      message += `📅 <b>Запрошено:</b> ${req.requested_months} мес. (${req.requested_days} дней)\n`;
      message += `📆 <b>Дата запроса:</b> ${formatDate(req.created_at)}\n\n`;
      message += `Выбери действие:`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: "✅ Одобрить", callback_data: `approve_${req.id}_${req.requested_months}` },
            { text: "❌ Отклонить", callback_data: `deny_${req.id}` }
          ],
          [
            { text: "📝 Другой период", callback_data: `change_req_${req.id}` }
          ]
        ]
      };

      bot.editMessageText(message, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: "HTML",
        reply_markup: keyboard
      });

      bot.answerCallbackQuery(query.id);
      return;
    }

    // Главное меню
    if (data === "back_to_main") {
      console.log(`[BACK_TO_MAIN] User ${userId} clicked back_to_main`);
      
      bot.editMessageText("🏠 Возвращаюсь в главное меню...", {
        chat_id: chatId,
        message_id: query.message.message_id,
      });
      
      console.log(`[BACK_TO_MAIN] Sending keyboard to user ${userId}`);
      
      // Отправляем сообщение с keyboard
      bot.sendMessage(chatId, "Выбери действие:", {
        reply_markup: getMainKeyboard(isAdmin(userId))
      }).then(() => {
        console.log(`[BACK_TO_MAIN] Keyboard sent successfully to user ${userId}`);
      }).catch((err) => {
        console.error(`[BACK_TO_MAIN] Error sending keyboard:`, err);
      });
      
      userStates.delete(userId);
      bot.answerCallbackQuery(query.id);
      return;
    }

    // Информация о клиенте
    else if (data.startsWith("info_")) {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      if (data === "info_cancel") {
        bot.editMessageText("❌ Отменено", {
          chat_id: chatId,
          message_id: query.message.message_id,
        });
        userStates.delete(userId);
        bot.answerCallbackQuery(query.id);
        return;
      }

      if (data.startsWith("info_idx_")) {
        const index = parseInt(data.split("_")[2]);
        const userState = userStates.get(userId);
        
        if (!userState || !userState.clients || !userState.clients[index]) {
          bot.answerCallbackQuery(query.id, {
            text: "❌ Ошибка: клиент не найден",
            show_alert: true,
          });
          return;
        }

        const client = userState.clients[index];

        try {
          const response = await apiClient.getClient(client.uuid);
          const clientData = response.client;

          // Получаем статистику трафика за день/неделю/месяц
          let trafficStats = null;
          try {
            const statsResponse = await apiClient.getClientTrafficStats(client.uuid);
            trafficStats = statsResponse.stats;
          } catch (err) {
            console.error("Ошибка получения статистики трафика:", err);
          }

          const endDate = new Date(clientData.subscription_end);
          const daysLeft = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));
          const status = clientData.status === "active" ? "✅ Активен" : "❌ Заблокирован";
          const isExpiringSoon = daysLeft > 0 && daysLeft <= 7;

          // Получаем информацию об активных устройствах
          const deviceInfo = await getActiveDevices();
          const devices = deviceInfo[clientData.uuid];
          const deviceCount = devices ? devices.count : 0;
          const deviceIPs = devices ? devices.ips : [];
          const maxDevices = clientData.max_devices || 2;

          let message = `👤 <b>Информация о клиенте</b>\n\n`;
          message += `<b>Имя:</b> ${clientData.name}\n`;
          message += `<b>UUID:</b> <code>${clientData.uuid}</code>\n`;
          message += `<b>Telegram ID:</b> ${clientData.telegram_id || "не связан"}\n`;
          message += `<b>Email:</b> ${clientData.email || "не указан"}\n\n`;
          message += `<b>Статус:</b> ${status}\n`;
          message += `<b>Подписка:</b> ${daysLeft > 0 ? `${daysLeft} дней` : "истекла"}${isExpiringSoon ? ' ⏰ (скоро истекает!)' : ''}\n`;
          message += `<b>Начало:</b> ${formatDate(clientData.subscription_start)}\n`;
          message += `<b>Конец:</b> ${formatDate(endDate)}\n\n`;
          message += `<b>Трафик (текущий):</b> ${formatTraffic(clientData.traffic_used_gb)}/${clientData.traffic_limit_gb} GB\n`;
          
          // Добавляем статистику трафика
          if (trafficStats) {
            message += `<b>За день:</b> ${formatTraffic(trafficStats.day)} GB\n`;
            message += `<b>За неделю:</b> ${formatTraffic(trafficStats.week)} GB\n`;
            message += `<b>За месяц:</b> ${formatTraffic(trafficStats.month)} GB\n`;
          }
          
          message += `<b>Сброс трафика:</b> ${formatDate(clientData.traffic_reset_date)}\n\n`;
          message += `<b>📱 Устройств:</b> ${deviceCount}/${maxDevices}`;
          
          if (deviceCount > maxDevices) {
            message += ` ⚠️ (превышен лимит!)`;
          }
          
          if (deviceCount > 0) {
            message += `\n<b>IP адреса:</b>\n${deviceIPs.map(ip => `   • ${ip}`).join('\n')}`;
          }
          
          if (clientData.warnings_count > 0) {
            message += `\n\n⚠️ <b>Предупреждения:</b> ${clientData.warnings_count}/3\n`;
            if (clientData.last_warning_date) {
              message += `<b>Последнее:</b> ${formatDate(clientData.last_warning_date)}\n`;
            }
          }

          // Сохраняем UUID клиента для последующих действий
          userStates.set(userId, {
            action: "info_client_selected",
            clientUuid: clientData.uuid
          });

          const keyboard = {
            inline_keyboard: []
          };

          // Кнопка показать VLESS ссылку
          keyboard.inline_keyboard.push([
            { text: "🔗 Показать VLESS ссылку", callback_data: `show_vless_${clientData.uuid}` }
          ]);

          // Кнопка разблокировать если клиент заблокирован
          if (clientData.status === "blocked") {
            keyboard.inline_keyboard.push([
              { text: "🔓 Разблокировать", callback_data: `unban_client` }
            ]);
          }

          // Кнопка изменить лимит устройств
          keyboard.inline_keyboard.push([
            { text: "📱 Изменить лимит устройств", callback_data: `change_device_limit_${clientData.uuid}` }
          ]);

          // Кнопка выдать предупреждение
          keyboard.inline_keyboard.push([
            { text: "⚠️ Выдать предупреждение", callback_data: `warn_client` }
          ]);

          // Кнопка сбросить предупреждения если есть
          if (clientData.warnings_count > 0) {
            keyboard.inline_keyboard.push([
              { text: "🔄 Сбросить предупреждения", callback_data: `reset_warn_client` }
            ]);
          }

          // Кнопка главного меню
          keyboard.inline_keyboard.push([
            { text: "🏠 Главное меню", callback_data: "back_to_main" }
          ]);

          bot.editMessageText(message, {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML",
            reply_markup: keyboard
          });

          bot.answerCallbackQuery(query.id);
        } catch (error) {
          console.error("Ошибка получения информации о клиенте:", error);
          bot.answerCallbackQuery(query.id, {
            text: `❌ Ошибка: ${error.message}`,
            show_alert: true,
          });
        }
      }
    }

    // ========================================================================
    // УПРАВЛЕНИЕ XRAY СЕРВИСОМ
    // ========================================================================

    // Запуск Xray
    if (data === "xray_start") {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      try {
        bot.editMessageText(
          `🔧 <b>Управление Xray сервисом</b>\n\n` +
            `⏳ Запуск сервиса...`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML"
          }
        );

        // Проверяем, запущен ли бот от root
        const isRoot = process.getuid && process.getuid() === 0;
        const sudoPrefix = isRoot ? "" : "sudo ";

        const { stdout, stderr } = await execAsync(`${sudoPrefix}systemctl start xray`);
        
        // Проверяем статус после запуска
        const { stdout: statusOutput } = await execAsync(`${sudoPrefix}systemctl status xray`);
        const isActive = statusOutput.includes("active (running)");

        const keyboard = {
          inline_keyboard: [
            [
              { text: "▶️ Запустить", callback_data: "xray_start" },
              { text: "⏹️ Остановить", callback_data: "xray_stop" }
            ],
            [
              { text: "🔄 Перезапустить", callback_data: "xray_restart" },
              { text: "📊 Статус", callback_data: "xray_status" }
            ]
          ]
        };

        bot.editMessageText(
          `🔧 <b>Управление Xray сервисом</b>\n\n` +
            `${isActive ? "✅ Сервис успешно запущен" : "⚠️ Сервис запущен, но статус неизвестен"}`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML",
            reply_markup: keyboard
          }
        );

        bot.answerCallbackQuery(query.id);
      } catch (error) {
        console.error("Ошибка запуска Xray:", error);
        
        const keyboard = {
          inline_keyboard: [
            [
              { text: "▶️ Запустить", callback_data: "xray_start" },
              { text: "⏹️ Остановить", callback_data: "xray_stop" }
            ],
            [
              { text: "🔄 Перезапустить", callback_data: "xray_restart" },
              { text: "📊 Статус", callback_data: "xray_status" }
            ]
          ]
        };

        bot.editMessageText(
          `🔧 <b>Управление Xray сервисом</b>\n\n` +
            `❌ Ошибка запуска:\n<code>${error.message}</code>`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML",
            reply_markup: keyboard
          }
        );

        bot.answerCallbackQuery(query.id, {
          text: "❌ Ошибка запуска",
          show_alert: true,
        });
      }
      return;
    }

    // Остановка Xray
    if (data === "xray_stop") {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      try {
        bot.editMessageText(
          `🔧 <b>Управление Xray сервисом</b>\n\n` +
            `⏳ Остановка сервиса...`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML"
          }
        );

        const isRoot = process.getuid && process.getuid() === 0;
        const sudoPrefix = isRoot ? "" : "sudo ";

        await execAsync(`${sudoPrefix}systemctl stop xray`);
        
        // Проверяем статус после остановки
        const { stdout: statusOutput } = await execAsync(`${sudoPrefix}systemctl status xray`).catch(() => ({ stdout: "inactive" }));
        const isInactive = statusOutput.includes("inactive") || statusOutput.includes("dead");

        const keyboard = {
          inline_keyboard: [
            [
              { text: "▶️ Запустить", callback_data: "xray_start" },
              { text: "⏹️ Остановить", callback_data: "xray_stop" }
            ],
            [
              { text: "🔄 Перезапустить", callback_data: "xray_restart" },
              { text: "📊 Статус", callback_data: "xray_status" }
            ]
          ]
        };

        bot.editMessageText(
          `🔧 <b>Управление Xray сервисом</b>\n\n` +
            `${isInactive ? "✅ Сервис успешно остановлен" : "⚠️ Сервис остановлен, но статус неизвестен"}`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML",
            reply_markup: keyboard
          }
        );

        bot.answerCallbackQuery(query.id);
      } catch (error) {
        console.error("Ошибка остановки Xray:", error);
        
        const keyboard = {
          inline_keyboard: [
            [
              { text: "▶️ Запустить", callback_data: "xray_start" },
              { text: "⏹️ Остановить", callback_data: "xray_stop" }
            ],
            [
              { text: "🔄 Перезапустить", callback_data: "xray_restart" },
              { text: "📊 Статус", callback_data: "xray_status" }
            ]
          ]
        };

        bot.editMessageText(
          `🔧 <b>Управление Xray сервисом</b>\n\n` +
            `❌ Ошибка остановки:\n<code>${error.message}</code>`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML",
            reply_markup: keyboard
          }
        );

        bot.answerCallbackQuery(query.id, {
          text: "❌ Ошибка остановки",
          show_alert: true,
        });
      }
      return;
    }

    // Перезапуск Xray
    if (data === "xray_restart") {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      try {
        bot.editMessageText(
          `🔧 <b>Управление Xray сервисом</b>\n\n` +
            `⏳ Перезапуск сервиса...`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML"
          }
        );

        const isRoot = process.getuid && process.getuid() === 0;
        const sudoPrefix = isRoot ? "" : "sudo ";

        await execAsync(`${sudoPrefix}systemctl restart xray`);
        
        // Проверяем статус после перезапуска
        const { stdout: statusOutput } = await execAsync(`${sudoPrefix}systemctl status xray`);
        const isActive = statusOutput.includes("active (running)");

        const keyboard = {
          inline_keyboard: [
            [
              { text: "▶️ Запустить", callback_data: "xray_start" },
              { text: "⏹️ Остановить", callback_data: "xray_stop" }
            ],
            [
              { text: "🔄 Перезапустить", callback_data: "xray_restart" },
              { text: "📊 Статус", callback_data: "xray_status" }
            ]
          ]
        };

        bot.editMessageText(
          `🔧 <b>Управление Xray сервисом</b>\n\n` +
            `${isActive ? "✅ Сервис успешно перезапущен" : "⚠️ Сервис перезапущен, но статус неизвестен"}`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML",
            reply_markup: keyboard
          }
        );

        bot.answerCallbackQuery(query.id);
      } catch (error) {
        console.error("Ошибка перезапуска Xray:", error);
        
        const keyboard = {
          inline_keyboard: [
            [
              { text: "▶️ Запустить", callback_data: "xray_start" },
              { text: "⏹️ Остановить", callback_data: "xray_stop" }
            ],
            [
              { text: "🔄 Перезапустить", callback_data: "xray_restart" },
              { text: "📊 Статус", callback_data: "xray_status" }
            ]
          ]
        };

        bot.editMessageText(
          `🔧 <b>Управление Xray сервисом</b>\n\n` +
            `❌ Ошибка перезапуска:\n<code>${error.message}</code>`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML",
            reply_markup: keyboard
          }
        );

        bot.answerCallbackQuery(query.id, {
          text: "❌ Ошибка перезапуска",
          show_alert: true,
        });
      }
      return;
    }

    // Статус Xray
    if (data === "xray_status") {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      try {
        bot.editMessageText(
          `🔧 <b>Управление Xray сервисом</b>\n\n` +
            `⏳ Проверка статуса...`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML"
          }
        );

        const isRoot = process.getuid && process.getuid() === 0;
        const sudoPrefix = isRoot ? "" : "sudo ";

        const { stdout } = await execAsync(`${sudoPrefix}systemctl status xray`).catch((error) => ({ stdout: error.stdout || error.stderr || "Сервис не найден" }));
        
        // Парсим статус
        const isActive = stdout.includes("active (running)");
        const isInactive = stdout.includes("inactive") || stdout.includes("dead");
        const isFailed = stdout.includes("failed");
        
        let statusEmoji = "❓";
        let statusText = "Неизвестно";
        
        if (isActive) {
          statusEmoji = "✅";
          statusText = "Запущен";
        } else if (isInactive) {
          statusEmoji = "⏹️";
          statusText = "Остановлен";
        } else if (isFailed) {
          statusEmoji = "❌";
          statusText = "Ошибка";
        }

        // Извлекаем последние строки лога
        const lines = stdout.split('\n');
        const relevantLines = lines.slice(0, 15).join('\n');

        const keyboard = {
          inline_keyboard: [
            [
              { text: "▶️ Запустить", callback_data: "xray_start" },
              { text: "⏹️ Остановить", callback_data: "xray_stop" }
            ],
            [
              { text: "🔄 Перезапустить", callback_data: "xray_restart" },
              { text: "📊 Статус", callback_data: "xray_status" }
            ]
          ]
        };

        bot.editMessageText(
          `🔧 <b>Управление Xray сервисом</b>\n\n` +
            `${statusEmoji} <b>Статус:</b> ${statusText}\n\n` +
            `<code>${relevantLines}</code>`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML",
            reply_markup: keyboard
          }
        );

        bot.answerCallbackQuery(query.id);
      } catch (error) {
        console.error("Ошибка проверки статуса Xray:", error);
        
        const keyboard = {
          inline_keyboard: [
            [
              { text: "▶️ Запустить", callback_data: "xray_start" },
              { text: "⏹️ Остановить", callback_data: "xray_stop" }
            ],
            [
              { text: "🔄 Перезапустить", callback_data: "xray_restart" },
              { text: "📊 Статус", callback_data: "xray_status" }
            ]
          ]
        };

        bot.editMessageText(
          `🔧 <b>Управление Xray сервисом</b>\n\n` +
            `❌ Ошибка проверки статуса:\n<code>${error.message}</code>`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: "HTML",
            reply_markup: keyboard
          }
        );

        bot.answerCallbackQuery(query.id, {
          text: "❌ Ошибка проверки статуса",
          show_alert: true,
        });
      }
      return;
    }

    // Показать VLESS ссылку
    if (data.startsWith("show_vless_")) {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      const uuid = data.replace("show_vless_", "");
      
      try {
        const response = await apiClient.getClient(uuid);
        const client = response.client;
        
        // Генерируем VLESS ссылку
        let vlessLink = '';
        try {
          if (XRAY_PUBLIC_KEY && XRAY_SHORT_ID) {
            vlessLink = generateVlessLink({
              uuid: client.uuid,
              serverIp: SERVER_IP,
              port: XRAY_PORT,
              publicKey: XRAY_PUBLIC_KEY,
              shortId: XRAY_SHORT_ID,
              sni: XRAY_SNI,
              clientName: client.name
            });
          }
        } catch (linkError) {
          console.error('Ошибка генерации vless ссылки:', linkError);
        }
        
        if (vlessLink) {
          bot.answerCallbackQuery(query.id);
          bot.sendMessage(
            chatId,
            `🔗 <b>VLESS ссылка для ${client.name}</b>\n\n` +
              `<code>${vlessLink}</code>\n\n` +
              `<i>Скопируй ссылку и отправь клиенту</i>`,
            { parse_mode: "HTML" }
          );
        } else {
          bot.answerCallbackQuery(query.id, {
            text: "❌ Не удалось сгенерировать ссылку. Проверь настройки X-Ray.",
            show_alert: true,
          });
        }
      } catch (error) {
        console.error("Ошибка показа VLESS ссылки:", error);
        bot.answerCallbackQuery(query.id, {
          text: `❌ Ошибка: ${error.message}`,
          show_alert: true,
        });
      }
      return;
    }

    // Изменить лимит устройств
    if (data.startsWith("change_device_limit_")) {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      const uuid = data.replace("change_device_limit_", "");
      
      // Показываем кнопки выбора лимита
      const keyboard = {
        inline_keyboard: [
          [
            { text: "1 устройство", callback_data: `set_device_limit_${uuid}_1` },
            { text: "2 устройства", callback_data: `set_device_limit_${uuid}_2` },
            { text: "3 устройства", callback_data: `set_device_limit_${uuid}_3` }
          ],
          [
            { text: "4 устройства", callback_data: `set_device_limit_${uuid}_4` },
            { text: "5 устройств", callback_data: `set_device_limit_${uuid}_5` },
            { text: "10 устройств", callback_data: `set_device_limit_${uuid}_10` }
          ],
          [
            { text: "« Назад", callback_data: `back_to_client_info_${uuid}` }
          ]
        ]
      };

      bot.editMessageText(
        `📱 <b>Изменить лимит устройств</b>\n\n` +
          `Выбери новый лимит одновременных подключений для клиента:`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: "HTML",
          reply_markup: keyboard
        }
      );

      bot.answerCallbackQuery(query.id);
      return;
    }

    // Установить лимит устройств
    if (data.startsWith("set_device_limit_")) {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      const parts = data.replace("set_device_limit_", "").split("_");
      const uuid = parts[0];
      const maxDevices = parseInt(parts[1]);

      try {
        const response = await apiClient.updateDeviceLimit(uuid, maxDevices);
        const client = response.client;

        bot.answerCallbackQuery(query.id, {
          text: `✅ Лимит устройств изменен на ${maxDevices}`,
          show_alert: true,
        });

        // Отправляем уведомление клиенту
        if (client.telegram_id) {
          try {
            await bot.sendMessage(
              client.telegram_id,
              `📱 <b>Изменение лимита устройств</b>\n\n` +
                `Твой лимит одновременных подключений изменен на <b>${maxDevices} ${maxDevices === 1 ? 'устройство' : maxDevices < 5 ? 'устройства' : 'устройств'}</b>.\n\n` +
                `Теперь ты можешь подключаться с ${maxDevices} ${maxDevices === 1 ? 'устройства' : maxDevices < 5 ? 'устройств' : 'устройств'} одновременно.`,
              { parse_mode: "HTML" }
            );
          } catch (notifyError) {
            console.error("Не удалось отправить уведомление клиенту:", notifyError.message);
          }
        }

        // Показываем обновленную информацию о клиенте
        const endDate = new Date(client.subscription_end);
        const daysLeft = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));
        const status = client.status === "active" ? "✅ Активен" : "❌ Заблокирован";

        let message = `👤 <b>Информация о клиенте</b>\n\n`;
        message += `<b>Имя:</b> ${client.name}\n`;
        message += `<b>UUID:</b> <code>${client.uuid}</code>\n`;
        message += `<b>Telegram ID:</b> ${client.telegram_id || "не связан"}\n\n`;
        message += `<b>Статус:</b> ${status}\n`;
        message += `<b>Подписка:</b> ${daysLeft > 0 ? `${daysLeft} дней` : "истекла"}\n\n`;
        message += `<b>Трафик:</b> ${formatTraffic(client.traffic_used_gb)}/${client.traffic_limit_gb} GB\n\n`;
        message += `<b>📱 Лимит устройств:</b> ${maxDevices}\n`;
        message += `✅ Лимит успешно изменен!`;

        const keyboard = {
          inline_keyboard: [
            [
              { text: "📱 Изменить лимит устройств", callback_data: `change_device_limit_${uuid}` }
            ]
          ]
        };

        bot.editMessageText(message, {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: "HTML",
          reply_markup: keyboard
        });

      } catch (error) {
        console.error("Ошибка изменения лимита устройств:", error);
        bot.answerCallbackQuery(query.id, {
          text: `❌ Ошибка: ${error.message}`,
          show_alert: true,
        });
      }
      return;
    }

    // Вернуться к информации о клиенте
    if (data.startsWith("back_to_client_info_")) {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      const uuid = data.replace("back_to_client_info_", "");

      try {
        const response = await apiClient.getClient(uuid);
        const client = response.client;

        const endDate = new Date(client.subscription_end);
        const daysLeft = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));
        const status = client.status === "active" ? "✅ Активен" : "❌ Заблокирован";
        const maxDevices = client.max_devices || 2;
        const isExpiringSoon = daysLeft > 0 && daysLeft <= 7;

        let message = `👤 <b>Информация о клиенте</b>\n\n`;
        message += `<b>Имя:</b> ${client.name}\n`;
        message += `<b>UUID:</b> <code>${client.uuid}</code>\n`;
        message += `<b>Telegram ID:</b> ${client.telegram_id || "не связан"}\n`;
        message += `<b>Email:</b> ${client.email || "не указан"}\n\n`;
        message += `<b>Статус:</b> ${status}\n`;
        message += `<b>Подписка:</b> ${daysLeft > 0 ? `${daysLeft} дней` : "истекла"}${isExpiringSoon ? ' ⏰ (скоро истекает!)' : ''}\n`;
        message += `<b>Начало:</b> ${formatDate(client.subscription_start)}\n`;
        message += `<b>Конец:</b> ${formatDate(endDate)}\n\n`;
        message += `<b>Трафик:</b> ${formatTraffic(client.traffic_used_gb)}/${client.traffic_limit_gb} GB\n`;
        message += `<b>Сброс трафика:</b> ${formatDate(client.traffic_reset_date)}\n\n`;
        message += `<b>📱 Лимит устройств:</b> ${maxDevices}`;

        const keyboard = {
          inline_keyboard: [
            [
              { text: "🔗 Показать VLESS ссылку", callback_data: `show_vless_${uuid}` }
            ],
            [
              { text: "📱 Изменить лимит устройств", callback_data: `change_device_limit_${uuid}` }
            ]
          ]
        };

        bot.editMessageText(message, {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: "HTML",
          reply_markup: keyboard
        });

        bot.answerCallbackQuery(query.id);
      } catch (error) {
        console.error("Ошибка получения информации о клиенте:", error);
        bot.answerCallbackQuery(query.id, {
          text: `❌ Ошибка: ${error.message}`,
          show_alert: true,
        });
      }
      return;
    }

    // Отмена добавления клиента
    if (data === "cancel_add_client") {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      userStates.delete(userId);

      bot.answerCallbackQuery(query.id, {
        text: "❌ Добавление клиента отменено",
        show_alert: true,
      });

      bot.sendMessage(
        chatId,
        "❌ Добавление клиента отменено",
        { reply_markup: getMainKeyboard(true) }
      );
      return;
    }

    // Отмена создания доступа
    if (data === "cancel_create_access") {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      userStates.delete(userId);

      bot.editMessageText(
        "❌ Создание доступа отменено",
        {
          chat_id: chatId,
          message_id: query.message.message_id,
        }
      );

      bot.answerCallbackQuery(query.id, {
        text: "❌ Создание доступа отменено",
        show_alert: true,
      });
      return;
    }

  } catch (error) {
    console.error("Ошибка обработки callback:", error);
    bot.answerCallbackQuery(query.id, {
      text: "❌ Произошла ошибка",
      show_alert: true,
    });
  }
});

// ============================================================================
// ОБРАБОТКА ПЛАТЕЖЕЙ
// ============================================================================

// Обработка pre-checkout запроса (перед оплатой)
bot.on('pre_checkout_query', async (query) => {
  try {
    // Всегда подтверждаем платеж
    await bot.answerPreCheckoutQuery(query.id, true);
  } catch (error) {
    console.error('[Payment] Ошибка pre-checkout:', error);
    await bot.answerPreCheckoutQuery(query.id, false, {
      error_message: 'Произошла ошибка. Попробуй позже.'
    });
  }
});

// Обработка успешной оплаты
bot.on('message', async (msg) => {
  if (msg.successful_payment) {
    const chatId = msg.chat.id;
    
    try {
      const payload = JSON.parse(msg.successful_payment.invoice_payload);
      const { userId, plan, method } = payload;

      console.log(`[Payment] Успешная оплата: пользователь ${userId}, план ${plan}, метод ${method}`);

      // Получаем данные плана
      const { SUBSCRIPTION_PLANS } = await import('./payments/payment-handler.js');
      const planData = SUBSCRIPTION_PLANS[plan];

      if (!planData) {
        throw new Error('Неверный план подписки');
      }

      // Получаем информацию о клиенте
      const client = await getClientByTelegramId(userId);
      const clientName = client ? client.name : `ID: ${userId}`;

      // Продлеваем подписку через API
      await apiClient.extendSubscription(userId, planData.days);

      // Уведомляем клиента
      bot.sendMessage(
        chatId,
        `✅ <b>Оплата прошла успешно!</b>\n\n` +
          `Твоя подписка продлена на ${planData.days} дней.\n` +
          `Спасибо за оплату! 🎉`,
        { parse_mode: 'HTML' }
      );

      // Уведомляем админа
      const methodEmoji = {
        stars: '⭐',
        ton: '💎',
        usdt: '💵',
        kaspa: '🔷'
      };
      
      const methodName = {
        stars: 'Telegram Stars',
        ton: 'TON',
        usdt: 'USDT',
        kaspa: 'Kaspa'
      };

      const price = method === 'stars' ? `${planData.price_stars} ⭐` :
                    method === 'ton' ? `${planData.price_ton} TON` :
                    method === 'usdt' ? `${planData.price_usdt} USDT` :
                    method === 'kaspa' ? `${planData.price_kaspa} KAS` : 
                    `${planData.price_rub} ₽`;

      bot.sendMessage(
        TELEGRAM_ADMIN_ID,
        `💰 <b>Новая оплата!</b>\n\n` +
          `👤 <b>Клиент:</b> ${clientName}\n` +
          `${methodEmoji[method] || '💳'} <b>Метод:</b> ${methodName[method] || method}\n` +
          `📦 <b>Тариф:</b> ${planData.name}\n` +
          `💵 <b>Сумма:</b> ${price}\n` +
          `📅 <b>Продлено на:</b> ${planData.days} дней\n` +
          `🕐 <b>Время:</b> ${new Date().toLocaleString('ru-RU')}`,
        { parse_mode: 'HTML' }
      ).catch(err => console.error('[Payment] Ошибка отправки уведомления админу:', err));

    } catch (error) {
      console.error('[Payment] Ошибка обработки платежа:', error);
      bot.sendMessage(
        chatId,
        `⚠️ Оплата получена, но возникла ошибка при продлении подписки.\n\n` +
          `Обратись к администратору: @yaronetwork`,
        { parse_mode: 'HTML' }
      );
    }
  }
});

// ============================================================================
// ОБРАБОТКА ОШИБОК
// ============================================================================

bot.on("polling_error", (error) => {
  console.error("Polling error:", error);
});

process.on("SIGINT", async () => {
  console.log("\n[YaroNetworkTool VPN Bot] Остановка...");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n[YaroNetworkTool VPN Bot] Остановка...");
  process.exit(0);
});
