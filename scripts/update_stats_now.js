require('dotenv').config();
const mongoose = require('mongoose');
const { markDirtyDay, markDirtyDays } = require('../utils/markDirty');
const { processTask } = require('../services/statsWorker');
const { getCurrentDateUTC5 } = require('../utils/dateUtils');
const { getDateKeyUTC5 } = require('../utils/dateKeyUtils');
const StatsDirty = require('../models/subModels/StatsDirty');

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME;

async function updateStatsNow() {
  try {
    await mongoose.connect(MONGO_URI, {
      dbName: MONGO_DB_NAME || 'cierta_db'
    });

    console.log('✅ Подключение к MongoDB установлено\n');

    const args = process.argv.slice(2);
    const dateArg = args.find(arg => arg.startsWith('--date='));
    const daysArg = args.find(arg => arg.startsWith('--days='));
    const entityTypeArg = args.find(arg => arg.startsWith('--entity='));
    const entityIdArg = args.find(arg => arg.startsWith('--entityId='));
    const processArg = args.includes('--process');

    let targetDate = null;
    let days = 1;
    let entityType = 'system';
    let entityId = null;

    if (dateArg) {
      const dateStr = dateArg.split('=')[1];
      targetDate = new Date(dateStr);
      if (isNaN(targetDate.getTime())) {
        console.error('❌ Неверный формат даты. Используйте YYYY-MM-DD');
        process.exit(1);
      }
    } else {
      targetDate = getCurrentDateUTC5();
    }

    if (daysArg) {
      days = parseInt(daysArg.split('=')[1], 10);
      if (isNaN(days) || days < 1) {
        console.error('❌ Неверное количество дней');
        process.exit(1);
      }
    }

    if (entityTypeArg) {
      entityType = entityTypeArg.split('=')[1];
      if (!['system', 'customer', 'carrier', 'user'].includes(entityType)) {
        console.error('❌ Неверный entityType. Используйте: system, customer, carrier, user');
        process.exit(1);
      }
    }

    if (entityIdArg) {
      entityId = entityIdArg.split('=')[1];
      if (entityType === 'system' && entityId) {
        console.warn('⚠️  entityId игнорируется для system');
        entityId = null;
      }
    }

    console.log('📊 Параметры обновления:');
    console.log(`   Дата: ${targetDate.toISOString().split('T')[0]}`);
    console.log(`   Дней: ${days}`);
    console.log(`   Entity Type: ${entityType}`);
    console.log(`   Entity ID: ${entityId || 'null (system)'}`);
    console.log(`   Обработка задач: ${processArg ? 'Да' : 'Нет (только пометка dirty)'}\n`);

    const dates = [];
    const current = new Date(targetDate);
    current.setUTCHours(0, 0, 0, 0);

    for (let i = 0; i < days; i++) {
      dates.push(new Date(current));
      current.setUTCDate(current.getUTCDate() + 1);
    }

    console.log('🔄 Пометка дней как dirty...\n');

    for (const date of dates) {
      const dateKey = getDateKeyUTC5(date);
      console.log(`   Помечаю ${dateKey} (${entityType}/${entityId || 'system'})...`);
      
      await markDirtyDay(
        date,
        entityType,
        entityId,
        ['loads', 'receivable', 'payable']
      );
    }

    console.log(`\n✅ Помечено ${dates.length} дней как dirty\n`);

    if (processArg) {
      console.log('🔄 Обработка задач воркером...\n');

      const workerId = `manual-worker-${Date.now()}`;
      let processed = 0;
      let maxIterations = 100;

      for (let i = 0; i < maxIterations; i++) {
        const task = await processTask(workerId);
        if (!task) {
          break;
        }
        processed++;
        
        if (processed % 10 === 0) {
          console.log(`   Обработано задач: ${processed}`);
        }
      }

      console.log(`\n✅ Обработано задач: ${processed}\n`);

      const remainingTasks = await StatsDirty.countDocuments({
        'lock.locked': false
      });

      if (remainingTasks > 0) {
        console.log(`⚠️  Осталось задач в очереди: ${remainingTasks}`);
        console.log('   Запустите скрипт снова или дождитесь автоматического воркера\n');
      } else {
        console.log('✅ Все задачи обработаны\n');
      }
    } else {
      console.log('ℹ️  Задачи помечены как dirty, но не обработаны.');
      console.log('   Для обработки запустите с флагом --process');
      console.log('   Или дождитесь автоматического воркера (работает каждые 5 секунд)\n');
    }

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Ошибка:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

updateStatsNow();
