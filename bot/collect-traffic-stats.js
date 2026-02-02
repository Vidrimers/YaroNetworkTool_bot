#!/usr/bin/env node
/**
 * Traffic Stats Collector
 * Собирает статистику трафика из Xray Stats API и записывает в БД
 * Запускается по cron каждый час
 */

import dotenv from "dotenv";
import { exec } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import APIClient from "./utils/api-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const execAsync = promisify(exec);

// Загружаем .env
dotenv.config({ path: join(__dirname, '..', '.env') });

const XRAY_API_PORT = process.env.XRAY_API_PORT || 10085;

const apiClient = new APIClient();

/**
 * Получить статистику трафика из Xray Stats API
 */
async function getXrayStats() {
  try {
    // Проверяем платформу
    const isWindows = process.platform === 'win32';
    if (isWindows) {
      console.log('[collectTrafficStats] Локальный запуск на Windows - сбор статистики недоступен');
      return {};
    }

    // Получаем статистику из Xray API
    const { stdout } = await execAsync(
      `xray api statsquery --server=127.0.0.1:${XRAY_API_PORT}`
    );

    // Парсим JSON ответ
    const response = JSON.parse(stdout);
    const stats = {};

    if (!response.stat || !Array.isArray(response.stat)) {
      console.log('[collectTrafficStats] Нет данных статистики в ответе API');
      return {};
    }

    // Обрабатываем каждую запись статистики
    for (const item of response.stat) {
      if (!item.name || !item.name.startsWith('user>>>')) continue;

      // Формат: user>>>email>>>traffic>>>uplink или user>>>email>>>traffic>>>downlink
      const parts = item.name.split('>>>');
      if (parts.length !== 4) continue;

      const email = parts[1];
      const direction = parts[3]; // uplink или downlink
      const bytes = parseInt(item.value) || 0;

      if (!stats[email]) {
        stats[email] = { uplink: 0, downlink: 0 };
      }

      stats[email][direction] = bytes;
    }

    return stats;
  } catch (error) {
    console.error('[collectTrafficStats] Ошибка получения статистики из Xray:', error.message);
    return {};
  }
}

/**
 * Основная функция сбора статистики
 */
async function collectTrafficStats() {
  console.log(`\n[${new Date().toISOString()}] Запуск сбора статистики трафика...`);

  try {
    // Динамически импортируем TrafficLogModel с абсолютным путем
    const TrafficLogModel = (await import('/home/xray-vpn/database/models/traffic-log.js')).default;
    const DB_PATH = process.env.DB_PATH || '/home/xray-vpn/database/vpn.db';
    const trafficLogModel = new TrafficLogModel(DB_PATH);

    // Получаем всех клиентов
    const clientsResponse = await apiClient.getClients();
    const clients = clientsResponse.clients || [];

    // Создаем маппинг имя -> UUID
    const nameToUuid = new Map();
    clients.forEach(client => {
      nameToUuid.set(client.name, client.uuid);
    });

    console.log(`[collectTrafficStats] Загружено клиентов: ${clients.length}`);

    // Получаем статистику из Xray
    const xrayStats = await getXrayStats();
    const statsCount = Object.keys(xrayStats).length;

    console.log(`[collectTrafficStats] Получено статистики для ${statsCount} клиентов`);

    if (statsCount === 0) {
      console.log('[collectTrafficStats] Нет данных статистики. Возможно Xray Stats API не включен.');
      console.log('[collectTrafficStats] Запусти: sudo bash scripts/enable-xray-stats.sh');
      return;
    }

    // Получаем предыдущие значения для расчета дельты
    const previousStats = new Map();
    for (const client of clients) {
      try {
        const lastRecord = await trafficLogModel.getLastRecord(client.uuid);
        if (lastRecord) {
          previousStats.set(client.uuid, {
            uplink: lastRecord.bytes_uploaded,
            downlink: lastRecord.bytes_downloaded,
            total: lastRecord.bytes_total
          });
        }
      } catch (err) {
        console.log(`[collectTrafficStats] Нет предыдущих записей для ${client.name}`);
      }
    }

    // Записываем статистику в БД
    let recorded = 0;

    for (const [clientName, traffic] of Object.entries(xrayStats)) {
      const uuid = nameToUuid.get(clientName);
      
      if (!uuid) {
        console.log(`[collectTrafficStats] UUID не найден для клиента: ${clientName}`);
        continue;
      }

      // Получаем предыдущие значения
      const prev = previousStats.get(uuid) || { uplink: 0, downlink: 0, total: 0 };
      
      // Считаем дельту (разницу с предыдущим значением)
      // Если счетчик Xray сбросился (перезапуск), берем текущее значение
      const deltaUplink = traffic.uplink >= prev.uplink 
        ? traffic.uplink - prev.uplink 
        : traffic.uplink;
      
      const deltaDownlink = traffic.downlink >= prev.downlink 
        ? traffic.downlink - prev.downlink 
        : traffic.downlink;
      
      const deltaTotal = deltaUplink + deltaDownlink;

      // Пропускаем если нет изменений
      if (deltaTotal === 0) {
        console.log(`[collectTrafficStats] ${clientName}: нет изменений, пропускаем`);
        continue;
      }

      try {
        console.log(`[collectTrafficStats] Запись для ${clientName} (${uuid})`);
        console.log(`[collectTrafficStats]   Дельта: ↑${(deltaUplink / 1024 / 1024).toFixed(2)} MB ↓${(deltaDownlink / 1024 / 1024).toFixed(2)} MB`);
        
        const result = await trafficLogModel.addHourly({
          client_uuid: uuid,
          bytes_uploaded: deltaUplink,
          bytes_downloaded: deltaDownlink,
          bytes_total: deltaTotal,
          connections_count: 1
        });

        console.log(`[collectTrafficStats]   ✅ Записано, ID: ${result.id}`);
        recorded++;
      } catch (err) {
        console.error(`[collectTrafficStats] ❌ Ошибка записи для ${clientName}:`, err.message);
      }
    }

    console.log(`\n[collectTrafficStats] Записано статистики для ${recorded} клиентов`);
    console.log('[collectTrafficStats] Сбор завершен\n');

  } catch (error) {
    console.error('[collectTrafficStats] Ошибка:', error);
  }

  process.exit(0);
}

// Запускаем сбор
collectTrafficStats();
