/**
 * YuMoney Payment Handler
 * Обработчик оплаты через ЮMoney
 */

import crypto from 'crypto';

// Обработать оплату через ЮMoney
export async function handleYuMoney(bot, chatId, userId, plan, planData) {
  try {
    const YUMONEY_RECEIVER = process.env.YUMONEY_RECEIVER; // Номер кошелька ЮMoney
    const YUMONEY_SECRET = process.env.YUMONEY_SECRET; // Секретный ключ для проверки подписи
    
    if (!YUMONEY_RECEIVER) {
      bot.sendMessage(
        chatId,
        `❌ ЮMoney не настроен\n\n` +
          `Обратись к администратору для настройки.`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Генерируем уникальный ID платежа
    const paymentId = `vpn_${userId}_${plan}_${Date.now()}`;
    
    // Создаем платежную форму ЮMoney
    const paymentUrl = createYuMoneyPaymentUrl({
      receiver: YUMONEY_RECEIVER,
      quickpay_form: 'shop',
      targets: `VPN подписка - ${planData.name}`,
      paymentType: 'SB', // Оплата с банковской карты
      sum: planData.price_rub,
      label: paymentId, // Уникальный ID для идентификации платежа
      successURL: `https://t.me/${(await bot.getMe()).username}` // Возврат в бот после оплаты
    });

    const keyboard = {
      inline_keyboard: [
        [
          { text: '💳 Оплатить', url: paymentUrl }
        ],
        [
          { text: '❌ Отмена', callback_data: 'payment_cancel' }
        ]
      ]
    };

    bot.sendMessage(
      chatId,
      `💳 <b>Оплата через ЮMoney</b>\n\n` +
        `📦 Тариф: ${planData.name}\n` +
        `💰 Цена: ${planData.price_rub} ₽\n` +
        `📅 Срок: ${planData.days} дней\n\n` +
        `Нажми кнопку "Оплатить" для перехода на страницу оплаты.\n\n` +
        `<i>После успешной оплаты подписка будет автоматически продлена.</i>\n\n` +
        `<b>ID платежа:</b> <code>${paymentId}</code>`,
      { 
        parse_mode: 'HTML',
        reply_markup: keyboard
      }
    );

  } catch (error) {
    console.error('[YuMoney] Ошибка создания платежа:', error);
    bot.sendMessage(
      chatId,
      `❌ Ошибка создания платежа\n\n` +
        `Попробуй позже или выбери другой способ оплаты.`,
      { parse_mode: 'HTML' }
    );
  }
}

// Создать URL платежной формы ЮMoney
function createYuMoneyPaymentUrl(params) {
  const baseUrl = 'https://yoomoney.ru/quickpay/confirm.xml';
  const queryParams = new URLSearchParams(params);
  return `${baseUrl}?${queryParams.toString()}`;
}

// Проверить подпись уведомления от ЮMoney
export function verifyYuMoneyNotification(notification, secret) {
  if (!secret) {
    console.warn('[YuMoney] Секретный ключ не установлен, пропускаем проверку подписи');
    return true;
  }

  const {
    notification_type,
    operation_id,
    amount,
    currency,
    datetime,
    sender,
    codepro,
    label,
    sha1_hash
  } = notification;

  // Формируем строку для проверки подписи
  const str = [
    notification_type,
    operation_id,
    amount,
    currency,
    datetime,
    sender,
    codepro,
    secret,
    label
  ].join('&');

  // Вычисляем SHA-1 хеш
  const hash = crypto.createHash('sha1').update(str).digest('hex');

  return hash === sha1_hash;
}

// Обработать уведомление от ЮMoney (webhook)
export async function handleYuMoneyNotification(notification, apiClient, bot) {
  try {
    const YUMONEY_SECRET = process.env.YUMONEY_SECRET;

    // Проверяем подпись
    if (!verifyYuMoneyNotification(notification, YUMONEY_SECRET)) {
      console.error('[YuMoney] Неверная подпись уведомления');
      return { success: false, error: 'Invalid signature' };
    }

    // Проверяем что платеж успешен
    if (notification.codepro === 'true') {
      console.error('[YuMoney] Платеж защищен кодом протекции');
      return { success: false, error: 'Payment protected by code' };
    }

    // Если это тестовое уведомление - просто подтверждаем
    if (notification.test_notification === 'true' || !notification.label) {
      console.log('[YuMoney] Тестовое уведомление получено успешно');
      return { success: true, test: true };
    }

    // Извлекаем данные из label
    const label = notification.label; // vpn_userId_plan_timestamp
    const parts = label.split('_');
    
    if (parts.length < 3 || parts[0] !== 'vpn') {
      console.error('[YuMoney] Неверный формат label:', label);
      return { success: false, error: 'Invalid label format' };
    }

    const userId = parts[1];
    const plan = parts[2];

    console.log(`[YuMoney] Успешная оплата: пользователь ${userId}, план ${plan}, сумма ${notification.amount}₽`);

    // Получаем данные плана
    const { SUBSCRIPTION_PLANS } = await import('./payment-handler.js');
    const planData = SUBSCRIPTION_PLANS[plan];

    if (!planData) {
      console.error('[YuMoney] Неверный план:', plan);
      return { success: false, error: 'Invalid plan' };
    }

    // Проверяем сумму платежа
    if (parseFloat(notification.amount) < planData.price_rub) {
      console.error('[YuMoney] Недостаточная сумма платежа');
      return { success: false, error: 'Insufficient amount' };
    }

    // Продлеваем подписку через API
    await apiClient.extendSubscription(userId, planData.days);

    // Уведомляем пользователя
    try {
      await bot.sendMessage(
        userId,
        `✅ <b>Оплата прошла успешно!</b>\n\n` +
          `Твоя подписка продлена на ${planData.days} дней.\n` +
          `Спасибо за оплату! 🎉`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[YuMoney] Не удалось отправить уведомление пользователю:', err);
    }

    return { success: true };

  } catch (error) {
    console.error('[YuMoney] Ошибка обработки уведомления:', error);
    return { success: false, error: error.message };
  }
}

export default {
  handleYuMoney,
  verifyYuMoneyNotification,
  handleYuMoneyNotification
};
