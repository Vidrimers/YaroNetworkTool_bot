#!/bin/bash
# Скрипт восстановления из резервной копии

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Директории
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_ROOT/backups"

echo -e "${GREEN}=== Восстановление из резервной копии ===${NC}"
echo ""

# Проверяем наличие бэкапов
if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A "$BACKUP_DIR"/backup_*.tar.gz 2>/dev/null)" ]; then
    echo -e "${RED}✗ Резервные копии не найдены${NC}"
    echo "Директория: $BACKUP_DIR"
    exit 1
fi

# Показываем список доступных бэкапов
echo "Доступные резервные копии:"
echo ""
ls -1t "$BACKUP_DIR"/backup_*.tar.gz | nl -w2 -s'. '

echo ""
read -p "Введи номер бэкапа для восстановления (или 0 для отмены): " BACKUP_NUM

if [ "$BACKUP_NUM" = "0" ]; then
    echo "Отменено"
    exit 0
fi

# Получаем путь к выбранному бэкапу
BACKUP_FILE=$(ls -1t "$BACKUP_DIR"/backup_*.tar.gz | sed -n "${BACKUP_NUM}p")

if [ -z "$BACKUP_FILE" ]; then
    echo -e "${RED}✗ Неверный номер бэкапа${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Выбран бэкап: $(basename "$BACKUP_FILE")${NC}"
echo ""
read -p "Продолжить восстановление? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Отменено"
    exit 0
fi

# Создаем временную директорию
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo ""
echo -e "${YELLOW}[1/4] Распаковка архива...${NC}"
tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"
BACKUP_NAME=$(basename "$BACKUP_FILE" .tar.gz)
EXTRACT_DIR="$TEMP_DIR/$BACKUP_NAME"

if [ ! -d "$EXTRACT_DIR" ]; then
    echo -e "${RED}✗ Ошибка распаковки архива${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Архив распакован${NC}"

# Останавливаем бота перед восстановлением
echo -e "${YELLOW}[2/4] Остановка бота...${NC}"
if command -v pm2 &> /dev/null; then
    pm2 stop vpn-bot 2>/dev/null || true
    echo -e "${GREEN}✓ Бот остановлен${NC}"
else
    echo -e "${YELLOW}⚠ PM2 не найден, пропускаем${NC}"
fi

# Восстанавливаем базу данных
echo -e "${YELLOW}[3/4] Восстановление базы данных...${NC}"
if [ -f "$EXTRACT_DIR/yaronetworkbase.db" ]; then
    # Создаем бэкап текущей БД перед восстановлением
    if [ -f "$PROJECT_ROOT/database/yaronetworkbase.db" ]; then
        cp "$PROJECT_ROOT/database/yaronetworkbase.db" "$PROJECT_ROOT/database/yaronetworkbase.db.before_restore"
        echo "Текущая БД сохранена как yaronetworkbase.db.before_restore"
    fi
    
    cp "$EXTRACT_DIR/yaronetworkbase.db" "$PROJECT_ROOT/database/yaronetworkbase.db"
    echo -e "${GREEN}✓ База данных восстановлена${NC}"
else
    echo -e "${RED}✗ База данных не найдена в бэкапе${NC}"
fi

# Восстанавливаем .env (опционально)
if [ -f "$EXTRACT_DIR/.env" ]; then
    read -p "Восстановить файл .env? (yes/no): " RESTORE_ENV
    if [ "$RESTORE_ENV" = "yes" ]; then
        cp "$PROJECT_ROOT/.env" "$PROJECT_ROOT/.env.before_restore" 2>/dev/null || true
        cp "$EXTRACT_DIR/.env" "$PROJECT_ROOT/.env"
        echo -e "${GREEN}✓ Файл .env восстановлен${NC}"
    else
        echo -e "${YELLOW}⚠ Файл .env пропущен${NC}"
    fi
fi

# Запускаем бота
echo -e "${YELLOW}[4/4] Запуск бота...${NC}"
if command -v pm2 &> /dev/null; then
    pm2 start vpn-bot 2>/dev/null || true
    echo -e "${GREEN}✓ Бот запущен${NC}"
else
    echo -e "${YELLOW}⚠ PM2 не найден, запусти бота вручную${NC}"
fi

echo ""
echo -e "${GREEN}=== Восстановление завершено ===${NC}"
echo "Восстановлено из: $(basename "$BACKUP_FILE")"
echo ""
echo "Примечание: Старые файлы сохранены с суффиксом .before_restore"
