require('dotenv').config();
const mongoose = require('mongoose');
const PaymentReceivable = require('../models/subModels/PaymentReceivable');
const PaymentPayable = require('../models/subModels/PaymentPayable');

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME;

async function fixLoadIdIndex() {
  try {
    await mongoose.connect(MONGO_URI, {
      dbName: MONGO_DB_NAME || 'cierta_db'
    });

    console.log('✅ Подключение к MongoDB установлено\n');

    console.log('📊 Исправление индекса loadId в PaymentReceivable...\n');
    
    const receivableIndexes = await PaymentReceivable.collection.getIndexes();
    console.log('Текущие индексы PaymentReceivable:');
    Object.keys(receivableIndexes).forEach(indexName => {
      const index = receivableIndexes[indexName];
      console.log(`   - ${indexName}:`, JSON.stringify({
        key: index.key,
        unique: index.unique,
        sparse: index.sparse
      }));
    });

    if (receivableIndexes.loadId_1) {
      const existingIndex = receivableIndexes.loadId_1;
      const needsFix = existingIndex.unique !== true;
      
      if (needsFix) {
        console.log('\n⚠️  Индекс loadId_1 существует БЕЗ unique: true');
        console.log('   Текущий индекс:', JSON.stringify({
          key: existingIndex.key,
          unique: existingIndex.unique,
          sparse: existingIndex.sparse
        }));
        console.log('   Удаляем старый индекс...');
        
        try {
          await PaymentReceivable.collection.dropIndex('loadId_1');
          console.log('   ✅ Старый индекс удален');
        } catch (error) {
          if (error.code === 27 || error.codeName === 'IndexNotFound') {
            console.log('   ℹ️  Индекс уже удален или не существует');
          } else {
            throw error;
          }
        }
      } else {
        console.log('\n✅ Индекс loadId_1 уже правильный (с unique: true)');
      }
    } else {
      console.log('\nℹ️  Индекс loadId_1 не найден, будет создан при синхронизации');
    }

    console.log('\n📊 Исправление индекса loadId в PaymentPayable...\n');
    
    const payableIndexes = await PaymentPayable.collection.getIndexes();
    console.log('Текущие индексы PaymentPayable:');
    Object.keys(payableIndexes).forEach(indexName => {
      const index = payableIndexes[indexName];
      console.log(`   - ${indexName}:`, JSON.stringify({
        key: index.key,
        unique: index.unique,
        sparse: index.sparse
      }));
    });

    if (payableIndexes.loadId_1) {
      const existingIndex = payableIndexes.loadId_1;
      const needsFix = existingIndex.unique !== true;
      
      if (needsFix) {
        console.log('\n⚠️  Индекс loadId_1 существует БЕЗ unique: true');
        console.log('   Текущий индекс:', JSON.stringify({
          key: existingIndex.key,
          unique: existingIndex.unique,
          sparse: existingIndex.sparse
        }));
        console.log('   Удаляем старый индекс...');
        
        try {
          await PaymentPayable.collection.dropIndex('loadId_1');
          console.log('   ✅ Старый индекс удален');
        } catch (error) {
          if (error.code === 27 || error.codeName === 'IndexNotFound') {
            console.log('   ℹ️  Индекс уже удален или не существует');
          } else {
            throw error;
          }
        }
      } else {
        console.log('\n✅ Индекс loadId_1 уже правильный (с unique: true)');
      }
    } else {
      console.log('\nℹ️  Индекс loadId_1 не найден, будет создан при синхронизации');
    }

    console.log('\n📊 Синхронизация индексов...\n');
    
    try {
      await PaymentReceivable.syncIndexes();
      console.log('✅ Индексы PaymentReceivable синхронизированы');
    } catch (error) {
      console.error('❌ Ошибка при синхронизации PaymentReceivable:', error.message);
    }

    try {
      await PaymentPayable.syncIndexes();
      console.log('✅ Индексы PaymentPayable синхронизированы');
    } catch (error) {
      console.error('❌ Ошибка при синхронизации PaymentPayable:', error.message);
    }

    console.log('\n📋 Финальные индексы PaymentReceivable:');
    const finalReceivableIndexes = await PaymentReceivable.collection.getIndexes();
    Object.keys(finalReceivableIndexes).forEach(indexName => {
      const index = finalReceivableIndexes[indexName];
      if (indexName === 'loadId_1') {
        console.log(`   ✅ ${indexName}:`, JSON.stringify({
          key: index.key,
          unique: index.unique,
          sparse: index.sparse
        }));
      }
    });

    console.log('\n📋 Финальные индексы PaymentPayable:');
    const finalPayableIndexes = await PaymentPayable.collection.getIndexes();
    Object.keys(finalPayableIndexes).forEach(indexName => {
      const index = finalPayableIndexes[indexName];
      if (indexName === 'loadId_1') {
        console.log(`   ✅ ${indexName}:`, JSON.stringify({
          key: index.key,
          unique: index.unique,
          sparse: index.sparse
        }));
      }
    });

    console.log('\n✅ Исправление индексов завершено!');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

fixLoadIdIndex();
