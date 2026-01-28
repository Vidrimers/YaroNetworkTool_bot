/**
 * YuMoney Webhook Handler
 * Обработчик webhook уведомлений от ЮMoney
 */

import express from 'express';
import { handleYuMoneyNotification } from './yumoney.js';

// Создать Express сервер для webhook
export function createYuMoneyWebhookServer(apiClient, bot, port = 3001) {
  const app = express();

  // Парсинг URL-encoded данных (ЮMoney отправляет в этом формате)
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  // Webhook endpoint для ЮMoney
  app.post('/webhook/yumoney', async (req, res) => {
    try {
      console.log('[YuMoney Webhook] Получено уведомление:', req.body);

      const result = await handleYuMoneyNotification(req.body, apiClient, bot);

      if (result.success) {
        res.status(200).send('OK');
      } else {
        res.status(400).send(result.error || 'Error');
      }
    } catch (error) {
      console.error('[YuMoney Webhook] Ошибка обработки:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'yumoney-webhook' });
  });

  // Запуск сервера
  const server = app.listen(port, () => {
    console.log(`[YuMoney Webhook] Сервер запущен на порту ${port}`);
    console.log(`[YuMoney Webhook] URL: http://localhost:${port}/webhook/yumoney`);
  });

  return server;
}

export default {
  createYuMoneyWebhookServer
};
