/**
 * Payment Handler
 * Главный обработчик платежей
 */

import { handleTelegramStars } from './telegram-stars.js';
import { handleTONConnect } from './ton-connect.js';
import { handleUSDT } from './usdt.js';
import { handleKaspa } from './kaspa.js';

// Тарифные планы
export const SUBSCRIPTION_PLANS = {
  '1_month': {
    name: '1 месяц',
    days: 30,
    price_rub: 100,
    price_stars: 70,       // 70 Stars
    price_ton: 1,          // 1 TON
    price_usdt: 1,         // 1 USD
    price_kaspa: 25        // ~1 USD (курс KAS ~0.04$)
  },
  '3_months': {
    name: '3 месяца',
    days: 90,
    price_rub: 270,
    price_stars: 165,      // 165 Stars
    price_ton: 2.7,        // 2.7 TON
    price_usdt: 2.7,       // 2.7 USD
    price_kaspa: 70        // 70 KAS
  }
};

// Показать выбор метода оплаты
export function showPaymentMethods(bot, chatId) {
  const keyboard = {
    inline_keyboard: [
      [
        { text: '⭐ Telegram Stars', callback_data: 'payment_method_stars' }
      ],
      [
        { text: '💎 TON Connect', callback_data: 'payment_method_ton' }
      ],
      [
        { text: '💵 USDT (TRC-20)', callback_data: 'payment_method_usdt' }
      ],
      [
        { text: '🔷 Kaspa', callback_data: 'payment_method_kaspa' }
      ],
      [
        { text: '💬 Написать админу', url: 'https://t.me/JaroCobain' }
      ],
      [
        { text: '❌ Отмена', callback_data: 'payment_cancel' }
      ]
    ]
  };

  bot.sendMessage(
    chatId,
    `💳 <b>Выбери способ оплаты</b>\n\n` +
      `Доступные методы:\n\n` +
      `⭐ <b>Telegram Stars</b> - встроенная валюта Telegram\n` +
      `💎 <b>TON Connect</b> - криптовалюта TON\n` +
      `💵 <b>USDT</b> - стейблкоин (TRC-20)\n` +
      `🔷 <b>Kaspa</b> - криптовалюта Kaspa\n\n` +
      `💬 <b>Написать админу</b> - другие способы оплаты`,
    {
      parse_mode: 'HTML',
      reply_markup: keyboard
    }
  );
}

// Показать тарифные планы для выбранного метода
export function showSubscriptionPlans(bot, chatId, paymentMethod) {
  const methodNames = {
    stars: '⭐ Telegram Stars',
    ton: '💎 TON Connect',
    usdt: '💵 USDT',
    kaspa: '🔷 Kaspa'
  };

  const keyboard = {
    inline_keyboard: [
      [
        { text: `1 месяц - ${getPriceForMethod('1_month', paymentMethod)}`, callback_data: `payment_plan_${paymentMethod}_1_month` }
      ],
      [
        { text: `3 месяца - ${getPriceForMethod('3_months', paymentMethod)}`, callback_data: `payment_plan_${paymentMethod}_3_months` }
      ],
      [
        { text: '◀️ Назад', callback_data: 'payment_back_to_methods' }
      ]
    ]
  };

  bot.sendMessage(
    chatId,
    `${methodNames[paymentMethod]}\n\n` +
      `📋 <b>Выбери тарифный план:</b>`,
    {
      parse_mode: 'HTML',
      reply_markup: keyboard
    }
  );
}

// Получить цену для метода оплаты
function getPriceForMethod(plan, method) {
  const planData = SUBSCRIPTION_PLANS[plan];
  
  switch (method) {
    case 'stars':
      return `${planData.price_stars} ⭐`;
    case 'ton':
      return `${planData.price_ton} TON`;
    case 'usdt':
      return `${planData.price_usdt} USDT`;
    case 'kaspa':
      return `${planData.price_kaspa} KAS`;
    default:
      return `${planData.price_rub} ₽`;
  }
}

// Обработать выбор тарифного плана
export async function handlePaymentPlan(bot, chatId, userId, paymentMethod, plan, apiClient = null) {
  const planData = SUBSCRIPTION_PLANS[plan];
  
  if (!planData) {
    bot.sendMessage(chatId, '❌ Неверный тарифный план');
    return;
  }

  // Получаем индивидуальную цену клиента (если есть)
  let customPrice = null;
  if (paymentMethod === 'kaspa' && apiClient) {
    try {
      const clientsResponse = await apiClient.getClients();
      const client = clientsResponse.clients?.find(c => c.telegram_id === userId);
      if (client && client.custom_price_kaspa !== null && client.custom_price_kaspa !== undefined) {
        customPrice = client.custom_price_kaspa;
      }
    } catch (error) {
      console.error('Ошибка получения индивидуальной цены:', error);
    }
  }

  // Вызываем соответствующий обработчик
  switch (paymentMethod) {
    case 'stars':
      await handleTelegramStars(bot, chatId, userId, plan, planData);
      break;
    case 'ton':
      await handleTONConnect(bot, chatId, userId, plan, planData);
      break;
    case 'usdt':
      await handleUSDT(bot, chatId, userId, plan, planData);
      break;
    case 'kaspa':
      await handleKaspa(bot, chatId, userId, plan, planData, customPrice);
      break;
    default:
      bot.sendMessage(chatId, '❌ Неизвестный метод оплаты');
  }
}

export default {
  showPaymentMethods,
  showSubscriptionPlans,
  handlePaymentPlan,
  SUBSCRIPTION_PLANS
};
