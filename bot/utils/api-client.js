/**
 * API Client для взаимодействия с Management API
 * Task 8.3: HTTP клиент для Management API
 */

import https from "https";
import http from "http";

class APIClient {
  constructor(config = {}) {
    this.baseURL = config.baseURL || process.env.API_BASE_URL || `http://${process.env.SERVER_IP || "localhost"}:3000`;
    this.apiKey = config.apiKey || process.env.API_KEY;
    this.timeout = config.timeout || 10000;
  }

  /**
   * Выполнить HTTP запрос
   * @param {string} endpoint - API endpoint
   * @param {string} method - HTTP метод
   * @param {Object} data - Данные для отправки
   * @returns {Promise<Object>} - Ответ API
   */
  request(endpoint, method = "GET", data = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, this.baseURL);
      const isHttps = url.protocol === "https:";
      const httpModule = isHttps ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: method,
        headers: {
          "Content-Type": "application/json",
        },
        timeout: this.timeout,
      };

      // Добавить API ключ если доступен
      if (this.apiKey) {
        options.headers["Authorization"] = `Bearer ${this.apiKey}`;
      }

      const req = httpModule.request(options, (res) => {
        let responseData = "";

        res.on("data", (chunk) => {
          responseData += chunk;
        });

        res.on("end", () => {
          try {
            const parsed = JSON.parse(responseData);
            
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(parsed.error || parsed.message || `HTTP ${res.statusCode}`));
            }
          } catch (e) {
            // Если не JSON, вернуть как есть
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(responseData);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
            }
          }
        });
      });

      req.on("error", (err) => {
        reject(new Error(`Ошибка запроса: ${err.message}`));
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Таймаут запроса"));
      });

      // Отправить данные если есть
      if (data && (method === "POST" || method === "PUT")) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  // ============================================================================
  // УПРАВЛЕНИЕ КЛИЕНТАМИ
  // ============================================================================

  /**
   * Создать нового клиента
   * @param {Object} clientData - Данные клиента
   * @returns {Promise<Object>} - Созданный клиент
   */
  async createClient(clientData) {
    return this.request("/api/clients", "POST", clientData);
  }

  /**
   * Получить список всех клиентов
   * @returns {Promise<Array>} - Список клиентов
   */
  async getClients() {
    return this.request("/api/clients", "GET");
  }

  /**
   * Получить информацию о клиенте
   * @param {string} uuid - UUID клиента
   * @returns {Promise<Object>} - Информация о клиенте
   */
  async getClient(uuid) {
    return this.request(`/api/clients/${uuid}`, "GET");
  }

  /**
   * Удалить клиента
   * @param {string} uuid - UUID клиента
   * @returns {Promise<Object>} - Результат удаления
   */
  async deleteClient(uuid) {
    return this.request(`/api/clients/${uuid}`, "DELETE");
  }

  /**
   * Обновить клиента
   * @param {string} uuid - UUID клиента
   * @param {Object} updateData - Данные для обновления
   * @returns {Promise<Object>} - Обновленный клиент
   */
  async updateClient(uuid, updateData) {
    return this.request(`/api/clients/${uuid}`, "PUT", updateData);
  }

  // ============================================================================
  // ТРАФИК И СТАТИСТИКА
  // ============================================================================

  /**
   * Получить статистику трафика клиента
   * @param {string} uuid - UUID клиента
   * @returns {Promise<Object>} - Статистика трафика
   */
  async getClientTraffic(uuid) {
    return this.request(`/api/stats/clients/${uuid}/traffic`, "GET");
  }

  /**
   * Получить общий трафик клиента за период (с даты сброса)
   * @param {string} uuid - UUID клиента
   * @returns {Promise<Object>} - Общий трафик за период
   */
  async getClientTotalTraffic(uuid) {
    return this.request(`/api/clients/${uuid}/traffic-total`, "GET");
  }

  /**
   * Получить статистику трафика клиента (день/неделя/месяц)
   * @param {string} uuid - UUID клиента
   * @returns {Promise<Object>} - Статистика трафика
   */
  async getClientTrafficStats(uuid) {
    return this.request(`/api/clients/${uuid}/traffic-stats`, "GET");
  }

  /**
   * Получить статус клиента
   * @param {string} uuid - UUID клиента
   * @returns {Promise<Object>} - Статус клиента
   */
  async getClientStatus(uuid) {
    return this.request(`/api/stats/clients/${uuid}/status`, "GET");
  }

  /**
   * Сбросить месячный счетчик трафика
   * @param {string} uuid - UUID клиента
   * @returns {Promise<Object>} - Результат сброса
   */
  async resetClientTraffic(uuid) {
    return this.request(`/api/stats/clients/${uuid}/reset`, "POST");
  }

  /**
   * Получить активные подключения
   * @returns {Promise<Array>} - Список активных подключений
   */
  async getActiveConnections() {
    return this.request("/api/stats/active", "GET");
  }

  /**
   * Получить топ клиентов по трафику
   * @returns {Promise<Array>} - Топ клиентов
   */
  async getTopClients() {
    return this.request("/api/stats/top", "GET");
  }

  // ============================================================================
  // УПРАВЛЕНИЕ ПОДПИСКАМИ
  // ============================================================================

  /**
   * Получить информацию о подписке клиента
   * @param {string} uuid - UUID клиента
   * @returns {Promise<Object>} - Информация о подписке
   */
  async getClientSubscription(uuid) {
    return this.request(`/api/clients/${uuid}/subscription`, "GET");
  }

  /**
   * Продлить подписку клиента
   * @param {string} uuid - UUID клиента
   * @param {number} days - Количество дней
   * @returns {Promise<Object>} - Обновленная подписка
   */
  async extendSubscription(uuid, days) {
    return this.request(`/api/clients/${uuid}/extend`, "POST", { days });
  }

  /**
   * Заблокировать клиента
   * @param {string} uuid - UUID клиента
   * @param {string} reason - Причина блокировки
   * @returns {Promise<Object>} - Результат блокировки
   */
  async blockClient(uuid, reason) {
    return this.request(`/api/clients/${uuid}/block`, "POST", { reason });
  }

  /**
   * Разблокировать клиента
   * @param {string} uuid - UUID клиента
   * @returns {Promise<Object>} - Результат разблокировки
   */
  async unblockClient(uuid) {
    return this.request(`/api/clients/${uuid}/unblock`, "POST");
  }

  /**
   * Выдать предупреждение клиенту
   * @param {string} uuid - UUID клиента
   * @param {string} reason - Причина предупреждения
   * @returns {Promise<Object>} - Результат
   */
  async warnClient(uuid, reason) {
    return this.request(`/api/clients/${uuid}/warn`, "POST", { reason });
  }

  /**
   * Сбросить предупреждения клиента
   * @param {string} uuid - UUID клиента
   * @returns {Promise<Object>} - Результат
   */
  async resetClientWarnings(uuid) {
    return this.request(`/api/clients/${uuid}/reset-warnings`, "POST");
  }

  // ============================================================================
  // УПРАВЛЕНИЕ ЗАПРОСАМИ НА ПРОДЛЕНИЕ
  // ============================================================================

  /**
   * Создать запрос на продление
   * @param {Object} requestData - Данные запроса
   * @returns {Promise<Object>} - Созданный запрос
   */
  async createExtensionRequest(requestData) {
    return this.request("/api/extension-requests/create", "POST", requestData);
  }

  /**
   * Получить все запросы на продление
   * @returns {Promise<Array>} - Список запросов
   */
  async getExtensionRequests() {
    return this.request("/api/extension-requests", "GET");
  }

  /**
   * Получить запрос на продление по ID
   * @param {string} id - ID запроса
   * @returns {Promise<Object>} - Запрос
   */
  async getExtensionRequest(id) {
    return this.request(`/api/extension-requests/${id}`, "GET");
  }

  /**
   * Одобрить запрос на продление
   * @param {string} id - ID запроса
   * @param {number} days - Количество дней (опционально)
   * @param {number} adminTelegramId - Telegram ID админа
   * @returns {Promise<Object>} - Результат одобрения
   */
  async approveExtensionRequest(id, days = null, adminTelegramId = null) {
    const data = {
      admin_telegram_id: adminTelegramId
    };
    if (days) data.approved_days = days;
    return this.request(`/api/extension-requests/${id}/approve`, "POST", data);
  }

  /**
   * Отклонить запрос на продление
   * @param {string} id - ID запроса
   * @param {string} reason - Причина отказа
   * @param {number} adminTelegramId - Telegram ID админа
   * @returns {Promise<Object>} - Результат отказа
   */
  async denyExtensionRequest(id, reason, adminTelegramId = null) {
    return this.request(`/api/extension-requests/${id}/deny`, "POST", { 
      reason,
      admin_telegram_id: adminTelegramId
    });
  }

  /**
   * Изменить период запроса
   * @param {string} id - ID запроса
   * @param {number} days - Новое количество дней
   * @returns {Promise<Object>} - Обновленный запрос
   */
  async changeExtensionPeriod(id, days) {
    return this.request(`/api/extension-requests/${id}/period`, "PUT", { days });
  }

  /**
   * Получить запросы клиента
   * @param {string} uuid - UUID клиента
   * @returns {Promise<Array>} - Список запросов клиента
   */
  async getClientExtensionRequests(uuid) {
    return this.request(`/api/extension-requests/client/${uuid}`, "GET");
  }

  // ============================================================================
  // СИСТЕМНЫЕ ОПЕРАЦИИ
  // ============================================================================

  /**
   * Получить статус сервера
   * @returns {Promise<Object>} - Статус сервера
   */
  async getSystemStatus() {
    return this.request("/api/system/status", "GET");
  }

  /**
   * Создать резервную копию
   * @returns {Promise<Object>} - Результат создания бэкапа
   */
  async createBackup() {
    return this.request("/api/system/backup", "POST");
  }

  /**
   * Восстановить из резервной копии
   * @param {string} backupFile - Имя файла бэкапа
   * @returns {Promise<Object>} - Результат восстановления
   */
  async restoreBackup(backupFile) {
    return this.request("/api/system/restore", "POST", { backupFile });
  }

  /**
   * Получить системные логи
   * @param {number} lines - Количество строк
   * @returns {Promise<string>} - Логи
   */
  async getSystemLogs(lines = 100) {
    return this.request(`/api/system/logs?lines=${lines}`, "GET");
  }

  /**
   * Изменить лимит устройств для клиента
   * @param {string} uuid - UUID клиента
   * @param {number} maxDevices - Максимальное количество устройств (1-10)
   * @returns {Promise<Object>} - Обновленный клиент
   */
  async updateDeviceLimit(uuid, maxDevices) {
    return this.request(`/api/clients/${uuid}/device-limit`, "PUT", { max_devices: maxDevices });
  }
}

export default APIClient;
