#!/bin/bash
# Настройка cron для сборщика статистики X-Ray

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COLLECTOR_SCRIPT="$SCRIPT_DIR/xray-stats-collector.js"
LOG_FILE="$SCRIPT_DIR/xray-stats-collector.log"

# Проверяем, что скрипт существует
if [ ! -f "$COLLECTOR_SCRIPT" ]; then
    echo "❌ Ошибка: файл $COLLECTOR_SCRIPT не найден"
    exit 1
fi

# Делаем скрипт исполняемым
chmod +x "$COLLECTOR_SCRIPT"

# Добавляем задачу в cron (каждые 10 минут)
CRON_JOB="*/10 * * * * cd $SCRIPT_DIR && /usr/bin/node $COLLECTOR_SCRIPT >> $LOG_FILE 2>&1"

# Проверяем, есть ли уже такая задача
if crontab -l 2>/dev/null | grep -q "xray-stats-collector.js"; then
    echo "⚠️  Задача уже существует в cron"
    echo "Текущая задача:"
    crontab -l | grep "xray-stats-collector.js"
    echo ""
    read -p "Заменить? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Отменено"
        exit 0
    fi
    # Удаляем старую задачу
    crontab -l | grep -v "xray-stats-collector.js" | crontab -
fi

# Добавляем новую задачу
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo "✅ Задача добавлена в cron:"
echo "$CRON_JOB"
echo ""
echo "Логи будут записываться в: $LOG_FILE"
echo ""
echo "Для просмотра логов используй:"
echo "  tail -f $LOG_FILE"
echo ""
echo "Для проверки работы запусти вручную:"
echo "  cd $SCRIPT_DIR && node xray-stats-collector.js"
