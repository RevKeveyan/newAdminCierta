require('dotenv').config();
const mongoose = require('mongoose');
const PaymentReceivable = require('../models/subModels/PaymentReceivable');
const PaymentPayable = require('../models/subModels/PaymentPayable');
const Load = require('../models/Load');
const { normalizeAmount, calculateReceivableConfirmedAmount, calculatePayableConfirmedAmount } = require('../utils/dateNormalization');

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME;

const BATCH_SIZE = 2000;
const DRY_RUN = process.argv.includes('--dry-run');
const INVOICE_AT_FROM_CREATED_AT = process.argv.includes('--invoice-from-created');

async function migratePayments() {
  try {
    await mongoose.connect(MONGO_URI, {
      dbName: MONGO_DB_NAME || 'cierta_db'
    });

    console.log('✅ Подключение к MongoDB установлено');
    console.log(`📋 Режим: ${DRY_RUN ? 'DRY RUN (без изменений)' : 'РЕАЛЬНАЯ МИГРАЦИЯ'}`);
    console.log(`📋 invoiceAt: ${INVOICE_AT_FROM_CREATED_AT ? 'из createdAt' : 'из Load.dates (delivery/pickup)'}\n`);

    let processedReceivable = 0;
    let updatedReceivable = 0;
    let skippedReceivable = 0;
    let errorsReceivable = 0;

    let processedPayable = 0;
    let updatedPayable = 0;
    let skippedPayable = 0;
    let errorsPayable = 0;

    console.log('📊 Миграция PaymentReceivable...\n');

    const totalReceivable = await PaymentReceivable.countDocuments();
    console.log(`Всего PaymentReceivable: ${totalReceivable}\n`);

    let skip = 0;
    const limit = BATCH_SIZE;

    while (skip < totalReceivable) {
      console.log(`🔄 Обработка батча Receivable: ${skip + 1}-${Math.min(skip + limit, totalReceivable)} из ${totalReceivable}`);

      const receivables = await PaymentReceivable.find({})
        .skip(skip)
        .limit(limit)
        .lean();

      if (receivables.length === 0) {
        break;
      }

      const bulkOps = [];

      for (const receivable of receivables) {
        processedReceivable++;
        const updates = {};
        let hasUpdates = false;

        try {
          if (!receivable.createdBy && receivable.loadId) {
            const load = await Load.findById(receivable.loadId).select('createdBy').lean();
            if (load && load.createdBy) {
              updates.createdBy = load.createdBy;
              hasUpdates = true;
            }
          }

          if (receivable.totalAmount !== undefined && receivable.totalAmount !== null) {
            const normalizedTotal = normalizeAmount(receivable.totalAmount);
            if (normalizedTotal !== receivable.totalAmount) {
              updates.totalAmount = normalizedTotal;
              hasUpdates = true;
            }
          }

          const confirmedAmount = calculateReceivableConfirmedAmount(receivable);
          if (receivable.confirmedAmount !== confirmedAmount) {
            updates.confirmedAmount = confirmedAmount;
            hasUpdates = true;
          }

          const hasInvoiceAt = receivable.invoiceAt instanceof Date && !isNaN(receivable.invoiceAt.getTime());
          
          if (!hasInvoiceAt) {
            let invoiceDate = null;
            
            if (receivable.invoiceAt && typeof receivable.invoiceAt === 'string' && receivable.invoiceAt.trim() !== '') {
              const { normalizeDate } = require('../utils/dateNormalization');
              invoiceDate = normalizeDate(receivable.invoiceAt);
            }
            
            if (!invoiceDate) {
              if (INVOICE_AT_FROM_CREATED_AT) {
                if (receivable.createdAt) {
                  invoiceDate = receivable.createdAt instanceof Date ? receivable.createdAt : new Date(receivable.createdAt);
                }
              } else if (receivable.loadId) {
                const load = await Load.findById(receivable.loadId).select('dates status').lean();
                if (load) {
                  if (load.status === 'Delivered' && load.dates?.deliveryAt) {
                    invoiceDate = load.dates.deliveryAt instanceof Date ? load.dates.deliveryAt : new Date(load.dates.deliveryAt);
                  } else if (load.status === 'Picked Up' && load.dates?.pickupAt) {
                    invoiceDate = load.dates.pickupAt instanceof Date ? load.dates.pickupAt : new Date(load.dates.pickupAt);
                  } else if (load.dates?.deliveryAt) {
                    invoiceDate = load.dates.deliveryAt instanceof Date ? load.dates.deliveryAt : new Date(load.dates.deliveryAt);
                  } else if (load.dates?.pickupAt) {
                    invoiceDate = load.dates.pickupAt instanceof Date ? load.dates.pickupAt : new Date(load.dates.pickupAt);
                  } else if (receivable.createdAt) {
                    invoiceDate = receivable.createdAt instanceof Date ? receivable.createdAt : new Date(receivable.createdAt);
                  }
                }
              } else if (receivable.createdAt) {
                invoiceDate = receivable.createdAt instanceof Date ? receivable.createdAt : new Date(receivable.createdAt);
              }
            }
            
            if (invoiceDate && !isNaN(invoiceDate.getTime())) {
              updates.invoiceAt = invoiceDate;
              hasUpdates = true;
            }
          }

          if (hasUpdates) {
            bulkOps.push({
              updateOne: {
                filter: { _id: receivable._id },
                update: { $set: updates }
              }
            });
            updatedReceivable++;
          } else {
            skippedReceivable++;
          }
        } catch (error) {
          errorsReceivable++;
          console.error(`❌ Ошибка при обработке Receivable ${receivable.orderId || receivable._id}:`, error.message);
        }
      }

      if (bulkOps.length > 0 && !DRY_RUN) {
        try {
          const result = await PaymentReceivable.bulkWrite(bulkOps, { ordered: false });
          console.log(`   ✅ Обновлено: ${result.modifiedCount} документов`);
        } catch (error) {
          console.error(`   ❌ Ошибка при bulkWrite:`, error.message);
          errorsReceivable += bulkOps.length;
        }
      } else if (bulkOps.length > 0 && DRY_RUN) {
        console.log(`   📝 [DRY RUN] Будет обновлено: ${bulkOps.length} документов`);
      }

      skip += limit;
    }

    console.log('\n📊 Миграция PaymentPayable...\n');

    const totalPayable = await PaymentPayable.countDocuments();
    console.log(`Всего PaymentPayable: ${totalPayable}\n`);

    skip = 0;

    while (skip < totalPayable) {
      console.log(`🔄 Обработка батча Payable: ${skip + 1}-${Math.min(skip + limit, totalPayable)} из ${totalPayable}`);

      const payables = await PaymentPayable.find({})
        .skip(skip)
        .limit(limit)
        .lean();

      if (payables.length === 0) {
        break;
      }

      const bulkOps = [];

      for (const payable of payables) {
        processedPayable++;
        const updates = {};
        let hasUpdates = false;

        try {
          if (!payable.createdBy && payable.loadId) {
            const load = await Load.findById(payable.loadId).select('createdBy').lean();
            if (load && load.createdBy) {
              updates.createdBy = load.createdBy;
              hasUpdates = true;
            }
          }

          if (payable.totalAmount !== undefined && payable.totalAmount !== null) {
            const normalizedTotal = normalizeAmount(payable.totalAmount);
            if (normalizedTotal !== payable.totalAmount) {
              updates.totalAmount = normalizedTotal;
              hasUpdates = true;
            }
          }

          const confirmedAmount = calculatePayableConfirmedAmount(payable);
          if (payable.confirmedAmount !== confirmedAmount) {
            updates.confirmedAmount = confirmedAmount;
            hasUpdates = true;
          }

          const hasInvoiceAt = payable.invoiceAt instanceof Date && !isNaN(payable.invoiceAt.getTime());
          
          if (!hasInvoiceAt) {
            let invoiceDate = null;
            
            if (payable.invoiceAt && typeof payable.invoiceAt === 'string' && payable.invoiceAt.trim() !== '') {
              const { normalizeDate } = require('../utils/dateNormalization');
              invoiceDate = normalizeDate(payable.invoiceAt);
            }
            
            if (!invoiceDate) {
              if (INVOICE_AT_FROM_CREATED_AT) {
                if (payable.createdAt) {
                  invoiceDate = payable.createdAt instanceof Date ? payable.createdAt : new Date(payable.createdAt);
                }
              } else if (payable.loadId) {
                const load = await Load.findById(payable.loadId).select('dates status').lean();
                if (load) {
                  if (load.status === 'Delivered' && load.dates?.deliveryAt) {
                    invoiceDate = load.dates.deliveryAt instanceof Date ? load.dates.deliveryAt : new Date(load.dates.deliveryAt);
                  } else if (load.dates?.deliveryAt) {
                    invoiceDate = load.dates.deliveryAt instanceof Date ? load.dates.deliveryAt : new Date(load.dates.deliveryAt);
                  } else if (load.dates?.pickupAt) {
                    invoiceDate = load.dates.pickupAt instanceof Date ? load.dates.pickupAt : new Date(load.dates.pickupAt);
                  } else if (payable.createdAt) {
                    invoiceDate = payable.createdAt instanceof Date ? payable.createdAt : new Date(payable.createdAt);
                  }
                }
              } else if (payable.createdAt) {
                invoiceDate = payable.createdAt instanceof Date ? payable.createdAt : new Date(payable.createdAt);
              }
            }
            
            if (invoiceDate && !isNaN(invoiceDate.getTime())) {
              updates.invoiceAt = invoiceDate;
              hasUpdates = true;
            }
          }

          if (hasUpdates) {
            bulkOps.push({
              updateOne: {
                filter: { _id: payable._id },
                update: { $set: updates }
              }
            });
            updatedPayable++;
          } else {
            skippedPayable++;
          }
        } catch (error) {
          errorsPayable++;
          console.error(`❌ Ошибка при обработке Payable ${payable.orderId || payable._id}:`, error.message);
        }
      }

      if (bulkOps.length > 0 && !DRY_RUN) {
        try {
          const result = await PaymentPayable.bulkWrite(bulkOps, { ordered: false });
          console.log(`   ✅ Обновлено: ${result.modifiedCount} документов`);
        } catch (error) {
          console.error(`   ❌ Ошибка при bulkWrite:`, error.message);
          errorsPayable += bulkOps.length;
        }
      } else if (bulkOps.length > 0 && DRY_RUN) {
        console.log(`   📝 [DRY RUN] Будет обновлено: ${bulkOps.length} документов`);
      }

      skip += limit;
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 ИТОГОВАЯ СТАТИСТИКА:');
    console.log('='.repeat(60));
    console.log('\nPaymentReceivable:');
    console.log(`   Обработано: ${processedReceivable}`);
    console.log(`   Обновлено: ${updatedReceivable}`);
    console.log(`   Пропущено: ${skippedReceivable}`);
    console.log(`   Ошибок: ${errorsReceivable}`);
    console.log('\nPaymentPayable:');
    console.log(`   Обработано: ${processedPayable}`);
    console.log(`   Обновлено: ${updatedPayable}`);
    console.log(`   Пропущено: ${skippedPayable}`);
    console.log(`   Ошибок: ${errorsPayable}`);

    if (DRY_RUN) {
      console.log('\n⚠️  Это был DRY RUN. Для реальной миграции запустите без --dry-run');
      console.log('   Для invoiceAt из createdAt используйте: --invoice-from-created');
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

migratePayments();
