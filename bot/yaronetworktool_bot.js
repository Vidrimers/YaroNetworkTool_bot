#!/usr/bin/env node
/**
 * YaroNetworkTool VPN Bot
 * Telegram бот для управления VPN сервером
 */

import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import sqlite3 from "sqlite3";
import APIClient from "./utils/api-client.js";

dotenv.config();

// Конфигурация
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_ADMIN_ID = parseInt(process.env.TELEGRAM_ADMIN_ID);
const SERVER_IP = process.env.SERVER_IP || "localhost";
const DB_PATH = process.env.DB_PATH || "./yaronetworkbase.db";

if (!TELEGRAM_BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN не установлен в .env");
  process.exit(1);
}

// Инициализация бота и API клиента
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
const apiClient = new APIClient();

// Класс для работы с базой данных
class DB {
  constructor(dbPath) {
    this.db = new sqlite3.Database(dbPath);
  }

  close() {
    return new Promise((resolve) => this.db.close(resolve));
  }

  // Получить клиента по Telegram ID
  getClientByTelegramId(telegramId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT * FROM clients WHERE telegram_id = ?",
        [telegramId],
        (err, row) => {
          err ? reject(err) : resolve(row || null);
        }
      );
    });
  }

  // Получить всех клиентов
  getAllClients() {
    return new Promise((resolve, reject) => {
      this.db.all("SELECT * FROM clients", (err, rows) => {
        err ? reject(err) : resolve(rows || []);
      });
    });
  }
}

const db = new DB(DB_PATH);

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
        [{ text: '👥 Клиенты' }, { text: '📊 Статистика' }],
        [{ text: '📝 Запросы' }, { text: '⚙️ Сервер' }],
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
console.log(`Database: ${DB_PATH}\n`);

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
          `Используйте кнопки ниже для управления:\n\n` +
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
      const client = await db.getClientByTelegramId(userId);

      if (client) {
        // Клиент зарегистрирован
        
        // Проверить, видел ли клиент правила (можно добавить поле в БД)
        // Пока отправляем правила каждый раз при первом /start
        
        bot.sendMessage(
          chatId,
          `👋 Добро пожаловать, <b>${client.name}</b>!\n\n` +
            `📊 <b>Ваш личный кабинет VPN</b>\n\n` +
            `Используйте кнопки ниже:\n\n` +
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
        bot.sendMessage(
          chatId,
          `👋 Привет, ${username}!\n\n` +
            `❌ <b>Вы не зарегистрированы в системе</b>\n\n` +
            `Для получения доступа к VPN обратитесь к администратору.\n\n` +
            `Ваш Telegram ID: <code>${userId}</code>\n` +
            `(Отправьте этот ID администратору)`,
          { parse_mode: "HTML" }
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
      { parse_mode: "HTML" }
    );
  } else {
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
      { parse_mode: "HTML" }
    );
  }
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

    let message = `👥 <b>Список клиентов (${clients.length}):</b>\n\n`;
    
    clients.forEach((client, i) => {
      const status = client.status === "active" ? "✅" : "❌";
      const endDate = new Date(client.subscription_end);
      const daysLeft = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));
      
      message += `${i + 1}. ${status} <b>${client.name}</b>\n`;
      message += `   UUID: <code>${client.uuid}</code>\n`;
      message += `   Telegram: ${client.telegram_id || "не связан"}\n`;
      message += `   Подписка: ${daysLeft > 0 ? `${daysLeft} дней` : "истекла"}\n`;
      message += `   Трафик: ${client.traffic_used_gb || 0}/${client.traffic_limit_gb} GB\n\n`;
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

    let message = `👤 <b>Информация о клиенте</b>\n\n`;
    message += `<b>Имя:</b> ${client.name}\n`;
    message += `<b>UUID:</b> <code>${client.uuid}</code>\n`;
    message += `<b>Telegram ID:</b> ${client.telegram_id || "не связан"}\n`;
    message += `<b>Email:</b> ${client.email || "не указан"}\n\n`;
    message += `<b>Статус:</b> ${status}\n`;
    message += `<b>Подписка:</b> ${daysLeft > 0 ? `${daysLeft} дней` : "истекла"}\n`;
    message += `<b>Начало:</b> ${new Date(client.subscription_start).toLocaleDateString()}\n`;
    message += `<b>Конец:</b> ${endDate.toLocaleDateString()}\n\n`;
    message += `<b>Трафик:</b> ${client.traffic_used_gb || 0}/${client.traffic_limit_gb} GB\n`;
    message += `<b>Сброс трафика:</b> ${new Date(client.traffic_reset_date).toLocaleDateString()}\n`;

    bot.sendMessage(chatId, message, { parse_mode: "HTML" });
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
      "Введите имя клиента:",
    { parse_mode: "HTML" }
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
    message += "Выберите клиента для удаления:\n\n";

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
    message += `🌐 IP: ${SERVER_IP}\n`;
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
    const client = await db.getClientByTelegramId(userId);

    if (!client) {
      bot.sendMessage(chatId, "❌ Вы не зарегистрированы в системе");
      return;
    }

    const response = await apiClient.getClient(client.uuid);
    const clientData = response.client;

    const endDate = new Date(clientData.subscription_end);
    const daysLeft = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));
    const status = clientData.status === "active" ? "✅ Активен" : "❌ Заблокирован";
    const trafficPercent = Math.round((clientData.traffic_used_gb / clientData.traffic_limit_gb) * 100);

    let message = `📊 <b>Моя статистика VPN</b>\n\n`;
    message += `👤 <b>Имя:</b> ${clientData.name}\n`;
    message += `🆔 <b>UUID:</b> <code>${clientData.uuid}</code>\n\n`;
    message += `<b>Статус:</b> ${status}\n`;
    message += `<b>Подписка:</b> ${daysLeft > 0 ? `${daysLeft} дней` : "истекла ⚠️"}\n`;
    message += `<b>Конец подписки:</b> ${endDate.toLocaleDateString()}\n\n`;
    message += `<b>Трафик:</b> ${clientData.traffic_used_gb || 0}/${clientData.traffic_limit_gb} GB (${trafficPercent}%)\n`;
    message += `<b>Сброс трафика:</b> ${new Date(clientData.traffic_reset_date).toLocaleDateString()}\n`;

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
    const client = await db.getClientByTelegramId(userId);

    if (!client) {
      bot.sendMessage(chatId, "❌ Вы не зарегистрированы в системе");
      return;
    }

    let message = `🔗 <b>Ссылка подключения</b>\n\n`;
    message += `Ваш UUID: <code>${client.uuid}</code>\n\n`;
    message += `Для получения ссылки подключения обратитесь к администратору.\n`;
    message += `Администратор сгенерирует для вас vless:// ссылку и QR код.`;

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
    const client = await db.getClientByTelegramId(userId);

    if (!client) {
      bot.sendMessage(chatId, "❌ Вы не зарегистрированы в системе");
      return;
    }

    const response = await apiClient.getClientExtensionRequests(client.uuid);
    const requests = response.requests || [];

    if (requests.length === 0) {
      bot.sendMessage(chatId, "📭 У вас нет запросов на продление");
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
      
      message += `   Дата: ${new Date(req.created_at).toLocaleDateString()}\n\n`;
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
    // Обработка добавления клиента
    if (userState.action === "add_client") {
      if (userState.step === "name") {
        userState.name = text;
        userState.step = "telegram_id";
        userStates.set(userId, userState);
        
        bot.sendMessage(
          chatId,
          "Введите Telegram ID клиента (или 0 если не известен):"
        );
        return;
      } else if (userState.step === "telegram_id") {
        const telegramId = parseInt(text);
        
        if (isNaN(telegramId)) {
          bot.sendMessage(chatId, "❌ Неверный формат. Введите число:");
          return;
        }
        
        userState.telegram_id = telegramId === 0 ? null : telegramId;
        userState.step = "subscription_days";
        userStates.set(userId, userState);
        
        bot.sendMessage(
          chatId,
          "Введите количество дней подписки (по умолчанию 30):"
        );
        return;
      } else if (userState.step === "subscription_days") {
        const days = parseInt(text);
        
        if (isNaN(days) || days <= 0) {
          bot.sendMessage(chatId, "❌ Неверный формат. Введите положительное число:");
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
          
          bot.sendMessage(
            chatId,
            `✅ <b>Клиент создан успешно!</b>\n\n` +
              `👤 Имя: ${client.name}\n` +
              `🆔 UUID: <code>${client.uuid}</code>\n` +
              `📱 Telegram ID: ${client.telegram_id || "не указан"}\n` +
              `📅 Подписка: ${days} дней\n` +
              `📊 Лимит трафика: ${client.traffic_limit_gb} GB`,
            { parse_mode: "HTML" }
          );
          
          userStates.delete(userId);
        } catch (error) {
          console.error("Ошибка создания клиента:", error);
          bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
          userStates.delete(userId);
        }
        return;
      }
    }
    
    // Обработка изменения периода запроса
    if (userState.action === "change_period") {
      const days = parseInt(text);
      
      if (isNaN(days) || days <= 0) {
        bot.sendMessage(chatId, "❌ Неверный формат. Введите положительное число:");
        return;
      }
      
      try {
        // Одобряем запрос с новым периодом
        const response = await apiClient.approveExtensionRequest(userState.requestId, days);
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
            `✅ <b>Ваш запрос одобрен!</b>\n\n` +
              `Подписка продлена на ${days} дней.\n` +
              `Используйте /my_vpn для просмотра обновленной информации.`,
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
    
    return;
  }

  // Обработка кнопок
  try {
    if (text === "❓ Помощь") {
      // Вызываем команду /help
      bot.emit("text", { ...msg, text: "/help" });
      return;
    }

    if (isAdmin(userId)) {
      // Кнопки администратора
      if (text === "👥 Клиенты") {
        const response = await apiClient.getClients();
        const clients = response.clients || [];
        
        if (clients.length === 0) {
          bot.sendMessage(chatId, "📭 Клиенты не найдены");
          return;
        }

        let message = `👥 <b>Список клиентов (${clients.length}):</b>\n\n`;
        clients.forEach((client, i) => {
          const status = client.status === "active" ? "✅" : "❌";
          const endDate = new Date(client.subscription_end);
          const daysLeft = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));
          
          message += `${i + 1}. ${status} <b>${client.name}</b>\n`;
          message += `   UUID: <code>${client.uuid}</code>\n`;
          message += `   Telegram: ${client.telegram_id || "не связан"}\n`;
          message += `   Подписка: ${daysLeft > 0 ? `${daysLeft} дней` : "истекла"}\n\n`;
        });

        bot.sendMessage(chatId, message, { parse_mode: "HTML" });
      } else if (text === "📊 Статистика") {
        const clientsResponse = await apiClient.getClients();
        const clients = clientsResponse.clients || [];
        
        const activeClients = clients.filter(c => c.status === "active").length;
        const blockedClients = clients.filter(c => c.status === "blocked").length;
        const totalTraffic = clients.reduce((sum, c) => sum + (c.traffic_used_gb || 0), 0);
        
        let message = `📊 <b>Статистика сервера</b>\n\n`;
        message += `👥 <b>Клиенты:</b>\n`;
        message += `   Всего: ${clients.length}\n`;
        message += `   Активных: ${activeClients}\n`;
        message += `   Заблокированных: ${blockedClients}\n\n`;
        message += `📈 <b>Трафик:</b>\n`;
        message += `   Всего использовано: ${totalTraffic.toFixed(2)} GB\n`;
        
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
          message += `   Дата: ${new Date(req.created_at).toLocaleDateString()}\n\n`;
        });
        
        bot.sendMessage(chatId, message, { parse_mode: "HTML" });
      } else if (text === "⚙️ Сервер") {
        const clientsResponse = await apiClient.getClients();
        const clients = clientsResponse.clients || [];
        
        const activeClients = clients.filter(c => c.status === "active").length;
        const blockedClients = clients.filter(c => c.status === "blocked").length;

        let message = `⚙️ <b>Статус сервера</b>\n\n`;
        message += `✅ Сервер: Онлайн\n`;
        message += `🌐 IP: ${SERVER_IP}\n`;
        message += `📊 База данных: Подключена\n\n`;
        message += `👥 <b>Клиенты:</b>\n`;
        message += `   Всего: ${clients.length}\n`;
        message += `   Активных: ${activeClients}\n`;
        message += `   Заблокированных: ${blockedClients}\n`;

        bot.sendMessage(chatId, message, { parse_mode: "HTML" });
      }
    } else {
      // Кнопки клиента
      const client = await db.getClientByTelegramId(userId);

      if (!client) {
        bot.sendMessage(
          chatId,
          "❌ Вы не зарегистрированы в системе.\n" +
            "Обратитесь к администратору."
        );
        return;
      }

      if (text === "📊 Мой VPN") {
        const response = await apiClient.getClient(client.uuid);
        const clientData = response.client;

        const endDate = new Date(clientData.subscription_end);
        const daysLeft = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));
        const status = clientData.status === "active" ? "✅ Активен" : "❌ Заблокирован";
        const trafficPercent = Math.round((clientData.traffic_used_gb / clientData.traffic_limit_gb) * 100);

        let message = `📊 <b>Моя статистика VPN</b>\n\n`;
        message += `👤 <b>Имя:</b> ${clientData.name}\n`;
        message += `🆔 <b>UUID:</b> <code>${clientData.uuid}</code>\n\n`;
        message += `<b>Статус:</b> ${status}\n`;
        message += `<b>Подписка:</b> ${daysLeft > 0 ? `${daysLeft} дней` : "истекла ⚠️"}\n`;
        message += `<b>Конец подписки:</b> ${endDate.toLocaleDateString()}\n\n`;
        message += `<b>Трафик:</b> ${clientData.traffic_used_gb || 0}/${clientData.traffic_limit_gb} GB (${trafficPercent}%)\n`;

        if (daysLeft <= 7 && daysLeft > 0) {
          message += `\n⚠️ <b>Внимание:</b> Подписка истекает через ${daysLeft} дней!`;
        }

        bot.sendMessage(chatId, message, { parse_mode: "HTML" });
      } else if (text === "🔗 Моя ссылка") {
        let message = `🔗 <b>Ссылка подключения</b>\n\n`;
        message += `Ваш UUID: <code>${client.uuid}</code>\n\n`;
        message += `Для получения ссылки подключения обратитесь к администратору.\n`;
        message += `Администратор сгенерирует для вас vless:// ссылку и QR код.`;

        bot.sendMessage(chatId, message, { parse_mode: "HTML" });
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
            `Выберите период продления:`,
          {
            parse_mode: "HTML",
            reply_markup: keyboard,
          }
        );
      } else if (text === "📝 Мои запросы") {
        const response = await apiClient.getClientExtensionRequests(client.uuid);
        const requests = response.requests || [];

        if (requests.length === 0) {
          bot.sendMessage(chatId, "📭 У вас нет запросов на продление");
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
          
          message += `   Дата: ${new Date(req.created_at).toLocaleDateString()}\n\n`;
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

  try {
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
      const client = await db.getClientByTelegramId(userId);

      if (!client) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Вы не зарегистрированы",
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
            `Администратор получил ваш запрос и рассмотрит его в ближайшее время.\n` +
            `Вы получите уведомление о решении.`,
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
                { text: "📝 Другой период", callback_data: `change_${response.request.id}_${client.uuid}` },
              ],
            ],
          };

          bot.sendMessage(
            TELEGRAM_ADMIN_ID,
            `🔔 <b>Новый запрос на продление</b>\n\n` +
              `👤 Клиент: ${client.name}\n` +
              `🆔 UUID: <code>${client.uuid}</code>\n` +
              `📅 Запрошено: ${months} ${months === 1 ? "месяц" : "месяцев"} (${response.request.requested_days} дней)\n\n` +
              `Выберите действие:`,
            {
              parse_mode: "HTML",
              reply_markup: keyboard,
            }
          );
        }

        bot.answerCallbackQuery(query.id);
      } catch (error) {
        console.error("Ошибка создания запроса:", error);
        bot.answerCallbackQuery(query.id, {
          text: `❌ Ошибка: ${error.message}`,
          show_alert: true,
        });
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
        const response = await apiClient.approveExtensionRequest(requestId, null);
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
            `✅ <b>Ваш запрос одобрен!</b>\n\n` +
              `Подписка продлена на ${request.approved_days} дней.\n` +
              `Используйте /my_vpn для просмотра обновленной информации.`,
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
        const response = await apiClient.denyExtensionRequest(requestId, "Отклонено администратором");
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
            `❌ <b>Ваш запрос отклонен</b>\n\n` +
              `К сожалению, администратор отклонил ваш запрос на продление.\n` +
              `Для уточнения причины обратитесь к администратору.`,
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

      const parts = data.split("_");
      const requestId = parts[1];
      const clientUuid = parts[2];

      // Устанавливаем состояние для ввода нового периода
      userStates.set(userId, {
        action: "change_period",
        requestId: requestId,
        clientUuid: clientUuid,
        messageId: query.message.message_id,
      });

      bot.sendMessage(
        chatId,
        `📝 Введите количество дней для продления:\n\n` +
          `Например: 30 (для 1 месяца) или 90 (для 3 месяцев)`,
        {
          reply_markup: {
            force_reply: true,
            selective: true,
          },
        }
      );

      bot.answerCallbackQuery(query.id);
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
        bot.answerCallbackQuery(query.id);
        return;
      }

      const clientUuid = data.split("_")[1];

      try {
        // Получаем информацию о клиенте
        const clientResponse = await apiClient.getClient(clientUuid);
        const client = clientResponse.client;

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

        bot.answerCallbackQuery(query.id, { text: "✅ Клиент удален" });
      } catch (error) {
        console.error("Ошибка удаления клиента:", error);
        bot.answerCallbackQuery(query.id, {
          text: `❌ Ошибка: ${error.message}`,
          show_alert: true,
        });
      }
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
// ОБРАБОТКА ОШИБОК
// ============================================================================

bot.on("polling_error", (error) => {
  console.error("Polling error:", error);
});

process.on("SIGINT", async () => {
  console.log("\n[YaroNetworkTool VPN Bot] Остановка...");
  await db.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n[YaroNetworkTool VPN Bot] Остановка...");
  await db.close();
  process.exit(0);
});
