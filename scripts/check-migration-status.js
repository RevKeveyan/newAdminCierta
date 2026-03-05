require('dotenv').config();
const mongoose = require('mongoose');
const Load = require('../models/Load');
const PaymentReceivable = require('../models/subModels/PaymentReceivable');
const PaymentPayable = require('../models/subModels/PaymentPayable');
const StatsSnapshot = require('../models/subModels/StatsSnapshot');

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME;

async function checkMigrationStatus() {
  try {
    await mongoose.connect(MONGO_URI, {
      dbName: MONGO_DB_NAME || 'cierta_db'
    });

    console.log('✅ Подключение к MongoDB установлено\n');
    console.log('📊 Статус миграций:\n');

    console.log('1️⃣ Load Dates Migration (String → Date):');
    const totalLoads = await Load.countDocuments();
    const loadsWithDeadlineAt = await Load.countDocuments({
      'dates.deadlineAt': { $exists: true, $ne: null }
    });
    const loadsWithAssignedAt = await Load.countDocuments({
      'dates.assignedAt': { $exists: true, $ne: null }
    });
    const loadsWithPickupAt = await Load.countDocuments({
      'dates.pickupAt': { $exists: true, $ne: null }
    });
    const loadsWithDeliveryAt = await Load.countDocuments({
      'dates.deliveryAt': { $exists: true, $ne: null }
    });

    console.log(`   Всего Loads: ${totalLoads}`);
    console.log(`   deadlineAt заполнено: ${loadsWithDeadlineAt} (${totalLoads > 0 ? Math.round(loadsWithDeadlineAt / totalLoads * 100) : 0}%)`);
    console.log(`   assignedAt заполнено: ${loadsWithAssignedAt} (${totalLoads > 0 ? Math.round(loadsWithAssignedAt / totalLoads * 100) : 0}%)`);
    console.log(`   pickupAt заполнено: ${loadsWithPickupAt} (${totalLoads > 0 ? Math.round(loadsWithPickupAt / totalLoads * 100) : 0}%)`);
    console.log(`   deliveryAt заполнено: ${loadsWithDeliveryAt} (${totalLoads > 0 ? Math.round(loadsWithDeliveryAt / totalLoads * 100) : 0}%)`);

    if (loadsWithDeadlineAt === 0 && totalLoads > 0) {
      console.log('   ⚠️  Требуется миграция Load dates!');
    } else if (loadsWithDeadlineAt > 0) {
      console.log('   ✅ Load dates миграция выполнена');
    }

    console.log('\n2️⃣ Payments Migration:');
    const totalReceivable = await PaymentReceivable.countDocuments();
    const receivableWithDeadlineDays = await PaymentReceivable.countDocuments({
      deadlineDays: { $exists: true, $ne: null }
    });
    const receivableWithInvoiceAt = await PaymentReceivable.countDocuments({
      invoiceAt: { $exists: true, $ne: null, $type: 'date' }
    });
    const receivableWithConfirmedAmount = await PaymentReceivable.countDocuments({
      confirmedAmount: { $exists: true, $ne: null, $type: 'number' }
    });

    const totalPayable = await PaymentPayable.countDocuments();
    const payableWithDeadlineDays = await PaymentPayable.countDocuments({
      deadlineDays: { $exists: true, $ne: null }
    });
    const payableWithInvoiceAt = await PaymentPayable.countDocuments({
      invoiceAt: { $exists: true, $ne: null, $type: 'date' }
    });
    const payableWithConfirmedAmount = await PaymentPayable.countDocuments({
      confirmedAmount: { $exists: true, $ne: null, $type: 'number' }
    });

    console.log(`   PaymentReceivable:`);
    console.log(`     Всего: ${totalReceivable}`);
    console.log(`     deadlineDays заполнено: ${receivableWithDeadlineDays} (${totalReceivable > 0 ? Math.round(receivableWithDeadlineDays / totalReceivable * 100) : 0}%)`);
    console.log(`     invoiceAt (Date) заполнено: ${receivableWithInvoiceAt} (${totalReceivable > 0 ? Math.round(receivableWithInvoiceAt / totalReceivable * 100) : 0}%)`);
    console.log(`     confirmedAmount заполнено: ${receivableWithConfirmedAmount} (${totalReceivable > 0 ? Math.round(receivableWithConfirmedAmount / totalReceivable * 100) : 0}%)`);

    console.log(`   PaymentPayable:`);
    console.log(`     Всего: ${totalPayable}`);
    console.log(`     deadlineDays заполнено: ${payableWithDeadlineDays} (${totalPayable > 0 ? Math.round(payableWithDeadlineDays / totalPayable * 100) : 0}%)`);
    console.log(`     invoiceAt (Date) заполнено: ${payableWithInvoiceAt} (${totalPayable > 0 ? Math.round(payableWithInvoiceAt / totalPayable * 100) : 0}%)`);
    console.log(`     confirmedAmount заполнено: ${payableWithConfirmedAmount} (${totalPayable > 0 ? Math.round(payableWithConfirmedAmount / totalPayable * 100) : 0}%)`);

    if (receivableWithDeadlineDays === totalReceivable && payableWithDeadlineDays === totalPayable) {
      console.log('   ✅ Payments миграция выполнена');
    } else {
      console.log('   ⚠️  Требуется миграция Payments!');
    }

    console.log('\n3️⃣ Statistics Snapshots:');
    const today = new Date().toISOString().split('T')[0];
    const systemSnapshots = await StatsSnapshot.countDocuments({
      entityType: 'system',
      entityId: null
    });
    const customerSnapshots = await StatsSnapshot.countDocuments({
      entityType: 'customer'
    });
    const carrierSnapshots = await StatsSnapshot.countDocuments({
      entityType: 'carrier'
    });
    const userSnapshots = await StatsSnapshot.countDocuments({
      entityType: 'user'
    });

    console.log(`   System snapshots: ${systemSnapshots}`);
    console.log(`   Customer snapshots: ${customerSnapshots}`);
    console.log(`   Carrier snapshots: ${carrierSnapshots}`);
    console.log(`   User snapshots: ${userSnapshots}`);

    if (systemSnapshots > 0) {
      console.log('   ✅ Statistics snapshots созданы');
    } else {
      console.log('   ⚠️  Statistics snapshots отсутствуют (запустите backfill)');
    }

    console.log('\n✅ Проверка завершена\n');

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Ошибка:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

checkMigrationStatus();
