require('dotenv').config();
const mongoose = require('mongoose');
const StatsDirty = require('../models/subModels/StatsDirty');
const Customer = require('../models/Customer');
const { getDateKeyUTC5, getStartOfDayUTC5, getDateRangeFromKey } = require('../utils/dateKeyUtils');

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME;

const DRY_RUN = process.argv.includes('--dry-run');
const INCLUDE_CUSTOMERS = process.argv.includes('--include-customers');
const INCLUDE_CARRIERS = process.argv.includes('--include-carriers');
const INCLUDE_USERS = process.argv.includes('--include-users');

function parseDate(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return null;
  return date;
}

function getDaysInRange(startDate, endDate) {
  const days = [];
  const current = new Date(startDate);
  current.setUTCHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setUTCHours(23, 59, 59, 999);

  while (current <= end) {
    days.push(new Date(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return days;
}

function createDirtyTask(date, entityType, entityId, sources) {
  const dateKey = getDateKeyUTC5(date);
  const rangeStart = getStartOfDayUTC5(date);
  
  const nextDay = new Date(date);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const rangeEnd = getStartOfDayUTC5(nextDay);

  return {
    grain: 'day',
    dateKey,
    rangeStart,
    rangeEnd,
    entityType,
    entityId: entityId ? (mongoose.Types.ObjectId.isValid(entityId) ? new mongoose.Types.ObjectId(entityId) : entityId) : null,
    sources: Array.isArray(sources) ? sources : ['loads', 'receivable', 'payable'],
    lock: {
      locked: false,
      lockedAt: null,
      lockedBy: null
    },
    attempts: 0,
    priority: 0,
    createdAt: new Date()
  };
}

async function backfillStatsDirty() {
  try {
    await mongoose.connect(MONGO_URI, {
      dbName: MONGO_DB_NAME || 'cierta_db'
    });

    console.log('✅ Подключение к MongoDB установлено');
    console.log(`📋 Режим: ${DRY_RUN ? 'DRY RUN (без изменений)' : 'РЕАЛЬНАЯ МИГРАЦИЯ'}\n`);

    const startDateArg = process.argv.find(arg => arg.startsWith('--start='))?.split('=')[1];
    const endDateArg = process.argv.find(arg => arg.startsWith('--end='))?.split('=')[1];
    const monthsArg = process.argv.find(arg => arg.startsWith('--months='))?.split('=')[1];

    let startDate, endDate;

    if (monthsArg) {
      const months = parseInt(monthsArg, 10);
      if (isNaN(months) || months <= 0) {
        console.error('❌ Неверное значение --months. Должно быть положительным числом.');
        process.exit(1);
      }
      endDate = new Date();
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months);
      console.log(`📅 Диапазон: последние ${months} месяцев (${startDate.toISOString().split('T')[0]} - ${endDate.toISOString().split('T')[0]})`);
    } else if (startDateArg && endDateArg) {
      startDate = parseDate(startDateArg);
      endDate = parseDate(endDateArg);
      if (!startDate || !endDate) {
        console.error('❌ Неверный формат дат. Используйте YYYY-MM-DD или ISO формат.');
        process.exit(1);
      }
      console.log(`📅 Диапазон: ${startDate.toISOString().split('T')[0]} - ${endDate.toISOString().split('T')[0]}`);
    } else {
      console.error('❌ Укажите диапазон дат: --start=YYYY-MM-DD --end=YYYY-MM-DD или --months=N');
      console.log('Примеры:');
      console.log('  node scripts/backfill_stats_dirty.js --months=12');
      console.log('  node scripts/backfill_stats_dirty.js --start=2025-01-01 --end=2025-12-31');
      process.exit(1);
    }

    const days = getDaysInRange(startDate, endDate);
    console.log(`📊 Дней для обработки: ${days.length}\n`);

    const entityTypes = ['system'];
    if (INCLUDE_CUSTOMERS) entityTypes.push('customer');
    if (INCLUDE_CARRIERS) entityTypes.push('carrier');
    if (INCLUDE_USERS) entityTypes.push('user');

    console.log(`📋 Типы сущностей: ${entityTypes.join(', ')}`);

    let customers = [];
    let carriers = [];
    let users = [];

    if (INCLUDE_CUSTOMERS) {
      customers = await Customer.find({ status: 'active' }).select('_id').lean();
      console.log(`   Найдено активных customers: ${customers.length}`);
    }

    if (INCLUDE_CARRIERS) {
      const Carrier = require('../models/Carrier');
      carriers = await Carrier.find({ status: 'active' }).select('_id').lean();
      console.log(`   Найдено активных carriers: ${carriers.length}`);
    }

    if (INCLUDE_USERS) {
      const User = require('../models/User');
      users = await User.find({ status: 'active' }).select('_id').lean();
      console.log(`   Найдено активных users: ${users.length}`);
    }

    console.log('');

    let totalTasks = 0;
    let createdTasks = 0;
    let skippedTasks = 0;

    const bulkOps = [];

    for (const day of days) {
      for (const entityType of entityTypes) {
        if (entityType === 'system') {
          const task = createDirtyTask(day, 'system', null, ['loads', 'receivable', 'payable']);
          bulkOps.push({
            updateOne: {
              filter: {
                grain: task.grain,
                dateKey: task.dateKey,
                entityType: task.entityType,
                entityId: task.entityId
              },
              update: {
                $setOnInsert: task
              },
              upsert: true
            }
          });
          totalTasks++;
        } else if (entityType === 'customer' && INCLUDE_CUSTOMERS) {
          for (const customer of customers) {
            const task = createDirtyTask(day, 'customer', customer._id, ['loads', 'receivable', 'payable']);
            bulkOps.push({
              updateOne: {
                filter: {
                  grain: task.grain,
                  dateKey: task.dateKey,
                  entityType: task.entityType,
                  entityId: task.entityId
                },
                update: {
                  $setOnInsert: task
                },
                upsert: true
              }
            });
            totalTasks++;
          }
        } else if (entityType === 'carrier' && INCLUDE_CARRIERS) {
          for (const carrier of carriers) {
            const task = createDirtyTask(day, 'carrier', carrier._id, ['loads', 'receivable', 'payable']);
            bulkOps.push({
              updateOne: {
                filter: {
                  grain: task.grain,
                  dateKey: task.dateKey,
                  entityType: task.entityType,
                  entityId: task.entityId
                },
                update: {
                  $setOnInsert: task
                },
                upsert: true
              }
            });
            totalTasks++;
          }
        } else if (entityType === 'user' && INCLUDE_USERS) {
          for (const user of users) {
            const task = createDirtyTask(day, 'user', user._id, ['loads', 'receivable', 'payable']);
            bulkOps.push({
              updateOne: {
                filter: {
                  grain: task.grain,
                  dateKey: task.dateKey,
                  entityType: task.entityType,
                  entityId: task.entityId
                },
                update: {
                  $setOnInsert: task
                },
                upsert: true
              }
            });
            totalTasks++;
          }
        }
      }
    }

    console.log(`\n📊 Всего задач для создания: ${totalTasks}`);
    console.log(`📦 Батчей для обработки: ${Math.ceil(bulkOps.length / 1000)}\n`);

    if (DRY_RUN) {
      console.log('🔍 DRY RUN: задачи не будут созданы');
      console.log(`   Пример первых 5 задач:`);
      bulkOps.slice(0, 5).forEach((op, idx) => {
        const task = op.updateOne.update.$setOnInsert;
        console.log(`   ${idx + 1}. ${task.dateKey} ${task.entityType}/${task.entityId || 'system'}`);
      });
      await mongoose.connection.close();
      process.exit(0);
    }

    const BATCH_SIZE = 1000;
    let processed = 0;

    for (let i = 0; i < bulkOps.length; i += BATCH_SIZE) {
      const batch = bulkOps.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(bulkOps.length / BATCH_SIZE);

      console.log(`🔄 Обработка батча ${batchNum}/${totalBatches} (${batch.length} операций)...`);

      try {
        const result = await StatsDirty.bulkWrite(batch, { ordered: false });
        const batchCreated = result.upsertedCount || 0;
        const batchSkipped = batch.length - batchCreated;
        createdTasks += batchCreated;
        skippedTasks += batchSkipped;
        processed += batch.length;

        console.log(`   ✅ Создано: ${batchCreated}, пропущено (уже существует): ${batchSkipped}`);
      } catch (error) {
        console.error(`   ❌ Ошибка в батче ${batchNum}:`, error.message);
        if (error.writeErrors) {
          error.writeErrors.forEach(err => {
            console.error(`      - ${err.errmsg}`);
          });
        }
      }
    }

    console.log(`\n📊 ИТОГИ:`);
    console.log(`   Всего задач: ${totalTasks}`);
    console.log(`   Создано: ${createdTasks}`);
    console.log(`   Пропущено (уже существует): ${skippedTasks}`);
    console.log(`   Обработано: ${processed}`);

    await mongoose.connection.close();
    console.log('\n✅ Backfill завершён');
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка при backfill:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

backfillStatsDirty();
