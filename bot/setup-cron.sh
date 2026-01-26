#!/bin/bash

# Скрипт для настройки cron задачи проверки подписок
# Запускает subscription-checker.js каждый день в 10:00

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CHECKER_SCRIPT="$SCRIPT_DIR/subscription-checker.js"

echo "=== Настройка cron задачи для проверки подписок ==="
echo ""

# Проверяем что скрипт существует
if [ ! -f "$CHECKER_SCRIPT" ]; then
    echo "❌ Ошибка: файл $CHECKER_SCRIPT не найден"
    exit 1
fi

# Делаем скрипт исполняемым
chmod +x "$CHECKER_SCRIPT"
echo "✅ Скрипт сделан исполняемым"

# Получаем путь к node
NODE_PATH=$(which node)
if [ -z "$NODE_PATH" ]; then
    echo "❌ Ошибка: Node.js не найден"
    exit 1
fi
echo "✅ Node.js найден: $NODE_PATH"

# Создаем cron задачу
CRON_JOB="0 10 * * * cd $SCRIPT_DIR && $NODE_PATH $CHECKER_SCRIPT >> $SCRIPT_DIR/subscription-checker.log 2>&1"

# Проверяем существует ли уже такая задача
if crontab -l 2>/dev/null | grep -q "subscription-checker.js"; then
    echo "⚠️  Cron задача уже существует"
    echo ""
    echo "Текущие cron задачи:"
    crontab -l | grep "subscription-checker.js"
    echo ""
    read -p "Заменить существующую задачу? (y/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Отменено"
        exit 0
    fi
    
    # Удаляем старую задачу
    crontab -l | grep -v "subscription-checker.js" | crontab -
    echo "✅ Старая задача удалена"
fi

# Добавляем новую задачу
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
echo "✅ Cron задача добавлена"

echo ""
echo "=== Настройка завершена ==="
echo ""
echo "Cron задача:"
echo "$CRON_JOB"
echo ""
echo "Скрипт будет запускаться каждый день в 10:00"
echo "Логи сохраняются в: $SCRIPT_DIR/subscription-checker.log"
echo ""
echo "Для проверки работы запусти вручную:"
echo "  node $CHECKER_SCRIPT"
echo ""
echo "Для просмотра всех cron задач:"
echo "  crontab -l"
echo ""
echo "Для удаления задачи:"
echo "  crontab -e"
echo "  (удали строку с subscription-checker.js)"
echo ""
