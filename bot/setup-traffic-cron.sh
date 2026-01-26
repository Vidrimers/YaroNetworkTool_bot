#!/bin/bash

# Скрипт для настройки автоматической проверки трафика через cron
# Проверка будет запускаться 3 раза в день: в 10:00, 15:00 и 20:00

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRAFFIC_CHECKER="$SCRIPT_DIR/traffic-checker.js"

echo "🔧 Настройка автоматической проверки трафика..."
echo ""

# Проверяем, существует ли скрипт
if [ ! -f "$TRAFFIC_CHECKER" ]; then
    echo "❌ Ошибка: Файл traffic-checker.js не найден в $SCRIPT_DIR"
    exit 1
fi

# Делаем скрипт исполняемым
chmod +x "$TRAFFIC_CHECKER"
echo "✅ Скрипт traffic-checker.js сделан исполняемым"

# Проверяем, установлен ли node
if ! command -v node &> /dev/null; then
    echo "❌ Ошибка: Node.js не установлен"
    exit 1
fi

echo "✅ Node.js найден: $(node --version)"
echo ""

# Создаем cron задачу
CRON_JOB="0 10,15,20 * * * cd $SCRIPT_DIR && /usr/bin/node $TRAFFIC_CHECKER >> /var/log/traffic-checker.log 2>&1"

# Проверяем, существует ли уже такая задача
if crontab -l 2>/dev/null | grep -q "traffic-checker.js"; then
    echo "⚠️  Cron задача для проверки трафика уже существует"
    echo ""
    echo "Текущая задача:"
    crontab -l | grep "traffic-checker.js"
    echo ""
    read -p "Хочешь заменить её? (y/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Отменено"
        exit 0
    fi
    
    # Удаляем старую задачу
    crontab -l | grep -v "traffic-checker.js" | crontab -
    echo "✅ Старая задача удалена"
fi

# Добавляем новую задачу
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo "✅ Cron задача добавлена!"
echo ""
echo "📅 Расписание проверки трафика:"
echo "   - 10:00 (утро)"
echo "   - 15:00 (день)"
echo "   - 20:00 (вечер)"
echo ""
echo "📝 Логи сохраняются в: /var/log/traffic-checker.log"
echo ""
echo "Для просмотра текущих cron задач: crontab -l"
echo "Для просмотра логов: tail -f /var/log/traffic-checker.log"
echo ""
echo "✅ Настройка завершена!"
