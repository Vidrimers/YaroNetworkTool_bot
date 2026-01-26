# YaroNetworkTool - Telegram VPN Bot

Telegram бот для управления VPN сервером на базе X-Ray Core.

## Быстрый старт

```bash
# 1. Установка
npm install

# 2. Настройка
cp .env.example .env
nano .env

# 3. Инициализация БД
mkdir -p database
sqlite3 database/yaronetworkbase.db < database/init.sql

# 4. Запуск
npm start
```

## Настройка .env

Обязательные переменные:
- `TELEGRAM_BOT_TOKEN` - токен от @BotFather
- `TELEGRAM_ADMIN_ID` - ваш ID от @userinfobot
- `SERVER_IP` - IP адрес VPN сервера
- `SSH_PASSWORD` или `SSH_KEY_PATH` - для SSH доступа

## Развертывание

### Systemd
```bash
sudo systemctl enable yaronetworktool-bot
sudo systemctl start yaronetworktool-bot
```

### Обновление
```bash
./bot/kvn-bot.sh
```

## Команды бота

**Администратор:** `/start`, `/list_clients`, `/help`

**Клиент:** `/start`, `/my_vpn`, кнопка "🔑 Запросить ключ"

## Документация

Подробная документация в папке `docs/`:
- [Быстрый старт](docs/QUICKSTART.md)
- [История изменений](docs/CHANGELOG.md)
