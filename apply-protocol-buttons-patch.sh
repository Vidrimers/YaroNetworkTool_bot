#!/bin/bash
# Скрипт для применения патча с кнопками протоколов

echo "🔧 Применение патча для кнопок протоколов..."

# Путь к файлу бота
BOT_FILE="bot/yaronetworktool_bot.js"

# Создаем резервную копию
echo "📦 Создание резервной копии..."
cp "$BOT_FILE" "$BOT_FILE.backup.$(date +%Y%m%d_%H%M%S)"

# Находим строки начала и конца блока
START_LINE=$(grep -n "// Полная информация о подписке" "$BOT_FILE" | head -1 | cut -d: -f1)
END_LINE=$(grep -n "// Изменить лимит устройств" "$BOT_FILE" | head -1 | cut -d: -f1)

if [ -z "$START_LINE" ] || [ -z "$END_LINE" ]; then
    echo "❌ Ошибка: не удалось найти блок для замены"
    exit 1
fi

echo "📍 Найден блок: строки $START_LINE-$END_LINE"

# Создаем временный файл с новым кодом
cat > /tmp/new_handler.js << 'EOF'
    // Полная информация о подписке (запуск скрипта get-client-key.js)
    if (data.startsWith("full_sub_info_")) {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      const uuid = data.replace("full_sub_info_", "");
      
      try {
        bot.answerCallbackQuery(query.id, {
          text: "⏳ Генерирую информацию...",
        });

        // Запускаем скрипт get-client-key.js из основного репозитория VPN
        const scriptPath = '/home/xray-vpn/scripts/get-client-key.js';
        const { stdout, stderr } = await execAsync(`node "${scriptPath}" ${uuid}`);
        
        if (stderr) {
          console.error('Ошибка выполнения скрипта:', stderr);
        }
        
        // Парсим вывод скрипта
        const lines = stdout.split('\n');
        
        // Находим Base64 подписку и ссылки
        let base64Subscription = '';
        let captureBase64 = false;
        let allLinks = [];
        let captureLinks = false;
        let currentLinkName = '';
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          // Начало Base64 блока
          if (line.includes('📋 Base64 подписка')) {
            captureBase64 = true;
            continue;
          }
          
          // Конец Base64 блока
          if (captureBase64 && line.includes('─'.repeat(10))) {
            if (base64Subscription) {
              captureBase64 = false;
            }
            continue;
          }
          
          // Захват Base64
          if (captureBase64 && line.trim() && !line.includes('─')) {
            base64Subscription = line.trim();
          }
          
          // Начало блока ссылок
          if (line.includes('🔗 Отдельные ссылки:')) {
            captureLinks = true;
            continue;
          }
          
          // Конец блока ссылок
          if (captureLinks && line.includes('🌐 URL подписки')) {
            captureLinks = false;
            continue;
          }
          
          // Захват названия ссылки (строка с номером)
          if (captureLinks && /^\d+\.\s/.test(line)) {
            currentLinkName = line.replace(/^\d+\.\s/, '').trim();
            continue;
          }
          
          // Захват ссылки
          if (captureLinks && line.startsWith('vless://') && currentLinkName) {
            allLinks.push({
              name: currentLinkName,
              link: line.trim()
            });
            currentLinkName = '';
          }
          
          // Захват SS ссылки
          if (captureLinks && line.startsWith('ss://') && currentLinkName) {
            allLinks.push({
              name: currentLinkName,
              link: line.trim()
            });
            currentLinkName = '';
          }
        }
        
        // Получаем информацию о клиенте
        const response = await apiClient.getClient(uuid);
        const client = response.client;
        
        // 1. Информация о клиенте
        let infoMessage = `╔════════════════════════════════════════╗\n`;
        infoMessage += `║     ПОЛНАЯ ИНФОРМАЦИЯ О ПОДПИСКЕ       ║\n`;
        infoMessage += `╚════════════════════════════════════════╝\n\n`;
        infoMessage += `👤 <b>Имя:</b> ${client.name}\n`;
        infoMessage += `🔑 <b>UUID:</b> <code>${client.uuid}</code>\n`;
        if (client.telegram_id) {
          infoMessage += `💬 <b>Telegram ID:</b> ${client.telegram_id}\n`;
        }
        infoMessage += `📊 <b>Статус:</b> ${getStatusEmoji(client.status)} ${client.status}\n`;
        infoMessage += `📅 <b>Подписка до:</b> ${new Date(client.subscription_end).toLocaleString('ru-RU')}\n`;
        infoMessage += `📈 <b>Трафик:</b> ${client.traffic_used_gb.toFixed(2)} / ${client.traffic_limit_gb} GB\n`;
        
        await bot.sendMessage(chatId, infoMessage, { parse_mode: "HTML" });
        
        // 2. Base64 подписка
        if (base64Subscription) {
          let base64Message = `📋 <b>Base64 подписка (все протоколы)</b>\n\n`;
          base64Message += `<code>${base64Subscription}</code>\n\n`;
          base64Message += `<i>Скопируй и импортируй в VPN-клиент для автоматической настройки всех протоколов</i>`;
          
          await bot.sendMessage(chatId, base64Message, { parse_mode: "HTML" });
        }
        
        // 3. URL подписки
        const subscriptionUrl = `https://${SERVER_IP}/subscription/${uuid}`;
        let urlMessage = `🌐 <b>URL подписки (автообновление)</b>\n\n`;
        urlMessage += `<code>${subscriptionUrl}</code>\n\n`;
        urlMessage += `<i>Используй для автоматического обновления конфигурации в клиенте</i>`;
        
        await bot.sendMessage(chatId, urlMessage, { parse_mode: "HTML" });
        
        // 4. Кнопки с протоколами
        if (allLinks.length > 0) {
          // Сохраняем ссылки в глобальный объект для доступа из callback
          if (!global.clientLinks) {
            global.clientLinks = {};
          }
          global.clientLinks[uuid] = allLinks;
          
          // Создаем кнопки (по 2 в ряд)
          const keyboard = {
            inline_keyboard: []
          };
          
          // Группируем кнопки
          for (let i = 0; i < allLinks.length; i += 2) {
            const row = [];
            
            // Первая кнопка в ряду
            const link1 = allLinks[i];
            const buttonText1 = getProtocolButtonText(link1.name);
            row.push({ 
              text: buttonText1, 
              callback_data: `show_protocol_link_${uuid}_${i}` 
            });
            
            // Вторая кнопка в ряду (если есть)
            if (i + 1 < allLinks.length) {
              const link2 = allLinks[i + 1];
              const buttonText2 = getProtocolButtonText(link2.name);
              row.push({ 
                text: buttonText2, 
                callback_data: `show_protocol_link_${uuid}_${i + 1}` 
              });
            }
            
            keyboard.inline_keyboard.push(row);
          }
          
          let protocolMessage = `🔗 <b>Отдельные протоколы подключения</b>\n\n`;
          protocolMessage += `Выбери протокол, чтобы получить ссылку для подключения:`;
          
          await bot.sendMessage(chatId, protocolMessage, { 
            parse_mode: "HTML",
            reply_markup: keyboard
          });
        }
        
      } catch (error) {
        console.error("Ошибка получения полной информации:", error);
        bot.sendMessage(chatId, `❌ <b>Ошибка:</b> ${error.message}`, { parse_mode: "HTML" });
      }
      return;
    }

    // Показать конкретную ссылку протокола
    if (data.startsWith("show_protocol_link_")) {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, {
          text: "❌ Доступ запрещен",
          show_alert: true,
        });
        return;
      }

      try {
        const parts = data.replace("show_protocol_link_", "").split("_");
        const uuid = parts.slice(0, -1).join("_"); // UUID может содержать _
        const linkIndex = parseInt(parts[parts.length - 1]);
        
        // Получаем сохраненные ссылки
        if (!global.clientLinks || !global.clientLinks[uuid]) {
          bot.answerCallbackQuery(query.id, {
            text: "❌ Ссылки не найдены. Попробуй снова получить полную информацию.",
            show_alert: true,
          });
          return;
        }
        
        const links = global.clientLinks[uuid];
        const linkData = links[linkIndex];
        
        if (!linkData) {
          bot.answerCallbackQuery(query.id, {
            text: "❌ Ссылка не найдена",
            show_alert: true,
          });
          return;
        }
        
        // Генерируем QR код для ссылки
        const qrCodeBuffer = await QRCode.toBuffer(linkData.link);
        
        // Отправляем ссылку
        let linkMessage = `🔗 <b>${linkData.name}</b>\n\n`;
        linkMessage += `<code>${linkData.link}</code>\n\n`;
        linkMessage += `<i>Скопируй ссылку или отсканируй QR код</i>`;
        
        await bot.sendMessage(chatId, linkMessage, { parse_mode: "HTML" });
        await bot.sendPhoto(chatId, qrCodeBuffer, {
          caption: `📱 QR код для ${linkData.name}`
        });
        
        bot.answerCallbackQuery(query.id, {
          text: "✅ Ссылка отправлена"
        });
        
      } catch (error) {
        console.error("Ошибка показа ссылки протокола:", error);
        bot.answerCallbackQuery(query.id, {
          text: `❌ Ошибка: ${error.message}`,
          show_alert: true,
        });
      }
      return;
    }

EOF

# Применяем изменения
echo "✏️ Применение изменений..."
{
    head -n $((START_LINE - 1)) "$BOT_FILE"
    cat /tmp/new_handler.js
    tail -n +$END_LINE "$BOT_FILE"
} > "$BOT_FILE.new"

# Заменяем файл
mv "$BOT_FILE.new" "$BOT_FILE"

echo "✅ Патч успешно применен!"
echo "📦 Резервная копия сохранена: $BOT_FILE.backup.*"
echo ""
echo "🔄 Перезапусти бота:"
echo "  pm2 restart vpn-bot"

rm /tmp/new_handler.js
