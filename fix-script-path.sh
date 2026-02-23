#!/bin/bash
# Скрипт для исправления пути к get-client-key.js на сервере

BOT_FILE="/home/yaronetworktool-bot/bot/yaronetworktool_bot.js"

echo "🔧 Исправление пути к скрипту get-client-key.js..."

# Создаем резервную копию
echo "📦 Создание резервной копии..."
cp "$BOT_FILE" "$BOT_FILE.backup.$(date +%Y%m%d_%H%M%S)"

# Ищем и заменяем старый путь на новый
echo "✏️ Замена пути..."

# Вариант 1: path.join(__dirname, '../../scripts/get-client-key.js')
sed -i "s|path\.join(__dirname, '\.\./\.\./scripts/get-client-key\.js')|'/home/xray-vpn/scripts/get-client-key.js'|g" "$BOT_FILE"

# Вариант 2: если используется другой формат
sed -i 's|const scriptPath = path\.join(__dirname, .*get-client-key\.js.*);|const scriptPath = '\''/home/xray-vpn/scripts/get-client-key.js'\'';|g' "$BOT_FILE"

# Проверяем результат
echo ""
echo "🔍 Проверка изменений:"
grep -n "get-client-key.js" "$BOT_FILE" | grep -v "Запускаем скрипт"

echo ""
echo "✅ Готово! Перезапусти бота:"
echo "  pm2 restart vpn-bot"
