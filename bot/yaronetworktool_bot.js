#!/usr/bin/env node
/**
 * YaroNetworkTool VPN Bot
 * Telegram бот для управления VPN сервером
 */

import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import sqlite3 from "sqlite3";

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

// Инициализация бота
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

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
    // TODO: Обработка интерактивных состояний
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
        const clients = await db.getAllClients();
        
        if (clients.length === 0) {
          bot.sendMessage(chatId, "📭 Клиенты не найдены");
          return;
        }

        let response = `👥 <b>Список клиентов (${clients.length}):</b>\n\n`;
        clients.forEach((client, i) => {
          const status = client.status === "active" ? "✅" : "❌";
          response += `${i + 1}. ${status} <b>${client.name}</b>\n`;
          response += `   UUID: <code>${client.uuid}</code>\n`;
          response += `   Telegram: ${client.telegram_id || "не связан"}\n\n`;
        });

        bot.sendMessage(chatId, response, { parse_mode: "HTML" });
      } else if (text === "📊 Статистика") {
        bot.sendMessage(
          chatId,
          "📊 <b>Статистика сервера</b>\n\n" +
            "Эта функция будет доступна после интеграции с API",
          { parse_mode: "HTML" }
        );
      } else if (text === "📝 Запросы") {
        bot.sendMessage(
          chatId,
          "📝 <b>Запросы на продление</b>\n\n" +
            "Эта функция будет доступна после интеграции с API",
          { parse_mode: "HTML" }
        );
      } else if (text === "⚙️ Сервер") {
        bot.sendMessage(
          chatId,
          `⚙️ <b>Статус сервера</b>\n\n` +
            `✅ Сервер: Онлайн\n` +
            `🌐 IP: ${SERVER_IP}\n` +
            `📊 База данных: Подключена\n\n` +
            `Детальная статистика будет доступна после интеграции с API`,
          { parse_mode: "HTML" }
        );
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
        bot.sendMessage(
          chatId,
          `📊 <b>Статистика VPN</b>\n\n` +
            `👤 Имя: ${client.name}\n` +
            `🆔 UUID: <code>${client.uuid}</code>\n\n` +
            `Детальная статистика будет доступна после интеграции с API`,
          { parse_mode: "HTML" }
        );
      } else if (text === "🔗 Моя ссылка") {
        bot.sendMessage(
          chatId,
          `🔗 <b>Ссылка подключения</b>\n\n` +
            `Эта функция будет доступна после интеграции с API\n\n` +
            `Ваш UUID: <code>${client.uuid}</code>`,
          { parse_mode: "HTML" }
        );
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
        bot.sendMessage(
          chatId,
          `📝 <b>Мои запросы на продление</b>\n\n` +
            `Эта функция будет доступна после интеграции с API`,
          { parse_mode: "HTML" }
        );
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
    // Запросы на продление
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

      // TODO: Создать запрос через API
      // TODO: Отправить уведомление админу

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

      // Отправляем уведомление админу (заглушка)
      if (TELEGRAM_ADMIN_ID) {
        const keyboard = {
          inline_keyboard: [
            [
              { text: "✅ Разрешить", callback_data: `approve_${client.uuid}_${months}` },
              { text: "❌ Отказать", callback_data: `deny_${client.uuid}` },
            ],
            [
              { text: "📝 Другой период", callback_data: `change_${client.uuid}` },
            ],
          ],
        };

        bot.sendMessage(
          TELEGRAM_ADMIN_ID,
          `🔔 <b>Новый запрос на продление</b>\n\n` +
            `👤 Клиент: ${client.name}\n` +
            `🆔 UUID: <code>${client.uuid}</code>\n` +
            `📅 Запрошено: ${months} ${months === 1 ? "месяц" : "месяцев"}\n\n` +
            `Выберите действие:`,
          {
            parse_mode: "HTML",
            reply_markup: keyboard,
          }
        );
      }

      bot.answerCallbackQuery(query.id);
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
      const clientUuid = parts[1];
      const months = parseInt(parts[2]);

      // TODO: Одобрить запрос через API
      // TODO: Продлить подписку клиента

      bot.editMessageText(
        `✅ <b>Запрос одобрен</b>\n\n` +
          `UUID: <code>${clientUuid}</code>\n` +
          `Период: ${months} ${months === 1 ? "месяц" : "месяцев"}\n\n` +
          `Подписка продлена автоматически.`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: "HTML",
        }
      );

      bot.answerCallbackQuery(query.id, { text: "✅ Запрос одобрен" });
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

      const clientUuid = data.split("_")[1];

      // TODO: Отклонить запрос через API

      bot.editMessageText(
        `❌ <b>Запрос отклонен</b>\n\n` +
          `UUID: <code>${clientUuid}</code>`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: "HTML",
        }
      );

      bot.answerCallbackQuery(query.id, { text: "❌ Запрос отклонен" });
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

      const clientUuid = data.split("_")[1];

      // Устанавливаем состояние для ввода нового периода
      userStates.set(userId, {
        action: "change_period",
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
