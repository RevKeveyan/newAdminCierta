require('dotenv').config();
const mongoose = require('mongoose');
const Load = require('../models/Load');
const PaymentReceivable = require('../models/subModels/PaymentReceivable');
const PaymentPayable = require('../models/subModels/PaymentPayable');

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME;

async function ensureIndexes() {
  try {
    await mongoose.connect(MONGO_URI, {
      dbName: MONGO_DB_NAME || 'cierta_db'
    });

    console.log('✅ Подключение к MongoDB установлено\n');

    console.log('📊 Создание/проверка индексов для Load...\n');
    
    await Load.createIndexes();
    console.log('✅ Индексы Load созданы/проверены');

    const loadIndexes = await Load.collection.getIndexes();
    console.log('\n📋 Индексы Load:');
    Object.keys(loadIndexes).forEach(indexName => {
      console.log(`   - ${indexName}:`, JSON.stringify(loadIndexes[indexName].key));
    });

    console.log('\n📊 Создание/проверка индексов для PaymentReceivable...\n');
    
    await PaymentReceivable.createIndexes();
    console.log('✅ Индексы PaymentReceivable созданы/проверены');

    const receivableIndexes = await PaymentReceivable.collection.getIndexes();
    console.log('\n📋 Индексы PaymentReceivable:');
    Object.keys(receivableIndexes).forEach(indexName => {
      console.log(`   - ${indexName}:`, JSON.stringify(receivableIndexes[indexName].key));
    });

    console.log('\n📊 Создание/проверка индексов для PaymentPayable...\n');
    
    await PaymentPayable.createIndexes();
    console.log('✅ Индексы PaymentPayable созданы/проверены');

    const payableIndexes = await PaymentPayable.collection.getIndexes();
    console.log('\n📋 Индексы PaymentPayable:');
    Object.keys(payableIndexes).forEach(indexName => {
      console.log(`   - ${indexName}:`, JSON.stringify(payableIndexes[indexName].key));
    });

    console.log('\n✅ Все индексы проверены и созданы!');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка при создании индексов:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

ensureIndexes();
