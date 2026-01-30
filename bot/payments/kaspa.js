/**
 * Kaspa Payment Handler
 * Обработчик оплаты через Kaspa криптовалюту
 */

// Обработать оплату через Kaspa
export async function handleKaspa(bot, chatId, userId, plan, planData) {
  try {
    const KASPA_ADDRESS = process.env.KASPA_ADDRESS; // Адрес кошелька Kaspa
    
    if (!KASPA_ADDRESS) {
      bot.sendMessage(
        chatId,
        `❌ Kaspa не настроен\n\n` +
          `Обратись к администратору для настройки.`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Генерируем уникальный ID платежа
    const paymentId = `vpn_${userId}_${plan}_${Date.now()}`;
    
    // Сохраняем ожидаемый платеж (можно в БД или в памяти)
    // Для простоты пока просто показываем адрес
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ Я оплатил', callback_data: `kaspa_paid_${paymentId}` }
        ],
        [
          { text: '❌ Отмена', callback_data: 'payment_cancel' }
        ]
      ]
    };

    bot.sendMessage(
      chatId,
      `🔷 <b>Оплата через Kaspa</b>\n\n` +
        `📦 Тариф: ${planData.name}\n` +
        `💰 Цена: ${planData.price_kaspa} KAS\n` +
        `📅 Срок: ${planData.days} дней\n\n` +
        `<b>Адрес для оплаты:</b>\n` +
        `<code>${KASPA_ADDRESS}</code>\n\n` +
        `<b>Сумма:</b> <code>${planData.price_kaspa}</code> KAS\n\n` +
        `<b>ID платежа:</b> <code>${paymentId}</code>\n\n` +
        `<i>⚠️ Отправь точную сумму ${planData.price_kaspa} KAS на указанный адрес.\n` +
        `Нажми на адрес чтобы скопировать.\n` +
        `После отправки нажми "Я оплатил" для проверки платежа.</i>\n\n` +
        `<i>Проверка может занять 1-2 минуты.</i>`,
      { 
        parse_mode: 'HTML',
        reply_markup: keyboard
      }
    );

    // Сохраняем информацию о платеже для последующей проверки
    // В реальной системе это должно быть в БД
    global.pendingKaspaPayments = global.pendingKaspaPayments || {};
    global.pendingKaspaPayments[paymentId] = {
      userId,
      plan,
      amount: planData.price_kaspa,
      address: KASPA_ADDRESS,
      timestamp: Date.now(),
      status: 'pending'
    };

  } catch (error) {
    console.error('[Kaspa] Ошибка создания платежа:', error);
    bot.sendMessage(
      chatId,
      `❌ Ошибка создания платежа\n\n` +
        `Попробуй позже или выбери другой способ оплаты.`,
      { parse_mode: 'HTML' }
    );
  }
}

// Проверить платеж Kaspa через API
export async function checkKaspaPayment(paymentId, apiClient, bot) {
  try {
    const payment = global.pendingKaspaPayments?.[paymentId];
    
    if (!payment) {
      return { success: false, error: 'Payment not found' };
    }

    if (payment.status === 'completed') {
      return { success: false, error: 'Payment already completed' };
    }

    // Проверяем транзакции через Kaspa API
    const KASPA_API_URL = process.env.KASPA_API_URL || 'https://api.kaspa.org';
    const response = await fetch(`${KASPA_API_URL}/addresses/${payment.address}/transactions`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch Kaspa transactions');
    }

    const data = await response.json();
    const transactions = data.transactions || [];

    // Ищем транзакцию с нужной суммой после timestamp платежа
    const matchingTx = transactions.find(tx => {
      const txTime = new Date(tx.block_time).getTime();
      const txAmount = parseFloat(tx.outputs.find(o => o.script_public_key_address === payment.address)?.amount || 0) / 100000000; // Kaspa использует сомпи (1 KAS = 100000000 sompi)
      
      return txTime >= payment.timestamp && 
             Math.abs(txAmount - payment.amount) < 0.01; // Допуск 0.01 KAS
    });

    if (matchingTx) {
      console.log(`[Kaspa] Платеж подтвержден: ${paymentId}, tx: ${matchingTx.transaction_id}`);

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
        console.error('[Kaspa] Ошибка получения имени клиента:', err);
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
        console.error('[Kaspa] Не удалось отправить уведомление пользователю:', err);
      }

      // Уведомляем админа
      try {
        const TELEGRAM_ADMIN_ID = parseInt(process.env.TELEGRAM_ADMIN_ID);
        if (TELEGRAM_ADMIN_ID) {
          await bot.sendMessage(
            TELEGRAM_ADMIN_ID,
            `💰 <b>Новая оплата!</b>\n\n` +
              `👤 <b>Клиент:</b> ${clientName}\n` +
              `🔷 <b>Метод:</b> Kaspa\n` +
              `📦 <b>Тариф:</b> ${planData.name}\n` +
              `💵 <b>Сумма:</b> ${planData.price_kaspa} KAS\n` +
              `📅 <b>Продлено на:</b> ${planData.days} дней\n` +
              `🕐 <b>Время:</b> ${new Date().toLocaleString('ru-RU')}\n` +
              `🔗 <b>TX:</b> <code>${matchingTx.transaction_id}</code>`,
            { parse_mode: 'HTML' }
          );
        }
      } catch (err) {
        console.error('[Kaspa] Ошибка отправки уведомления админу:', err);
      }

      return { success: true, txId: matchingTx.transaction_id };
    }

    return { success: false, error: 'Payment not found in blockchain' };

  } catch (error) {
    console.error('[Kaspa] Ошибка проверки платежа:', error);
    return { success: false, error: error.message };
  }
}

export default {
  handleKaspa,
  checkKaspaPayment
};
