require('dotenv').config();
const mongoose = require('mongoose');
const Load = require('../models/Load');
const PaymentReceivable = require('../models/subModels/PaymentReceivable');
const PaymentPayable = require('../models/subModels/PaymentPayable');
const StatsSnapshot = require('../models/subModels/StatsSnapshot');
const StatsDirty = require('../models/subModels/StatsDirty');
const User = require('../models/User');
const Customer = require('../models/Customer');
const { getStatsScope } = require('../utils/statsPermissions');
const { markDirtyForLoad, markDirtyForPayment } = require('../utils/markDirty');
const { computeSnapshot, processTask } = require('../services/statsWorker');
const { getDateKeyUTC5 } = require('../utils/dateKeyUtils');
const { getCurrentDateUTC5 } = require('../utils/dateUtils');

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME;

let testResults = [];
let testCustomerId = null;
let testCarrierId = null;
let testUserId = null;
let testLoadId = null;
let testReceivableId = null;
let testPayableId = null;
let testFreightBrokerUser = null;
let testAccountingInUser = null;

function logTest(name, passed, message = '') {
  const status = passed ? '✅' : '❌';
  testResults.push({ name, passed, message });
  console.log(`${status} ${name}${message ? `: ${message}` : ''}`);
}

async function cleanup() {
  try {
    if (testLoadId) {
      await Load.findByIdAndDelete(testLoadId);
    }
    if (testReceivableId) {
      await PaymentReceivable.findByIdAndDelete(testReceivableId);
    }
    if (testPayableId) {
      await PaymentPayable.findByIdAndDelete(testPayableId);
    }
    if (testCustomerId) {
      await Customer.findByIdAndDelete(testCustomerId);
    }
    if (testCarrierId) {
      const Carrier = require('../models/Carrier');
      await Carrier.findByIdAndDelete(testCarrierId);
    }
    if (testUserId) {
      await User.findByIdAndDelete(testUserId);
    }
    if (testFreightBrokerUser && testFreightBrokerUser._id) {
      await User.findByIdAndDelete(testFreightBrokerUser._id);
    }
    if (testAccountingInUser && testAccountingInUser._id) {
      await User.findByIdAndDelete(testAccountingInUser._id);
    }

    const today = getDateKeyUTC5();
    await StatsSnapshot.deleteMany({
      dateKey: today,
      entityType: 'system',
      entityId: null
    });
    await StatsDirty.deleteMany({
      dateKey: today,
      entityType: 'system',
      entityId: null
    });
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

async function testLoadCreatedIncreasesTotal() {
  console.log('\n📋 Тест 1: Load created → вырос total');
  
  try {
    const today = getDateKeyUTC5();
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);

    const beforeSnapshot = await StatsSnapshot.findOne({
      grain: 'day',
      dateKey: today,
      entityType: 'system',
      entityId: null
    }).lean();

    const beforeTotal = beforeSnapshot?.loads?.total || 0;

    if (!testCustomerId) {
      const customer = new Customer({
        companyName: `Test Customer ${Date.now()}`,
        email: `test-customer-${Date.now()}@test.com`,
        paymentTerms: '15'
      });
      await customer.save();
      testCustomerId = customer._id;
    }

    if (!testUserId) {
      const testUser = new User({
        firstName: 'Test',
        lastName: 'User',
        email: `test-user-${Date.now()}@test.com`,
        password: 'test',
        role: 'admin'
      });
      await testUser.save();
      testUserId = testUser._id;
    }

    const testLoad = new Load({
      orderId: `TEST-${Date.now()}`,
      status: 'Listed',
      customer: testCustomerId,
      paymentTerms: '15',
      createdBy: testUserId,
      createdAt: getCurrentDateUTC5()
    });
    await testLoad.save();
    testLoadId = testLoad._id;

    await markDirtyForLoad(testLoad, ['loads']);

    let workerId = `test-worker-${Date.now()}`;
    let processed = 0;
    for (let i = 0; i < 10; i++) {
      const task = await processTask(workerId);
      if (!task) break;
      processed++;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    const afterSnapshot = await StatsSnapshot.findOne({
      grain: 'day',
      dateKey: today,
      entityType: 'system',
      entityId: null
    }).lean();

    const afterTotal = afterSnapshot?.loads?.total || 0;

    if (afterTotal > beforeTotal) {
      logTest('Load created increases total', true, `Before: ${beforeTotal}, After: ${afterTotal}`);
    } else {
      logTest('Load created increases total', false, `Before: ${beforeTotal}, After: ${afterTotal} (не увеличился)`);
    }
  } catch (error) {
    logTest('Load created increases total', false, error.message);
  }
}

async function testStatusChangeRebuild() {
  console.log('\n📋 Тест 2: Статус меняется → rebuild корректен');
  
  try {
    if (!testLoadId) {
      logTest('Status change rebuild', false, 'testLoadId не создан');
      return;
    }

    const today = getDateKeyUTC5();
    
    const load = await Load.findById(testLoadId);
    const oldStatus = load.status;
    
    load.status = 'Delivered';
    await load.save();

    await markDirtyForLoad(load, ['loads']);

    let workerId = `test-worker-${Date.now()}`;
    let processed = 0;
    for (let i = 0; i < 10; i++) {
      const task = await processTask(workerId);
      if (!task) break;
      processed++;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    const snapshot = await StatsSnapshot.findOne({
      grain: 'day',
      dateKey: today,
      entityType: 'system',
      entityId: null
    }).lean();

    const deliveredCount = snapshot?.loads?.byStatus?.delivered || 0;
    const listedCount = snapshot?.loads?.byStatus?.listed || 0;

    if (deliveredCount > 0) {
      logTest('Status change rebuild', true, `Delivered: ${deliveredCount}, Listed: ${listedCount}`);
    } else {
      logTest('Status change rebuild', false, `Delivered: ${deliveredCount} (должен быть > 0)`);
    }
  } catch (error) {
    logTest('Status change rebuild', false, error.message);
  }
}

async function testDeadlineExpired() {
  console.log('\n📋 Тест 3: deadline прошёл → expired растёт');
  
  try {
    const today = getDateKeyUTC5();
    
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    
    if (!testCustomerId) {
      const customer = new Customer({
        companyName: `Test Customer ${Date.now()}`,
        email: `test-customer-${Date.now()}@test.com`,
        paymentTerms: '15'
      });
      await customer.save();
      testCustomerId = customer._id;
    }

    if (!testUserId) {
      const testUser = new User({
        firstName: 'Test',
        lastName: 'User',
        email: `test-user-${Date.now()}@test.com`,
        password: 'test',
        role: 'admin'
      });
      await testUser.save();
      testUserId = testUser._id;
    }

    const expiredLoad = new Load({
      orderId: `TEST-EXPIRED-${Date.now()}`,
      status: 'Listed',
      customer: testCustomerId,
      paymentTerms: '15',
      createdBy: testUserId,
      dates: {
        deadlineAt: yesterday,
        deadline: yesterday.toISOString()
      },
      createdAt: getCurrentDateUTC5()
    });
    await expiredLoad.save();

    await markDirtyForLoad(expiredLoad, ['loads']);

    let workerId = `test-worker-${Date.now()}`;
    let processed = 0;
    for (let i = 0; i < 10; i++) {
      const task = await processTask(workerId);
      if (!task) break;
      processed++;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    const snapshot = await StatsSnapshot.findOne({
      grain: 'day',
      dateKey: today,
      entityType: 'system',
      entityId: null
    }).lean();

    const expiredCount = snapshot?.loads?.byStatus?.expired || 0;

    if (expiredCount > 0) {
      logTest('Deadline expired increases count', true, `Expired: ${expiredCount}`);
    } else {
      logTest('Deadline expired increases count', false, `Expired: ${expiredCount} (должен быть > 0)`);
    }

    await Load.findByIdAndDelete(expiredLoad._id);
  } catch (error) {
    logTest('Deadline expired increases count', false, error.message);
  }
}

async function testReceivableReceived() {
  console.log('\n📋 Тест 4: receivable received → confirmedReceived растёт');
  
  try {
    const today = getDateKeyUTC5();
    
    if (!testCustomerId) {
      const customer = new Customer({
        companyName: 'Test Customer',
        email: `test-customer-${Date.now()}@test.com`,
        paymentTerms: '15'
      });
      await customer.save();
      testCustomerId = customer._id;
    }

    const customer = await Customer.findById(testCustomerId).lean();
    const deadlineDays = customer.paymentTerms ? parseInt(customer.paymentTerms.match(/\d+/)?.[0] || '15', 10) : 15;

    const receivable = new PaymentReceivable({
      customer: testCustomerId,
      status: 'received',
      totalAmount: 1000,
      confirmedAmount: 1000,
      deadlineDays: deadlineDays,
      invoiceAt: getCurrentDateUTC5(),
      createdAt: getCurrentDateUTC5()
    });
    await receivable.save();
    testReceivableId = receivable._id;

    await markDirtyForPayment(receivable, 'receivable');

    let workerId = `test-worker-${Date.now()}`;
    let processed = 0;
    for (let i = 0; i < 10; i++) {
      const task = await processTask(workerId);
      if (!task) break;
      processed++;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    const snapshot = await StatsSnapshot.findOne({
      grain: 'day',
      dateKey: today,
      entityType: 'system',
      entityId: null
    }).lean();

    const confirmed = snapshot?.receivable?.money?.confirmed || 0;

    if (confirmed >= 1000) {
      logTest('Receivable received increases confirmed', true, `Confirmed: ${confirmed}`);
    } else {
      logTest('Receivable received increases confirmed', false, `Confirmed: ${confirmed} (ожидалось >= 1000)`);
    }
  } catch (error) {
    logTest('Receivable received increases confirmed', false, error.message);
  }
}

async function testPayablePaid() {
  console.log('\n📋 Тест 5: payable paid → confirmedPaid растёт → profit меняется');
  
  try {
    const today = getDateKeyUTC5();
    
    if (!testCarrierId) {
      const Carrier = require('../models/Carrier');
      const carrier = new Carrier({
        name: 'Test Carrier',
        email: `test-carrier-${Date.now()}@test.com`,
        equipmentType: ['Dry Van']
      });
      await carrier.save();
      testCarrierId = carrier._id;
    }

    if (!testLoadId) {
      if (!testCustomerId) {
        const customer = new Customer({
          companyName: `Test Customer ${Date.now()}`,
          email: `test-customer-${Date.now()}@test.com`,
          paymentTerms: '15'
        });
        await customer.save();
        testCustomerId = customer._id;
      }

      if (!testUserId) {
        const testUser = new User({
          firstName: 'Test',
          lastName: 'User',
          email: `test-user-${Date.now()}@test.com`,
          password: 'test',
          role: 'admin'
        });
        await testUser.save();
        testUserId = testUser._id;
      }

      const testLoad = new Load({
        orderId: `TEST-PAYABLE-${Date.now()}`,
        status: 'Delivered',
        customer: testCustomerId,
        carrier: testCarrierId,
        paymentTerms: '15',
        createdBy: testUserId,
        createdAt: getCurrentDateUTC5()
      });
      await testLoad.save();
      testLoadId = testLoad._id;
    }

    const load = await Load.findById(testLoadId).lean();
    const deadlineDays = load.paymentTerms ? parseInt(load.paymentTerms.match(/\d+/)?.[0] || '15', 10) : 15;

    const beforeSnapshot = await StatsSnapshot.findOne({
      grain: 'day',
      dateKey: today,
      entityType: 'system',
      entityId: null
    }).lean();

    const beforeProfit = beforeSnapshot?.finance?.profitConfirmed || 0;

    const payable = new PaymentPayable({
      loadId: testLoadId,
      carrier: testCarrierId,
      status: 'paid',
      totalAmount: 500,
      confirmedAmount: 500,
      deadlineDays: deadlineDays,
      invoiceAt: getCurrentDateUTC5(),
      createdAt: getCurrentDateUTC5()
    });
    await payable.save();
    testPayableId = payable._id;

    await markDirtyForPayment(payable, 'payable');

    let workerId = `test-worker-${Date.now()}`;
    let processed = 0;
    for (let i = 0; i < 10; i++) {
      const task = await processTask(workerId);
      if (!task) break;
      processed++;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    const afterSnapshot = await StatsSnapshot.findOne({
      grain: 'day',
      dateKey: today,
      entityType: 'system',
      entityId: null
    }).lean();

    const confirmed = afterSnapshot?.payable?.money?.confirmed || 0;
    const afterProfit = afterSnapshot?.finance?.profitConfirmed || 0;

    if (confirmed >= 500) {
      logTest('Payable paid increases confirmed', true, `Confirmed: ${confirmed}`);
      
      if (afterProfit !== beforeProfit) {
        logTest('Payable paid changes profit', true, `Before: ${beforeProfit}, After: ${afterProfit}`);
      } else {
        logTest('Payable paid changes profit', false, `Before: ${beforeProfit}, After: ${afterProfit} (не изменился)`);
      }
    } else {
      logTest('Payable paid increases confirmed', false, `Confirmed: ${confirmed} (ожидалось >= 500)`);
    }
  } catch (error) {
    logTest('Payable paid increases confirmed', false, error.message);
  }
}

async function testFreightBrokerAccess() {
  console.log('\n📋 Тест 6: freightBroker видит только allowedCustomers');
  
  try {
    if (!testCustomerId) {
      const customer = new Customer({
        companyName: 'Test Customer',
        email: `test-customer-${Date.now()}@test.com`,
        type: 'platform',
        paymentTerms: '15'
      });
      await customer.save();
      testCustomerId = customer._id;
    }

    const freightBroker = new User({
      firstName: 'Test',
      lastName: 'Broker',
      email: `test-broker-${Date.now()}@test.com`,
      password: 'test',
      role: 'freightBroker',
      allowedCustomers: [testCustomerId]
    });
    await freightBroker.save();
    testFreightBrokerUser = freightBroker;

    const scope = await getStatsScope(freightBroker);

    const hasCustomerAccess = scope.allowedEntityTypes.includes('customer');
    const hasSystemAccess = scope.allowedEntityTypes.includes('system');
    const hasCorrectCustomerIds = scope.allowedEntityIds.customer?.includes(testCustomerId.toString());

    if (hasCustomerAccess && !hasSystemAccess && hasCorrectCustomerIds) {
      logTest('FreightBroker sees only allowedCustomers', true, `Customer IDs: ${scope.allowedEntityIds.customer?.length || 0}`);
    } else {
      logTest('FreightBroker sees only allowedCustomers', false, 
        `Customer: ${hasCustomerAccess}, System: ${hasSystemAccess}, Correct IDs: ${hasCorrectCustomerIds}`);
    }
  } catch (error) {
    logTest('FreightBroker sees only allowedCustomers', false, error.message);
  }
}

async function testAccountingInAccess() {
  console.log('\n📋 Тест 7: accountingIn видит только receivable stats');
  
  try {
    const accountingIn = new User({
      firstName: 'Test',
      lastName: 'Accounting',
      email: `test-accounting-${Date.now()}@test.com`,
      password: 'test',
      role: 'accountingIn'
    });
    await accountingIn.save();
    testAccountingInUser = accountingIn;

    const scope = await getStatsScope(accountingIn);

    const hasPaymentsAccess = scope.allowedSections.includes('payments');
    const hasLoadsAccess = scope.allowedSections.includes('loads');
    const hasReceivableAccess = scope.paymentTypes?.includes('receivable');
    const hasPayableAccess = scope.paymentTypes?.includes('payable');

    if (hasPaymentsAccess && !hasLoadsAccess && hasReceivableAccess && !hasPayableAccess) {
      logTest('AccountingIn sees only receivable stats', true, `Payment types: ${scope.paymentTypes?.join(', ') || 'null'}`);
    } else {
      logTest('AccountingIn sees only receivable stats', false,
        `Payments: ${hasPaymentsAccess}, Loads: ${hasLoadsAccess}, Receivable: ${hasReceivableAccess}, Payable: ${hasPayableAccess}`);
    }
  } catch (error) {
    logTest('AccountingIn sees only receivable stats', false, error.message);
  }
}

async function runTests() {
  try {
    await mongoose.connect(MONGO_URI, {
      dbName: MONGO_DB_NAME || 'cierta_db'
    });

    console.log('✅ Подключение к MongoDB установлено\n');
    console.log('🧪 Запуск тестов качества статистики...\n');

    await testLoadCreatedIncreasesTotal();
    await testStatusChangeRebuild();
    await testDeadlineExpired();
    await testReceivableReceived();
    await testPayablePaid();
    await testFreightBrokerAccess();
    await testAccountingInAccess();

    console.log('\n📊 РЕЗУЛЬТАТЫ ТЕСТОВ:\n');
    
    const passed = testResults.filter(t => t.passed).length;
    const failed = testResults.filter(t => !t.passed).length;
    
    testResults.forEach(test => {
      const status = test.passed ? '✅' : '❌';
      console.log(`${status} ${test.name}${test.message ? ` - ${test.message}` : ''}`);
    });

    console.log(`\n📈 Итого: ${passed} прошло, ${failed} провалено из ${testResults.length}`);

    if (failed === 0) {
      console.log('\n✅ Все тесты прошли успешно!');
    } else {
      console.log(`\n⚠️  ${failed} тест(ов) провалено. Проверьте логи выше.`);
    }

    await cleanup();
    await mongoose.connection.close();
    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Ошибка при выполнении тестов:', error);
    await cleanup();
    await mongoose.connection.close();
    process.exit(1);
  }
}

runTests();
