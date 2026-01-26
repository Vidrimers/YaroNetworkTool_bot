#!/bin/bash

# Скрипт для настройки автоматического обнаружения торрентов через cron
# Проверка будет запускаться 1 раз в день в 22:00

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TORRENT_DETECTOR="$SCRIPT_DIR/torrent-detector.js"

echo "🔧 Настройка автоматического обнаружения торрентов..."
echo ""

# Проверяем, существует ли скрипт
if [ ! -f "$TORRENT_DETECTOR" ]; then
    echo "❌ Ошибка: Файл torrent-detector.js не найден в $SCRIPT_DIR"
    exit 1
fi

# Делаем скрипт исполняемым
chmod +x "$TORRENT_DETECTOR"
echo "✅ Скрипт torrent-detector.js сделан исполняемым"

# Проверяем, установлен ли node
if ! command -v node &> /dev/null; then
    echo "❌ Ошибка: Node.js не установлен"
    exit 1
fi

echo "✅ Node.js найден: $(node --version)"
echo ""

# Создаем cron задачу (раз в день в 22:00)
CRON_JOB="0 22 * * * cd $SCRIPT_DIR && /usr/bin/node $TORRENT_DETECTOR >> /var/log/torrent-detector.log 2>&1"

# Проверяем, существует ли уже такая задача
if crontab -l 2>/dev/null | grep -q "torrent-detector.js"; then
    echo "⚠️  Cron задача для обнаружения торрентов уже существует"
    echo ""
    echo "Текущая задача:"
    crontab -l | grep "torrent-detector.js"
    echo ""
    read -p "Хочешь заменить её? (y/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Отменено"
        exit 0
    fi
    
    # Удаляем старую задачу
    crontab -l | grep -v "torrent-detector.js" | crontab -
    echo "✅ Старая задача удалена"
fi

# Добавляем новую задачу
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo "✅ Cron задача добавлена!"
echo ""
echo "📅 Расписание обнаружения торрентов:"
echo "   - 22:00 (каждый день)"
echo ""
echo "📝 Логи сохраняются в: /var/log/torrent-detector.log"
echo ""
echo "⚙️ Настройки:"
echo "   - Порог трафика: 30 GB/день"
echo "   - Максимум предупреждений: 3"
echo "   - Действие: автоматическая блокировка"
echo ""
echo "Для просмотра текущих cron задач: crontab -l"
echo "Для просмотра логов: tail -f /var/log/torrent-detector.log"
echo ""
echo "✅ Настройка завершена!"
