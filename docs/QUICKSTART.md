# Быстрый старт

## 1. Установка зависимостей

```bash
cd yaronetworktool
npm install
```

## 2. Настройка переменных окружения

```bash
cp .env.example .env
nano .env
```

Обязательно заполните:
- `TELEGRAM_BOT_TOKEN` - получите у @BotFather
- `TELEGRAM_ADMIN_ID` - ваш ID от @userinfobot
- `SERVER_IP` - IP адрес VPN сервера
- `SSH_PASSWORD` или `SSH_KEY_PATH` - для SSH доступа

## 3. Инициализация базы данных

```bash
mkdir -p database
sqlite3 database/yaronetworkbase.db < database/init.sql
```

## 4. Запуск бота

### Режим разработки
```bash
npm run dev
```

### Продакшн режим
```bash
npm start
```

## 5. Проверка работы

Откройте Telegram и отправьте боту команду `/start`

Если вы администратор (ваш ID совпадает с TELEGRAM_ADMIN_ID), вы увидите админ-панель.

## Развертывание на сервере

### Systemd сервис

```bash
sudo cp bot/yaronetworktool-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable yaronetworktool-bot
sudo systemctl start yaronetworktool-bot
```

### Обновление через Git

```bash
./bot/kvn-bot.sh
```

## Команды бота

### Администратор
- `/start` - Главное меню
- `/list_clients` - Список клиентов
- `/help` - Справка

### Клиент
- `/start` - Личный кабинет
- `/my_vpn` - Статистика
- Кнопка "🔑 Запросить ключ" - Продление подписки

## Troubleshooting

### Бот не отвечает
```bash
# Проверить статус
systemctl status yaronetworktool-bot

# Посмотреть логи
journalctl -u yaronetworktool-bot -f
```

### Ошибка подключения к серверу
```bash
# Проверить SSH
ssh root@YOUR_SERVER_IP

# Проверить API
curl http://YOUR_SERVER_IP:3000/api/v1/system/status
```
