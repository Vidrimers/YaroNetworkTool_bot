#!/bin/bash
# Настройка ежемесячного сброса трафика через cron

set -e

# Цвета
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESET_SCRIPT="$SCRIPT_DIR/traffic-reset.js"

echo -e "${GREEN}=== Настройка ежемесячного сброса трафика ===${NC}"
echo ""

# Делаем скрипт исполняемым
chmod +x "$RESET_SCRIPT"
echo -e "${GREEN}✓ Права на выполнение установлены${NC}"

# Проверяем существующие задачи cron
# Каждое 1-е число месяца в 00:00
CRON_JOB="0 0 1 * * cd $SCRIPT_DIR && /usr/bin/node $RESET_SCRIPT >> $SCRIPT_DIR/traffic-reset.log 2>&1"

if crontab -l 2>/dev/null | grep -q "$RESET_SCRIPT"; then
    echo -e "${YELLOW}⚠ Задача cron уже существует${NC}"
    echo ""
    echo "Текущие задачи для traffic-reset.js:"
    crontab -l | grep "$RESET_SCRIPT"
    echo ""
    read -p "Обновить задачу? (yes/no): " UPDATE
    
    if [ "$UPDATE" != "yes" ]; then
        echo "Отменено"
        exit 0
    fi
    
    # Удаляем старую задачу
    crontab -l | grep -v "$RESET_SCRIPT" | crontab -
    echo -e "${GREEN}✓ Старая задача удалена${NC}"
fi

# Добавляем новую задачу
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo -e "${GREEN}✓ Задача cron добавлена${NC}"
echo ""
echo "Расписание: 1-го числа каждого месяца в 00:00"
echo "Лог: $SCRIPT_DIR/traffic-reset.log"
echo ""
echo "Проверить задачи: crontab -l"
echo "Удалить задачу: crontab -e"
echo ""

# Тестовый запуск
read -p "Запустить тестовый сброс сейчас? (yes/no): " TEST

if [ "$TEST" = "yes" ]; then
    echo ""
    echo -e "${YELLOW}Запуск тестового сброса трафика...${NC}"
    cd "$SCRIPT_DIR"
    /usr/bin/node "$RESET_SCRIPT"
fi

echo ""
echo -e "${GREEN}=== Настройка завершена ===${NC}"
