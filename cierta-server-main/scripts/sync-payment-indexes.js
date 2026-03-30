require('dotenv').config();
const mongoose = require('mongoose');
const PaymentReceivable = require('../models/subModels/PaymentReceivable');
const PaymentPayable = require('../models/subModels/PaymentPayable');

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME;

async function syncIndexes() {
  try {
    await mongoose.connect(MONGO_URI, {
      dbName: MONGO_DB_NAME || 'cierta_db'
    });

    console.log('✅ Подключение к MongoDB установлено\n');

    console.log('📊 Синхронизация индексов PaymentReceivable...\n');
    
    const receivableIndexesBefore = await PaymentReceivable.collection.getIndexes();
    console.log('Индексы ДО синхронизации:');
    Object.keys(receivableIndexesBefore).forEach(indexName => {
      console.log(`   - ${indexName}:`, JSON.stringify(receivableIndexesBefore[indexName].key));
    });

    await PaymentReceivable.syncIndexes();
    console.log('\n✅ Индексы PaymentReceivable синхронизированы');

    const receivableIndexesAfter = await PaymentReceivable.collection.getIndexes();
    console.log('\nИндексы ПОСЛЕ синхронизации:');
    Object.keys(receivableIndexesAfter).forEach(indexName => {
      console.log(`   - ${indexName}:`, JSON.stringify(receivableIndexesAfter[indexName].key));
    });

    console.log('\n📊 Синхронизация индексов PaymentPayable...\n');
    
    const payableIndexesBefore = await PaymentPayable.collection.getIndexes();
    console.log('Индексы ДО синхронизации:');
    Object.keys(payableIndexesBefore).forEach(indexName => {
      console.log(`   - ${indexName}:`, JSON.stringify(payableIndexesBefore[indexName].key));
    });

    await PaymentPayable.syncIndexes();
    console.log('\n✅ Индексы PaymentPayable синхронизированы');

    const payableIndexesAfter = await PaymentPayable.collection.getIndexes();
    console.log('\nИндексы ПОСЛЕ синхронизации:');
    Object.keys(payableIndexesAfter).forEach(indexName => {
      console.log(`   - ${indexName}:`, JSON.stringify(payableIndexesAfter[indexName].key));
    });

    console.log('\n✅ Все индексы синхронизированы!');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка при синхронизации индексов:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

syncIndexes();
