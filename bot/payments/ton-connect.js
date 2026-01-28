/**
 * TON Connect Payment Handler
 * Обработчик оплаты через TON криптовалюту
 */

// Обработать оплату через TON
export async function handleTONConnect(bot, chatId, userId, plan, planData) {
  try {
    const TON_ADDRESS = process.env.TON_ADDRESS; // Адрес кошелька TON
    
    if (!TON_ADDRESS) {
      bot.sendMessage(
        chatId,
        `❌ TON Connect не настроен\n\n` +
          `Обратись к администратору для настройки.`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Генерируем уникальный ID платежа
    const paymentId = `vpn_${userId}_${plan}_${Date.now()}`;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ Я оплатил', callback_data: `ton_paid_${paymentId}` }
        ],
        [
          { text: '❌ Отмена', callback_data: 'payment_cancel' }
        ]
      ]
    };

    bot.sendMessage(
      chatId,
      `💎 <b>Оплата через TON</b>\n\n` +
        `📦 Тариф: ${planData.name}\n` +
        `💰 Цена: ${planData.price_ton} TON\n` +
        `📅 Срок: ${planData.days} дней\n\n` +
        `<b>Адрес для оплаты:</b>\n` +
        `<code>${TON_ADDRESS}</code>\n\n` +
        `<b>Сумма:</b> <code>${planData.price_ton}</code> TON\n\n` +
        `<b>ID платежа:</b> <code>${paymentId}</code>\n\n` +
        `<i>⚠️ Отправь точную сумму ${planData.price_ton} TON на указанный адрес.\n` +
        `Нажми на адрес чтобы скопировать.\n` +
        `После отправки нажми "Я оплатил" для проверки платежа.</i>\n\n` +
        `<i>Проверка может занять 1-2 минуты.</i>`,
      { 
        parse_mode: 'HTML',
        reply_markup: keyboard
      }
    );

    // Сохраняем информацию о платеже
    global.pendingTONPayments = global.pendingTONPayments || {};
    global.pendingTONPayments[paymentId] = {
      userId,
      plan,
      amount: planData.price_ton,
      address: TON_ADDRESS,
      timestamp: Date.now(),
      status: 'pending'
    };

  } catch (error) {
    console.error('[TON] Ошибка создания платежа:', error);
    bot.sendMessage(
      chatId,
      `❌ Ошибка создания платежа\n\n` +
        `Попробуй позже или выбери другой способ оплаты.`,
      { parse_mode: 'HTML' }
    );
  }
}

// Проверить платеж TON через API
export async function checkTONPayment(paymentId, apiClient, bot) {
  try {
    const payment = global.pendingTONPayments?.[paymentId];
    
    if (!payment) {
      return { success: false, error: 'Payment not found' };
    }

    if (payment.status === 'completed') {
      return { success: false, error: 'Payment already completed' };
    }

    // Проверяем транзакции через TON API
    const TON_API_URL = process.env.TON_API_URL || 'https://toncenter.com/api/v2';
    const response = await fetch(`${TON_API_URL}/getTransactions?address=${payment.address}&limit=10`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch TON transactions');
    }

    const data = await response.json();
    const transactions = data.result || [];

    // Ищем транзакцию с нужной суммой после timestamp платежа
    const matchingTx = transactions.find(tx => {
      if (!tx.in_msg || !tx.in_msg.value) return false;
      
      const txTime = tx.utime * 1000; // TON использует unix timestamp в секундах
      const txAmount = parseFloat(tx.in_msg.value) / 1000000000; // TON использует nanotons (1 TON = 1000000000 nanotons)
      
      return txTime >= payment.timestamp && 
             Math.abs(txAmount - payment.amount) < 0.01; // Допуск 0.01 TON
    });

    if (matchingTx) {
      console.log(`[TON] Платеж подтвержден: ${paymentId}, tx: ${matchingTx.transaction_id.hash}`);

      // Получаем данные плана
      const { SUBSCRIPTION_PLANS } = await import('./payment-handler.js');
      const planData = SUBSCRIPTION_PLANS[payment.plan];

      if (!planData) {
        throw new Error('Invalid plan');
      }

      // Продлеваем подписку
      await apiClient.extendSubscription(payment.userId, planData.days);

      // Обновляем статус платежа
      payment.status = 'completed';
      payment.txId = matchingTx.transaction_id.hash;

      // Уведомляем пользователя
      try {
        await bot.sendMessage(
          payment.userId,
          `✅ <b>Оплата подтверждена!</b>\n\n` +
            `Твоя подписка продлена на ${planData.days} дней.\n` +
            `Спасибо за оплату! 🎉\n\n` +
            `<b>TX Hash:</b> <code>${matchingTx.transaction_id.hash}</code>`,
          { parse_mode: 'HTML' }
        );
      } catch (err) {
        console.error('[TON] Не удалось отправить уведомление пользователю:', err);
      }

      return { success: true, txId: matchingTx.transaction_id.hash };
    }

    return { success: false, error: 'Payment not found in blockchain' };

  } catch (error) {
    console.error('[TON] Ошибка проверки платежа:', error);
    return { success: false, error: error.message };
  }
}

export default {
  handleTONConnect,
  checkTONPayment
};
