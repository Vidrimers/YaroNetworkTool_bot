/**
 * Генератор vless:// ссылок для подключения к VPN
 */

/**
 * Генерирует vless:// ссылку для клиента
 * @param {Object} params - Параметры для генерации ссылки
 * @param {string} params.uuid - UUID клиента
 * @param {string} params.serverIp - IP адрес сервера
 * @param {number} params.port - Порт сервера (по умолчанию 8443)
 * @param {string} params.publicKey - Public Key для Reality
 * @param {string} params.shortId - Short ID для Reality
 * @param {string} params.sni - Server Name Indication (по умолчанию www.microsoft.com)
 * @param {string} params.clientName - Имя клиента для отображения
 * @returns {string} vless:// ссылка
 */
export function generateVlessLink({
  uuid,
  serverIp,
  port = 8443,
  publicKey,
  shortId,
  sni = 'www.microsoft.com',
  clientName = 'MyVPN'
}) {
  // Валидация обязательных параметров
  if (!uuid || !serverIp || !publicKey || !shortId) {
    throw new Error('Missing required parameters for vless link generation');
  }

  // Формируем параметры ссылки
  const params = new URLSearchParams({
    encryption: 'none',
    flow: '',
    security: 'reality',
    sni: sni,
    fp: 'chrome',
    pbk: publicKey,
    sid: shortId,
    type: 'xhttp',
    host: ''
  });

  // Формируем vless:// ссылку
  const vlessLink = `vless://${uuid}@${serverIp}:${port}?${params.toString()}#${encodeURIComponent(clientName)}`;

  return vlessLink;
}

/**
 * Генерирует QR код для vless ссылки (placeholder)
 * В будущем можно добавить генерацию реального QR кода
 */
export function generateQRCode(vlessLink) {
  // TODO: Реализовать генерацию QR кода
  return null;
}

export default {
  generateVlessLink,
  generateQRCode
};
