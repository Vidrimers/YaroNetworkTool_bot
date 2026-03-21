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
import sqlite3 from 'sqlite3';
import APIClient from "./utils/api-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const execAsync = promisify(exec);

// Загружаем .env
dotenv.config({ path: join(__dirname, '..', '.env') });

const XRAY_API_PORT = process.env.XRAY_API_PORT || 10085;
const DB_PATH = process.env.DB_PATH || '/home/xray-vpn/database/vpn.db';

const apiClient = new APIClient();

// --- Вспомогательные функции для работы со снапшотами ---

/**
 * Инициализация таблицы снапшотов (если не существует)
 */
async function initSnapshotTable(db) {
  await db.run(`
    CREATE TABLE IF NOT EXISTS xray_stats_snapshot (
      client_uuid TEXT PRIMARY KEY,
      bytes_uplink INTEGER NOT NULL DEFAULT 0,
      bytes_downlink INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )
  `);
}

/**
 * Получить последний снапшот для клиента
 */
async function getSnapshot(db, clientUuid) {
  return db.get(
    'SELECT * FROM xray_stats_snapshot WHERE client_uuid = ?',
    [clientUuid]
  );
}

/**
 * Сохранить снапшот абсолютных значений из Xray
 */
async function saveSnapshot(db, clientUuid, uplinkBytes, downlinkBytes) {
  await db.run(`
    INSERT INTO xray_stats_snapshot (client_uuid, bytes_uplink, bytes_downlink, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(client_uuid) DO UPDATE SET
      bytes_uplink = excluded.bytes_uplink,
      bytes_downlink = excluded.bytes_downlink,
      updated_at = excluded.updated_at
  `, [clientUuid, uplinkBytes, downlinkBytes, new Date().toISOString()]);
}

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

  const db = new sqlite3.Database(DB_PATH);
  db.run = promisify(db.run.bind(db));
  db.get = promisify(db.get.bind(db));
  db.all = promisify(db.all.bind(db));

  try {
    const TrafficLogModel = (await import('/home/xray-vpn/database/models/traffic-log.js')).default;
    const trafficLogModel = new TrafficLogModel(DB_PATH);

    // Создаём таблицу снапшотов если не существует
    await db.run(`
      CREATE TABLE IF NOT EXISTS xray_stats_snapshot (
        client_uuid TEXT PRIMARY KEY,
        bytes_uplink INTEGER NOT NULL DEFAULT 0,
        bytes_downlink INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      )
    `);

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

    let recorded = 0;

    for (const [clientName, currentAbsolute] of Object.entries(xrayStats)) {
      const uuid = nameToUuid.get(clientName);

      if (!uuid) {
        console.log(`[collectTrafficStats] UUID не найден для клиента: ${clientName}`);
        continue;
      }

      // Получаем предыдущий снапшот абсолютных значений из Xray
      const snapshot = await db.get(
        'SELECT * FROM xray_stats_snapshot WHERE client_uuid = ?',
        [uuid]
      );

      let deltaUplink, deltaDownlink;

      if (!snapshot) {
        // Первый запуск — просто сохраняем снапшот, не пишем дельту
        console.log(`[collectTrafficStats] ${clientName}: первый снапшот, пропускаем запись`);
      } else {
        // Считаем дельту от предыдущего абсолютного значения
        // Если Xray перезапустился (текущее < предыдущего) — берём текущее как дельту
        deltaUplink = currentAbsolute.uplink >= snapshot.bytes_uplink
          ? currentAbsolute.uplink - snapshot.bytes_uplink
          : currentAbsolute.uplink;

        deltaDownlink = currentAbsolute.downlink >= snapshot.bytes_downlink
          ? currentAbsolute.downlink - snapshot.bytes_downlink
          : currentAbsolute.downlink;

        const deltaTotal = deltaUplink + deltaDownlink;

        if (deltaTotal === 0) {
          console.log(`[collectTrafficStats] ${clientName}: нет изменений, пропускаем`);
        } else {
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
      }

      // Сохраняем новый снапшот в любом случае
      await db.run(`
        INSERT INTO xray_stats_snapshot (client_uuid, bytes_uplink, bytes_downlink, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(client_uuid) DO UPDATE SET
          bytes_uplink = excluded.bytes_uplink,
          bytes_downlink = excluded.bytes_downlink,
          updated_at = excluded.updated_at
      `, [uuid, currentAbsolute.uplink, currentAbsolute.downlink, new Date().toISOString()]);
    }

    console.log(`\n[collectTrafficStats] Записано статистики для ${recorded} клиентов`);
    console.log('[collectTrafficStats] Сбор завершен\n');

  } catch (error) {
    console.error('[collectTrafficStats] Ошибка:', error);
  } finally {
    db.close();
  }

  process.exit(0);
}

// Запускаем сбор
collectTrafficStats();
