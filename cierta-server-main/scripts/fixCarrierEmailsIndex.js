const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Carrier = require('../models/Carrier');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/Adminka';

async function fixCarrierEmailsIndex() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const collection = db.collection('carriers');

    console.log('📋 Checking existing indexes...');
    const indexes = await collection.indexes();
    console.log('Current indexes:', indexes.map(idx => idx.name).join(', '));
    console.log('');

  

    console.log('🧹 Cleaning emails field from existing documents...');
    const result = await collection.updateMany(
      { emails: { $exists: true } },
      { $unset: { emails: "" } }
    );
    console.log(`✅ Removed emails field from ${result.modifiedCount} documents\n`);

    console.log('📋 Verifying indexes after cleanup...');
    const finalIndexes = await collection.indexes();
    console.log('Remaining indexes:', finalIndexes.map(idx => idx.name).join(', '));
    console.log('');

    console.log('✅ Fix completed successfully!');
    console.log('\n📝 Summary:');
    console.log(`   - Dropped emails index`);
    console.log(`   - Removed emails field from ${result.modifiedCount} documents`);
    console.log('\n✨ You can now create carriers without the emails field');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 MongoDB connection closed');
  }
}

if (require.main === module) {
  fixCarrierEmailsIndex()
    .then(() => {
      console.log('\n✅ Script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = fixCarrierEmailsIndex;
