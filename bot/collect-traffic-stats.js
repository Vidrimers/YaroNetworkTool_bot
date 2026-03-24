#!/usr/bin/env node
/**
 * Traffic Stats Collector
 * Собирает статистику трафика из Xray Stats API и записывает в БД
 * Запускается по cron каждый час
 *
 * Логика:
 * - Xray хранит накопленные байты с момента своего запуска (абсолютные значения)
 * - Мы храним последнее абсолютное значение в таблице xray_stats_snapshot
 * - Дельта = текущее абсолютное - предыдущее абсолютное
 * - Если Xray перезапустился (текущее < предыдущего), берём текущее как дельту
 */

import dotenv from "dotenv";
import { exec } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';
import APIClient from "./utils/api-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const execAsync = promisify(exec);

// Загружаем .env
dotenv.config({ path: join(__dirname, '..', '.env') });

const XRAY_API_PORT = process.env.XRAY_API_PORT || 10085;
const DB_PATH = process.env.DB_PATH || '/home/xray-vpn/database/vpn.db';
// Файл для хранения абсолютных значений трафика из Xray между запусками
const SNAPSHOT_PATH = join(__dirname, '../data/xray-stats-snapshot.json');

const apiClient = new APIClient();

// --- Получение статистики из Xray ---

/**
 * Получить статистику трафика из Xray Stats API (абсолютные значения)
 */
async function getXrayStats() {
  try {
    const isWindows = process.platform === 'win32';
    if (isWindows) {
      console.log('[collectTrafficStats] Локальный запуск на Windows - сбор статистики недоступен');
      return {};
    }

    const { stdout } = await execAsync(
      `xray api statsquery --server=127.0.0.1:${XRAY_API_PORT}`
    );

    const response = JSON.parse(stdout);
    const stats = {};

    if (!response.stat || !Array.isArray(response.stat)) {
      console.log('[collectTrafficStats] Нет данных статистики в ответе API');
      return {};
    }

    // Формат: user>>>email>>>traffic>>>uplink / downlink
    for (const item of response.stat) {
      if (!item.name || !item.name.startsWith('user>>>')) continue;

      const parts = item.name.split('>>>');
      if (parts.length !== 4) continue;

      const email = parts[1];
      const direction = parts[3];
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

// --- Основная функция ---

/**
 * Основная функция сбора статистики
 */
async function collectTrafficStats() {
  console.log(`\n[${new Date().toISOString()}] Запуск сбора статистики трафика...`);

  try {
    const TrafficLogModel = (await import('/home/xray-vpn/database/models/traffic-log.js')).default;
    const trafficLogModel = new TrafficLogModel(DB_PATH);

    const clientsResponse = await apiClient.getClients();
    const clients = clientsResponse.clients || [];

    const nameToUuid = new Map();
    clients.forEach(client => nameToUuid.set(client.name, client.uuid));

    console.log(`[collectTrafficStats] Загружено клиентов: ${clients.length}`);

    const xrayStats = await getXrayStats();
    const statsCount = Object.keys(xrayStats).length;

    console.log(`[collectTrafficStats] Получено статистики для ${statsCount} клиентов`);

    if (statsCount === 0) {
      console.log('[collectTrafficStats] Нет данных статистики. Возможно Xray Stats API не включен.');
      console.log('[collectTrafficStats] Запусти: sudo bash scripts/enable-xray-stats.sh');
      return;
    }

    // Загружаем снапшоты из файла (абсолютные значения предыдущего запуска)
    let snapshots = {};
    try {
      const snapshotData = await fs.readFile(SNAPSHOT_PATH, 'utf8');
      snapshots = JSON.parse(snapshotData);
    } catch {
      console.log('[collectTrafficStats] Файл снапшотов не найден, первый запуск');
    }

    const newSnapshots = {};
    let recorded = 0;

    for (const [clientName, currentAbsolute] of Object.entries(xrayStats)) {
      const uuid = nameToUuid.get(clientName);

      if (!uuid) {
        console.log(`[collectTrafficStats] UUID не найден для клиента: ${clientName}`);
        continue;
      }

      // Сохраняем текущее абсолютное значение в новый снапшот
      newSnapshots[uuid] = { uplink: currentAbsolute.uplink, downlink: currentAbsolute.downlink };

      const prev = snapshots[uuid];

      if (!prev) {
        // Первый запуск — только сохраняем снапшот, дельту не пишем
        console.log(`[collectTrafficStats] ${clientName}: первый снапшот, пропускаем запись`);
        continue;
      }

      // Считаем дельту от предыдущего абсолютного значения
      // Если Xray перезапустился (текущее < предыдущего) — берём текущее как дельту
      const deltaUplink = currentAbsolute.uplink >= prev.uplink
        ? currentAbsolute.uplink - prev.uplink
        : currentAbsolute.uplink;

      const deltaDownlink = currentAbsolute.downlink >= prev.downlink
        ? currentAbsolute.downlink - prev.downlink
        : currentAbsolute.downlink;

      const deltaTotal = deltaUplink + deltaDownlink;

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

    // Сохраняем новые снапшоты в файл
    await fs.writeFile(SNAPSHOT_PATH, JSON.stringify(newSnapshots, null, 2));
    console.log(`[collectTrafficStats] Снапшоты сохранены: ${SNAPSHOT_PATH}`);

    console.log(`\n[collectTrafficStats] Записано статистики для ${recorded} клиентов`);
    console.log('[collectTrafficStats] Сбор завершен\n');

  } catch (error) {
    console.error('[collectTrafficStats] Ошибка:', error);
  }

  process.exit(0);
}

// Запускаем сбор
collectTrafficStats();
