#!/usr/bin/env node
/**
 * Тестовый скрипт для проверки функции полной информации о подписке
 * 
 * Использование:
 *   node yaronetworktool/test-full-sub-info.js <uuid>
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testFullSubInfo(uuid) {
  console.log('🧪 Тестирование функции полной информации о подписке\n');
  console.log(`UUID: ${uuid}\n`);
  
  try {
    // Запускаем скрипт get-client-key.js
    const scriptPath = path.join(__dirname, '../scripts/get-client-key.js');
    console.log(`📂 Путь к скрипту: ${scriptPath}\n`);
    
    console.log('⏳ Запуск скрипта...\n');
    const { stdout, stderr } = await execAsync(`node "${scriptPath}" ${uuid}`);
    
    if (stderr) {
      console.error('⚠️ Предупреждения:', stderr);
    }
    
    console.log('✅ Скрипт выполнен успешно!\n');
    console.log('📋 Вывод скрипта:\n');
    console.log('─'.repeat(60));
    console.log(stdout);
    console.log('─'.repeat(60));
    
    // Парсим вывод
    const lines = stdout.split('\n');
    
    // Находим Base64 подписку
    let base64Subscription = '';
    let captureBase64 = false;
    let allLinks = [];
    let captureLinks = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Начало Base64 блока
      if (line.includes('📋 Base64 подписка')) {
        captureBase64 = true;
        continue;
      }
      
      // Конец Base64 блока
      if (captureBase64 && line.includes('─'.repeat(10))) {
        if (base64Subscription) {
          captureBase64 = false;
        }
        continue;
      }
      
      // Захват Base64
      if (captureBase64 && line.trim() && !line.includes('─')) {
        base64Subscription = line.trim();
      }
      
      // Начало блока ссылок
      if (line.includes('🔗 Отдельные ссылки:')) {
        captureLinks = true;
        continue;
      }
      
      // Конец блока ссылок
      if (captureLinks && line.includes('🌐 URL подписки')) {
        captureLinks = false;
        continue;
      }
      
      // Захват ссылок
      if (captureLinks && line.startsWith('vless://')) {
        allLinks.push(line.trim());
      }
    }
    
    console.log('\n🔍 Результаты парсинга:\n');
    console.log(`Base64 подписка найдена: ${base64Subscription ? '✅' : '❌'}`);
    if (base64Subscription) {
      console.log(`Длина Base64: ${base64Subscription.length} символов`);
    }
    
    console.log(`\nНайдено ссылок: ${allLinks.length}`);
    if (allLinks.length > 0) {
      console.log('\nСсылки:');
      allLinks.forEach((link, idx) => {
        const nameMatch = link.match(/#(.+)$/);
        const linkName = nameMatch ? decodeURIComponent(nameMatch[1]) : `Ссылка ${idx + 1}`;
        console.log(`  ${idx + 1}. ${linkName}`);
      });
    }
    
    console.log('\n✅ Тест завершен успешно!');
    
  } catch (error) {
    console.error('\n❌ Ошибка:', error.message);
    if (error.stderr) {
      console.error('\nStderr:', error.stderr);
    }
    process.exit(1);
  }
}

// Получаем UUID из аргументов
const uuid = process.argv[2];

if (!uuid) {
  console.error('❌ Ошибка: не указан UUID');
  console.log('\n📖 Использование:');
  console.log('  node yaronetworktool/test-full-sub-info.js <uuid>');
  console.log('\n📝 Пример:');
  console.log('  node yaronetworktool/test-full-sub-info.js 12345678-1234-1234-1234-123456789abc');
  process.exit(1);
}

// Запуск теста
testFullSubInfo(uuid);
