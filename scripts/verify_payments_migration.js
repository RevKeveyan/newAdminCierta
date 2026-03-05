require('dotenv').config();
const mongoose = require('mongoose');
const PaymentReceivable = require('../models/subModels/PaymentReceivable');
const PaymentPayable = require('../models/subModels/PaymentPayable');

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME;

const SAMPLE_SIZE = 50;

async function verifyPaymentsMigration() {
  try {
    await mongoose.connect(MONGO_URI, {
      dbName: MONGO_DB_NAME || 'cierta_db'
    });

    console.log('✅ Подключение к MongoDB установлено\n');

    const totalReceivable = await PaymentReceivable.countDocuments();
    const totalPayable = await PaymentPayable.countDocuments();
    
    console.log(`📊 Всего PaymentReceivable: ${totalReceivable}`);
    console.log(`📊 Всего PaymentPayable: ${totalPayable}\n`);

    const sampleSize = Math.min(SAMPLE_SIZE, Math.max(totalReceivable, totalPayable));
    
    console.log(`🔍 Проверка ${sampleSize} случайных документов...\n`);

    const receivableSample = await PaymentReceivable.find({})
      .limit(sampleSize)
      .select('_id orderId totalAmount confirmedAmount invoiceAt createdAt loadId customer createdBy status')
      .lean();

    const payableSample = await PaymentPayable.find({})
      .limit(sampleSize)
      .select('_id orderId totalAmount confirmedAmount invoiceAt createdAt loadId carrier createdBy status')
      .lean();

    const checks = {
      receivable: {
        totalAmount: { number: 0, string: 0, null: 0, invalid: 0 },
        confirmedAmount: { number: 0, null: 0, invalid: 0 },
        invoiceAt: { date: 0, null: 0, invalid: 0, string: 0 },
        createdBy: { exists: 0, missing: 0 }
      },
      payable: {
        totalAmount: { number: 0, string: 0, null: 0, invalid: 0 },
        confirmedAmount: { number: 0, null: 0, invalid: 0 },
        invoiceAt: { date: 0, null: 0, invalid: 0, string: 0 },
        createdBy: { exists: 0, missing: 0 }
      }
    };

    const issues = [];

    function checkField(fieldName, value, checksObj, docId, docType) {
      if (value === null || value === undefined) {
        checksObj[fieldName].null++;
      } else if (typeof value === 'number') {
        if (isNaN(value)) {
          checksObj[fieldName].invalid++;
          issues.push({
            docType,
            docId,
            field: fieldName,
            issue: 'NaN value'
          });
        } else {
          checksObj[fieldName].number++;
        }
      } else if (typeof value === 'string') {
        checksObj[fieldName].string++;
        issues.push({
          docType,
          docId,
          field: fieldName,
          issue: `String вместо Number: "${value}"`
        });
      } else if (value instanceof Date) {
        if (isNaN(value.getTime())) {
          checksObj[fieldName].invalid++;
          issues.push({
            docType,
            docId,
            field: fieldName,
            issue: 'Invalid Date'
          });
        } else {
          checksObj[fieldName].date++;
        }
      } else {
        checksObj[fieldName].invalid++;
        issues.push({
          docType,
          docId,
          field: fieldName,
          issue: `Неожиданный тип: ${typeof value}`
        });
      }
    }

    console.log('📋 Проверка PaymentReceivable:\n');

    for (const doc of receivableSample) {
      checkField('totalAmount', doc.totalAmount, checks.receivable, doc._id, 'Receivable');
      checkField('confirmedAmount', doc.confirmedAmount, checks.receivable, doc._id, 'Receivable');
      checkField('invoiceAt', doc.invoiceAt, checks.receivable, doc._id, 'Receivable');
      
      if (doc.createdBy) {
        checks.receivable.createdBy.exists++;
      } else {
        checks.receivable.createdBy.missing++;
      }
    }

    console.log('📋 Проверка PaymentPayable:\n');

    for (const doc of payableSample) {
      checkField('totalAmount', doc.totalAmount, checks.payable, doc._id, 'Payable');
      checkField('confirmedAmount', doc.confirmedAmount, checks.payable, doc._id, 'Payable');
      checkField('invoiceAt', doc.invoiceAt, checks.payable, doc._id, 'Payable');
      
      if (doc.createdBy) {
        checks.payable.createdBy.exists++;
      } else {
        checks.payable.createdBy.missing++;
      }
    }

    console.log('📊 РЕЗУЛЬТАТЫ ПРОВЕРКИ:\n');

    console.log('PaymentReceivable:');
    console.log(`   totalAmount: Number=${checks.receivable.totalAmount.number}, String=${checks.receivable.totalAmount.string}, Null=${checks.receivable.totalAmount.null}, Invalid=${checks.receivable.totalAmount.invalid}`);
    console.log(`   confirmedAmount: Number=${checks.receivable.confirmedAmount.number}, Null=${checks.receivable.confirmedAmount.null}, Invalid=${checks.receivable.confirmedAmount.invalid}`);
    console.log(`   invoiceAt: Date=${checks.receivable.invoiceAt.date}, Null=${checks.receivable.invoiceAt.null}, String=${checks.receivable.invoiceAt.string}, Invalid=${checks.receivable.invoiceAt.invalid}`);
    console.log(`   createdBy: Exists=${checks.receivable.createdBy.exists}, Missing=${checks.receivable.createdBy.missing}`);

    console.log('\nPaymentPayable:');
    console.log(`   totalAmount: Number=${checks.payable.totalAmount.number}, String=${checks.payable.totalAmount.string}, Null=${checks.payable.totalAmount.null}, Invalid=${checks.payable.totalAmount.invalid}`);
    console.log(`   confirmedAmount: Number=${checks.payable.confirmedAmount.number}, Null=${checks.payable.confirmedAmount.null}, Invalid=${checks.payable.confirmedAmount.invalid}`);
    console.log(`   invoiceAt: Date=${checks.payable.invoiceAt.date}, Null=${checks.payable.invoiceAt.null}, String=${checks.payable.invoiceAt.string}, Invalid=${checks.payable.invoiceAt.invalid}`);
    console.log(`   createdBy: Exists=${checks.payable.createdBy.exists}, Missing=${checks.payable.createdBy.missing}`);

    if (issues.length > 0) {
      console.log(`\n⚠️  Найдено проблем: ${issues.length}\n`);
      console.log('Детали проблем:');
      issues.slice(0, 20).forEach(issue => {
        console.log(`   ${issue.docType} ${issue.docId}: ${issue.field} - ${issue.issue}`);
      });
      if (issues.length > 20) {
        console.log(`   ... и еще ${issues.length - 20} проблем`);
      }
    } else {
      console.log('\n✅ Проблем не обнаружено!');
    }

    const receivableWithStringTotal = await PaymentReceivable.countDocuments({
      totalAmount: { $type: 'string' }
    });
    const payableWithStringTotal = await PaymentPayable.countDocuments({
      totalAmount: { $type: 'string' }
    });
    
    console.log(`\n📊 PaymentReceivable с totalAmount (String): ${receivableWithStringTotal}`);
    console.log(`📊 PaymentPayable с totalAmount (String): ${payableWithStringTotal}`);

    const receivableWithInvoiceAt = await PaymentReceivable.countDocuments({
      invoiceAt: { $exists: true, $ne: null, $type: 'date' }
    });
    const payableWithInvoiceAt = await PaymentPayable.countDocuments({
      invoiceAt: { $exists: true, $ne: null, $type: 'date' }
    });
    
    console.log(`📊 PaymentReceivable с invoiceAt (Date): ${receivableWithInvoiceAt}`);
    console.log(`📊 PaymentPayable с invoiceAt (Date): ${payableWithInvoiceAt}`);

    await mongoose.connection.close();
    process.exit(issues.length > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Ошибка при проверке:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

verifyPaymentsMigration();
