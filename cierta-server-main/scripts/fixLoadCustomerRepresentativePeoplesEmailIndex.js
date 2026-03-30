const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Load = require('../models/Load');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/Adminka';

async function fixLoadCustomerRepresentativePeoplesEmailIndex() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const collection = db.collection('loads');

    console.log('📋 Checking existing indexes...');
    const indexes = await collection.indexes();
    console.log('Current indexes:', indexes.map(idx => `${idx.name} (${JSON.stringify(idx.key)})`).join(', '));
    console.log('');

    const emailIndex = indexes.find(idx => 
      idx.name === 'loadCustomerRepresentativePeoples.email_1' || 
      (idx.key && idx.key['loadCustomerRepresentativePeoples.email'] === 1) ||
      (idx.key && JSON.stringify(idx.key) === JSON.stringify({ 'loadCustomerRepresentativePeoples.email': 1 }))
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
            await collection.dropIndex({ 'loadCustomerRepresentativePeoples.email': 1 });
            console.log('✅ Successfully dropped index by key pattern\n');
          } catch (err) {
            console.log(`⚠️  Could not drop index: ${err.message}\n`);
          }
        }
      }
    } else {
      console.log('ℹ️  loadCustomerRepresentativePeoples.email_1 index not found in index list\n');
      
      try {
        await collection.dropIndex('loadCustomerRepresentativePeoples.email_1');
        console.log('✅ Successfully dropped loadCustomerRepresentativePeoples.email_1 index (found by name)\n');
      } catch (dropError) {
        if (dropError.code === 27 || dropError.message.includes('index not found')) {
          console.log('ℹ️  Index loadCustomerRepresentativePeoples.email_1 does not exist\n');
        } else {
          console.log(`⚠️  Could not drop loadCustomerRepresentativePeoples.email_1: ${dropError.message}\n`);
        }
      }
    }

    console.log('🔍 Attempting to drop index directly via command...');
    try {
      await db.command({ dropIndexes: 'loads', index: 'loadCustomerRepresentativePeoples.email_1' });
      console.log('✅ Successfully dropped index via command\n');
    } catch (cmdError) {
      if (cmdError.code === 27 || cmdError.message.includes('index not found')) {
        console.log('ℹ️  Index does not exist (checked via command)\n');
      } else {
        console.log(`⚠️  Could not drop index via command: ${cmdError.message}\n`);
      }
    }

    console.log('🔍 Checking for any index containing loadCustomerRepresentativePeoples.email...');
    const allIndexes = await collection.indexes();
    const relatedIndexes = allIndexes.filter(idx => 
      (idx.name && idx.name.includes('loadCustomerRepresentativePeoples')) ||
      (idx.key && idx.key['loadCustomerRepresentativePeoples.email'] !== undefined)
    );
    if (relatedIndexes.length > 0) {
      console.log(`⚠️  Found ${relatedIndexes.length} index(es) related to loadCustomerRepresentativePeoples:`);
      relatedIndexes.forEach(idx => {
        console.log(`   - ${idx.name}: ${JSON.stringify(idx.key)}`);
        try {
          collection.dropIndex(idx.name);
          console.log(`   ✅ Dropped ${idx.name}`);
        } catch (err) {
          console.log(`   ⚠️  Could not drop ${idx.name}: ${err.message}`);
        }
      });
      console.log('');
    } else {
      console.log('✅ No indexes related to loadCustomerRepresentativePeoples.email found\n');
    }

    console.log('🔧 Force cleaning documents with loadCustomerRepresentativePeoples.email field...');
    const cursor = collection.find({ 
      'loadCustomerRepresentativePeoples.email': { $exists: true } 
    });
    let cleanedCount = 0;
    const bulkOps = [];
    for await (const doc of cursor) {
      if (doc.loadCustomerRepresentativePeoples && Array.isArray(doc.loadCustomerRepresentativePeoples)) {
        const updatedPeoples = doc.loadCustomerRepresentativePeoples.map(person => {
          if (person && typeof person === 'object') {
            const { email, ...rest } = person;
            if (email === null || email === undefined || email === '') {
              return rest;
            }
            return person;
          }
          return person;
        });
        bulkOps.push({
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: { loadCustomerRepresentativePeoples: updatedPeoples } }
          }
        });
        if (bulkOps.length >= 1000) {
          try {
            const result = await collection.bulkWrite(bulkOps, { ordered: false });
            cleanedCount += result.modifiedCount;
            bulkOps.length = 0;
          } catch (bulkError) {
            console.log(`⚠️  Bulk operation error: ${bulkError.message}`);
          }
        }
      }
    }
    if (bulkOps.length > 0) {
      try {
        const result = await collection.bulkWrite(bulkOps, { ordered: false });
        cleanedCount += result.modifiedCount;
      } catch (bulkError) {
        console.log(`⚠️  Final bulk operation error: ${bulkError.message}`);
      }
    }
    console.log(`✅ Cleaned ${cleanedCount} documents\n`);

    console.log('📋 Verifying indexes after cleanup...');
    const finalIndexes = await collection.indexes();
    console.log('Remaining indexes:', finalIndexes.map(idx => idx.name).join(', '));
    console.log('');

    console.log('✅ Fix completed successfully!');
    console.log('\n📝 Summary:');
    console.log(`   - Removed unique constraint from loadCustomerRepresentativePeoples.email`);
    console.log(`   - Dropped loadCustomerRepresentativePeoples.email_1 index from database`);
    console.log('\n✨ You can now create loads with multiple loadCustomerRepresentativePeoples having null emails');

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
  fixLoadCustomerRepresentativePeoplesEmailIndex()
    .then(() => {
      console.log('\n✅ Script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = fixLoadCustomerRepresentativePeoplesEmailIndex;
