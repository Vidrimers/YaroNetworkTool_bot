#!/bin/bash
# Настройка парсера логов X-Ray через cron

set -e

# Цвета
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARSER_SCRIPT="$SCRIPT_DIR/xray-log-parser.js"

echo -e "${GREEN}=== Настройка парсера логов X-Ray ===${NC}"
echo ""

# Делаем скрипт исполняемым
chmod +x "$PARSER_SCRIPT"
echo -e "${GREEN}✓ Права на выполнение установлены${NC}"

# Проверяем существующие задачи cron
# Каждый час в 5 минут
CRON_JOB="5 * * * * cd $SCRIPT_DIR && /usr/bin/node $PARSER_SCRIPT >> $SCRIPT_DIR/xray-log-parser.log 2>&1"

if crontab -l 2>/dev/null | grep -q "$PARSER_SCRIPT"; then
    echo -e "${YELLOW}⚠ Задача cron уже существует${NC}"
    echo ""
    echo "Текущие задачи для xray-log-parser.js:"
    crontab -l | grep "$PARSER_SCRIPT"
    echo ""
    read -p "Обновить задачу? (yes/no): " UPDATE
    
    if [ "$UPDATE" != "yes" ]; then
        echo "Отменено"
        exit 0
    fi
    
    # Удаляем старую задачу
    crontab -l | grep -v "$PARSER_SCRIPT" | crontab -
    echo -e "${GREEN}✓ Старая задача удалена${NC}"
fi

# Добавляем новую задачу
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo -e "${GREEN}✓ Задача cron добавлена${NC}"
echo ""
echo "Расписание: Каждый час в 5 минут"
echo "Лог: $SCRIPT_DIR/xray-log-parser.log"
echo ""
echo "Проверить задачи: crontab -l"
echo "Удалить задачу: crontab -e"
echo ""

# Тестовый запуск
read -p "Запустить тестовый парсинг сейчас? (yes/no): " TEST

if [ "$TEST" = "yes" ]; then
    echo ""
    echo -e "${YELLOW}Запуск тестового парсинга...${NC}"
    cd "$SCRIPT_DIR"
    /usr/bin/node "$PARSER_SCRIPT"
fi

echo ""
echo -e "${GREEN}=== Настройка завершена ===${NC}"
