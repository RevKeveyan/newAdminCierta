const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Customer = require('../models/Customer');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/Adminka';

async function fixCustomerEmailsIndex() {
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

    const emailsIndex = indexes.find(idx => 
      idx.name === 'emails_1' || 
      (idx.key && idx.key.emails === 1) ||
      (idx.key && JSON.stringify(idx.key) === JSON.stringify({ emails: 1 }))
    );
    
    if (emailsIndex) {
      console.log(`🗑️  Dropping index: ${emailsIndex.name}...`);
      try {
        await collection.dropIndex(emailsIndex.name);
        console.log(`✅ Successfully dropped index: ${emailsIndex.name}\n`);
      } catch (dropError) {
        if (dropError.code === 27 || dropError.message.includes('index not found')) {
          console.log(`ℹ️  Index ${emailsIndex.name} already removed\n`);
        } else {
          console.log(`⚠️  Error dropping index ${emailsIndex.name}: ${dropError.message}`);
          try {
            await collection.dropIndex({ emails: 1 });
            console.log('✅ Successfully dropped index by key pattern\n');
          } catch (err) {
            console.log(`⚠️  Could not drop index: ${err.message}\n`);
          }
        }
      }
    } else {
      console.log('ℹ️  emails_1 index not found in index list\n');
      
      try {
        await collection.dropIndex('emails_1');
        console.log('✅ Successfully dropped emails_1 index (found by name)\n');
      } catch (dropError) {
        if (dropError.code === 27 || dropError.message.includes('index not found')) {
          console.log('ℹ️  Index emails_1 does not exist\n');
        } else {
          console.log(`⚠️  Could not drop emails_1: ${dropError.message}\n`);
        }
      }
    }

    console.log('🧹 Cleaning emails field from existing documents...');
    
    const docsWithEmails = await collection.countDocuments({ emails: { $exists: true } });
    console.log(`Found ${docsWithEmails} documents with emails field`);
    
    const result = await collection.updateMany(
      { emails: { $exists: true } },
      { $unset: { emails: "" } }
    );
    console.log(`✅ Removed emails field from ${result.modifiedCount} documents\n`);
    
    const docsWithNullEmails = await collection.countDocuments({ emails: null });
    if (docsWithNullEmails > 0) {
      console.log(`⚠️  Found ${docsWithNullEmails} documents with emails: null, cleaning them...`);
      
      try {
        const nullResult = await collection.updateMany(
          { emails: null },
          { $unset: { emails: "" } }
        );
        console.log(`✅ Cleaned ${nullResult.modifiedCount} documents with emails: null`);
      } catch (updateError) {
        console.log(`⚠️  Error updating documents: ${updateError.message}`);
        console.log('Trying alternative approach...');
        
        const cursor = collection.find({ emails: null });
        let count = 0;
        for await (const doc of cursor) {
          try {
            await collection.updateOne(
              { _id: doc._id },
              { $unset: { emails: "" } }
            );
            count++;
          } catch (err) {
            console.log(`Error updating document ${doc._id}: ${err.message}`);
          }
        }
        console.log(`✅ Cleaned ${count} documents individually\n`);
      }
    }
    
    console.log('🔍 Attempting to drop emails_1 index directly via command...');
    try {
      await db.command({ dropIndexes: 'customers', index: 'emails_1' });
      console.log('✅ Successfully dropped emails_1 index via command\n');
    } catch (cmdError) {
      if (cmdError.code === 27 || cmdError.message.includes('index not found')) {
        console.log('ℹ️  Index emails_1 does not exist (checked via command)\n');
      } else {
        console.log(`⚠️  Could not drop index via command: ${cmdError.message}\n`);
      }
    }
    
    console.log('🔍 Checking for any index containing emails field...');
    const allIndexes = await collection.indexes();
    const emailsRelatedIndexes = allIndexes.filter(idx => 
      idx.name && idx.name.includes('emails') ||
      (idx.key && idx.key.emails !== undefined)
    );
    if (emailsRelatedIndexes.length > 0) {
      console.log(`⚠️  Found ${emailsRelatedIndexes.length} index(es) related to emails:`);
      emailsRelatedIndexes.forEach(idx => {
        console.log(`   - ${idx.name}: ${JSON.stringify(idx.key)}`);
      });
      console.log('');
    } else {
      console.log('✅ No indexes related to emails field found\n');
    }
    
    console.log('🔧 Force cleaning documents with emails field using bulk operations...');
    const cursor = collection.find({ $or: [{ emails: { $exists: true } }, { emails: null }] });
    let cleanedCount = 0;
    const bulkOps = [];
    for await (const doc of cursor) {
      bulkOps.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $unset: { emails: "" } }
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
    if (bulkOps.length > 0) {
      try {
        const result = await collection.bulkWrite(bulkOps, { ordered: false });
        cleanedCount += result.modifiedCount;
      } catch (bulkError) {
        console.log(`⚠️  Final bulk operation error: ${bulkError.message}`);
      }
    }
    console.log(`✅ Cleaned ${cleanedCount} documents using bulk operations\n`);

    console.log('📋 Verifying indexes after cleanup...');
    const finalIndexes = await collection.indexes();
    console.log('Remaining indexes:', finalIndexes.map(idx => idx.name).join(', '));
    console.log('');

    console.log('✅ Fix completed successfully!');
    console.log('\n📝 Summary:');
    console.log(`   - Dropped emails index`);
    console.log(`   - Removed emails field from ${result.modifiedCount} documents`);
    console.log('\n✨ You can now create customers without the emails field');

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
  fixCustomerEmailsIndex()
    .then(() => {
      console.log('\n✅ Script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = fixCustomerEmailsIndex;
