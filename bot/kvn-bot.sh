#!/bin/bash

###############################################################################
# kvn-bot.sh - Скрипт развертывания обновлений Telegram бота
# Автоматическое обновление бота из Git с резервным копированием и откатом
###############################################################################

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Конфигурация
BOT_DIR="/opt/yaronetworktool"
BACKUP_DIR="/opt/yaronetworktool-backup"
LOG_FILE="/var/log/yaronetworktool-deploy.log"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.tar.gz"

# Функция логирования
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1" | tee -a "$LOG_FILE"
}

# Проверка прав root
if [ "$EUID" -ne 0 ]; then 
    error "Этот скрипт должен быть запущен с правами root"
    exit 1
fi

# Создание директории для бэкапов
mkdir -p "$BACKUP_DIR"

log "=========================================="
log "Начало развертывания обновлений бота"
log "=========================================="

# 1. Создание резервной копии
log "Шаг 1: Создание резервной копии..."
cd "$BOT_DIR" || exit 1

if [ -d ".git" ]; then
    CURRENT_COMMIT=$(git rev-parse HEAD)
    log "Текущий коммит: $CURRENT_COMMIT"
    echo "$CURRENT_COMMIT" > "${BACKUP_DIR}/last_commit.txt"
fi

tar -czf "$BACKUP_FILE" \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='*.log' \
    . 2>/dev/null || {
    error "Не удалось создать резервную копию"
    exit 1
}

log "Резервная копия создана: $BACKUP_FILE"

# 2. Остановка бота
log "Шаг 2: Остановка бота..."

# Попробовать остановить через systemd
if systemctl is-active --quiet yaronetworktool-bot; then
    systemctl stop yaronetworktool-bot
    log "Бот остановлен (systemd)"
    SERVICE_MANAGER="systemd"
# Попробовать остановить через PM2
elif command -v pm2 &> /dev/null && pm2 list | grep -q "yaronetworktool-bot"; then
    pm2 stop yaronetworktool-bot
    log "Бот остановлен (PM2)"
    SERVICE_MANAGER="pm2"
else
    warning "Бот не запущен или не найден менеджер процессов"
    SERVICE_MANAGER="none"
fi

# 3. Pull изменений из Git
log "Шаг 3: Получение обновлений из Git..."

git fetch origin || {
    error "Не удалось получить обновления из Git"
    rollback
    exit 1
}

REMOTE_COMMIT=$(git rev-parse origin/main)
log "Удаленный коммит: $REMOTE_COMMIT"

if [ "$CURRENT_COMMIT" = "$REMOTE_COMMIT" ]; then
    log "Нет новых обновлений"
else
    git pull origin main || {
        error "Не удалось применить обновления"
        rollback
        exit 1
    }
    log "Обновления применены успешно"
fi

# 4. Проверка package.json на изменения
log "Шаг 4: Проверка зависимостей..."

if git diff --name-only "$CURRENT_COMMIT" "$REMOTE_COMMIT" | grep -q "package.json"; then
    log "Обнаружены изменения в package.json, устанавливаем зависимости..."
    npm install --production || {
        error "Не удалось установить зависимости"
        rollback
        exit 1
    }
    log "Зависимости установлены"
else
    log "Изменений в зависимостях нет"
fi

# 5. Проверка конфигурации
log "Шаг 5: Проверка конфигурации..."

if [ ! -f ".env" ]; then
    error "Файл .env не найден"
    rollback
    exit 1
fi

# Проверка обязательных переменных
REQUIRED_VARS=("TELEGRAM_BOT_TOKEN" "TELEGRAM_ADMIN_ID" "SERVER_IP")
for var in "${REQUIRED_VARS[@]}"; do
    if ! grep -q "^${var}=" .env; then
        error "Отсутствует обязательная переменная: $var"
        rollback
        exit 1
    fi
done

log "Конфигурация валидна"

# 6. Запуск бота
log "Шаг 6: Запуск бота..."

case "$SERVICE_MANAGER" in
    systemd)
        systemctl start yaronetworktool-bot || {
            error "Не удалось запустить бот через systemd"
            rollback
            exit 1
        }
        sleep 3
        if systemctl is-active --quiet yaronetworktool-bot; then
            log "Бот успешно запущен (systemd)"
        else
            error "Бот не запустился"
            rollback
            exit 1
        fi
        ;;
    pm2)
        pm2 start yaronetworktool-bot || {
            error "Не удалось запустить бот через PM2"
            rollback
            exit 1
        }
        sleep 3
        if pm2 list | grep -q "yaronetworktool-bot.*online"; then
            log "Бот успешно запущен (PM2)"
        else
            error "Бот не запустился"
            rollback
            exit 1
        fi
        ;;
    *)
        warning "Менеджер процессов не найден, запустите бот вручную"
        ;;
esac

# 7. Проверка работоспособности
log "Шаг 7: Проверка работоспособности..."
sleep 5

case "$SERVICE_MANAGER" in
    systemd)
        if systemctl is-active --quiet yaronetworktool-bot; then
            log "✓ Бот работает корректно"
        else
            error "Бот не работает"
            rollback
            exit 1
        fi
        ;;
    pm2)
        if pm2 list | grep -q "yaronetworktool-bot.*online"; then
            log "✓ Бот работает корректно"
        else
            error "Бот не работает"
            rollback
            exit 1
        fi
        ;;
esac

# 8. Очистка старых бэкапов (оставляем последние 30)
log "Шаг 8: Очистка старых бэкапов..."
cd "$BACKUP_DIR"
ls -t backup_*.tar.gz 2>/dev/null | tail -n +31 | xargs -r rm
log "Старые бэкапы удалены"

log "=========================================="
log "Развертывание завершено успешно!"
log "Коммит: $(git rev-parse HEAD)"
log "=========================================="

exit 0

# Функция отката
rollback() {
    error "=========================================="
    error "ОТКАТ К ПРЕДЫДУЩЕЙ ВЕРСИИ"
    error "=========================================="
    
    if [ -f "$BACKUP_FILE" ]; then
        log "Восстановление из резервной копии..."
        cd "$BOT_DIR" || exit 1
        
        # Очистка текущих файлов (кроме node_modules и .git)
        find . -mindepth 1 -maxdepth 1 \
            ! -name 'node_modules' \
            ! -name '.git' \
            ! -name '*.log' \
            -exec rm -rf {} +
        
        # Распаковка бэкапа
        tar -xzf "$BACKUP_FILE" || {
            error "Не удалось распаковать резервную копию"
            exit 1
        }
        
        # Откат Git
        if [ -f "${BACKUP_DIR}/last_commit.txt" ]; then
            LAST_COMMIT=$(cat "${BACKUP_DIR}/last_commit.txt")
            git reset --hard "$LAST_COMMIT" 2>/dev/null || true
        fi
        
        # Перезапуск бота
        case "$SERVICE_MANAGER" in
            systemd)
                systemctl start yaronetworktool-bot
                ;;
            pm2)
                pm2 start yaronetworktool-bot
                ;;
        esac
        
        log "Откат выполнен успешно"
    else
        error "Резервная копия не найдена"
    fi
}
