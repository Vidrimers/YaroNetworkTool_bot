/**
 * USDT Payment Handler
 * Обработчик оплаты через USDT (TRC-20)
 */

// Обработать оплату через USDT
export async function handleUSDT(bot, chatId, userId, plan, planData) {
  try {
    const USDT_ADDRESS = process.env.USDT_ADDRESS; // Адрес кошелька TRON для USDT
    
    if (!USDT_ADDRESS) {
      bot.sendMessage(
        chatId,
        `❌ USDT не настроен\n\n` +
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
          { text: '✅ Я оплатил', callback_data: `usdt_paid_${paymentId}` }
        ],
        [
          { text: '❌ Отмена', callback_data: 'payment_cancel' }
        ]
      ]
    };

    bot.sendMessage(
      chatId,
      `💵 <b>Оплата через USDT (TRC-20)</b>\n\n` +
        `📦 Тариф: ${planData.name}\n` +
        `💰 Цена: ${planData.price_usdt} USDT\n` +
        `📅 Срок: ${planData.days} дней\n\n` +
        `<b>Адрес для оплаты (TRC-20):</b>\n` +
        `<code>${USDT_ADDRESS}</code>\n\n` +
        `<b>Сумма:</b> <code>${planData.price_usdt}</code> USDT\n\n` +
        `<b>ID платежа:</b> <code>${paymentId}</code>\n\n` +
        `<i>⚠️ ВАЖНО: Используй только сеть TRC-20 (TRON)!\n` +
        `Отправь точную сумму ${planData.price_usdt} USDT на указанный адрес.\n` +
        `Нажми на адрес чтобы скопировать.\n` +
        `После отправки нажми "Я оплатил" для проверки платежа.</i>\n\n` +
        `<i>Проверка может занять 1-2 минуты.</i>`,
      { 
        parse_mode: 'HTML',
        reply_markup: keyboard
      }
    );

    // Сохраняем информацию о платеже
    global.pendingUSDTPayments = global.pendingUSDTPayments || {};
    global.pendingUSDTPayments[paymentId] = {
      userId,
      plan,
      amount: planData.price_usdt,
      address: USDT_ADDRESS,
      timestamp: Date.now(),
      status: 'pending'
    };

  } catch (error) {
    console.error('[USDT] Ошибка создания платежа:', error);
    bot.sendMessage(
      chatId,
      `❌ Ошибка создания платежа\n\n` +
        `Попробуй позже или выбери другой способ оплаты.`,
      { parse_mode: 'HTML' }
    );
  }
}

// Проверить платеж USDT через TronGrid API
export async function checkUSDTPayment(paymentId, apiClient, bot) {
  try {
    const payment = global.pendingUSDTPayments?.[paymentId];
    
    if (!payment) {
      return { success: false, error: 'Payment not found' };
    }

    if (payment.status === 'completed') {
      return { success: false, error: 'Payment already completed' };
    }

    // USDT TRC-20 contract address
    const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
    
    // Проверяем транзакции через TronGrid API
    const TRON_API_URL = process.env.TRON_API_URL || 'https://api.trongrid.io';
    const response = await fetch(
      `${TRON_API_URL}/v1/accounts/${payment.address}/transactions/trc20?limit=20&contract_address=${USDT_CONTRACT}`,
      {
        headers: {
          'TRON-PRO-API-KEY': process.env.TRON_API_KEY || ''
        }
      }
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch USDT transactions');
    }

    const data = await response.json();
    const transactions = data.data || [];

    // Ищем транзакцию с нужной суммой после timestamp платежа
    const matchingTx = transactions.find(tx => {
      const txTime = tx.block_timestamp;
      const txAmount = parseFloat(tx.value) / 1000000; // USDT использует 6 decimals
      const toAddress = tx.to;
      
      return toAddress === payment.address &&
             txTime >= payment.timestamp && 
             Math.abs(txAmount - payment.amount) < 0.01; // Допуск 0.01 USDT
    });

    if (matchingTx) {
      console.log(`[USDT] Платеж подтвержден: ${paymentId}, tx: ${matchingTx.transaction_id}`);

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
      payment.txId = matchingTx.transaction_id;

      // Получаем информацию о клиенте для уведомления админа
      let clientName = `ID: ${payment.userId}`;
      try {
        const clientsResponse = await apiClient.getClients();
        const client = clientsResponse.clients?.find(c => c.telegram_id === payment.userId);
        if (client) clientName = client.name;
      } catch (err) {
        console.error('[USDT] Ошибка получения имени клиента:', err);
      }

      // Уведомляем пользователя
      try {
        await bot.sendMessage(
          payment.userId,
          `✅ <b>Оплата подтверждена!</b>\n\n` +
            `Твоя подписка продлена на ${planData.days} дней.\n` +
            `Спасибо за оплату! 🎉\n\n` +
            `<b>TX ID:</b> <code>${matchingTx.transaction_id}</code>`,
          { parse_mode: 'HTML' }
        );
      } catch (err) {
        console.error('[USDT] Не удалось отправить уведомление пользователю:', err);
      }

      // Уведомляем админа
      try {
        const TELEGRAM_ADMIN_ID = parseInt(process.env.TELEGRAM_ADMIN_ID);
        if (TELEGRAM_ADMIN_ID) {
          await bot.sendMessage(
            TELEGRAM_ADMIN_ID,
            `💰 <b>Новая оплата!</b>\n\n` +
              `👤 <b>Клиент:</b> ${clientName}\n` +
              `💵 <b>Метод:</b> USDT (TRC-20)\n` +
              `📦 <b>Тариф:</b> ${planData.name}\n` +
              `💵 <b>Сумма:</b> ${planData.price_usdt} USDT\n` +
              `📅 <b>Продлено на:</b> ${planData.days} дней\n` +
              `🕐 <b>Время:</b> ${new Date().toLocaleString('ru-RU')}\n` +
              `🔗 <b>TX:</b> <code>${matchingTx.transaction_id}</code>`,
            { parse_mode: 'HTML' }
          );
        }
      } catch (err) {
        console.error('[USDT] Ошибка отправки уведомления админу:', err);
      }

      return { success: true, txId: matchingTx.transaction_id };
    }

    return { success: false, error: 'Payment not found in blockchain' };

  } catch (error) {
    console.error('[USDT] Ошибка проверки платежа:', error);
    return { success: false, error: error.message };
  }
}

export default {
  handleUSDT,
  checkUSDTPayment
};
