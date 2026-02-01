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
import TrafficLogModel from "../../database/models/traffic-log.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const execAsync = promisify(exec);

// Загружаем .env
dotenv.config({ path: join(__dirname, '..', '.env') });

const DB_PATH = process.env.DB_PATH || join(__dirname, '..', '..', 'database', 'vpn.db');
const XRAY_API_PORT = process.env.XRAY_API_PORT || 10085;

const apiClient = new APIClient();
const trafficLogModel = new TrafficLogModel(DB_PATH);

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

    // Получаем список всех пользователей и их статистику
    const { stdout } = await execAsync(
      `xray api statsquery --server=127.0.0.1:${XRAY_API_PORT} -pattern "user>>>"`
    );

    const stats = {};
    const lines = stdout.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        // Формат: user>>>email>>>traffic>>>uplink: 12345
        // Формат: user>>>email>>>traffic>>>downlink: 67890
        const match = line.match(/user>>>(.+?)>>>traffic>>>(uplink|downlink):\s*(\d+)/);
        if (!match) continue;

        const email = match[1];
        const direction = match[2]; // uplink или downlink
        const bytes = parseInt(match[3]);

        if (!stats[email]) {
          stats[email] = { uplink: 0, downlink: 0 };
        }

        stats[email][direction] = bytes;
      } catch (err) {
        continue;
      }
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

    // Записываем статистику в БД
    const today = new Date().toISOString().split('T')[0];
    let recorded = 0;

    for (const [clientName, traffic] of Object.entries(xrayStats)) {
      const uuid = nameToUuid.get(clientName);
      
      if (!uuid) {
        console.log(`[collectTrafficStats] UUID не найден для клиента: ${clientName}`);
        continue;
      }

      try {
        await trafficLogModel.add({
          client_uuid: uuid,
          date: today,
          bytes_uploaded: traffic.uplink,
          bytes_downloaded: traffic.downlink,
          connections_count: 1
        });

        recorded++;
        console.log(`[collectTrafficStats] ${clientName}: ↑${(traffic.uplink / 1024 / 1024).toFixed(2)} MB ↓${(traffic.downlink / 1024 / 1024).toFixed(2)} MB`);
      } catch (err) {
        console.error(`[collectTrafficStats] Ошибка записи для ${clientName}:`, err.message);
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
