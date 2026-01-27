#!/usr/bin/env node
/**
 * X-Ray Stats Collector
 * Собирает статистику трафика через API X-Ray и обновляет базу данных
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import APIClient from './utils/api-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем .env из родительской директории
dotenv.config({ path: join(__dirname, '../.env') });

const execAsync = promisify(exec);

const API_ENDPOINT = '127.0.0.1:10085';

/**
 * Получить статистику пользователя через xray API
 */
async function getUserStats(email) {
  try {
    const command = `xray api statsquery --server=${API_ENDPOINT} --pattern="user>>>${email}>>>"`;
    const { stdout } = await execAsync(command);
    
    const stats = {
      uplink: 0,
      downlink: 0
    };
    
    // Парсим JSON вывод
    try {
      const data = JSON.parse(stdout);
      if (data.stat && Array.isArray(data.stat)) {
        for (const item of data.stat) {
          if (item.name && item.name.includes('uplink')) {
            stats.uplink = parseInt(item.value) || 0;
          }
          if (item.name && item.name.includes('downlink')) {
            stats.downlink = parseInt(item.value) || 0;
          }
        }
      }
    } catch (parseError) {
      console.error(`Ошибка парсинга JSON для ${email}:`, parseError.message);
      return null;
    }
    
    return stats;
  } catch (error) {
    console.error(`Ошибка получения статистики для ${email}:`, error.message);
    return null;
  }
}

/**
 * Основная функция
 */
async function main() {
  console.log(`[${new Date().toISOString()}] Запуск сборщика статистики X-Ray...`);
  
  const apiClient = new APIClient();
  
  try {
    // Получаем список всех клиентов
    const response = await apiClient.getClients();
    const clients = response.clients || [];
    
    console.log(`Найдено клиентов: ${clients.length}`);
    
    let updated = 0;
    
    for (const client of clients) {
      // Используем имя клиента как email (так настроено в конфиге)
      const email = client.name;
      
      if (!email) {
        console.log(`Пропуск клиента ${client.uuid}: нет имени`);
        continue;
      }
      
      // Получаем статистику
      const stats = await getUserStats(email);
      
      if (!stats) {
        console.log(`Пропуск клиента ${email}: не удалось получить статистику`);
        continue;
      }
      
      // Вычисляем общий трафик в GB
      const totalBytes = stats.uplink + stats.downlink;
      const totalGB = totalBytes / (1024 * 1024 * 1024);
      
      console.log(`${email}: ${totalGB.toFixed(3)} GB (↑${(stats.uplink / 1024 / 1024 / 1024).toFixed(3)} GB, ↓${(stats.downlink / 1024 / 1024 / 1024).toFixed(3)} GB)`);
      
      // Обновляем в базе данных
      try {
        await apiClient.updateClient(client.uuid, {
          traffic_used_gb: totalGB
        });
        updated++;
      } catch (updateError) {
        console.error(`Ошибка обновления клиента ${email}:`, updateError.message);
      }
    }
    
    console.log(`Обновлено клиентов: ${updated}/${clients.length}`);
    console.log('Готово!');
    
  } catch (error) {
    console.error('Ошибка:', error.message);
    process.exit(1);
  }
}

main();
