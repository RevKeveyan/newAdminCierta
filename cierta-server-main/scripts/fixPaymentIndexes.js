const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

/**
 * Скрипт для удаления старых индексов из коллекций платежей
 * Используйте этот скрипт если получаете ошибку E11000 duplicate key error index: loadId_1
 */

async function fixIndexes() {
  try {
    console.log('🔧 Fixing payment collection indexes...\n');

    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/cierta_db';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // Удаляем старые индексы loadId если они существуют
    const collections = ['paymentreceivables', 'paymentpayables'];

    for (const collectionName of collections) {
      try {
        const collection = db.collection(collectionName);
        const indexes = await collection.indexes();
        
        console.log(`📋 Checking indexes for ${collectionName}:`);
        indexes.forEach(idx => {
          console.log(`   - ${idx.name}: ${JSON.stringify(idx.key)}`);
        });

        // Пытаемся удалить индекс loadId_1 если он существует
        try {
          await collection.dropIndex('loadId_1');
          console.log(`✅ Removed index loadId_1 from ${collectionName}\n`);
        } catch (e) {
          if (e.code === 27 || e.message.includes('index not found')) {
            console.log(`ℹ️  Index loadId_1 does not exist in ${collectionName}\n`);
          } else {
            throw e;
          }
        }
      } catch (error) {
        console.error(`❌ Error processing ${collectionName}:`, error.message);
      }
    }

    console.log('✅ Index cleanup completed!');
    console.log('\n💡 You can now run the test data generation script:');
    console.log('   npm run generate-test-stats-data');

  } catch (error) {
    console.error('❌ Error fixing indexes:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

if (require.main === module) {
  fixIndexes()
    .then(() => {
      console.log('\n✨ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Failed:', error);
      process.exit(1);
    });
}

module.exports = { fixIndexes };
