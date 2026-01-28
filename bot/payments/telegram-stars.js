/**
 * Telegram Stars Payment Handler
 * Обработчик оплаты через Telegram Stars
 */

// Обработать оплату через Telegram Stars
export async function handleTelegramStars(bot, chatId, userId, plan, planData) {
  try {
    // Создаем инвойс для оплаты Stars
    const title = `VPN подписка - ${planData.name}`;
    const description = `Подписка на VPN сервис на ${planData.days} дней`;
    const payload = JSON.stringify({
      userId,
      plan,
      method: 'stars',
      timestamp: Date.now()
    });
    const currency = 'XTR'; // Telegram Stars
    const prices = [{ label: planData.name, amount: planData.price_stars }];

    await bot.sendInvoice(
      chatId,
      title,
      description,
      payload,
      '', // provider_token пустой для Stars
      currency,
      prices,
      {
        need_name: false,
        need_phone_number: false,
        need_email: false,
        need_shipping_address: false,
        is_flexible: false
      }
    );

  } catch (error) {
    console.error('[Telegram Stars] Ошибка создания инвойса:', error);
    bot.sendMessage(
      chatId,
      `❌ Ошибка создания платежа\n\n` +
        `Попробуй позже или выбери другой способ оплаты.`,
      { parse_mode: 'HTML' }
    );
  }
}

export default {
  handleTelegramStars
};
