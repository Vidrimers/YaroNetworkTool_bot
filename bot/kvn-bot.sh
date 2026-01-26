#!/bin/bash

###############################################################################
# kvn-bot.sh - Скрипт обновления Telegram бота через Git
# Использование: ./bot/kvn-bot.sh
###############################################################################

set -e  # Остановить при ошибке

echo "[DEPLOY] Переход в директорию бота..."
cd "$HOME/yaronetworktool" || exit 1

echo "[DEPLOY] Обновляем код из Git..."
git pull origin main || git pull origin master || exit 1

echo "[DEPLOY] Проверяем зависимости..."
# Раскомментируйте если нужно обновлять зависимости
# npm install --production

echo "[DEPLOY] Перезапускаем бота через PM2..."
pm2 restart vpn-bot || exit 1

echo "[DEPLOY] ✓ Обновление завершено успешно!"
echo "[DEPLOY] Проверить статус: pm2 status"
echo "[DEPLOY] Просмотреть логи: pm2 logs vpn-bot"

exit 0
