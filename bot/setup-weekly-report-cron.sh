#!/bin/bash
# Настройка недельного генератора отчетов через cron

set -e

# Цвета
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT_SCRIPT="$SCRIPT_DIR/weekly-report.js"

echo -e "${GREEN}=== Настройка недельного генератора отчетов ===${NC}"
echo ""

# Делаем скрипт исполняемым
chmod +x "$REPORT_SCRIPT"
echo -e "${GREEN}✓ Права на выполнение установлены${NC}"

# Проверяем существующие задачи cron
# Каждый понедельник в 09:00
CRON_JOB="0 9 * * 1 cd $SCRIPT_DIR && /usr/bin/node $REPORT_SCRIPT >> $SCRIPT_DIR/weekly-report.log 2>&1"

if crontab -l 2>/dev/null | grep -q "$REPORT_SCRIPT"; then
    echo -e "${YELLOW}⚠ Задача cron уже существует${NC}"
    echo ""
    echo "Текущие задачи для weekly-report.js:"
    crontab -l | grep "$REPORT_SCRIPT"
    echo ""
    read -p "Обновить задачу? (yes/no): " UPDATE
    
    if [ "$UPDATE" != "yes" ]; then
        echo "Отменено"
        exit 0
    fi
    
    # Удаляем старую задачу
    crontab -l | grep -v "$REPORT_SCRIPT" | crontab -
    echo -e "${GREEN}✓ Старая задача удалена${NC}"
fi

# Добавляем новую задачу
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo -e "${GREEN}✓ Задача cron добавлена${NC}"
echo ""
echo "Расписание: Каждый понедельник в 09:00"
echo "Лог: $SCRIPT_DIR/weekly-report.log"
echo ""
echo "Проверить задачи: crontab -l"
echo "Удалить задачу: crontab -e"
echo ""

# Тестовый запуск
read -p "Запустить тестовую генерацию отчета сейчас? (yes/no): " TEST

if [ "$TEST" = "yes" ]; then
    echo ""
    echo -e "${YELLOW}Запуск тестовой генерации...${NC}"
    cd "$SCRIPT_DIR"
    /usr/bin/node "$REPORT_SCRIPT"
fi

echo ""
echo -e "${GREEN}=== Настройка завершена ===${NC}"
