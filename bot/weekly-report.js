#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';
import APIClient from "./utils/api-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
const apiClient = new APIClient();

// Форматирование даты
function formatDate(date) {
  return date.toLocaleDateString('ru-RU', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  });
}

// Генерация недельного отчета
async function generateWeeklyReport() {
  console.log(`\n[${new Date().toISOString()}] Генерация недельного отчета...`);
  
  try {
    // Получаем всех клиентов
    const response = await apiClient.getClients();
    const clients = response.clients || [];
    
    if (clients.length === 0) {
      console.log('Нет клиентов для отчета');
      return;
    }
    
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Статистика за неделю
    let totalTraffic = 0;
    let activeClients = 0;
    let blockedClients = 0;
    let expiringClients = [];
    let topClients = [];
    let newClients = [];
    
    for (const client of clients) {
      // Общий трафик
      totalTraffic += client.traffic_used_gb || 0;
      
      // Активные клиенты
      if (!client.is_blocked) {
        activeClients++;
      } else {
        blockedClients++;
      }
      
      // Истекающие подписки (в течение 7 дней)
      const daysLeft = Math.ceil((new Date(client.subscription_end) - now) / (1000 * 60 * 60 * 24));
      if (daysLeft > 0 && daysLeft <= 7) {
        expiringClients.push({
          name: client.name,
          daysLeft,
          telegram_id: client.telegram_id
        });
      }
      
      // Новые клиенты (созданы за последние 7 дней)
      const createdAt = new Date(client.created_at);
      if (createdAt >= weekAgo) {
        newClients.push({
          name: client.name,
          created_at: formatDate(createdAt),
          traffic: client.traffic_used_gb || 0
        });
      }
      
      // Топ клиентов по трафику
      topClients.push({
        name: client.name,
        traffic: client.traffic_used_gb || 0,
        limit: client.traffic_limit_gb || 100
      });
    }
    
    // Сортируем топ клиентов
    topClients.sort((a, b) => b.traffic - a.traffic);
    topClients = topClients.slice(0, 5);
    
    // Средний трафик на клиента
    const avgTraffic = clients.length > 0 ? (totalTraffic / clients.length).toFixed(2) : 0;
    
    // Формируем отчет
    let report = `📊 *НЕДЕЛЬНЫЙ ОТЧЕТ*\n`;
    report += `Период: ${formatDate(weekAgo)} - ${formatDate(now)}\n\n`;
    
    report += `📈 *ОБЩАЯ СТАТИСТИКА*\n`;
    report += `• Всего клиентов: ${clients.length}\n`;
    report += `• Активных: ${activeClients}\n`;
    report += `• Заблокированных: ${blockedClients}\n`;
    report += `• Новых за неделю: ${newClients.length}\n`;
    report += `• Общий трафик: ${totalTraffic.toFixed(2)} GB\n`;
    report += `• Средний трафик: ${avgTraffic} GB/клиент\n\n`;
    
    // Топ клиентов
    if (topClients.length > 0) {
      report += `🏆 *ТОП-5 КЛИЕНТОВ ПО ТРАФИКУ*\n`;
      topClients.forEach((client, index) => {
        const percent = ((client.traffic / client.limit) * 100).toFixed(1);
        report += `${index + 1}. ${client.name}: ${client.traffic.toFixed(2)} GB (${percent}%)\n`;
      });
      report += `\n`;
    }
    
    // Новые клиенты
    if (newClients.length > 0) {
      report += `🆕 *НОВЫЕ КЛИЕНТЫ*\n`;
      newClients.forEach(client => {
        report += `• ${client.name} (${client.created_at}) - ${client.traffic.toFixed(2)} GB\n`;
      });
      report += `\n`;
    }
    
    // Истекающие подписки
    if (expiringClients.length > 0) {
      report += `⚠️ *ИСТЕКАЮЩИЕ ПОДПИСКИ*\n`;
      expiringClients.forEach(client => {
        report += `• ${client.name}: ${client.daysLeft} ${client.daysLeft === 1 ? 'день' : 'дня/дней'}\n`;
      });
      report += `\n`;
    }
    
    report += `✅ Отчет сгенерирован автоматически`;
    
    // Отправляем отчет админу
    await bot.sendMessage(ADMIN_TELEGRAM_ID, report, { parse_mode: 'Markdown' });
    
    console.log('✅ Недельный отчет отправлен админу');
    console.log(`Статистика: ${clients.length} клиентов, ${totalTraffic.toFixed(2)} GB трафика`);
    
  } catch (error) {
    console.error('Ошибка генерации отчета:', error);
    
    // Отправляем уведомление об ошибке админу
    try {
      await bot.sendMessage(
        ADMIN_TELEGRAM_ID,
        `❌ Ошибка генерации недельного отчета:\n${error.message}`
      );
    } catch (err) {
      console.error('Не удалось отправить уведомление об ошибке:', err);
    }
    
    process.exit(1);
  }
}

// Запускаем генератор
generateWeeklyReport();
