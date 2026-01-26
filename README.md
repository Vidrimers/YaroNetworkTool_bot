# YaroNetworkTool - Telegram VPN Bot

Telegram бот для управления VPN сервером на базе X-Ray Core.

## 🚀 Быстрый старт

### Локально (для разработки и тестирования)

```bash
# 1. Установка зависимостей
npm install

# 2. Настройка .env
cp .env.example .env
nano .env

# 3. Запуск бота
node bot/yaronetworktool_bot.js
```

Бот подключится к API на сервере через `http://144.124.237.222:333`

### На сервере (продакшн)

```bash
# 1. Клонировать репозиторий
cd ~
git clone <url> yaronetworktool

# 2. Установить зависимости
cd yaronetworktool
npm install --production

# 3. Настроить .env
nano .env
# Установить: API_BASE_URL=http://localhost:333

# 4. Запустить через PM2
pm2 start bot/yaronetworktool_bot.js --name vpn-bot --time

# 5. Сохранить конфигурацию для автозапуска
pm2 save
pm2 startup
```

## ⚙️ Настройка .env

Обязательные переменные:
- `TELEGRAM_BOT_TOKEN` - токен от @BotFather
- `TELEGRAM_ADMIN_ID` - ваш ID от @userinfobot
- `SERVER_IP` - IP адрес VPN сервера
- `API_BASE_URL` - URL Management API (http://144.124.237.222:333 или http://localhost:333)

Опциональные (для SSH доступа):
- `SSH_USERNAME` - пользователь SSH
- `SSH_PASSWORD` или `SSH_KEY_PATH` - для SSH доступа

## 🔄 Управление через PM2

```bash
# Проверить статус
pm2 status

# Просмотреть логи
pm2 logs vpn-bot

# Перезапустить
pm2 restart vpn-bot

# Остановить
pm2 stop vpn-bot

# Обновить из Git
./bot/kvn-bot.sh

# Остановить через скрипт
./bot/kvn-bot-stop.sh
```

## 🤖 Команды бота

### Администратор
- `/start` - Главное меню
- `/add_client` - Добавить клиента
- `/remove_client` - Удалить клиента
- `/list_clients` - Список всех клиентов
- `/client_info <uuid>` - Информация о клиенте
- `/server_status` - Статус сервера
- `/help` - Справка

### Клиент
- `/start` - Личный кабинет
- `/my_vpn` - Статистика VPN
- `/my_link` - Ссылка подключения
- `/my_requests` - Мои запросы на продление
- `🔑 Запросить ключ` - Запрос на продление (1-12 месяцев)
- `/help` - Справка

## 📁 Структура проекта

```
yaronetworktool/
├── bot/
│   ├── yaronetworktool_bot.js    # Основной файл бота
│   ├── kvn-bot.sh                # Скрипт обновления через Git
│   ├── kvn-bot-stop.sh           # Скрипт остановки бота
│   └── utils/
│       ├── ssh.js                # SSH утилита
│       └── api-client.js         # API клиент (22 метода)
├── database/
│   └── init.sql                  # Схема БД
├── docs/
│   ├── TESTING.md                # Руководство по тестированию
│   ├── CHANGELOG.md              # История изменений
│   └── QUICKSTART.md             # Быстрый старт
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

## 📚 Документация

Подробная документация в папке `docs/`:
- [Быстрый старт](docs/QUICKSTART.md)
- [Руководство по тестированию](docs/TESTING.md)
- [История изменений](docs/CHANGELOG.md)

Полная документация по развертыванию в основном репозитории:
- `DEPLOYMENT-GUIDE.md` - Полное руководство
- `QUICK-DEPLOY.md` - Быстрое развертывание
- `CHEATSHEET.md` - Шпаргалка команд

## 🔧 Технологии

- Node.js 18+
- node-telegram-bot-api 0.66.0
- sqlite3 5.1.7
- ssh2 1.15.0
- dotenv 16.4.5

## 📄 Лицензия

MIT License
