require('dotenv').config();
const mongoose = require('mongoose');
const Load = require('../models/Load');
const PaymentReceivable = require('../models/subModels/PaymentReceivable');
const PaymentPayable = require('../models/subModels/PaymentPayable');

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME;

async function checkDataIntegrity() {
  try {
    await mongoose.connect(MONGO_URI, {
      dbName: MONGO_DB_NAME || 'cierta_db'
    });

    console.log('✅ Подключение к MongoDB установлено\n');

    const checks = {
      loads: {},
      paymentsReceivable: {},
      paymentsPayable: {}
    };

    console.log('📊 Проверка Loads...\n');

    const totalLoads = await Load.countDocuments();
    console.log(`Всего Loads: ${totalLoads}`);

    const loadsWithDeadlineString = await Load.countDocuments({
      'dates.deadline': { $exists: true, $ne: null, $ne: '' }
    });
    console.log(`Loads с dates.deadline (string): ${loadsWithDeadlineString}`);

    const loadsWithDeadlineAt = await Load.countDocuments({
      'dates.deadlineAt': { $exists: true, $ne: null }
    });
    console.log(`Loads с dates.deadlineAt (Date): ${loadsWithDeadlineAt}`);

    const loadsWithAssignedDateString = await Load.countDocuments({
      'dates.assignedDate': { $exists: true, $ne: null, $ne: '' }
    });
    console.log(`Loads с dates.assignedDate (string): ${loadsWithAssignedDateString}`);

    const loadsWithAssignedAt = await Load.countDocuments({
      'dates.assignedAt': { $exists: true, $ne: null }
    });
    console.log(`Loads с dates.assignedAt (Date): ${loadsWithAssignedAt}`);

    const loadsWithPickupDateString = await Load.countDocuments({
      'dates.pickupDate': { $exists: true, $ne: null, $ne: '' }
    });
    console.log(`Loads с dates.pickupDate (string): ${loadsWithPickupDateString}`);

    const loadsWithPickupAt = await Load.countDocuments({
      'dates.pickupAt': { $exists: true, $ne: null }
    });
    console.log(`Loads с dates.pickupAt (Date): ${loadsWithPickupAt}`);

    const loadsWithDeliveryDateString = await Load.countDocuments({
      'dates.deliveryDate': { $exists: true, $ne: null, $ne: '' }
    });
    console.log(`Loads с dates.deliveryDate (string): ${loadsWithDeliveryDateString}`);

    const loadsWithDeliveryAt = await Load.countDocuments({
      'dates.deliveryAt': { $exists: true, $ne: null }
    });
    console.log(`Loads с dates.deliveryAt (Date): ${loadsWithDeliveryAt}\n`);

    checks.loads = {
      total: totalLoads,
      deadlineString: loadsWithDeadlineString,
      deadlineAt: loadsWithDeadlineAt,
      assignedDateString: loadsWithAssignedDateString,
      assignedAt: loadsWithAssignedAt,
      pickupDateString: loadsWithPickupDateString,
      pickupAt: loadsWithPickupAt,
      deliveryDateString: loadsWithDeliveryDateString,
      deliveryAt: loadsWithDeliveryAt
    };

    console.log('📊 Проверка PaymentReceivable...\n');

    const totalReceivable = await PaymentReceivable.countDocuments();
    console.log(`Всего PaymentReceivable: ${totalReceivable}`);

    const receivableWithInvoiceAt = await PaymentReceivable.countDocuments({
      invoiceAt: { $exists: true, $ne: null }
    });
    const receivableWithInvoiceAtDate = await PaymentReceivable.countDocuments({
      invoiceAt: { $type: 'date' }
    });
    const receivableWithInvoiceAtString = await PaymentReceivable.countDocuments({
      invoiceAt: { $type: 'string' }
    });
    const receivableWithoutInvoiceAt = totalReceivable - receivableWithInvoiceAt;
    console.log(`invoiceAt exists: ${receivableWithInvoiceAt} / missing: ${receivableWithoutInvoiceAt}`);
    console.log(`invoiceAt type Date: ${receivableWithInvoiceAtDate} / String: ${receivableWithInvoiceAtString}`);

    const receivableWithTotalAmount = await PaymentReceivable.countDocuments({
      totalAmount: { $exists: true, $ne: null }
    });
    const receivableWithTotalAmountNumber = await PaymentReceivable.countDocuments({
      totalAmount: { $type: 'number' }
    });
    const receivableWithTotalAmountString = await PaymentReceivable.countDocuments({
      totalAmount: { $type: 'string' }
    });
    const receivableWithoutTotalAmount = totalReceivable - receivableWithTotalAmount;
    console.log(`totalAmount exists: ${receivableWithTotalAmount} / missing: ${receivableWithoutTotalAmount}`);
    console.log(`totalAmount type Number: ${receivableWithTotalAmountNumber} / String: ${receivableWithTotalAmountString} / null: ${receivableWithoutTotalAmount}`);

    const receivableWithConfirmedAmount = await PaymentReceivable.countDocuments({
      confirmedAmount: { $exists: true, $ne: null }
    });
    const receivableWithConfirmedAmountNumber = await PaymentReceivable.countDocuments({
      confirmedAmount: { $type: 'number' }
    });
    const receivableWithoutConfirmedAmount = totalReceivable - receivableWithConfirmedAmount;
    console.log(`confirmedAmount exists: ${receivableWithConfirmedAmount} / missing: ${receivableWithoutConfirmedAmount}`);
    console.log(`confirmedAmount type Number: ${receivableWithConfirmedAmountNumber}`);

    const receivableWithLoadId = await PaymentReceivable.countDocuments({
      loadId: { $exists: true, $ne: null }
    });
    const receivableWithCustomer = await PaymentReceivable.countDocuments({
      customer: { $exists: true, $ne: null }
    });
    const receivableWithCreatedBy = await PaymentReceivable.countDocuments({
      createdBy: { $exists: true, $ne: null }
    });
    console.log(`loadId exists: ${receivableWithLoadId}`);
    console.log(`customer exists: ${receivableWithCustomer}`);
    console.log(`createdBy exists: ${receivableWithCreatedBy}`);

    console.log('\nРаспределение статусов PaymentReceivable:');
    const receivableStatuses = await PaymentReceivable.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);
    receivableStatuses.forEach(({ _id, count }) => {
      console.log(`   ${_id || '(null)'}: ${count}`);
    });

    checks.paymentsReceivable = {
      total: totalReceivable,
      invoiceAt: { exists: receivableWithInvoiceAt, missing: receivableWithoutInvoiceAt, date: receivableWithInvoiceAtDate, string: receivableWithInvoiceAtString },
      totalAmount: { exists: receivableWithTotalAmount, missing: receivableWithoutTotalAmount, number: receivableWithTotalAmountNumber, string: receivableWithTotalAmountString },
      confirmedAmount: { exists: receivableWithConfirmedAmount, missing: receivableWithoutConfirmedAmount, number: receivableWithConfirmedAmountNumber },
      loadId: receivableWithLoadId,
      customer: receivableWithCustomer,
      createdBy: receivableWithCreatedBy,
      statuses: receivableStatuses.reduce((acc, { _id, count }) => {
        acc[_id || 'null'] = count;
        return acc;
      }, {})
    };

    console.log('\n📊 Проверка PaymentPayable...\n');

    const totalPayable = await PaymentPayable.countDocuments();
    console.log(`Всего PaymentPayable: ${totalPayable}`);

    const payableWithInvoiceAt = await PaymentPayable.countDocuments({
      invoiceAt: { $exists: true, $ne: null }
    });
    const payableWithInvoiceAtDate = await PaymentPayable.countDocuments({
      invoiceAt: { $type: 'date' }
    });
    const payableWithInvoiceAtString = await PaymentPayable.countDocuments({
      invoiceAt: { $type: 'string' }
    });
    const payableWithoutInvoiceAt = totalPayable - payableWithInvoiceAt;
    console.log(`invoiceAt exists: ${payableWithInvoiceAt} / missing: ${payableWithoutInvoiceAt}`);
    console.log(`invoiceAt type Date: ${payableWithInvoiceAtDate} / String: ${payableWithInvoiceAtString}`);

    const payableWithTotalAmount = await PaymentPayable.countDocuments({
      totalAmount: { $exists: true, $ne: null }
    });
    const payableWithTotalAmountNumber = await PaymentPayable.countDocuments({
      totalAmount: { $type: 'number' }
    });
    const payableWithTotalAmountString = await PaymentPayable.countDocuments({
      totalAmount: { $type: 'string' }
    });
    const payableWithoutTotalAmount = totalPayable - payableWithTotalAmount;
    console.log(`totalAmount exists: ${payableWithTotalAmount} / missing: ${payableWithoutTotalAmount}`);
    console.log(`totalAmount type Number: ${payableWithTotalAmountNumber} / String: ${payableWithTotalAmountString} / null: ${payableWithoutTotalAmount}`);

    const payableWithConfirmedAmount = await PaymentPayable.countDocuments({
      confirmedAmount: { $exists: true, $ne: null }
    });
    const payableWithConfirmedAmountNumber = await PaymentPayable.countDocuments({
      confirmedAmount: { $type: 'number' }
    });
    const payableWithoutConfirmedAmount = totalPayable - payableWithConfirmedAmount;
    console.log(`confirmedAmount exists: ${payableWithConfirmedAmount} / missing: ${payableWithoutConfirmedAmount}`);
    console.log(`confirmedAmount type Number: ${payableWithConfirmedAmountNumber}`);

    const payableWithLoadId = await PaymentPayable.countDocuments({
      loadId: { $exists: true, $ne: null }
    });
    const payableWithCarrier = await PaymentPayable.countDocuments({
      carrier: { $exists: true, $ne: null }
    });
    const payableWithCreatedBy = await PaymentPayable.countDocuments({
      createdBy: { $exists: true, $ne: null }
    });
    console.log(`loadId exists: ${payableWithLoadId}`);
    console.log(`carrier exists: ${payableWithCarrier}`);
    console.log(`createdBy exists: ${payableWithCreatedBy}`);

    console.log('\nРаспределение статусов PaymentPayable:');
    const payableStatuses = await PaymentPayable.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);
    payableStatuses.forEach(({ _id, count }) => {
      console.log(`   ${_id || '(null)'}: ${count}`);
    });

    checks.paymentsPayable = {
      total: totalPayable,
      invoiceAt: { exists: payableWithInvoiceAt, missing: payableWithoutInvoiceAt, date: payableWithInvoiceAtDate, string: payableWithInvoiceAtString },
      totalAmount: { exists: payableWithTotalAmount, missing: payableWithoutTotalAmount, number: payableWithTotalAmountNumber, string: payableWithTotalAmountString },
      confirmedAmount: { exists: payableWithConfirmedAmount, missing: payableWithoutConfirmedAmount, number: payableWithConfirmedAmountNumber },
      loadId: payableWithLoadId,
      carrier: payableWithCarrier,
      createdBy: payableWithCreatedBy,
      statuses: payableStatuses.reduce((acc, { _id, count }) => {
        acc[_id || 'null'] = count;
        return acc;
      }, {})
    };

    console.log('📋 Итоговый отчёт:\n');
    console.log(JSON.stringify(checks, null, 2));

    console.log('\n✅ Проверка завершена');
    console.log('\n⚠️  Ожидаемое состояние ДО backfill:');
    console.log('   - Старые String поля заполнены');
    console.log('   - Новые Date поля пустые (null)');
    console.log('   - totalAmount может быть String (будет исправлено)');
    console.log('   - confirmedAmount пустой (0)');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка при проверке:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

checkDataIntegrity();
