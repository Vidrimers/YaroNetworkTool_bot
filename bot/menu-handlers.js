/**
 * Обработчики для команды /menu и инлайн-кнопок меню
 * Заменяет старые keyboard кнопки на инлайн-кнопки
 */

import { getActiveDevices } from "./device-monitor.js";
import QRCode from "qrcode";

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
          { text: '📊 Мой VPN', callback_data: 'menu_my_vpn' }
        ],
        [
          { text: '🔗 Моя ссылка', callback_data: 'menu_my_link' },
          { text: '❓ Помощь', callback_data: 'menu_help' }
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
          { text: '❓ Помощь', callback_data: 'menu_help' }
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
        // Показываем ссылки для скачивания VPN клиента
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
            `2. Получи ссылку подписки через кнопку "🔗 Моя ссылка"\n` +
            `3. В приложении добавь подписку (Subscription)\n` +
            `4. Вставь ссылку и обнови\n` +
            `5. Подключись\n\n` +
            `💡 <b>Подписка содержит 8 протоколов с автоматическим переключением</b>`,
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
          
          let message = `⏳ <b>Ожидающие запросы (${pendingRequests.length}):</b>\n\n`;
          
          pendingRequests.forEach((req, i) => {
            message += `${i + 1}. <b>${req.client_name}</b>\n`;
            message += `   Запрошено: ${req.requested_months} мес. (${req.requested_days} дней)\n`;
            message += `   Дата: ${formatDate(req.created_at)}\n`;
            message += `   ID: <code>${req.id}</code>\n\n`;
          });
          
          await bot.sendMessage(chatId, message, {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [[{ text: "◀️ Назад", callback_data: "menu_requests" }]]
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
            message += `${i + 1}. <b>${req.client_name}</b>\n`;
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
            message += `${i + 1}. <b>${req.client_name}</b>\n`;
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
      // ВОЗВРАТ В ГЛАВНОЕ МЕНЮ
      // ========================================================================

      case 'back_to_menu':
        // Возврат в главное меню
        await handleMenuCommand(bot, { chat: { id: chatId }, from: { id: userId } }, isAdmin, apiClient);
        break;

      default:
        console.log(`[MENU_CALLBACK] Неизвестный callback: ${data}`);
        break;
    }
  } catch (error) {
    console.error("Ошибка обработки menu callback:", error);
    await bot.sendMessage(chatId, "❌ Произошла ошибка. Попробуйте позже.");
  }
}
