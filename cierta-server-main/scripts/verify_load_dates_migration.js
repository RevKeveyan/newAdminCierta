require('dotenv').config();
const mongoose = require('mongoose');
const Load = require('../models/Load');

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME;

const SAMPLE_SIZE = 100;

async function verifyMigration() {
  try {
    await mongoose.connect(MONGO_URI, {
      dbName: MONGO_DB_NAME || 'cierta_db'
    });

    console.log('✅ Подключение к MongoDB установлено\n');

    const totalLoads = await Load.countDocuments();
    console.log(`📊 Всего Loads в базе: ${totalLoads}\n`);

    const sampleSize = Math.min(SAMPLE_SIZE, totalLoads);
    const loads = await Load.find({})
      .limit(sampleSize)
      .lean();

    console.log(`🔍 Проверка ${sampleSize} случайных документов...\n`);

    const checks = {
      deadlineAt: { total: 0, date: 0, null: 0, invalid: 0 },
      assignedAt: { total: 0, date: 0, null: 0, invalid: 0 },
      pickupAt: { total: 0, date: 0, null: 0, invalid: 0 },
      pickupStartAt: { total: 0, date: 0, null: 0, invalid: 0 },
      pickupEndAt: { total: 0, date: 0, null: 0, invalid: 0 },
      deliveryAt: { total: 0, date: 0, null: 0, invalid: 0 },
      deliveryStartAt: { total: 0, date: 0, null: 0, invalid: 0 },
      deliveryEndAt: { total: 0, date: 0, null: 0, invalid: 0 }
    };

    const issues = [];

    for (const load of loads) {
      const dates = load.dates || {};

      function checkDateField(fieldName, value) {
        checks[fieldName].total++;
        if (!value) {
          checks[fieldName].null++;
        } else if (value instanceof Date) {
          if (isNaN(value.getTime())) {
            checks[fieldName].invalid++;
            issues.push({
              loadId: load._id,
              orderId: load.orderId,
              field: fieldName,
              issue: 'Invalid Date'
            });
          } else {
            checks[fieldName].date++;
          }
        } else {
          issues.push({
            loadId: load._id,
            orderId: load.orderId,
            field: fieldName,
            issue: `Не Date тип: ${typeof value}`
          });
        }
      }

      checkDateField('deadlineAt', dates.deadlineAt);
      checkDateField('assignedAt', dates.assignedAt);
      checkDateField('pickupAt', dates.pickupAt);
      checkDateField('pickupStartAt', dates.pickupStartAt);
      checkDateField('pickupEndAt', dates.pickupEndAt);
      checkDateField('deliveryAt', dates.deliveryAt);
      checkDateField('deliveryStartAt', dates.deliveryStartAt);
      checkDateField('deliveryEndAt', dates.deliveryEndAt);

      if (dates.pickupDateType === 'Estimate') {
        if (dates.pickupStartAt && dates.pickupEndAt) {
          if (dates.pickupStartAt > dates.pickupEndAt) {
            issues.push({
              loadId: load._id,
              orderId: load.orderId,
              field: 'pickupDateRange',
              issue: 'pickupStartAt > pickupEndAt'
            });
          }
        }
      }

      if (dates.deliveryDateType === 'Estimate') {
        if (dates.deliveryStartAt && dates.deliveryEndAt) {
          if (dates.deliveryStartAt > dates.deliveryEndAt) {
            issues.push({
              loadId: load._id,
              orderId: load.orderId,
              field: 'deliveryDateRange',
              issue: 'deliveryStartAt > deliveryEndAt'
            });
          }
        }
      }
    }

    console.log('📋 РЕЗУЛЬТАТЫ ПРОВЕРКИ:\n');

    Object.keys(checks).forEach(fieldName => {
      const check = checks[fieldName];
      if (check.total > 0) {
        console.log(`${fieldName}:`);
        console.log(`   Всего проверок: ${check.total}`);
        console.log(`   ✅ Date: ${check.date}`);
        console.log(`   ⚪ Null: ${check.null}`);
        console.log(`   ❌ Invalid: ${check.invalid}`);
        console.log('');
      }
    });

    if (issues.length > 0) {
      console.log(`\n⚠️  Найдено проблем: ${issues.length}\n`);
      console.log('Детали проблем:');
      issues.slice(0, 20).forEach(issue => {
        console.log(`   Load ${issue.orderId || issue.loadId}: ${issue.field} - ${issue.issue}`);
      });
      if (issues.length > 20) {
        console.log(`   ... и еще ${issues.length - 20} проблем`);
      }
    } else {
      console.log('✅ Проблем не обнаружено!');
    }

    const loadsWithDeadlineString = await Load.countDocuments({
      'dates.deadline': { $exists: true, $ne: null, $ne: '' },
      'dates.deadlineAt': { $exists: false }
    });
    console.log(`\n📊 Loads с deadline (string) но без deadlineAt: ${loadsWithDeadlineString}`);

    const loadsWithDeadlineAt = await Load.countDocuments({
      'dates.deadlineAt': { $exists: true, $ne: null }
    });
    console.log(`📊 Loads с deadlineAt (Date): ${loadsWithDeadlineAt}`);

    await mongoose.connection.close();
    process.exit(issues.length > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Ошибка при проверке:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

verifyMigration();
