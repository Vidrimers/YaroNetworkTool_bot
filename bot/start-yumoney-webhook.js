#!/usr/bin/env node
/**
 * YuMoney Webhook Server
 * Отдельный сервер для приема webhook уведомлений от ЮMoney
 */

import dotenv from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';
import APIClient from './utils/api-client.js';
import { createYuMoneyWebhookServer } from './payments/yumoney-webhook.js';

dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const YUMONEY_WEBHOOK_PORT = parseInt(process.env.YUMONEY_WEBHOOK_PORT) || 3001;

if (!TELEGRAM_BOT_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN не установлен в .env');
  process.exit(1);
}

// Инициализация бота (без polling, только для отправки сообщений)
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN);

// Инициализация API клиента
const apiClient = new APIClient();

console.log('\n[YuMoney Webhook Server] Запуск...\n');
console.log(`API URL: ${apiClient.baseURL}`);
console.log(`Webhook Port: ${YUMONEY_WEBHOOK_PORT}\n`);

// Запуск webhook сервера
const server = createYuMoneyWebhookServer(apiClient, bot, YUMONEY_WEBHOOK_PORT);

console.log('\n✅ Webhook сервер запущен!');
console.log(`\n📍 Локальный URL: http://localhost:${YUMONEY_WEBHOOK_PORT}/webhook/yumoney`);
console.log('\n🔧 Для тестирования через ngrok:');
console.log(`   1. Запусти: ngrok http ${YUMONEY_WEBHOOK_PORT}`);
console.log(`   2. Скопируй HTTPS URL из ngrok (например: https://abc123.ngrok.io)`);
console.log(`   3. Используй в ЮMoney: https://abc123.ngrok.io/webhook/yumoney\n`);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[YuMoney Webhook Server] Остановка...');
  server.close(() => {
    console.log('[YuMoney Webhook Server] Сервер остановлен');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n[YuMoney Webhook Server] Остановка...');
  server.close(() => {
    console.log('[YuMoney Webhook Server] Сервер остановлен');
    process.exit(0);
  });
});
