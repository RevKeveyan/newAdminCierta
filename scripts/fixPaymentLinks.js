const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Загружаем все модели перед использованием
const Load = require('../models/Load');
const Customer = require('../models/Customer');
const Carrier = require('../models/Carrier');
const PaymentReceivable = require('../models/subModels/PaymentReceivable');
const PaymentPayable = require('../models/subModels/PaymentPayable');

/**
 * Скрипт для исправления связей между Loads и Payments
 * Создает платежи для delivered loads, которые их не имеют
 */

async function fixPaymentLinks() {
  try {
    console.log('🔧 Fixing payment links for delivered loads...\n');

    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/cierta_db';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Находим все delivered loads без платежей
    const deliveredLoads = await Load.find({
      status: 'Delivered',
      $or: [
        { paymentReceivable: { $exists: false } },
        { paymentReceivable: null },
        { paymentPayable: { $exists: false } },
        { paymentPayable: null }
      ]
    })
    .lean();

    console.log(`📊 Found ${deliveredLoads.length} delivered loads without payment links\n`);

    if (deliveredLoads.length === 0) {
      console.log('✅ All delivered loads already have payment links!');
      return;
    }

    let fixedCount = 0;
    let createdReceivableCount = 0;
    let createdPayableCount = 0;

    for (const load of deliveredLoads) {
      try {
        const deadlineDays = parseInt(load.paymentTerms) || 30;
        
        // Создаем или находим PaymentReceivable
        let receivable = null;
        if (load.paymentReceivable) {
          receivable = await PaymentReceivable.findById(load.paymentReceivable);
        }
        
        if (!receivable && load.customer) {
          // Создаем новый PaymentReceivable
          const receivableData = {
            customer: load.customer._id || load.customer,
            status: 'pending',
            paymentMethod: load.paymentMethod || 'ACH',
            deadlineDays: deadlineDays,
            createdAt: load.createdAt || new Date(),
            updatedAt: load.updatedAt || new Date()
          };
          
          receivable = await PaymentReceivable.create(receivableData);
          createdReceivableCount++;
        }

        // Создаем или находим PaymentPayable
        let payable = null;
        if (load.paymentPayable) {
          payable = await PaymentPayable.findById(load.paymentPayable);
        }
        
        if (!payable && load.carrier) {
          // Получаем данные carrier для банковских реквизитов
          const carrier = await Carrier.findById(load.carrier._id || load.carrier).lean();
          
          const payableData = {
            carrier: load.carrier._id || load.carrier,
            status: 'pending',
            paymentMethod: load.paymentMethod || 'ACH',
            deadlineDays: deadlineDays,
            bank: carrier?.bank || null,
            routing: carrier?.routing || null,
            accountNumber: carrier?.accountNumber || null,
            createdAt: load.createdAt || new Date(),
            updatedAt: load.updatedAt || new Date()
          };
          
          payable = await PaymentPayable.create(payableData);
          createdPayableCount++;
        }

        // Обновляем load с ссылками на платежи
        const updateData = {};
        if (receivable) {
          updateData.paymentReceivable = receivable._id;
        }
        if (payable) {
          updateData.paymentPayable = payable._id;
        }

        if (Object.keys(updateData).length > 0) {
          await Load.findByIdAndUpdate(load._id, updateData);
          fixedCount++;
        }

        if (fixedCount % 10 === 0) {
          console.log(`  Fixed ${fixedCount}/${deliveredLoads.length} loads...`);
        }
      } catch (error) {
        console.error(`  ⚠️  Error fixing load ${load.orderId}:`, error.message);
      }
    }

    console.log(`\n✅ Fixed ${fixedCount} loads`);
    console.log(`   Created ${createdReceivableCount} PaymentReceivable`);
    console.log(`   Created ${createdPayableCount} PaymentPayable`);

    // Проверяем результаты
    const loadsWithReceivable = await Load.countDocuments({
      status: 'Delivered',
      paymentReceivable: { $exists: true, $ne: null }
    });
    
    const loadsWithPayable = await Load.countDocuments({
      status: 'Delivered',
      paymentPayable: { $exists: true, $ne: null }
    });

    const totalDelivered = await Load.countDocuments({ status: 'Delivered' });

    console.log(`\n📊 Final status:`);
    console.log(`   Total delivered loads: ${totalDelivered}`);
    console.log(`   Loads with PaymentReceivable: ${loadsWithReceivable}`);
    console.log(`   Loads with PaymentPayable: ${loadsWithPayable}`);

    if (loadsWithReceivable < totalDelivered || loadsWithPayable < totalDelivered) {
      console.log(`\n⚠️  Some loads still don't have payment links`);
      console.log(`   This might be because:`);
      console.log(`   1. Loads don't have customer/carrier`);
      console.log(`   2. There were errors during creation`);
    } else {
      console.log(`\n✅ All delivered loads now have payment links!`);
      console.log(`\n💡 Next step: Run rebuild-stats to update statistics`);
    }

  } catch (error) {
    console.error('❌ Error fixing payment links:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

if (require.main === module) {
  fixPaymentLinks()
    .then(() => {
      console.log('\n✨ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Failed:', error);
      process.exit(1);
    });
}

module.exports = { fixPaymentLinks };
