require('dotenv').config();
const mongoose = require('mongoose');
const PaymentReceivable = require('../models/subModels/PaymentReceivable');
const PaymentPayable = require('../models/subModels/PaymentPayable');
const Load = require('../models/Load');
const Customer = require('../models/Customer');

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME;

const BATCH_SIZE = 2000;
const DRY_RUN = process.argv.includes('--dry-run');

function addDaysUTC5(date, days) {
  if (!date) return null;
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function parseDeadlineDays(paymentTerms) {
  if (!paymentTerms) return 30;
  if (typeof paymentTerms === 'number') return paymentTerms;
  if (typeof paymentTerms === 'string') {
    const trimmed = paymentTerms.trim();
    const match = trimmed.match(/\d+/);
    if (match) {
      return parseInt(match[0], 10);
    }
  }
  return 30;
}

async function backfillPaymentDates() {
  try {
    await mongoose.connect(MONGO_URI, {
      dbName: MONGO_DB_NAME || 'cierta_db'
    });

    console.log('✅ Подключение к MongoDB установлено');
    console.log(`📋 Режим: ${DRY_RUN ? 'DRY RUN (без изменений)' : 'РЕАЛЬНАЯ МИГРАЦИЯ'}\n`);

    let processedReceivable = 0;
    let updatedReceivable = 0;
    let skippedReceivable = 0;
    let errorsReceivable = 0;

    let processedPayable = 0;
    let updatedPayable = 0;
    let skippedPayable = 0;
    let errorsPayable = 0;

    console.log('📊 Backfill PaymentReceivable invoiceAt и dueAt...\n');

    const receivableQuery = {
      $or: [
        { invoiceAt: { $exists: false } },
        { invoiceAt: null }
      ]
    };

    const totalReceivable = await PaymentReceivable.countDocuments(receivableQuery);
    console.log(`Найдено PaymentReceivable с invoiceAt null/отсутствует: ${totalReceivable}\n`);

    let skip = 0;
    const limit = BATCH_SIZE;

    while (skip < totalReceivable) {
      console.log(`🔄 Обработка батча Receivable: ${skip + 1}-${Math.min(skip + limit, totalReceivable)} из ${totalReceivable}`);

      const receivables = await PaymentReceivable.find(receivableQuery)
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
          const hasInvoiceAt = receivable.invoiceAt instanceof Date && !isNaN(receivable.invoiceAt.getTime());
          
          if (!hasInvoiceAt && receivable.loadId) {
            const load = await Load.findById(receivable.loadId).select('dates status customer').lean();
            if (load) {
              let invoiceDate = null;

              if (load.dates?.deliveryAt) {
                invoiceDate = load.dates.deliveryAt instanceof Date ? load.dates.deliveryAt : new Date(load.dates.deliveryAt);
              } else if (load.dates?.pickupAt) {
                invoiceDate = load.dates.pickupAt instanceof Date ? load.dates.pickupAt : new Date(load.dates.pickupAt);
              } else if (receivable.createdAt) {
                invoiceDate = receivable.createdAt instanceof Date ? receivable.createdAt : new Date(receivable.createdAt);
              }

              if (invoiceDate && !isNaN(invoiceDate.getTime())) {
                updates.invoiceAt = invoiceDate;
                hasUpdates = true;

                if (receivable.deadlineDays && receivable.deadlineDays > 0) {
                  const dueDate = addDaysUTC5(invoiceDate, receivable.deadlineDays);
                  if (dueDate) {
                    updates.dueAt = dueDate;
                    hasUpdates = true;
                  }
                } else {
                  const customerId = receivable.customer || load.customer;
                  if (customerId) {
                    const customer = await Customer.findById(customerId).select('paymentTerms').lean();
                    if (customer && customer.paymentTerms) {
                      const deadlineDays = parseDeadlineDays(customer.paymentTerms);
                      const dueDate = addDaysUTC5(invoiceDate, deadlineDays);
                      if (dueDate) {
                        updates.dueAt = dueDate;
                        updates.deadlineDays = deadlineDays;
                        hasUpdates = true;
                      }
                    }
                  }
                }
              }
            } else if (receivable.createdAt) {
              const invoiceDate = receivable.createdAt instanceof Date ? receivable.createdAt : new Date(receivable.createdAt);
              updates.invoiceAt = invoiceDate;
              hasUpdates = true;

              if (receivable.deadlineDays && receivable.deadlineDays > 0) {
                const dueDate = addDaysUTC5(invoiceDate, receivable.deadlineDays);
                if (dueDate) {
                  updates.dueAt = dueDate;
                  hasUpdates = true;
                }
              }
            }
          } else if (!hasInvoiceAt && receivable.createdAt) {
            const invoiceDate = receivable.createdAt instanceof Date ? receivable.createdAt : new Date(receivable.createdAt);
            updates.invoiceAt = invoiceDate;
            hasUpdates = true;

            if (receivable.deadlineDays && receivable.deadlineDays > 0) {
              const dueDate = addDaysUTC5(invoiceDate, receivable.deadlineDays);
              if (dueDate) {
                updates.dueAt = dueDate;
                hasUpdates = true;
              }
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

    console.log('\n📊 Backfill PaymentPayable invoiceAt и dueAt...\n');

    const payableQuery = {
      $or: [
        { invoiceAt: { $exists: false } },
        { invoiceAt: null }
      ]
    };

    const totalPayable = await PaymentPayable.countDocuments(payableQuery);
    console.log(`Найдено PaymentPayable с invoiceAt null/отсутствует: ${totalPayable}\n`);

    skip = 0;

    while (skip < totalPayable) {
      console.log(`🔄 Обработка батча Payable: ${skip + 1}-${Math.min(skip + limit, totalPayable)} из ${totalPayable}`);

      const payables = await PaymentPayable.find(payableQuery)
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
          const hasInvoiceAt = payable.invoiceAt instanceof Date && !isNaN(payable.invoiceAt.getTime());
          
          if (!hasInvoiceAt && payable.loadId) {
            const load = await Load.findById(payable.loadId).select('dates status paymentTerms').lean();
            if (load) {
              let invoiceDate = null;

              if (load.dates?.deliveryAt) {
                invoiceDate = load.dates.deliveryAt instanceof Date ? load.dates.deliveryAt : new Date(load.dates.deliveryAt);
              } else if (load.dates?.pickupAt) {
                invoiceDate = load.dates.pickupAt instanceof Date ? load.dates.pickupAt : new Date(load.dates.pickupAt);
              } else if (payable.createdAt) {
                invoiceDate = payable.createdAt instanceof Date ? payable.createdAt : new Date(payable.createdAt);
              }

              if (invoiceDate && !isNaN(invoiceDate.getTime())) {
                updates.invoiceAt = invoiceDate;
                hasUpdates = true;

                if (payable.deadlineDays && payable.deadlineDays > 0) {
                  const dueDate = addDaysUTC5(invoiceDate, payable.deadlineDays);
                  if (dueDate) {
                    updates.dueAt = dueDate;
                    hasUpdates = true;
                  }
                } else if (load.paymentTerms) {
                  const deadlineDays = parseDeadlineDays(load.paymentTerms);
                  const dueDate = addDaysUTC5(invoiceDate, deadlineDays);
                  if (dueDate) {
                    updates.dueAt = dueDate;
                    updates.deadlineDays = deadlineDays;
                    hasUpdates = true;
                  }
                }
              }
            } else if (payable.createdAt) {
              const invoiceDate = payable.createdAt instanceof Date ? payable.createdAt : new Date(payable.createdAt);
              updates.invoiceAt = invoiceDate;
              hasUpdates = true;

              if (payable.deadlineDays && payable.deadlineDays > 0) {
                const dueDate = addDaysUTC5(invoiceDate, payable.deadlineDays);
                if (dueDate) {
                  updates.dueAt = dueDate;
                  hasUpdates = true;
                }
              }
            }
          } else if (!hasInvoiceAt && payable.createdAt) {
            const invoiceDate = payable.createdAt instanceof Date ? payable.createdAt : new Date(payable.createdAt);
            updates.invoiceAt = invoiceDate;
            hasUpdates = true;

            if (payable.deadlineDays && payable.deadlineDays > 0) {
              const dueDate = addDaysUTC5(invoiceDate, payable.deadlineDays);
              if (dueDate) {
                updates.dueAt = dueDate;
                hasUpdates = true;
              }
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
    } else {
      console.log('\n✅ Миграция завершена успешно!');
    }

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Критическая ошибка:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

backfillPaymentDates();
