#!/bin/bash
# Настройка автоматического резервного копирования через cron

set -e

# Цвета
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="$SCRIPT_DIR/backup.sh"

echo -e "${GREEN}=== Настройка автоматического резервного копирования ===${NC}"
echo ""

# Делаем скрипт исполняемым
chmod +x "$BACKUP_SCRIPT"
echo -e "${GREEN}✓ Права на выполнение установлены${NC}"

# Проверяем существующие задачи cron
# Каждые 3 дня в 03:00 (1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31 числа месяца)
CRON_JOB="0 3 */3 * * $BACKUP_SCRIPT >> $SCRIPT_DIR/../logs/backup.log 2>&1"

if crontab -l 2>/dev/null | grep -q "$BACKUP_SCRIPT"; then
    echo -e "${YELLOW}⚠ Задача cron уже существует${NC}"
    echo ""
    echo "Текущие задачи для backup.sh:"
    crontab -l | grep "$BACKUP_SCRIPT"
    echo ""
    read -p "Обновить задачу? (yes/no): " UPDATE
    
    if [ "$UPDATE" != "yes" ]; then
        echo "Отменено"
        exit 0
    fi
    
    # Удаляем старую задачу
    crontab -l | grep -v "$BACKUP_SCRIPT" | crontab -
    echo -e "${GREEN}✓ Старая задача удалена${NC}"
fi

# Создаем директорию для логов
mkdir -p "$SCRIPT_DIR/../logs"

# Добавляем новую задачу
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo -e "${GREEN}✓ Задача cron добавлена${NC}"
echo ""
echo "Расписание: Каждые 3 дня в 03:00"
echo "Лог: $SCRIPT_DIR/../logs/backup.log"
echo ""
echo "Проверить задачи: crontab -l"
echo "Удалить задачу: crontab -e"
echo ""

# Тестовый запуск
read -p "Запустить тестовый бэкап сейчас? (yes/no): " TEST

if [ "$TEST" = "yes" ]; then
    echo ""
    echo -e "${YELLOW}Запуск тестового бэкапа...${NC}"
    bash "$BACKUP_SCRIPT"
fi

echo ""
echo -e "${GREEN}=== Настройка завершена ===${NC}"
