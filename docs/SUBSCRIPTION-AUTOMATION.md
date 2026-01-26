# Автоматизация проверки подписок

Система автоматической проверки подписок и блокировки клиентов.

## Возможности

### Автоматические уведомления
- **За 3 дня до истечения**: уведомление клиенту и админу
- **В день истечения**: уведомление админу

### Автоматическая блокировка
- Блокировка клиента в базе данных
- Удаление UUID из конфига X-Ray
- Перезапуск X-Ray сервиса

## Установка

### 1. Добавь переменную в .env

```bash
cd ~/yaronetworktool-bot
nano .env
```

Добавь строку:
```
XRAY_CONFIG_PATH=/usr/local/etc/xray/config.json
```

### 2. Настрой cron задачу

```bash
cd ~/yaronetworktool-bot/bot
chmod +x setup-cron.sh
./setup-cron.sh
```

Скрипт будет запускаться каждый день в 10:00.

### 3. Проверь работу вручную

```bash
cd ~/yaronetworktool-bot/bot
node subscription-checker.js
```

## Логи

Логи сохраняются в файл:
```
~/yaronetworktool-bot/bot/subscription-checker.log
```

Просмотр логов:
```bash
tail -f ~/yaronetworktool-bot/bot/subscription-checker.log
```

## Управление cron задачей

### Просмотр всех задач
```bash
crontab -l
```

### Редактирование задач
```bash
crontab -e
```

### Удаление задачи
```bash
crontab -e
# Удали строку с subscription-checker.js
```

## Как это работает

1. **Каждый день в 10:00** запускается скрипт `subscription-checker.js`
2. Скрипт получает список всех активных клиентов из API
3. Для каждого клиента проверяет дату окончания подписки
4. Если подписка истекает через ≤3 дней:
   - Отправляет уведомление клиенту
   - Отправляет уведомление админу
5. Если подписка истекла:
   - Блокирует клиента в базе данных
   - Удаляет UUID из конфига X-Ray
   - Перезапускает X-Ray
   - Отправляет уведомления админу и клиенту

## Требования

- Node.js
- Права на выполнение `systemctl restart xray` (sudo или root)
- Доступ к конфигу X-Ray (`/usr/local/etc/xray/config.json`)

## Настройка прав sudo (если бот не от root)

Если бот запущен не от root, добавь права:

```bash
sudo visudo
```

Добавь в конец (замени `USERNAME` на пользователя бота):
```
USERNAME ALL=(ALL) NOPASSWD: /bin/systemctl restart xray
USERNAME ALL=(ALL) NOPASSWD: /bin/cat /usr/local/etc/xray/config.json
USERNAME ALL=(ALL) NOPASSWD: /usr/bin/tee /usr/local/etc/xray/config.json
```

## Изменение времени запуска

По умолчанию скрипт запускается в 10:00. Для изменения:

```bash
crontab -e
```

Измени время в строке:
```
0 10 * * * ...  # 10:00
0 14 * * * ...  # 14:00
0 0 * * * ...   # 00:00 (полночь)
```

Формат: `минута час день месяц день_недели`

## Отладка

Если что-то не работает:

1. Проверь логи:
   ```bash
   tail -50 ~/yaronetworktool-bot/bot/subscription-checker.log
   ```

2. Запусти вручную:
   ```bash
   cd ~/yaronetworktool-bot/bot
   node subscription-checker.js
   ```

3. Проверь права:
   ```bash
   ls -la /usr/local/etc/xray/config.json
   systemctl status xray
   ```

4. Проверь переменные окружения:
   ```bash
   cat ~/yaronetworktool-bot/.env | grep XRAY
   ```
