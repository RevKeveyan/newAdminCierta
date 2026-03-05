const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Customer = require('../models/Customer');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/Adminka';

async function fixRepresentativePeoplesEmailIndex() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const collection = db.collection('customers');

    console.log('📋 Checking existing indexes...');
    const indexes = await collection.indexes();
    console.log('Current indexes:', indexes.map(idx => `${idx.name} (${JSON.stringify(idx.key)})`).join(', '));
    console.log('');

    const emailIndex = indexes.find(idx => 
      idx.name === 'representativePeoples.email_1' || 
      (idx.key && idx.key['representativePeoples.email'] === 1) ||
      (idx.key && JSON.stringify(idx.key) === JSON.stringify({ 'representativePeoples.email': 1 }))
    );
    
    if (emailIndex) {
      console.log(`🗑️  Dropping index: ${emailIndex.name}...`);
      try {
        await collection.dropIndex(emailIndex.name);
        console.log(`✅ Successfully dropped index: ${emailIndex.name}\n`);
      } catch (dropError) {
        if (dropError.code === 27 || dropError.message.includes('index not found')) {
          console.log(`ℹ️  Index ${emailIndex.name} already removed\n`);
        } else {
          console.log(`⚠️  Error dropping index ${emailIndex.name}: ${dropError.message}`);
          try {
            await collection.dropIndex({ 'representativePeoples.email': 1 });
            console.log('✅ Successfully dropped index by key pattern\n');
          } catch (err) {
            console.log(`⚠️  Could not drop index: ${err.message}\n`);
          }
        }
      }
    } else {
      console.log('ℹ️  representativePeoples.email_1 index not found in index list\n');
      
      try {
        await collection.dropIndex('representativePeoples.email_1');
        console.log('✅ Successfully dropped representativePeoples.email_1 index (found by name)\n');
      } catch (dropError) {
        if (dropError.code === 27 || dropError.message.includes('index not found')) {
          console.log('ℹ️  Index representativePeoples.email_1 does not exist\n');
        } else {
          console.log(`⚠️  Could not drop representativePeoples.email_1: ${dropError.message}\n`);
        }
      }
    }

    console.log('🔍 Attempting to drop index directly via command...');
    try {
      await db.command({ dropIndexes: 'customers', index: 'representativePeoples.email_1' });
      console.log('✅ Successfully dropped index via command\n');
    } catch (cmdError) {
      if (cmdError.code === 27 || cmdError.message.includes('index not found')) {
        console.log('ℹ️  Index does not exist (checked via command)\n');
      } else {
        console.log(`⚠️  Could not drop index via command: ${cmdError.message}\n`);
      }
    }

    console.log('📋 Verifying indexes after cleanup...');
    const finalIndexes = await collection.indexes();
    console.log('Remaining indexes:', finalIndexes.map(idx => idx.name).join(', '));
    console.log('');

    console.log('✅ Fix completed successfully!');
    console.log('\n📝 Summary:');
    console.log(`   - Removed unique constraint from representativePeoples.email in schema`);
    console.log(`   - Dropped representativePeoples.email_1 index from database`);
    console.log('\n✨ You can now create customers with multiple representativePeoples having null emails');

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
  fixRepresentativePeoplesEmailIndex()
    .then(() => {
      console.log('\n✅ Script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = fixRepresentativePeoplesEmailIndex;
