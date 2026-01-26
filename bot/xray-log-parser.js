#!/usr/bin/env node
/**
 * X-Ray Log Parser
 * Парсит логи X-Ray для подсчета трафика клиентов
 * Сохраняет данные в таблицу traffic_logs
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import APIClient from "./utils/api-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const XRAY_LOG_PATH = process.env.XRAY_LOG_PATH || '/var/log/xray/access.log';
const apiClient = new APIClient();

// Парсинг одной строки лога X-Ray
function parseLogLine(line) {
  try {
    // Пример формата лога X-Ray:
    // 2024/01/26 10:30:45 [Info] [UUID] accepted connection from 1.2.3.4:12345
    // 2024/01/26 10:30:50 [Info] [UUID] connection closed, sent: 1024 bytes, received: 2048 bytes
    
    // Ищем строки с информацией о закрытии соединения
    const closedMatch = line.match(/\[(\w{8}-\w{4}-\w{4}-\w{4}-\w{12})\].*connection closed.*sent:\s*(\d+)\s*bytes.*received:\s*(\d+)\s*bytes/i);
    
    if (closedMatch) {
      const uuid = closedMatch[1];
      const sentBytes = parseInt(closedMatch[2]);
      const receivedBytes = parseInt(closedMatch[3]);
      const totalBytes = sentBytes + receivedBytes;
      
      return {
        uuid,
        sentBytes,
        receivedBytes,
        totalBytes,
        timestamp: new Date()
      };
    }
    
    return null;
  } catch (error) {
    console.error('Ошибка парсинга строки:', error.message);
    return null;
  }
}

// Агрегация трафика по клиентам
function aggregateTraffic(logEntries) {
  const trafficByClient = {};
  
  for (const entry of logEntries) {
    if (!entry) continue;
    
    if (!trafficByClient[entry.uuid]) {
      trafficByClient[entry.uuid] = {
        uuid: entry.uuid,
        uploaded: 0,
        downloaded: 0,
        total: 0,
        connections: 0
      };
    }
    
    trafficByClient[entry.uuid].uploaded += entry.sentBytes;
    trafficByClient[entry.uuid].downloaded += entry.receivedBytes;
    trafficByClient[entry.uuid].total += entry.totalBytes;
    trafficByClient[entry.uuid].connections += 1;
  }
  
  return Object.values(trafficByClient);
}

// Основная функция парсинга логов
async function parseXrayLogs() {
  console.log(`\n[${new Date().toISOString()}] Запуск парсера логов X-Ray...`);
  console.log(`Файл логов: ${XRAY_LOG_PATH}`);
  
  try {
    // Читаем файл логов
    const logContent = readFileSync(XRAY_LOG_PATH, 'utf-8');
    const lines = logContent.split('\n');
    
    console.log(`Прочитано строк: ${lines.length}`);
    
    // Парсим каждую строку
    const logEntries = lines.map(parseLogLine).filter(entry => entry !== null);
    
    console.log(`Найдено записей о трафике: ${logEntries.length}`);
    
    if (logEntries.length === 0) {
      console.log('Нет данных для обработки');
      return;
    }
    
    // Агрегируем трафик по клиентам
    const trafficData = aggregateTraffic(logEntries);
    
    console.log(`\nОбработано клиентов: ${trafficData.length}`);
    
    // Обновляем трафик через API
    let successCount = 0;
    let errorCount = 0;
    
    for (const data of trafficData) {
      try {
        // Получаем текущие данные клиента
        const response = await apiClient.getClient(data.uuid);
        const client = response.client;
        
        // Конвертируем байты в GB
        const trafficGB = data.total / (1024 * 1024 * 1024);
        const newTrafficUsed = (client.traffic_used_gb || 0) + trafficGB;
        
        // Обновляем трафик
        await apiClient.updateClient(data.uuid, {
          traffic_used_gb: newTrafficUsed
        });
        
        successCount++;
        console.log(`✅ ${client.name}: +${trafficGB.toFixed(3)} GB (всего: ${newTrafficUsed.toFixed(2)} GB)`);
        
      } catch (err) {
        errorCount++;
        console.error(`❌ Ошибка обновления трафика для ${data.uuid}:`, err.message);
      }
    }
    
    console.log(`\nИтого:`);
    console.log(`- Успешно обновлено: ${successCount}`);
    console.log(`- Ошибок: ${errorCount}`);
    console.log(`Парсинг завершен\n`);
    
  } catch (error) {
    console.error('Ошибка парсинга логов:', error);
    process.exit(1);
  }
}

// Запускаем парсер
parseXrayLogs();
