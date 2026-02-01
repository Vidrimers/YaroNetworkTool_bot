#!/bin/bash
# Скрипт для настройки cron задачи сбора статистики трафика

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CRON_SCRIPT="$SCRIPT_DIR/collect-traffic-stats.js"

echo "Настройка cron задачи для сбора статистики трафика..."
echo "Директория проекта: $PROJECT_DIR"
echo "Скрипт: $CRON_SCRIPT"

# Делаем скрипт исполняемым
chmod +x "$CRON_SCRIPT"

# Создаем временный файл для crontab
TEMP_CRON=$(mktemp)

# Сохраняем текущий crontab
crontab -l > "$TEMP_CRON" 2>/dev/null || true

# Удаляем старые записи для этого скрипта (если есть)
sed -i '/collect-traffic-stats\.js/d' "$TEMP_CRON"

# Добавляем новую задачу (каждый час)
echo "# Сбор статистики трафика VPN (каждый час)" >> "$TEMP_CRON"
echo "0 * * * * cd $PROJECT_DIR && /usr/bin/node $CRON_SCRIPT >> /var/log/vpn-traffic-stats.log 2>&1" >> "$TEMP_CRON"

# Устанавливаем новый crontab
crontab "$TEMP_CRON"

# Удаляем временный файл
rm "$TEMP_CRON"

echo "✅ Cron задача настроена!"
echo ""
echo "Задача будет запускаться каждый час"
echo "Логи: /var/log/vpn-traffic-stats.log"
echo ""
echo "Для просмотра текущих задач: crontab -l"
echo "Для ручного запуска: cd $PROJECT_DIR && node $CRON_SCRIPT"
