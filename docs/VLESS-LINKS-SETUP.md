# Настройка генерации vless:// ссылок в боте

## Что добавлено

Бот теперь умеет автоматически генерировать vless:// ссылки для подключения к VPN при создании клиента.

## Настройка

Добавь в файл `yaronetworktool/.env` следующие параметры:

```bash
# XRAY CONFIGURATION (для генерации vless ссылок)
XRAY_PORT=8443
XRAY_PUBLIC_KEY=YOUR_PUBLIC_KEY_HERE
XRAY_SHORT_ID=YOUR_SHORT_ID_HERE
XRAY_SNI=www.microsoft.com
```

### Где взять эти значения:

1. **XRAY_PORT** - порт X-Ray сервера (обычно 8443 или 443)
2. **XRAY_PUBLIC_KEY** - это значение из строки `Password:` при выполнении команды `xray x25519`
3. **XRAY_SHORT_ID** - сгенерированный Short ID из `scripts/generated/keys.txt`
4. **XRAY_SNI** - Server Name Indication, обычно `www.microsoft.com`

### Как получить ключи на сервере:

```bash
# На сервере
cd /home/xray-vpn/scripts
cat generated/keys.txt

# Или сгенерировать новые
/usr/local/bin/xray x25519
```

## Функционал

После настройки бот будет:

1. **При создании клиента** - автоматически генерировать и отправлять vless:// ссылку
2. **По кнопке "🔗 Моя ссылка"** - показывать клиенту его ссылку для подключения
3. **Отправлять ссылку клиенту** - при создании доступа через Telegram ID

## Пример ссылки

```
vless://CLIENT_UUID@SERVER_IP:8443?encryption=none&flow=&security=reality&sni=www.microsoft.com&fp=chrome&pbk=PUBLIC_KEY&sid=SHORT_ID&type=xhttp&host=#ClientName
```

## Тестирование

1. Обнови `.env` файл с правильными ключами
2. Перезапусти бота: `pm2 restart vpn-bot`
3. Создай тестового клиента через бота
4. Проверь что ссылка генерируется и работает

## Troubleshooting

Если ссылки не генерируются:
- Проверь что все переменные окружения установлены: `cat .env | grep XRAY`
- Проверь логи бота: `pm2 logs vpn-bot`
- Убедись что ключи правильные (Public Key должен быть из строки `Password:`)
