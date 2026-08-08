/**
 * Обработчики для команды /menu и инлайн-кнопок меню
 * Заменяет старые keyboard кнопки на инлайн-кнопки
 */

import { getActiveDevices } from "./device-monitor.js";
import QRCode from "qrcode";
import jwt from "jsonwebtoken";

// Переменные окружения
const SERVER_IP = process.env.SERVER_IP || "localhost";

/**
 * Команда /menu - показывает главное меню с инлайн-кнопками
 */
export async function handleMenuCommand(bot, msg, isAdmin, apiClient) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  console.log(`[MENU] Пользователь ${userId} открыл меню`);

  try {
    if (isAdmin(userId)) {
      // Админ меню
      const menuButtons = [
        [
          { text: '👶 Малютки', callback_data: 'menu_clients' },
          { text: '📊 Статистика', callback_data: 'menu_stats' }
        ],
        [
          { text: '📝 Запросы', callback_data: 'menu_requests' },
          { text: '⚙️ Сервер', callback_data: 'menu_server' }
        ],
        [
          { text: '🔧 Xray', callback_data: 'menu_xray' },
          { text: '📢 Объявление', callback_data: 'menu_announcement' }
        ],
        [
          { text: '📊 Мой VPN', callback_data: 'menu_my_vpn' },
          { text: '🔗 Моя ссылка', callback_data: 'menu_my_link' }
        ],
        [
          { text: '📥 Скачать VPN', callback_data: 'menu_download' }
        ],
        [
          { text: '🚀 Ускорение TG', callback_data: 'menu_tg_acceleration' },
          { text: '🛡️ Zapret', callback_data: 'menu_zapret' }
        ],
        [
          { text: '🔍 Диагностика блокировок', callback_data: 'menu_tspu' }
        ],
        [
          { text: '❓ Помощь', callback_data: 'menu_help' }
        ],
        [
          { text: '📱 Личный кабинет', callback_data: 'menu_portal' }
        ]
      ];

      const menuOptions = {
        reply_markup: {
          inline_keyboard: menuButtons
        }
      };

      await bot.sendMessage(chatId, '<b>📱 Главное меню администратора</b>\n\nВыберите действие:', {
        parse_mode: "HTML",
        ...menuOptions
      });
    } else {
      // Клиент меню
      const menuButtons = [
        [
          { text: '📊 Мой VPN', callback_data: 'menu_my_vpn' },
          { text: '🔗 Моя ссылка', callback_data: 'menu_my_link' }
        ],
        [
          { text: '🔑 Запросить ключ', callback_data: 'menu_request_key' },
          { text: '📝 Мои запросы', callback_data: 'menu_my_requests' }
        ],
        [
          { text: '📥 Скачать VPN', callback_data: 'menu_download' }
        ],
        [
          { text: '🔍 Проверить подключение', callback_data: 'menu_tspu_client' }
        ],
        [
          { text: '🚀 Ускорение TG', callback_data: 'menu_tg_acceleration' },
          { text: '🛡️ Zapret', callback_data: 'menu_zapret' }
        ],
        [
          { text: '❓ Помощь', callback_data: 'menu_help' }
        ],
        [
          { text: '📱 Личный кабинет', callback_data: 'menu_portal' }
        ],
        [
          { text: '🗑️ Удалить аккаунт', callback_data: 'menu_delete_account' }
        ]
      ];

      const menuOptions = {
        reply_markup: {
          inline_keyboard: menuButtons
        }
      };

      await bot.sendMessage(chatId, '<b>📱 Главное меню</b>\n\nВыберите действие:', {
        parse_mode: "HTML",
        ...menuOptions
      });
    }
  } catch (error) {
    console.error("Ошибка в /menu:", error);
    await bot.sendMessage(chatId, "❌ Произошла ошибка. Попробуйте позже.");
  }
}

/**
 * Обработчик инлайн-кнопок меню
 * Вызывается из основного обработчика callback_query
 */
export async function handleMenuCallback(bot, query, data, isAdmin, apiClient, getClientByTelegramId, formatDate, formatTraffic) {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  
  console.log(`[MENU_CALLBACK] Пользователь ${userId} нажал: ${data}`);

  try {
    // Отвечаем на callback чтобы убрать "часики"
    await bot.answerCallbackQuery(query.id);

    // Обработка кнопок меню
    switch (data) {
      case 'menu_clients':
        // Показываем список клиентов (только для админа)
        if (!isAdmin(userId)) {
          await bot.sendMessage(chatId, "❌ Доступ запрещен");
          return;
        }
        
        try {
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
                { text: "✏️ Переименовать клиента", callback_data: "admin_rename_client" }
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
              ],
              [
                { text: "📅 Выдать дни подписки", callback_data: "admin_extend_client" }
              ],
              [
                { text: "◀️ Назад в меню", callback_data: "back_to_menu" }
              ]
            ]
          };

          await bot.sendMessage(chatId, message, { 
            parse_mode: "HTML",
            reply_markup: keyboard
          });
        } catch (error) {
          console.error("Ошибка получения списка клиентов:", error);
          await bot.sendMessage(chatId, "❌ Ошибка подключения к API серверу. Проверь что API запущен.", {
            reply_markup: {
              inline_keyboard: [[{ text: "◀️ Назад в меню", callback_data: "back_to_menu" }]]
            }
          });
        }
        break;

      case 'menu_requests':
        // Показываем запросы на продление (только для админа)
        if (!isAdmin(userId)) {
          await bot.sendMessage(chatId, "❌ Доступ запрещен");
          return;
        }
        
        try {
          const requestsResponse = await apiClient.getExtensionRequests();
          const allRequests = requestsResponse.requests || [];
          
          const pendingRequests = allRequests.filter(r => r.status === "pending");
          const approvedRequests = allRequests.filter(r => r.status === "approved");
          const deniedRequests = allRequests.filter(r => r.status === "denied");
          
          let requestsMsg = `📝 <b>Запросы на продление подписки</b>\n\n`;
          requestsMsg += `⏳ Ожидают: ${pendingRequests.length}\n`;
          requestsMsg += `✅ Одобрено: ${approvedRequests.length}\n`;
          requestsMsg += `❌ Отклонено: ${deniedRequests.length}\n\n`;
          
          if (pendingRequests.length > 0) {
            requestsMsg += `<b>Ожидающие запросы:</b>\n`;
            pendingRequests.slice(0, 5).forEach((req, i) => {
              requestsMsg += `${i + 1}. ${req.client_name} - ${req.requested_months} мес.\n`;
            });
            if (pendingRequests.length > 5) {
              requestsMsg += `... и еще ${pendingRequests.length - 5}\n`;
            }
          }
          
          const keyboard = {
            inline_keyboard: [
              [
                { text: "⏳ Ожидающие запросы", callback_data: "admin_pending_requests" }
              ],
              [
                { text: "✅ Одобренные запросы", callback_data: "admin_approved_requests" }
              ],
              [
                { text: "❌ Отклоненные запросы", callback_data: "admin_denied_requests" }
              ],
              [
                { text: "◀️ Назад в меню", callback_data: "back_to_menu" }
              ]
            ]
          };
          
          await bot.sendMessage(chatId, requestsMsg, {
            parse_mode: "HTML",
            reply_markup: keyboard
          });
        } catch (error) {
          console.error("Ошибка получения запросов:", error);
          await bot.sendMessage(chatId, "❌ Ошибка подключения к API серверу. Проверь что API запущен.", {
            reply_markup: {
              inline_keyboard: [[{ text: "◀️ Назад в меню", callback_data: "back_to_menu" }]]
            }
          });
        }
        break;

      case 'menu_server':
        // Показываем статус сервера (только для админа)
        if (!isAdmin(userId)) {
          await bot.sendMessage(chatId, "❌ Доступ запрещен");
          return;
        }
        
        try {
          const clientsResponse = await apiClient.getClients();
          const clients = clientsResponse.clients || [];
          
          const activeClients = clients.filter(c => c.status === "active").length;
          const blockedClients = clients.filter(c => c.status === "blocked").length;

          let serverMsg = `⚙️ <b>Статус сервера</b>\n\n`;
          serverMsg += `✅ Сервер: Онлайн\n`;
          serverMsg += `🌐 VPN: <code>${SERVER_IP}:443</code>\n`;
          serverMsg += `🔧 API: <code>${SERVER_IP}:333</code>\n`;
          serverMsg += `📊 База данных: Подключена\n\n`;
          serverMsg += `👥 <b>Клиенты:</b>\n`;
          serverMsg += `   Всего: ${clients.length}\n`;
          serverMsg += `   Активных: ${activeClients}\n`;
          serverMsg += `   Заблокированных: ${blockedClients}\n`;

          const keyboard = {
            inline_keyboard: [
              [
                { text: "🔄 Обновить", callback_data: "menu_server" }
              ],
              [
                { text: "◀️ Назад в меню", callback_data: "back_to_menu" }
              ]
            ]
          };

          await bot.sendMessage(chatId, serverMsg, {
            parse_mode: "HTML",
            reply_markup: keyboard
          });
        } catch (error) {
          console.error("Ошибка получения статуса сервера:", error);
          await bot.sendMessage(chatId, "❌ Ошибка подключения к API серверу. Проверь что API запущен.", {
            reply_markup: {
              inline_keyboard: [[{ text: "◀️ Назад в меню", callback_data: "back_to_menu" }]]
            }
          });
        }
        break;

      case 'menu_xray':
        // Управление Xray сервисом (только для админа)
        if (!isAdmin(userId)) {
          await bot.sendMessage(chatId, "❌ Доступ запрещен");
          return;
        }
        
        let xrayMsg = `🔧 <b>Управление Xray</b>\n\n`;
        xrayMsg += `Выбери действие:`;
        
        const xrayKeyboard = {
          inline_keyboard: [
            [
              { text: "📊 Статус Xray", callback_data: "xray_status" }
            ],
            [
              { text: "🔄 Перезапустить Xray", callback_data: "xray_restart" }
            ],
            [
              { text: "⏹️ Остановить Xray", callback_data: "xray_stop" }
            ],
            [
              { text: "▶️ Запустить Xray", callback_data: "xray_start" }
            ],
            [
              { text: "📝 Логи Xray", callback_data: "xray_logs" }
            ],
            [
              { text: "◀️ Назад в меню", callback_data: "back_to_menu" }
            ]
          ]
        };
        
        await bot.sendMessage(chatId, xrayMsg, {
          parse_mode: "HTML",
          reply_markup: xrayKeyboard
        });
        break;

      case 'menu_stats':
        // Показываем статистику (только для админа)
        if (!isAdmin(userId)) {
          await bot.sendMessage(chatId, "❌ Доступ запрещен");
          return;
        }
        
        try {
          const clientsResponse = await apiClient.getClients();
        const allClients = clientsResponse.clients || [];
        
        const activeClients = allClients.filter(c => c.status === "active");
        const blockedClients = allClients.filter(c => c.status === "blocked");
        
        // Получаем статистику трафика за день/неделю/месяц для всех клиентов
        let dayTraffic = 0;
        let weekTraffic = 0;
        let monthTraffic = 0;
        const clientsWithStats = [];
        
        for (const client of allClients) {
          try {
            const statsResponse = await apiClient.getClientTrafficStats(client.uuid);
            const stats = statsResponse.stats;
            dayTraffic += stats.day || 0;
            weekTraffic += stats.week || 0;
            monthTraffic += stats.month || 0;
            clientsWithStats.push({ ...client, monthTraffic: stats.month || 0 });
          } catch (err) {
            console.error(`Ошибка получения статистики для ${client.uuid}:`, err);
            clientsWithStats.push({ ...client, monthTraffic: 0 });
          }
        }
        
        // Топ 5 клиентов по трафику за месяц
        const topClients = [...clientsWithStats]
          .sort((a, b) => b.monthTraffic - a.monthTraffic)
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
        
        let statsMessage = `📊 <b>Статистика сервера</b>\n\n`;
        statsMessage += `👥 <b>Клиенты:</b>\n`;
        statsMessage += `   Всего: ${allClients.length}\n`;
        statsMessage += `   Активных: ${activeClients.length}\n`;
        statsMessage += `   Заблокированных: ${blockedClients.length}\n\n`;
        statsMessage += `📈 <b>Трафик:</b>\n`;
        statsMessage += `   За день: ${dayTraffic.toFixed(2)} GB\n`;
        statsMessage += `   За неделю: ${weekTraffic.toFixed(2)} GB\n`;
        statsMessage += `   За месяц: ${monthTraffic.toFixed(2)} GB\n`;
        statsMessage += `   Средний на клиента: ${(monthTraffic / allClients.length || 0).toFixed(2)} GB\n\n`;
        
        if (topClients.length > 0) {
          statsMessage += `🏆 <b>Топ клиентов по трафику (за месяц):</b>\n`;
          topClients.forEach((c, i) => {
            statsMessage += `   ${i + 1}. ${c.name}: ${c.monthTraffic.toFixed(2)} GB\n`;
          });
          statsMessage += `\n`;
        }
        
        if (expiringClients.length > 0) {
          statsMessage += `⏰ <b>Истекающие подписки (&lt; 7 дней):</b> ${expiringClients.length}\n`;
          expiringClients.forEach(c => {
            const endDate = new Date(c.subscription_end);
            const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
            statsMessage += `   • ${c.name}: ${daysLeft} ${daysLeft === 1 ? 'день' : daysLeft < 5 ? 'дня' : 'дней'}\n`;
          });
          statsMessage += `\n`;
        }
        
        if (highTrafficClients.length > 0) {
          statsMessage += `⚠️ <b>Превышение трафика (&gt; 80%):</b> ${highTrafficClients.length}\n`;
        }
        
        await bot.sendMessage(chatId, statsMessage, { 
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[{ text: "◀️ Назад в меню", callback_data: "back_to_menu" }]]
          }
        });
        } catch (error) {
          console.error("Ошибка получения статистики:", error);
          await bot.sendMessage(chatId, "❌ Ошибка подключения к API серверу. Проверь что API запущен.", {
            reply_markup: {
              inline_keyboard: [[{ text: "◀️ Назад в меню", callback_data: "back_to_menu" }]]
            }
          });
        }
        break;

      // ========================================================================
      // ОБРАБОТЧИКИ КНОПОК ДЛЯ КЛИЕНТОВ И АДМИНОВ
      // ========================================================================

      case 'menu_my_vpn':
        // Показываем статистику VPN (для всех)
        try {
          const client = await getClientByTelegramId(userId);
          
          if (!client) {
            await bot.sendMessage(chatId, "❌ Ты не зарегистрирован в системе");
            return;
          }
          
          const clientResponse = await apiClient.getClient(client.uuid);
        const clientData = clientResponse.client;
        
        // Получаем статистику трафика
        let trafficStats = null;
        try {
          const statsResponse = await apiClient.getClientTrafficStats(client.uuid);
          trafficStats = statsResponse.stats;
        } catch (error) {
          if (!error.message.includes('Not Found')) {
            console.error("Ошибка получения статистики трафика:", error);
          }
        }
        
        const endDate = new Date(clientData.subscription_end);
        const daysLeft = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));
        const status = clientData.status === "active" ? "✅ Активен" : "❌ Заблокирован";
        
        // Получаем информацию об активных устройствах
        const vpnDeviceInfo = await getActiveDevices();
        const vpnDevices = vpnDeviceInfo[clientData.uuid];
        const vpnDeviceCount = vpnDevices ? vpnDevices.count : 0;
        const vpnMaxDevices = clientData.max_devices || 2;
        
        let vpnMessage = `📊 <b>Моя статистика VPN</b>\n\n`;
        vpnMessage += `👤 <b>Имя:</b> ${clientData.name}\n`;
        vpnMessage += `🆔 <b>UUID:</b> <code>${clientData.uuid}</code>\n\n`;
        vpnMessage += `<b>Статус:</b> ${status}\n`;
        vpnMessage += `<b>Подписка:</b> ${daysLeft > 0 ? `${daysLeft} дней` : "истекла ⚠️"}\n`;
        vpnMessage += `<b>Конец подписки:</b> ${formatDate(endDate)}\n\n`;
        
        if (trafficStats) {
          vpnMessage += `<b>За день:</b> ${formatTraffic(trafficStats.day)} GB\n`;
          vpnMessage += `<b>За неделю:</b> ${formatTraffic(trafficStats.week)} GB\n`;
          vpnMessage += `<b>За месяц:</b> ${formatTraffic(trafficStats.month)} GB / ${clientData.traffic_limit_gb} GB\n`;
        }
        
        vpnMessage += `<b>📱 Устройств:</b> ${vpnDeviceCount}/${vpnMaxDevices}`;
        
        if (vpnDeviceCount > vpnMaxDevices) {
          vpnMessage += ` ⚠️ (превышен лимит!)`;
        }
        vpnMessage += `\n`;
        
        if (daysLeft <= 7 && daysLeft > 0) {
          vpnMessage += `\n⚠️ <b>Внимание:</b> Подписка истекает через ${daysLeft} дней!`;
        }
        
        await bot.sendMessage(chatId, vpnMessage, {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[{ text: "◀️ Назад в меню", callback_data: "back_to_menu" }]]
          }
        });
        } catch (error) {
          console.error("Ошибка получения статистики VPN:", error);
          await bot.sendMessage(chatId, "❌ Ошибка подключения к API серверу. Проверь что API запущен.", {
            reply_markup: {
              inline_keyboard: [[{ text: "◀️ Назад в меню", callback_data: "back_to_menu" }]]
            }
          });
        }
        break;

      case 'menu_my_link':
        // Показываем ссылку подписки (для всех)
        try {
          const linkClient = await getClientByTelegramId(userId);
          
          if (!linkClient) {
            await bot.sendMessage(chatId, "❌ Ты не зарегистрирован в системе");
            return;
          }
          
          // Генерируем ссылку подписки
          const subscriptionUrl = `https://${SERVER_IP}/subscription/${linkClient.uuid}`;
        
        let linkMessage = `🔗 <b>Ссылка подписки</b>\n\n`;
        linkMessage += `<code>${subscriptionUrl}</code>\n\n`;
        linkMessage += `<b>Как подключиться:</b>\n`;
        linkMessage += `1. Скачай VPN клиент: /download\n`;
        linkMessage += `2. Скопируй ссылку выше\n`;
        linkMessage += `3. В клиенте добавь подписку (Subscription)\n`;
        linkMessage += `4. Вставь ссылку и обнови\n\n`;
        linkMessage += `📱 <b>Рекомендуемые клиенты:</b>\n`;
        linkMessage += `• Android: Happ, Hiddify\n`;
        linkMessage += `• iOS: Happ\n`;
        linkMessage += `• Windows: Happ, Sing-box\n\n`;
        linkMessage += `💡 Подписка содержит 8 протоколов с автоматическим переключением`;
        
        // Отправляем сообщение
        await bot.sendMessage(chatId, linkMessage, { 
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[{ text: "◀️ Назад в меню", callback_data: "back_to_menu" }]]
          }
        });
        
        // Генерируем и отправляем QR код
        try {
          const qrBuffer = await QRCode.toBuffer(subscriptionUrl, {
            errorCorrectionLevel: 'M',
            type: 'png',
            width: 512,
            margin: 2
          });
          
          await bot.sendPhoto(chatId, qrBuffer, {
            caption: `📱 QR код подписки\n\nОтсканируй в VPN клиенте для быстрого добавления`
          });
        } catch (qrError) {
          console.error('Ошибка генерации QR кода:', qrError);
        }
        } catch (error) {
          console.error("Ошибка получения ссылки подписки:", error);
          await bot.sendMessage(chatId, "❌ Ошибка подключения к API серверу. Проверь что API запущен.", {
            reply_markup: {
              inline_keyboard: [[{ text: "◀️ Назад в меню", callback_data: "back_to_menu" }]]
            }
          });
        }
        break;

      case 'menu_download':
        // Показываем ссылки для скачивания VPN клиента с полными настройками
        const downloadKeyboard = {
          inline_keyboard: [
            [{ text: "💻 Happ (Windows)", url: "https://github.com/Happ-proxy/happ-desktop/releases/latest/download/setup-Happ.x64.exe" }],
            [{ text: "💻 Happ Releases (Windows)", url: "https://github.com/Happ-proxy/happ-desktop/releases" }],
            [{ text: "💻 Sing-box (Windows)", url: "https://github.com/SagerNet/sing-box/releases/tag/v1.12.19" }],
            [{ text: "📱 Happ (Android)", url: "https://play.google.com/store/apps/details?id=com.happproxy&hl=ru" }],
            [{ text: "📱 Hiddify (Android)", url: "https://play.google.com/store/apps/details?id=app.hiddify.com" }],
            [{ text: "📱 v2rayNG (Android)", url: "https://github.com/2dust/v2rayNG/releases" }],
            [{ text: "🍎 Happ (iOS)", url: "https://apps.apple.com/ru/app/happ-proxy-utility-plus/id6746188973" }],
            [{ text: "◀️ Назад в меню", callback_data: "back_to_menu" }]
          ]
        };
        
        await bot.sendMessage(
          chatId,
          `📥 <b>Скачать VPN клиент</b>\n\n` +
            `<b>Windows:</b>\n` +
            `• <b>Happ</b> - Прямая ссылка или GitHub Releases\n` +
            `• <b>Sing-box</b> - GitHub Releases\n\n` +
            `<b>Android:</b>\n` +
            `• <b>Happ</b> - Google Play Store\n` +
            `• <b>Hiddify</b> - Google Play Store\n` +
            `• <b>v2rayNG</b> - GitHub Releases\n\n` +
            `<b>iOS:</b>\n` +
            `• <b>Happ</b> - App Store\n\n` +
            `<b>Как подключиться:</b>\n` +
            `1. Установи приложение\n` +
            `2. Получи ссылку подписки: /my_link или кнопка "🔗 Моя ссылка"\n` +
            `3. В приложении добавь подписку (Subscription)\n` +
            `4. Вставь ссылку и обнови\n` +
            `5. Подключись\n\n` +
            `💡 <b>Подписка содержит 7 протоколов с автоматическим переключением</b>\n\n\n` +
            `⚙️ <b>Настройка для Happ:</b>\n\n` +
            `<b>0. 📱 Приложения</b>\n` +
            `Прокси для выбранных приложений → можно добавить браузер, Telegram и всё нужное.\n\n` +
            `<b>1. 🧩 Фрагментирование</b>\n` +
            `• Тип: Xray\n` +
            `• Фрагментирование пакетов: tlshello\n` +
            `• Длина фрагмента (от–до): 50–100\n` +
            `• Интервал фрагментов (от–до): 10–20\n` +
            `• Максимальное разделение фрагмента: 100+\n\n` +
            `🔊 <b>Шумы (Noise)</b>\n` +
            `• Тип: rand\n` +
            `• Пакет (от–до): 10–20\n` +
            `• Задержка (от–до): 10–16\n` +
            `• Применить к: ip\n\n` +
            `🚀 <b>Результат</b>\n\n` +
            `Трафик маскируется под обычный HTTPS, лучше проходит DPI и меньше рвётся.\n\n` +
            `<b>2. 🔧 Использовать Mux</b>\n` +
            `Включите, если хотите объединять несколько подключений в одно для повышения эффективности.\n\n` +
            `🔌 <b>TCP‑соединения</b>\n` +
            `• Значение: 8\n` +
            `• Диапазон: от –1 до 1024\n\n` +
            `📡 <b>XUDP‑соединения</b>\n` +
            `• Значение: 8\n` +
            `• Диапазон: от –1 до 1024\n\n` +
            `🚫 <b>Обработка QUIC</b>\n` +
            `• reject\n\n` +
            `🌐 <b>Предпочтительный тип IP</b>\n` +
            `• Auto\n\n` +
            `✨ <b>Что даёт Mux</b>\n` +
            `Снижает накладные расходы, ускоряет установку соединений и делает трафик стабильнее.\n\n\n` +
            `<b>3. 📋 Подписки</b>\n\n` +
            `🔄 <b>Автоматическое обновление подписок</b>\n` +
            `• Включите, если хотите, чтобы конфиги обновлялись сами.\n\n` +
            `⏱ <b>Интервал автообновления</b>\n` +
            `• 1 час (минимум 1, максимум 730)\n\n` +
            `🔔 <b>Уведомления обновления</b>\n` +
            `• Включите, если хотите получать оповещения.\n\n` +
            `📥 <b>Обновить при открытии</b>\n` +
            `• Обновляет подписку каждый раз при запуске приложения.\n\n` +
            `📶 <b>Пинг при открытии</b>\n` +
            `• Проверяет задержку серверов сразу после запуска.\n\n` +
            `⚡ <b>Подключаться при открытии</b>\n` +
            `• Автоматически подключается к серверу при входе в приложение.\n\n` +
            `🚀 <b>Подключаться к с наименьшей задержкой</b>\n` +
            `• Выбирает самый быстрый сервер из подписки.\n\n` +
            `🚫 <b>Запретить добавление дубликатов</b>\n` +
            `• Не позволяет добавлять одинаковые узлы.\n\n` +
            `📂 <b>Сворачивание подписок</b>\n` +
            `• Делает список подписок компактнее.`,
          { 
            parse_mode: "HTML",
            reply_markup: downloadKeyboard
          }
        );
        break;

      case 'menu_request_key':
        // Показываем выбор периода для запроса ключа
        const requestKeyboard = {
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
            [{ text: "◀️ Назад в меню", callback_data: "back_to_menu" }],
          ],
        };
        
        await bot.sendMessage(
          chatId,
          `🔑 <b>Запрос на продление подписки</b>\n\n` +
            `Выбери период продления:`,
          {
            parse_mode: "HTML",
            reply_markup: requestKeyboard,
          }
        );
        break;

      case 'menu_my_requests':
        // Показываем запросы клиента
        try {
          const requestsClient = await getClientByTelegramId(userId);
          
          if (!requestsClient) {
            await bot.sendMessage(chatId, "❌ Ты не зарегистрирован в системе");
            return;
          }
          
          const requestsResponse = await apiClient.getClientExtensionRequests(requestsClient.uuid);
        const requests = requestsResponse.requests || [];
        
        if (requests.length === 0) {
          await bot.sendMessage(chatId, "📭 У тебя нет запросов на продление", {
            reply_markup: {
              inline_keyboard: [[{ text: "◀️ Назад в меню", callback_data: "back_to_menu" }]]
            }
          });
          return;
        }
        
        let requestsMessage = `📝 <b>Мои запросы на продление (${requests.length}):</b>\n\n`;
        
        requests.forEach((req, i) => {
          const statusEmoji = req.status === "pending" ? "⏳" : req.status === "approved" ? "✅" : "❌";
          const statusText = req.status === "pending" ? "Ожидает" : req.status === "approved" ? "Одобрен" : "Отклонен";
          
          requestsMessage += `${i + 1}. ${statusEmoji} <b>${statusText}</b>\n`;
          requestsMessage += `   Запрошено: ${req.requested_months} мес. (${req.requested_days} дней)\n`;
          
          if (req.status === "approved") {
            requestsMessage += `   Одобрено: ${req.approved_days} дней\n`;
          } else if (req.status === "denied" && req.denial_reason) {
            requestsMessage += `   Причина: ${req.denial_reason}\n`;
          }
          
          requestsMessage += `   Дата: ${formatDate(req.created_at)}\n\n`;
        });
        
        await bot.sendMessage(chatId, requestsMessage, { 
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[{ text: "◀️ Назад в меню", callback_data: "back_to_menu" }]]
          }
        });
        } catch (error) {
          console.error("Ошибка получения запросов:", error);
          await bot.sendMessage(chatId, "❌ Ошибка подключения к API серверу. Проверь что API запущен.", {
            reply_markup: {
              inline_keyboard: [[{ text: "◀️ Назад в меню", callback_data: "back_to_menu" }]]
            }
          });
        }
        break;

      // ========================================================================
      // ОБРАБОТЧИКИ ДОПОЛНИТЕЛЬНЫХ ИНСТРУМЕНТОВ
      // ========================================================================

      case 'menu_tg_acceleration':
        // Показываем информацию об ускорении Telegram
        const tgAccelKeyboard = {
          inline_keyboard: [
            [{ text: "📡 Подключить MTProxy", callback_data: "activate_mtproxy" }],
            [{ text: "📖 Открыть GitHub", url: "https://github.com/Flowseal/tg-ws-proxy" }],
            [{ text: "◀️ Назад в меню", callback_data: "back_to_menu" }]
          ]
        };
        
        await bot.sendMessage(
          chatId,
          `🚀 <b>TG WS Proxy - Ускорение Telegram Desktop</b>\n\n` +
            `<b>Что это?</b>\n` +
            `Локальный SOCKS5-прокси, который перенаправляет трафик Telegram Desktop через WebSocket-соединения, ускоряя работу мессенджера.\n\n` +
            `<b>✅ Преимущества:</b>\n` +
            `• Ускорение загрузки и скачивания файлов\n` +
            `• Быстрая загрузка сообщений и медиа\n` +
            `• Работает параллельно с VPN\n` +
            `• Бесплатное решение\n\n` +
            `<b>💻 Поддержка:</b>\n` +
            `• ✅ Windows (готовый .exe с GUI)\n` +
            `• ✅ Linux/Mac (через Python)\n` +
            `• ❌ Мобильные устройства (только десктоп)\n\n` +
            `<b>🎯 Для кого:</b>\n` +
            `Только для пользователей Telegram Desktop на компьютере. Не работает с веб-версией или мобильными приложениями.\n\n` +
            `<b>📥 Установка:</b>\n` +
            `1. Перейди на GitHub (кнопка ниже)\n` +
            `2. Скачай TgWsProxy.exe из раздела Releases\n` +
            `3. Запусти программу\n` +
            `4. Следуй инструкциям в окне\n\n` +
            `<b>⚙️ Как работает:</b>\n` +
            `Программа создаёт локальный прокси на твоём компьютере (127.0.0.1:1080) и перенаправляет трафик Telegram через WebSocket к серверам kws*.web.telegram.org.\n\n` +
            `<i>💡 Это дополнительный инструмент для ускорения Telegram, работает независимо от нашего VPN.</i>`,
          { 
            parse_mode: "HTML",
            reply_markup: tgAccelKeyboard
          }
        );
        break;

      // ========================================================================
      // ОБРАБОТЧИК АКТИВАЦИИ MTPROXY
      // ========================================================================

      case 'activate_mtproxy': {
        // Отправляем ссылку MTProxy клиенту и уведомляем админа при первой активации
        const MTPROXY_LINK = process.env.MTPROXY_LINK;

        if (!MTPROXY_LINK) {
          await bot.sendMessage(chatId, "❌ MTProxy не настроен. Обратись к администратору.");
          return;
        }

        // Получаем клиента для проверки флага первой активации
        let proxyClient = null;
        try {
          proxyClient = await getClientByTelegramId(userId);
        } catch (err) {
          console.error('[MTProxy] Ошибка получения клиента:', err);
        }

        // Отправляем ссылку пользователю
        await bot.sendMessage(
          chatId,
          `📡 <b>MTProxy для Telegram</b>\n\n` +
            `Нажми на кнопку ниже — Telegram предложит добавить прокси автоматически.\n\n` +
            `<b>Что это даёт:</b>\n` +
            `• Ускорение Telegram при медленном соединении\n` +
            `• Обход блокировок Telegram\n` +
            `• Работает на всех устройствах (Android, iOS, Desktop)\n\n` +
            `<i>Прокси работает только для Telegram, не влияет на другой трафик.</i>`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📡 Добавить прокси в Telegram', url: MTPROXY_LINK }],
                [{ text: '◀️ Назад', callback_data: 'menu_tg_acceleration' }]
              ]
            }
          }
        );

        // Уведомляем админа только при первой активации
        if (proxyClient && !proxyClient.proxy_activated_at) {
          try {
            // Ставим флаг первой активации
            await apiClient.updateClient(proxyClient.uuid, {
              proxy_activated_at: new Date().toISOString()
            });

            const TELEGRAM_ADMIN_ID = parseInt(process.env.TELEGRAM_ADMIN_ID);
            if (TELEGRAM_ADMIN_ID) {
              await bot.sendMessage(
                TELEGRAM_ADMIN_ID,
                `📡 <b>Клиент активировал MTProxy</b>\n\n` +
                  `👤 <b>Клиент:</b> ${proxyClient.name}\n` +
                  `🆔 <b>Telegram ID:</b> ${userId}\n` +
                  `🕐 <b>Время:</b> ${new Date().toLocaleString('ru-RU')}`,
                { parse_mode: 'HTML' }
              );
            }
          } catch (err) {
            console.error('[MTProxy] Ошибка обновления флага или уведомления админа:', err);
          }
        }
        break;
      }

      // ========================================================================
      // КОНЕЦ ОБРАБОТЧИКА АКТИВАЦИИ MTPROXY
      // ========================================================================

      // ========================================================================
      // ДИАГНОСТИКА ТСПУ (АДМИН)
      // ========================================================================

      case 'menu_tspu': {
        if (!isAdmin(userId)) {
          await bot.sendMessage(chatId, "❌ Доступ запрещен");
          return;
        }

        const tspuMenuKeyboard = {
          inline_keyboard: [
            [
              { text: '🟢 prod (89.124.70.156)', callback_data: 'tspu_check_89.124.70.156' }
            ],
            [
              { text: '🟡 rus (185.244.172.188)', callback_data: 'tspu_check_185.244.172.188' }
            ],
            [
              { text: '◀️ Назад в меню', callback_data: 'back_to_menu' }
            ]
          ]
        };

        await bot.sendMessage(chatId,
          `🔍 <b>Диагностика блокировок ТСПУ</b>\n\n` +
          `Выберите сервер для проверки:`,
          { parse_mode: "HTML", reply_markup: tspuMenuKeyboard }
        );
        break;
      }

      case 'menu_tspu_client': {
        // Упрощённая диагностика для клиента
        const serverIp = process.env.SERVER_IP || '89.124.70.156';

        await bot.sendMessage(chatId, '⏳ Проверяю подключение к YaroVPN...');

        try {
          const result = await apiClient.checkTSPU(serverIp);

          let msg = `🔍 <b>Проверка подключения к YaroVPN</b>\n\n`;

          // Пинг
          if (result.ping?.reachable) {
            msg += `📡 Пинг: ${result.ping.latency_ms}ms ✅\n\n`;
          } else {
            msg += `📡 Пинг: Недоступен ❌\n\n`;
          }

          // Определяем какие протоколы работают
          const ports = result.ports || {};
          const working = [];
          const blocked = [];

          const protoMap = {
            443: '🔒 VLESS WS TLS (443)',
            8443: '🚀 Reality XHTTP',
            8448: '🔐 SS2022',
            8449: '🌐 VLESS WS',
            25000: '⚡ Hysteria2',
          };

          for (const [port, info] of Object.entries(ports)) {
            const name = protoMap[port] || `Порт ${port}`;
            if (info.open) working.push(name);
            else blocked.push(name);
          }

          if (working.length > 0) {
            msg += `<b>✅ Работающие протоколы:</b>\n`;
            working.forEach(p => { msg += `  ${p}\n`; });
            msg += `\n`;

            // Рекомендация
            if (working.some(p => p.includes('443'))) {
              msg += `💡 <b>Рекомендация:</b> используйте "🔒 WS 443" — самый стойкий к блокировкам\n`;
            } else if (working.some(p => p.includes('Hysteria'))) {
              msg += `💡 <b>Рекомендация:</b> используйте "⚡ Hysteria2" — QUIC сложнее заблокировать\n`;
            } else {
              msg += `💡 <b>Рекомендация:</b> используйте любой работающий протокол из меню "Моя ссылка"\n`;
            }
          }

          if (blocked.length > 0 && working.length > 0) {
            msg += `\n<b>❌ Заблокировано:</b>\n`;
            blocked.forEach(p => { msg += `  ${p}\n`; });
          }

          if (working.length === 0) {
            msg += `<b>❌ Серверы YaroVPN не доступны из вашей сети.</b>\n\n`;
            msg += `Попробуйте:\n`;
            msg += `1️⃣ Смените сеть (мобильный / другая WiFi)\n`;
            msg += `2️⃣ Попробуйте другой протокол из меню "Моя ссылка"\n`;
            msg += `3️⃣ Напишите в поддержку\n`;
          }

          const tspuClientKeyboard = {
            inline_keyboard: [
              [{ text: '🔄 Проверить снова', callback_data: 'menu_tspu_client' }],
              [{ text: '📋 Мои протоколы', callback_data: 'menu_my_link' }],
              [{ text: '◀️ Назад в меню', callback_data: 'back_to_menu' }]
            ]
          };

          await bot.sendMessage(chatId, msg, {
            parse_mode: "HTML",
            reply_markup: tspuClientKeyboard
          });
        } catch (error) {
          console.error('[TSPU] Ошибка диагностики для клиента:', error);
          await bot.sendMessage(chatId,
            `❌ Не удалось проверить подключение.\n\nПопробуйте позже или обратитесь в поддержку.`,
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🔄 Попробовать снова', callback_data: 'menu_tspu_client' }],
                  [{ text: '◀️ Назад в меню', callback_data: 'back_to_menu' }]
                ]
              }
            }
          );
        }
        break;
      }

      case 'menu_zapret':
        // Показываем информацию о Zapret
        const zapretKeyboard = {
          inline_keyboard: [
            [{ text: "📖 Открыть GitHub", url: "https://github.com/Flowseal/zapret-discord-youtube" }],
            [{ text: "◀️ Назад в меню", callback_data: "back_to_menu" }]
          ]
        };
        
        await bot.sendMessage(
          chatId,
          `🛡️ <b>Zapret - Обход DPI блокировок</b>\n\n` +
            `<b>Что это?</b>\n` +
            `Инструмент для обхода Deep Packet Inspection (DPI) - технологии, которую провайдеры используют для блокировки и замедления сайтов и сервисов.\n\n` +
            `<b>✅ Что разблокирует:</b>\n` +
            `• Discord, YouTube, Instagram\n` +
            `• Онлайн игры (Apex Legends, Titanfall 2, WWZ и др.)\n` +
            `• Telegram, Facebook\n` +
            `• Другие заблокированные сервисы\n\n` +
            `<b>💻 Поддержка:</b>\n` +
            `• ✅ Windows (основная платформа)\n` +
            `• ✅ Linux (через оригинальный zapret)\n` +
            `• ❌ Мобильные устройства\n\n` +
            `<b>🎯 Для кого:</b>\n` +
            `Для пользователей Windows, которые сталкиваются с блокировками или замедлением Discord, YouTube, игр и других сервисов.\n\n` +
            `<b>⚙️ Как работает:</b>\n` +
            `Zapret модифицирует сетевые пакеты на уровне ядра Windows (через WinDivert), изменяя характеристики трафика так, чтобы DPI-системы провайдера не могли точно идентифицировать и заблокировать его.\n\n` +
            `<b>📥 Установка:</b>\n` +
            `1. Перейди на GitHub (кнопка ниже)\n` +
            `2. Скачай последнюю версию из Releases\n` +
            `3. Следуй инструкциям в README\n` +
            `4. Запусти программу с правами администратора\n\n` +
            `<b>⚠️ Важно:</b>\n` +
            `• Требуются права администратора\n` +
            `• Работает на уровне системы\n` +
            `• Не является VPN, а дополняет его\n` +
            `• Может работать параллельно с нашим VPN\n\n` +
            `<i>💡 Zapret - это не замена VPN, а дополнительный инструмент для обхода DPI-блокировок конкретных сервисов.</i>`,
          { 
            parse_mode: "HTML",
            reply_markup: zapretKeyboard
          }
        );
        break;

      // ========================================================================
      // ОБРАБОТЧИК ВЕБ-ПОРТАЛА
      // ========================================================================

      case 'menu_portal':
        try {
          const portalClient = await getClientByTelegramId(userId);
          
          if (!portalClient) {
            await bot.sendMessage(chatId, "❌ Ты не зарегистрирован в системе");
            return;
          }
          
          // Генерируем токен для входа в панель
          const token = jwt.sign(
            { client_uuid: portalClient.uuid, admin: isAdmin(userId), telegram_id: userId },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
          );
          
          const portalUrl = `https://panel.1xbetlineboom.xyz/?token=${token}`;
          
          const portalKeyboard = {
            inline_keyboard: [
              [{ text: '🔗 Открыть кабинет', url: portalUrl }],
              [{ text: '📱 Открыть Mini App', web_app: { url: 'https://panel.1xbetlineboom.xyz' } }],
              [{ text: '◀️ Назад в меню', callback_data: 'back_to_menu' }]
            ]
          };
          
          await bot.sendMessage(chatId,
            `📱 <b>Личный кабинет</b>\n\n` +
            `Выберите способ входа:`,
            {
              parse_mode: "HTML",
              reply_markup: portalKeyboard
            }
          );
        } catch (error) {
          console.error("Ошибка открытия портала:", error);
          await bot.sendMessage(chatId, "❌ Ошибка генерации ссылки", {
            reply_markup: {
              inline_keyboard: [[{ text: "◀️ Назад в меню", callback_data: "back_to_menu" }]]
            }
          });
        }
        break;

      // ========================================================================
      // ОБРАБОТЧИК СПРАВКИ
      // ========================================================================

      case 'menu_help':
        // Показываем справку
        const helpKeyboard = {
          inline_keyboard: [
            [{ text: "🔒 Безопасность и шифрование", callback_data: "security_info" }],
            [{ text: "◀️ Назад в меню", callback_data: "back_to_menu" }]
          ]
        };
        
        if (isAdmin(userId)) {
          await bot.sendMessage(
            chatId,
            `📚 <b>Справка для администратора</b>\n\n` +
              `<b>Команды:</b>\n` +
              `/start - Главное меню\n` +
              `/menu - Открыть меню\n` +
              `/add_client - Добавить клиента\n` +
              `/remove_client - Удалить клиента\n` +
              `/list_clients - Список всех клиентов\n` +
              `/client_info &lt;uuid&gt; - Информация о клиенте\n` +
              `/server_status - Статус сервера\n` +
              `/help - Эта справка\n\n` +
              `<b>Меню:</b>\n` +
              `👶 Малютки - Управление клиентами\n` +
              `📊 Статистика - Статистика сервера\n` +
              `📝 Запросы - Запросы на продление\n` +
              `⚙️ Сервер - Статус сервера\n` +
              `🔧 Xray - Управление Xray сервисом\n` +
              `📊 Мой VPN - Моя статистика VPN`,
            { 
              parse_mode: "HTML",
              reply_markup: helpKeyboard
            }
          );
        } else {
          await bot.sendMessage(
            chatId,
            `📚 <b>Справка для клиента</b>\n\n` +
              `<b>Команды:</b>\n` +
              `/start - Личный кабинет\n` +
              `/menu - Открыть меню\n` +
              `/my_vpn - Моя статистика VPN\n` +
              `/my_link - Ссылка подключения\n` +
              `/my_requests - Мои запросы\n` +
              `/download - Скачать VPN клиент\n` +
              `/terms - Правила использования\n` +
              `/help - Эта справка\n\n` +
              `<b>Меню:</b>\n` +
              `📊 Мой VPN - Статистика использования\n` +
              `🔗 Моя ссылка - Ссылка и QR код\n` +
              `🔑 Запросить ключ - Продлить подписку\n` +
              `📝 Мои запросы - История запросов\n` +
              `📥 Скачать VPN - Инструкция по установке`,
            { 
              parse_mode: "HTML",
              reply_markup: helpKeyboard
            }
          );
        }
        break;

      // ========================================================================
      // ОБРАБОТЧИКИ КНОПОК ЗАПРОСОВ АДМИНА
      // ========================================================================

      case 'admin_pending_requests':
        // Показываем ожидающие запросы (только для админа)
        if (!isAdmin(userId)) {
          await bot.sendMessage(chatId, "❌ Доступ запрещен");
          return;
        }
        
        try {
          const pendingResponse = await apiClient.getExtensionRequests();
          const allRequests = pendingResponse.requests || [];
          const pendingRequests = allRequests.filter(r => r.status === "pending");
          
          if (pendingRequests.length === 0) {
            await bot.sendMessage(chatId, "📭 Нет ожидающих запросов", {
              reply_markup: {
                inline_keyboard: [[{ text: "◀️ Назад", callback_data: "menu_requests" }]]
              }
            });
            return;
          }
          
          // Отправляем каждый запрос отдельным сообщением с кнопками
          for (const req of pendingRequests) {
            const clientName = req.client_name || `UUID: ${req.client_uuid?.substring(0, 8)}...` || "Неизвестный";
            const months = req.requested_months;
            
            let message = `🔔 <b>Запрос на продление</b>\n\n`;
            message += `👤 Клиент: <b>${clientName}</b>\n`;
            message += `🆔 UUID: <code>${req.client_uuid}</code>\n`;
            message += `📅 Запрошено: ${months} ${months === 1 ? 'месяц' : months < 5 ? 'месяца' : 'месяцев'} (${req.requested_days} дней)\n`;
            message += `📆 Дата запроса: ${formatDate(req.created_at)}\n`;
            message += `🆔 ID запроса: <code>${req.id}</code>\n\n`;
            message += `Выбери действие:`;
            
            const keyboard = {
              inline_keyboard: [
                [
                  { text: `✅ Одобрить ${months} мес.`, callback_data: `approve_${req.id}_${months}` }
                ],
                [
                  { text: "✏️ Изменить период", callback_data: `period_custom_${req.id}` }
                ],
                [
                  { text: "❌ Отклонить", callback_data: `deny_${req.id}` }
                ]
              ]
            };
            
            await bot.sendMessage(chatId, message, {
              parse_mode: "HTML",
              reply_markup: keyboard
            });
          }
          
          // Отправляем кнопку "Назад" отдельным сообщением
          await bot.sendMessage(chatId, `⏳ <b>Всего ожидающих запросов: ${pendingRequests.length}</b>`, {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [[{ text: "◀️ Назад в меню", callback_data: "menu_requests" }]]
            }
          });
        } catch (error) {
          console.error("Ошибка получения ожидающих запросов:", error);
          await bot.sendMessage(chatId, "❌ Ошибка подключения к API серверу.", {
            reply_markup: {
              inline_keyboard: [[{ text: "◀️ Назад", callback_data: "menu_requests" }]]
            }
          });
        }
        break;

      case 'admin_approved_requests':
        // Показываем одобренные запросы (только для админа)
        if (!isAdmin(userId)) {
          await bot.sendMessage(chatId, "❌ Доступ запрещен");
          return;
        }
        
        try {
          const approvedResponse = await apiClient.getExtensionRequests();
          const allRequests = approvedResponse.requests || [];
          const approvedRequests = allRequests.filter(r => r.status === "approved");
          
          if (approvedRequests.length === 0) {
            await bot.sendMessage(chatId, "📭 Нет одобренных запросов", {
              reply_markup: {
                inline_keyboard: [[{ text: "◀️ Назад", callback_data: "menu_requests" }]]
              }
            });
            return;
          }
          
          let message = `✅ <b>Одобренные запросы (${approvedRequests.length}):</b>\n\n`;
          
          approvedRequests.slice(0, 10).forEach((req, i) => {
            const clientName = req.client_name || `UUID: ${req.client_uuid?.substring(0, 8)}...` || "Неизвестный";
            message += `${i + 1}. <b>${clientName}</b>\n`;
            message += `   Запрошено: ${req.requested_months} мес.\n`;
            message += `   Одобрено: ${req.approved_days} дней\n`;
            message += `   Дата: ${formatDate(req.created_at)}\n\n`;
          });
          
          if (approvedRequests.length > 10) {
            message += `... и еще ${approvedRequests.length - 10} запросов\n`;
          }
          
          await bot.sendMessage(chatId, message, {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [[{ text: "◀️ Назад", callback_data: "menu_requests" }]]
            }
          });
        } catch (error) {
          console.error("Ошибка получения одобренных запросов:", error);
          await bot.sendMessage(chatId, "❌ Ошибка подключения к API серверу.", {
            reply_markup: {
              inline_keyboard: [[{ text: "◀️ Назад", callback_data: "menu_requests" }]]
            }
          });
        }
        break;

      case 'admin_denied_requests':
        // Показываем отклоненные запросы (только для админа)
        if (!isAdmin(userId)) {
          await bot.sendMessage(chatId, "❌ Доступ запрещен");
          return;
        }
        
        try {
          const deniedResponse = await apiClient.getExtensionRequests();
          const allRequests = deniedResponse.requests || [];
          const deniedRequests = allRequests.filter(r => r.status === "denied");
          
          if (deniedRequests.length === 0) {
            await bot.sendMessage(chatId, "📭 Нет отклоненных запросов", {
              reply_markup: {
                inline_keyboard: [[{ text: "◀️ Назад", callback_data: "menu_requests" }]]
              }
            });
            return;
          }
          
          let message = `❌ <b>Отклоненные запросы (${deniedRequests.length}):</b>\n\n`;
          
          deniedRequests.slice(0, 10).forEach((req, i) => {
            const clientName = req.client_name || `UUID: ${req.client_uuid?.substring(0, 8)}...` || "Неизвестный";
            message += `${i + 1}. <b>${clientName}</b>\n`;
            message += `   Запрошено: ${req.requested_months} мес.\n`;
            if (req.denial_reason) {
              message += `   Причина: ${req.denial_reason}\n`;
            }
            message += `   Дата: ${formatDate(req.created_at)}\n\n`;
          });
          
          if (deniedRequests.length > 10) {
            message += `... и еще ${deniedRequests.length - 10} запросов\n`;
          }
          
          await bot.sendMessage(chatId, message, {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [[{ text: "◀️ Назад", callback_data: "menu_requests" }]]
            }
          });
        } catch (error) {
          console.error("Ошибка получения отклоненных запросов:", error);
          await bot.sendMessage(chatId, "❌ Ошибка подключения к API серверу.", {
            reply_markup: {
              inline_keyboard: [[{ text: "◀️ Назад", callback_data: "menu_requests" }]]
            }
          });
        }
        break;

      // ========================================================================
      // ОБРАБОТЧИК ОБЪЯВЛЕНИЙ (РАССЫЛКА ВСЕМ ПОЛЬЗОВАТЕЛЯМ)
      // ========================================================================

      case 'menu_announcement':
        // Рассылка объявления всем пользователям (только для админа)
        if (!isAdmin(userId)) {
          await bot.sendMessage(chatId, "❌ Доступ запрещен");
          return;
        }
        
        await bot.sendMessage(
          chatId,
          `📢 <b>Рассылка объявления</b>\n\n` +
            `Напишите текст объявления, которое будет отправлено всем пользователям бота.\n\n` +
            `<i>Поддерживается HTML форматирование:</i>\n` +
            `<code>&lt;b&gt;жирный&lt;/b&gt;</code>\n` +
            `<code>&lt;i&gt;курсив&lt;/i&gt;</code>\n` +
            `<code>&lt;code&gt;код&lt;/code&gt;</code>\n\n` +
            `Отправьте текст объявления следующим сообщением.`,
          { 
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [[{ text: "◀️ Отмена", callback_data: "back_to_menu" }]]
            }
          }
        );
        
        // Устанавливаем флаг ожидания объявления
        // Сохраняем в глобальной переменной или базе данных
        if (!global.awaitingAnnouncement) {
          global.awaitingAnnouncement = {};
        }
        global.awaitingAnnouncement[userId] = true;
        break;

      // ========================================================================
      // УДАЛЕНИЕ АККАУНТА КЛИЕНТОМ
      // ========================================================================

      case 'menu_delete_account':
        // Клиент запрашивает удаление своего аккаунта
        try {
          const client = await getClientByTelegramId(userId);
          if (!client) {
            await bot.sendMessage(chatId, "❌ Ты не зарегистрирован в системе");
            return;
          }

          await bot.sendMessage(chatId,
            `🗑️ <b>Удаление аккаунта</b>\n\n` +
            `Ты уверен, что хочешь удалить свой аккаунт?\n\n` +
            `⚠️ <b>Это действие необратимо:</b>\n` +
            `• Твой VPN ключ будет удалён\n` +
            `• Все данные о тебе будут удалены\n` +
            `• Доступ к VPN прекратится немедленно`,
            {
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [
                  [{ text: "✅ Да, удалить аккаунт", callback_data: `confirm_delete_self_${client.uuid}` }],
                  [{ text: "❌ Отмена", callback_data: "back_to_menu" }]
                ]
              }
            }
          );
        } catch (error) {
          console.error("Ошибка запроса удаления аккаунта:", error);
          await bot.sendMessage(chatId, "❌ Произошла ошибка. Попробуйте позже.");
        }
        break;

      // ========================================================================
      // ПРЯМАЯ ВЫДАЧА ДНЕЙ АДМИНОМ
      // ========================================================================

      case 'admin_extend_client':
        // Админ выбирает клиента для продления подписки напрямую
        if (!isAdmin(userId)) {
          await bot.sendMessage(chatId, "❌ Доступ запрещен");
          return;
        }

        try {
          const response = await apiClient.getClients();
          const clients = response.clients || [];

          if (clients.length === 0) {
            await bot.sendMessage(chatId, "📭 Клиенты не найдены", {
              reply_markup: { inline_keyboard: [[{ text: "◀️ Назад", callback_data: "menu_clients" }]] }
            });
            return;
          }

          const keyboard = {
            inline_keyboard: [
              ...clients.map(c => [{
                text: `${c.status === 'active' ? '✅' : '❌'} ${c.name}`,
                callback_data: `extend_select_${c.uuid}`
              }]),
              [{ text: "◀️ Назад", callback_data: "menu_clients" }]
            ]
          };

          await bot.sendMessage(chatId, `📅 <b>Выдать дни подписки</b>\n\nВыбери клиента:`, {
            parse_mode: "HTML",
            reply_markup: keyboard
          });
        } catch (error) {
          console.error("Ошибка получения клиентов для продления:", error);
          await bot.sendMessage(chatId, "❌ Ошибка подключения к API серверу.");
        }
        break;

      // ========================================================================
      // ВОЗВРАТ В ГЛАВНОЕ МЕНЮ
      // ========================================================================

      case 'back_to_menu':
        // Возврат в главное меню
        await handleMenuCommand(bot, { chat: { id: chatId }, from: { id: userId } }, isAdmin, apiClient);
        break;

      default:
        // Динамические callback'и
        if (data.startsWith('tspu_check_')) {
          const targetIp = data.replace('tspu_check_', '');

          if (!isAdmin(userId)) {
            await bot.sendMessage(chatId, "❌ Доступ запрещен");
            return;
          }

          await bot.sendMessage(chatId, `⏳ Проверяю сервер ${targetIp}...`);

          try {
            const result = await apiClient.checkTSPU(targetIp);

            let msg = `📊 <b>Диагностика — ${result.ip}</b>\n`;
            msg += `🕐 ${new Date(result.timestamp).toLocaleString('ru-RU')}\n\n`;

            // Пинг
            if (result.ping?.reachable) {
              msg += `🔌 Пинг: ${result.ping.latency_ms}ms ✅ | Потери: ${result.ping.packet_loss}\n\n`;
            } else {
              msg += `🔌 Пинг: Недоступен ❌\n\n`;
            }

            // Порты
            msg += `<b>📡 TCP порты:</b>\n`;
            const ports = result.ports || {};
            for (const [port, info] of Object.entries(ports)) {
              const status = info.open ? `✅ ${info.time_ms}ms` : '❌';
              msg += `  ${port} (${info.name}) ${status}\n`;
            }
            msg += `\n`;

            // SNI
            msg += `<b>🎭 SNI фильтрация:</b>\n`;
            const sni = result.sni || {};
            for (const [domain, info] of Object.entries(sni)) {
              const status = info.pass ? `✅ ${info.cert || 'OK'}` : `❌ ${info.error || 'Заблокирован'}`;
              msg += `  ${domain} ${status}\n`;
            }
            msg += `\n`;

            // DNS
            const dns = result.dns || {};
            msg += `<b>🌐 DNS:</b>\n`;
            if (dns.system) {
              msg += `  Системный → ${dns.system.ip || 'нет ответа'} ${dns.system.ok ? '✅' : '❌'}\n`;
            }
            if (dns.doh_1111) {
              msg += `  DoH 1.1.1.1 → ${dns.doh_1111.ip || 'нет ответа'} ${dns.doh_1111.ok ? '✅' : '❌'}\n`;
            }
            msg += `  Spoofing: ${dns.spoofing ? '⚠️ ДА' : 'НЕТ'}\n\n`;

            // ТСПУ режим
            const modeMap = {
              'none': '✅ Блокировок нет',
              'allowlist': '⚠️ Режим белого списка',
              'blocklist': '⚠️ Режим чёрного списка',
              'unknown': '❓ Не определён',
            };
            msg += `<b>📡 Режим ТСПУ:</b> ${modeMap[result.tspu_mode] || '❓ Не определён'}\n`;

            const tspuResultKeyboard = {
              inline_keyboard: [
                [{ text: '🔄 Обновить', callback_data: `tspu_check_${targetIp}` }],
                [
                  { text: '🟢 prod', callback_data: 'tspu_check_89.124.70.156' },
                  { text: '🟡 rus', callback_data: 'tspu_check_185.244.172.188' }
                ],
                [{ text: '◀️ Назад в меню', callback_data: 'back_to_menu' }]
              ]
            };

            await bot.sendMessage(chatId, msg, {
              parse_mode: "HTML",
              reply_markup: tspuResultKeyboard
            });
          } catch (error) {
            console.error('[TSPU] Ошибка диагностики:', error);
            await bot.sendMessage(chatId, `❌ Ошибка диагностики сервера ${targetIp}. Попробуйте позже.`, {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🔄 Попробовать снова', callback_data: `tspu_check_${targetIp}` }],
                  [{ text: '◀️ Назад в меню', callback_data: 'back_to_menu' }]
                ]
              }
            });
          }
          return;
        }

        // Конец динамических callback'ей
        console.log(`[MENU_CALLBACK] Неизвестный callback: ${data}`);
        break;
    }
  } catch (error) {
    console.error("Ошибка обработки menu callback:", error);
    await bot.sendMessage(chatId, "❌ Произошла ошибка. Попробуйте позже.");
  }
}
