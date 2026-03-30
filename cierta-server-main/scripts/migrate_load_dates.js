require('dotenv').config();
const mongoose = require('mongoose');
const Load = require('../models/Load');
const { parseDateSafe, normalizeDate } = require('../utils/dateNormalization');

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME;

const BATCH_SIZE = 2000;
const DRY_RUN = process.argv.includes('--dry-run');

async function migrateLoadDates() {
  try {
    await mongoose.connect(MONGO_URI, {
      dbName: MONGO_DB_NAME || 'cierta_db'
    });

    console.log('✅ Подключение к MongoDB установлено');
    console.log(`📋 Режим: ${DRY_RUN ? 'DRY RUN (без изменений)' : 'РЕАЛЬНАЯ МИГРАЦИЯ'}\n`);

    const totalLoads = await Load.countDocuments();
    console.log(`📊 Всего Loads для обработки: ${totalLoads}\n`);

    let processed = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    const errorLog = [];

    let skip = 0;
    const limit = BATCH_SIZE;

    while (skip < totalLoads) {
      console.log(`\n🔄 Обработка батча: ${skip + 1}-${Math.min(skip + limit, totalLoads)} из ${totalLoads}`);

      const loads = await Load.find({})
        .skip(skip)
        .limit(limit)
        .lean();

      if (loads.length === 0) {
        break;
      }

      const bulkOps = [];

      for (const load of loads) {
        processed++;
        const updates = {};
        let hasUpdates = false;

        try {
          const dates = load.dates || {};

          if (dates.deadline && typeof dates.deadline === 'string' && dates.deadline.trim() !== '') {
            if (!dates.deadlineAt) {
              const deadlineAt = normalizeDate(dates.deadline);
              if (deadlineAt) {
                updates['dates.deadlineAt'] = deadlineAt;
                hasUpdates = true;
              }
            }
          }

          if (dates.assignedDate && typeof dates.assignedDate === 'string' && dates.assignedDate.trim() !== '') {
            if (!dates.assignedAt) {
              const assignedAt = normalizeDate(dates.assignedDate);
              if (assignedAt) {
                updates['dates.assignedAt'] = assignedAt;
                hasUpdates = true;
              }
            }
          }

          const pickupDateType = dates.pickupDateType || 'Exact';
          
          if (pickupDateType === 'Exact') {
            if (dates.pickupDate && typeof dates.pickupDate === 'string' && dates.pickupDate.trim() !== '') {
              if (!dates.pickupAt) {
                const pickupAt = normalizeDate(dates.pickupDate);
                if (pickupAt) {
                  updates['dates.pickupAt'] = pickupAt;
                  hasUpdates = true;
                }
              }
            }
          } else if (pickupDateType === 'Estimate') {
            if (dates.pickupDateStart && typeof dates.pickupDateStart === 'string' && dates.pickupDateStart.trim() !== '') {
              if (!dates.pickupStartAt) {
                const pickupStartAt = normalizeDate(dates.pickupDateStart);
                if (pickupStartAt) {
                  updates['dates.pickupStartAt'] = pickupStartAt;
                  hasUpdates = true;
                }
              }
            }
            if (dates.pickupDateEnd && typeof dates.pickupDateEnd === 'string' && dates.pickupDateEnd.trim() !== '') {
              if (!dates.pickupEndAt) {
                const pickupEndAt = normalizeDate(dates.pickupDateEnd);
                if (pickupEndAt) {
                  updates['dates.pickupEndAt'] = pickupEndAt;
                  hasUpdates = true;
                }
              }
            }
          }

          const deliveryDateType = dates.deliveryDateType || 'Exact';
          
          if (deliveryDateType === 'Exact') {
            if (dates.deliveryDate && typeof dates.deliveryDate === 'string' && dates.deliveryDate.trim() !== '') {
              if (!dates.deliveryAt) {
                const deliveryAt = normalizeDate(dates.deliveryDate);
                if (deliveryAt) {
                  updates['dates.deliveryAt'] = deliveryAt;
                  hasUpdates = true;
                }
              }
            }
          } else if (deliveryDateType === 'Estimate') {
            if (dates.deliveryDateStart && typeof dates.deliveryDateStart === 'string' && dates.deliveryDateStart.trim() !== '') {
              if (!dates.deliveryStartAt) {
                const deliveryStartAt = normalizeDate(dates.deliveryDateStart);
                if (deliveryStartAt) {
                  updates['dates.deliveryStartAt'] = deliveryStartAt;
                  hasUpdates = true;
                }
              }
            }
            if (dates.deliveryDateEnd && typeof dates.deliveryDateEnd === 'string' && dates.deliveryDateEnd.trim() !== '') {
              if (!dates.deliveryEndAt) {
                const deliveryEndAt = normalizeDate(dates.deliveryDateEnd);
                if (deliveryEndAt) {
                  updates['dates.deliveryEndAt'] = deliveryEndAt;
                  hasUpdates = true;
                }
              }
            }
          }

          if (hasUpdates) {
            bulkOps.push({
              updateOne: {
                filter: { _id: load._id },
                update: { $set: updates }
              }
            });
            updated++;
          } else {
            skipped++;
          }
        } catch (error) {
          errors++;
          errorLog.push({
            loadId: load._id,
            orderId: load.orderId,
            error: error.message
          });
          console.error(`❌ Ошибка при обработке Load ${load.orderId || load._id}:`, error.message);
        }
      }

      if (bulkOps.length > 0 && !DRY_RUN) {
        try {
          const result = await Load.bulkWrite(bulkOps, { ordered: false });
          console.log(`   ✅ Обновлено: ${result.modifiedCount} документов`);
        } catch (error) {
          console.error(`   ❌ Ошибка при bulkWrite:`, error.message);
          errors += bulkOps.length;
        }
      } else if (bulkOps.length > 0 && DRY_RUN) {
        console.log(`   📝 [DRY RUN] Будет обновлено: ${bulkOps.length} документов`);
      }

      skip += limit;
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 ИТОГОВАЯ СТАТИСТИКА:');
    console.log('='.repeat(60));
    console.log(`Всего обработано: ${processed}`);
    console.log(`Обновлено: ${updated}`);
    console.log(`Пропущено (нет изменений): ${skipped}`);
    console.log(`Ошибок: ${errors}`);

    if (errorLog.length > 0) {
      console.log('\n❌ ОШИБКИ:');
      errorLog.forEach(({ loadId, orderId, error }) => {
        console.log(`   Load ${orderId || loadId}: ${error}`);
      });
    }

    if (DRY_RUN) {
      console.log('\n⚠️  Это был DRY RUN. Для реальной миграции запустите без --dry-run');
    } else {
      console.log('\n✅ Миграция завершена!');
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Критическая ошибка:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

migrateLoadDates();
