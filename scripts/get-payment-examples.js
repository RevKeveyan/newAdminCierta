require('dotenv').config();
const mongoose = require('mongoose');
const PaymentReceivable = require('../models/subModels/PaymentReceivable');
const PaymentPayable = require('../models/subModels/PaymentPayable');

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME;

async function getPaymentExamples() {
  try {
    await mongoose.connect(MONGO_URI, {
      dbName: MONGO_DB_NAME || 'cierta_db'
    });

    console.log('✅ Подключение к MongoDB установлено\n');

    console.log('📋 Примеры PaymentReceivable:\n');

    const receivableReceived = await PaymentReceivable.findOne({ status: 'received' })
      .select('_id status invoiceAt createdAt totalAmount confirmedAmount loadId customer createdBy')
      .lean();

    const receivablePartiallyReceived = await PaymentReceivable.findOne({ status: 'partially received' })
      .select('_id status invoiceAt createdAt totalAmount confirmedAmount loadId customer createdBy')
      .lean();

    console.log('1. PaymentReceivable со статусом "received":');
    console.log(JSON.stringify(receivableReceived, null, 2));
    console.log('\n2. PaymentReceivable со статусом "partially received":');
    console.log(JSON.stringify(receivablePartiallyReceived, null, 2));

    console.log('\n📋 Примеры PaymentPayable:\n');

    const payablePaid = await PaymentPayable.findOne({ status: 'paid' })
      .select('_id status invoiceAt createdAt totalAmount confirmedAmount loadId carrier createdBy')
      .lean();

    const payablePartiallyPaid = await PaymentPayable.findOne({ status: 'partially paid' })
      .select('_id status invoiceAt createdAt totalAmount confirmedAmount loadId carrier createdBy')
      .lean();

    console.log('3. PaymentPayable со статусом "paid":');
    console.log(JSON.stringify(payablePaid, null, 2));
    console.log('\n4. PaymentPayable со статусом "partially paid":');
    console.log(JSON.stringify(payablePartiallyPaid, null, 2));

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

getPaymentExamples();
