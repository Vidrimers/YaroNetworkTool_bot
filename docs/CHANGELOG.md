# Changelog

## [1.0.0] - 2026-01-26

### Добавлено
- ✅ Базовая структура Telegram бота
- ✅ Обработчики команд для администратора (/start, /help, /add_client, /remove_client, /list_clients, /client_info, /server_status)
- ✅ Обработчики команд для клиента (/start, /help, /my_vpn, /my_link, /my_requests)
- ✅ Система запросов на продление подписки (1-12 месяцев)
- ✅ Inline кнопки для одобрения/отказа запросов администратором
- ✅ SSH утилита для подключения к VPN серверу
- ✅ API клиент для взаимодействия с Management API
- ✅ Скрипт развертывания kvn-bot.sh с автоматическим откатом
- ✅ Схема базы данных SQLite (clients, extension_requests, traffic_logs)
- ✅ Полная документация в README.md
- ✅ Конфигурация package.json с зависимостями
- ✅ Шаблон .env.example

### Структура проекта
```
yaronetworktool/
├── bot/
│   ├── yaronetworktool_bot.js    # Основной файл бота (559 строк)
│   ├── kvn-bot.sh                # Скрипт развертывания (267 строк)
│   └── utils/
│       ├── ssh.js                # SSH утилита (177 строк)
│       └── api-client.js         # API клиент (337 строк)
├── database/
│   └── init.sql                  # Схема БД
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

### Следующие шаги
- [ ] Интеграция с Management API (когда API будет готов)
- [ ] Реализация команд администратора (add_client, remove_client, client_info)
- [ ] Реализация команд клиента (my_vpn, my_link с QR кодом)
- [ ] Обработка состояний пользователя для интерактивных команд
- [ ] Генерация QR кодов для ссылок подключения
- [ ] Уведомления клиентам о статусе запросов
- [ ] Мониторинг и статистика в реальном времени

### Технологии
- Node.js 18+
- node-telegram-bot-api 0.66.0
- sqlite3 5.1.7
- ssh2 1.15.0
- dotenv 16.4.5
