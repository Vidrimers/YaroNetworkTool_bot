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
- `/start` - Главное меню с кнопками
- Кнопки:
  - ➕ Добавить клиента
  - ❌ Удалить клиента
  - 📋 Список клиентов
  - 📊 Статистика (топ-5, истекающие, превышение)
  - ⚙️ Сервер (статус, бэкапы)
- Команды:
  - `/client_info <uuid>` - Информация о клиенте
  - `/help` - Справка

### Клиент
- `/start` - Личный кабинет
- Кнопки:
  - 📊 Моя статистика
  - 🔗 Ссылка подключения
  - 🔑 Запросить ключ (1-12 месяцев)
  - 🔍 Проверка VPN
  - 📜 История запросов
- Команды:
  - `/help` - Справка

### Автоматические уведомления

**Для админа:**
- Новые запросы на продление
- Истекающие подписки (за 7 дней)
- Превышение трафика (> 80%)
- Обнаружение торрентов
- Недельный отчет (понедельник 09:00)

**Для клиента:**
- Подписка истекает через 7 дней
- Превышен лимит трафика (80%, 90%, 100%)
- Обнаружен торрент (3 предупреждения)
- Решение по запросу на продление
- Ежемесячный сброс трафика

## 📁 Структура проекта

```
yaronetworktool/
├── bot/
│   ├── yaronetworktool_bot.js        # Основной файл бота
│   ├── subscription-checker.js       # Проверка подписок (cron)
│   ├── traffic-checker.js            # Проверка трафика (cron)
│   ├── torrent-detector.js           # Обнаружение торрентов (cron)
│   ├── traffic-reset.js              # Ежемесячный сброс трафика (cron)
│   ├── xray-log-parser.js            # Парсер логов X-Ray (cron)
│   ├── weekly-report.js              # Недельный отчет (cron)
│   ├── backup.sh                     # Резервное копирование
│   ├── restore.sh                    # Восстановление из бэкапа
│   ├── kvn-bot.sh                    # Скрипт обновления через Git
│   ├── setup-*-cron.sh               # Скрипты настройки cron
│   └── utils/
│       ├── ssh.js                    # SSH утилита
│       └── api-client.js             # API клиент (22 метода)
├── database/
│   ├── init.sql                      # Схема БД
│   ├── models/                       # Модели данных
│   └── yaronetworkbase.db            # SQLite база
├── backups/                          # Резервные копии
├── logs/                             # Логи cron задач
├── docs/
│   ├── BOT-GUIDE.md                  # Руководство по боту
│   ├── TESTING.md                    # Руководство по тестированию
│   ├── VLESS-LINKS-SETUP.md          # Настройка ссылок
│   └── CHANGELOG.md                  # История изменений
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

## 📚 Документация

Подробная документация в папке `docs/`:
- [Руководство по боту](docs/BOT-GUIDE.md) - полное руководство пользователя
- [Настройка VLESS ссылок](docs/VLESS-LINKS-SETUP.md) - генерация ссылок
- [Руководство по тестированию](docs/TESTING.md) - тестирование функций
- [История изменений](docs/CHANGELOG.md) - changelog

Полная документация по развертыванию в основном репозитории:
- `SETUP.md` - Установка VPN сервера
- `DEPLOYMENT.md` - Развертывание и обновление
- `CLIENT-MANAGEMENT.md` - Управление клиентами
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
