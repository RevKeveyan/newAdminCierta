/**
 * Script to drop loadId index from Loads collection
 * This is a critical fix - the index loadId_1 exists in the database but the field doesn't exist in the model
 * 
 * Usage: node server/scripts/dropLoadIdIndexFromLoads.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function dropLoadIdIndexFromLoads() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/cierta', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const loadsCollection = db.collection('loads');

    // Get all indexes
    const indexes = await loadsCollection.indexes();
    console.log('\nCurrent Loads indexes:', indexes.map(idx => ({ name: idx.name, key: idx.key })));

    // Find and drop loadId index
    const loadIdIndex = indexes.find(idx => idx.key && idx.key.loadId);
    
    if (loadIdIndex) {
      console.log(`\n⚠️  Found loadId index: ${loadIdIndex.name}`);
      console.log(`   Index key:`, loadIdIndex.key);
      
      try {
        await loadsCollection.dropIndex(loadIdIndex.name);
        console.log(`\n✅ Successfully dropped index: ${loadIdIndex.name}`);
        console.log('   The loadId_1 index has been removed from the loads collection.');
      } catch (error) {
        if (error.code === 27 || error.message.includes('index not found')) {
          console.log(`\n⚠️  Index ${loadIdIndex.name} not found (may have been already dropped)`);
        } else {
          throw error;
        }
      }
    } else {
      console.log('\n✅ No loadId index found in Loads collection. All good!');
    }

    // Verify indexes after drop
    const remainingIndexes = await loadsCollection.indexes();
    console.log('\nRemaining Loads indexes:', remainingIndexes.map(idx => idx.name));

    // Close connection
    await mongoose.connection.close();
    console.log('\n✅ Connection closed');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
}

// Run the script
dropLoadIdIndexFromLoads();






