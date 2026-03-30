const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/test';

async function dropBillOfLadingIndex() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const Load = mongoose.model('Load', new mongoose.Schema({}, { strict: false }));
    
    // Get all indexes
    const indexes = await Load.collection.indexes();
    console.log('Current indexes:', indexes.map(idx => idx.name));

    // Find and drop billOfLadingNumber index
    const billOfLadingIndex = indexes.find(idx => 
      idx.name === 'billOfLadingNumber_1' || 
      (idx.key && idx.key.billOfLadingNumber)
    );

    if (billOfLadingIndex) {
      await Load.collection.dropIndex(billOfLadingIndex.name);
      console.log(`✅ Successfully dropped index: ${billOfLadingIndex.name}`);
    } else {
      console.log('ℹ️  billOfLadingNumber index not found (may have already been dropped)');
    }

    // Verify it's gone
    const indexesAfter = await Load.collection.indexes();
    console.log('Indexes after drop:', indexesAfter.map(idx => idx.name));

    await mongoose.connection.close();
    console.log('MongoDB connection closed');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

dropBillOfLadingIndex();




