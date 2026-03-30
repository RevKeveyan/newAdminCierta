require('dotenv').config();
const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Carrier = require('../models/Carrier');
const User = require('../models/User');

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME;

async function fixDuplicateIndexes() {
  try {
    await mongoose.connect(MONGO_URI, {
      dbName: MONGO_DB_NAME || 'cierta_db'
    });

    console.log('✅ Подключение к MongoDB установлено\n');

    console.log('🔍 Проверка индексов...\n');

    const customerIndexes = await Customer.collection.getIndexes();
    console.log('Customer indexes:', JSON.stringify(customerIndexes, null, 2));

    const carrierIndexes = await Carrier.collection.getIndexes();
    console.log('\nCarrier indexes:', JSON.stringify(carrierIndexes, null, 2));

    const userIndexes = await User.collection.getIndexes();
    console.log('\nUser indexes:', JSON.stringify(userIndexes, null, 2));

    console.log('\n📋 Рекомендации:');
    console.log('1. Если видите дубликаты индексов (например, email_1 и email_1_sparse),');
    console.log('   удалите старые через MongoDB Compass или mongo shell:');
    console.log('   db.customers.dropIndex("email_1")');
    console.log('   db.carriers.dropIndex("email_1")');
    console.log('   db.carriers.dropIndex("mcNumber_1")');
    console.log('   db.carriers.dropIndex("dotNumber_1")');
    console.log('   db.carriers.dropIndex("companyName_1")');
    console.log('\n2. Затем запустите syncIndexes():');
    console.log('   await Customer.syncIndexes()');
    console.log('   await Carrier.syncIndexes()');
    console.log('   await User.syncIndexes()');

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Ошибка:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

fixDuplicateIndexes();
