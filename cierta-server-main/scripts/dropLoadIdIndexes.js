/**
 * Script to drop old loadId indexes from PaymentReceivable and PaymentPayable collections
 * Run this script once after removing loadId field from models
 * 
 * Usage: node server/scripts/dropLoadIdIndexes.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function dropLoadIdIndexes() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/cierta', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;

    // Get collections
    const loadsCollection = db.collection('loads');
    const paymentReceivableCollection = db.collection('paymentreceivables');
    const paymentPayableCollection = db.collection('paymentpayables');

    // Get all indexes
    const loadsIndexes = await loadsCollection.indexes();
    const receivableIndexes = await paymentReceivableCollection.indexes();
    const payableIndexes = await paymentPayableCollection.indexes();

    console.log('\nLoads indexes:', loadsIndexes.map(idx => idx.name));
    console.log('PaymentReceivable indexes:', receivableIndexes.map(idx => idx.name));
    console.log('PaymentPayable indexes:', payableIndexes.map(idx => idx.name));

    // Drop loadId indexes if they exist
    let dropped = false;

    // Check and drop from Loads collection
    for (const index of loadsIndexes) {
      if (index.key && index.key.loadId) {
        console.log(`\nDropping index from Loads: ${index.name}`);
        await loadsCollection.dropIndex(index.name);
        console.log(`✓ Dropped index: ${index.name}`);
        dropped = true;
      }
    }

    // Check and drop from PaymentReceivable collection
    for (const index of receivableIndexes) {
      if (index.key && index.key.loadId) {
        console.log(`\nDropping index from PaymentReceivable: ${index.name}`);
        await paymentReceivableCollection.dropIndex(index.name);
        console.log(`✓ Dropped index: ${index.name}`);
        dropped = true;
      }
    }

    for (const index of payableIndexes) {
      if (index.key && index.key.loadId) {
        console.log(`\nDropping index from PaymentPayable: ${index.name}`);
        await paymentPayableCollection.dropIndex(index.name);
        console.log(`✓ Dropped index: ${index.name}`);
        dropped = true;
      }
    }

    if (!dropped) {
      console.log('\n✓ No loadId indexes found. All indexes are up to date.');
    } else {
      console.log('\n✓ Successfully dropped all loadId indexes');
    }

    // Close connection
    await mongoose.connection.close();
    console.log('\nConnection closed');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run the script
dropLoadIdIndexes();

