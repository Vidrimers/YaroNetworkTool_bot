#!/bin/bash
# Скрипт резервного копирования для YaroNetworkTool
# Создает резервные копии БД, конфигурации и логов

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Директории
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="/home/xray-vpn/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="backup_$TIMESTAMP"
BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"

# Максимальное количество бэкапов (хранить последние 30)
MAX_BACKUPS=30

echo -e "${GREEN}=== Резервное копирование YaroNetworkTool ===${NC}"
echo "Время: $(date)"
echo "Директория бэкапа: $BACKUP_PATH"
echo ""

# Создаем директорию для бэкапов если не существует
mkdir -p "$BACKUP_DIR"
mkdir -p "$BACKUP_PATH"

# 1. Бэкап базы данных
echo -e "${YELLOW}[1/4] Копирование базы данных...${NC}"
# Бэкапим основную БД из /home/xray-vpn
if [ -f "/home/xray-vpn/database/vpn.db" ]; then
    cp "/home/xray-vpn/database/vpn.db" "$BACKUP_PATH/vpn.db"
    echo -e "${GREEN}✓ База данных скопирована${NC}"
else
    echo -e "${RED}✗ База данных не найдена${NC}"
fi

# 2. Бэкап конфигурации
echo -e "${YELLOW}[2/4] Копирование конфигурации...${NC}"
if [ -f "$PROJECT_ROOT/.env" ]; then
    cp "$PROJECT_ROOT/.env" "$BACKUP_PATH/.env"
    echo -e "${GREEN}✓ Конфигурация .env скопирована${NC}"
else
    echo -e "${RED}✗ Файл .env не найден${NC}"
fi

# 3. Бэкап списка клиентов (если есть)
echo -e "${YELLOW}[3/4] Экспорт списка клиентов...${NC}"
if [ -f "/home/xray-vpn/database/vpn.db" ]; then
    sqlite3 "/home/xray-vpn/database/vpn.db" <<EOF > "$BACKUP_PATH/clients_export.sql"
.mode insert clients
SELECT * FROM clients;
EOF
    echo -e "${GREEN}✓ Список клиентов экспортирован${NC}"
else
    echo -e "${YELLOW}⚠ База данных недоступна для экспорта${NC}"
fi

# 4. Создание архива
echo -e "${YELLOW}[4/4] Создание архива...${NC}"
cd "$BACKUP_DIR"
tar -czf "${BACKUP_NAME}.tar.gz" "$BACKUP_NAME"
rm -rf "$BACKUP_NAME"
echo -e "${GREEN}✓ Архив создан: ${BACKUP_NAME}.tar.gz${NC}"

# Получаем размер архива
BACKUP_SIZE=$(du -h "${BACKUP_NAME}.tar.gz" | cut -f1)
echo -e "${GREEN}✓ Размер архива: $BACKUP_SIZE${NC}"

# 5. Удаление старых бэкапов (оставляем последние MAX_BACKUPS)
echo -e "${YELLOW}[5/5] Очистка старых бэкапов...${NC}"
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/backup_*.tar.gz 2>/dev/null | wc -l)

if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
    DELETE_COUNT=$((BACKUP_COUNT - MAX_BACKUPS))
    echo "Найдено бэкапов: $BACKUP_COUNT (лимит: $MAX_BACKUPS)"
    echo "Удаляем старые бэкапы: $DELETE_COUNT"
    
    ls -1t "$BACKUP_DIR"/backup_*.tar.gz | tail -n "$DELETE_COUNT" | xargs rm -f
    echo -e "${GREEN}✓ Старые бэкапы удалены${NC}"
else
    echo "Найдено бэкапов: $BACKUP_COUNT (лимит: $MAX_BACKUPS)"
    echo -e "${GREEN}✓ Очистка не требуется${NC}"
fi

echo ""
echo -e "${GREEN}=== Резервное копирование завершено ===${NC}"
echo "Архив: $BACKUP_DIR/${BACKUP_NAME}.tar.gz"
echo "Размер: $BACKUP_SIZE"
echo ""

# Список всех бэкапов
echo "Доступные бэкапы:"
ls -lh "$BACKUP_DIR"/backup_*.tar.gz 2>/dev/null | awk '{print $9, "(" $5 ")"}'
