const cron = require('node-cron');
const PaymentReceivable = require('../models/subModels/PaymentReceivable');
const PaymentPayable = require('../models/subModels/PaymentPayable');
const Load = require('../models/Load');
const notificationService = require('../services/notificationService');
const { getCurrentDateUTC5 } = require('../utils/dateUtils');

function getUtc5DateParts(date) {
  const d = date instanceof Date ? date : new Date(date);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate()
  };
}

function isSameUtc5Day(a, b) {
  if (!a || !b) return false;
  const da = getUtc5DateParts(a);
  const db = getUtc5DateParts(b);
  return da.year === db.year && da.month === db.month && da.day === db.day;
}

/**
 * Cron job to check for payment notifications
 * Runs every hour to check for:
 * 1. PaymentReceivable past due (when dueAt has passed)
 * 2. PaymentPayable need to pay (when dueAt is reached)
 */
async function checkPaymentNotifications() {
  const now = getCurrentDateUTC5();
  console.log(`[PaymentNotificationsCron] Checking payment notifications at ${now.toISOString()}`);

  try {
    // 1. Check PaymentReceivable due today and overdue milestones (1, 7, 30 days)
    const receivablesToCheck = await PaymentReceivable.find({
      status: { $nin: ['received', 'canceled', 'withheld'] },
      dueAt: { $ne: null }
    })
      .populate('customer', 'companyName emails phoneNumber customerAddress')
      .lean();

    console.log(`[PaymentNotificationsCron] Found ${receivablesToCheck.length} receivables to check`);

    for (const receivable of receivablesToCheck) {
      try {
        // Find load through paymentReceivable field
        const load = await Load.findOne({ paymentReceivable: receivable._id })
          .select('orderId customer customerRate')
          .lean();
        if (!load) {
          console.warn(`[PaymentNotificationsCron] Load not found for receivable ${receivable._id}`);
          continue;
        }

        const dueAt = receivable.dueAt ? new Date(receivable.dueAt) : null;
        if (!dueAt || isNaN(dueAt.getTime())) {
          continue;
        }

        const updates = {};

        if (!receivable.notified?.dueTodayAt && isSameUtc5Day(dueAt, now)) {
          await notificationService.sendPaymentDueToday(receivable, load);
          updates['notified.dueTodayAt'] = now;
          console.log(`[PaymentNotificationsCron] Sent due today notification for receivable ${receivable._id}, load ${load.orderId}`);
        }

        const daysOverdue = Math.floor((now - dueAt) / (1000 * 60 * 60 * 24));

        if (daysOverdue === 1 && !receivable.notified?.overdueDayAt) {
          await notificationService.sendPaymentOverdue(receivable, load, daysOverdue);
          updates['notified.overdueDayAt'] = now;
          console.log(`[PaymentNotificationsCron] Sent 1-day overdue notification for receivable ${receivable._id}, load ${load.orderId}`);
        }

        if (daysOverdue === 7 && !receivable.notified?.overdueWeekAt) {
          await notificationService.sendPaymentOverdue(receivable, load, daysOverdue);
          updates['notified.overdueWeekAt'] = now;
          console.log(`[PaymentNotificationsCron] Sent 7-day overdue notification for receivable ${receivable._id}, load ${load.orderId}`);
        }

        if (daysOverdue === 30 && !receivable.notified?.overdueMonthAt) {
          await notificationService.sendPaymentOverdue(receivable, load, daysOverdue);
          updates['notified.overdueMonthAt'] = now;
          console.log(`[PaymentNotificationsCron] Sent 30-day overdue notification for receivable ${receivable._id}, load ${load.orderId}`);
        }

        if (Object.keys(updates).length > 0) {
          await PaymentReceivable.findByIdAndUpdate(receivable._id, {
            $set: updates
          });
        }
      } catch (error) {
        console.error(`[PaymentNotificationsCron] Error processing receivable ${receivable._id}:`, error);
      }
    }

    // 2. Check PaymentPayable need to pay (dueAt is reached and not paid/canceled)
    // PaymentPayable notifies 1 day before dueAt, so we check if dueAt is today or passed
    const payablesToPay = await PaymentPayable.find({
      status: { $nin: ['paid', 'canceled'] },
      dueAt: { $lte: now },
      nextNotifyAt: { $lte: now, $ne: null },
      $or: [
        { 'notified.dueTodayAt': null }, // Not yet notified for "due today"
        { 'notified.payTodayAt': null } // Not yet notified for "pay today"
      ]
    })
      .populate('carrier', 'name email phoneNumber')
      .lean();

    console.log(`[PaymentNotificationsCron] Found ${payablesToPay.length} payables need to pay`);

    for (const payable of payablesToPay) {
      try {
        // Find load through paymentPayable field
        const load = await Load.findOne({ paymentPayable: payable._id })
          .select('orderId carrier carrierRate')
          .lean();
        if (!load) {
          console.warn(`[PaymentNotificationsCron] Load not found for payable ${payable._id}`);
          continue;
        }

        // Get recipients: admin users and carrier users
        const User = require('../models/User');
        const adminUsers = await User.find({ role: 'admin' }).select('_id').lean();
        const recipients = adminUsers.map(u => u._id.toString());

        // Add carrier users if available
        if (payable.carrier && typeof payable.carrier === 'object') {
          const carrierUsers = await User.find({ 
            role: 'carrier',
            carrier: payable.carrier._id || payable.carrier
          }).select('_id').lean();
          carrierUsers.forEach(u => recipients.push(u._id.toString()));
        }

        // Send notification
        await notificationService.sendNotification({
          type: 'payment_payable_need_to_pay',
          title: `💰 Payment Payable: ${load.orderId || payable._id}`,
          message: `Payment for load ${load.orderId || load._id} is due. Amount: $${payable.amount || load.carrierRate || 'N/A'}`,
          recipients: [...new Set(recipients)],
          data: {
            paymentPayableId: payable._id?.toString() || payable.id,
            loadId: load?._id?.toString() || load?.id,
            orderId: load.orderId,
            carrierId: payable.carrier?._id?.toString() || payable.carrier?.toString(),
            carrier: payable.carrier,
            amount: payable.amount || load.carrierRate,
            carrierRate: payable.carrierRate || load.carrierRate,
            status: payable.status,
            dueAt: payable.dueAt,
            invoiceAt: payable.invoiceAt,
            load: {
              id: load._id?.toString() || load.id,
              orderId: load.orderId,
              status: load.status
            }
          },
          priority: 'high'
        });

        // Mark as notified
        await PaymentPayable.findByIdAndUpdate(payable._id, {
          $set: {
            'notified.dueTodayAt': now,
            'notified.payTodayAt': now,
            nextNotifyAt: null // Clear nextNotifyAt after notification
          }
        });

        console.log(`[PaymentNotificationsCron] Sent need to pay notification for payable ${payable._id}, load ${load.orderId}`);
      } catch (error) {
        console.error(`[PaymentNotificationsCron] Error processing payable ${payable._id}:`, error);
      }
    }

    // 3. Check PaymentPayable overdue (past due and not paid)
    const overduePayables = await PaymentPayable.find({
      status: { $nin: ['paid', 'canceled'] },
      dueAt: { $lt: now },
      nextNotifyAt: { $lte: now, $ne: null },
      'notified.overdueAt': null
    })
      .populate('carrier', 'name email phoneNumber')
      .lean();

    console.log(`[PaymentNotificationsCron] Found ${overduePayables.length} overdue payables`);

    for (const payable of overduePayables) {
      try {
        const load = await Load.findOne({ paymentPayable: payable._id })
          .select('orderId carrier carrierRate createdBy status')
          .lean();
        if (!load) {
          console.warn(`[PaymentNotificationsCron] Load not found for overdue payable ${payable._id}`);
          continue;
        }

        const daysOverdue = Math.floor((now - new Date(payable.dueAt)) / (1000 * 60 * 60 * 24));

        await notificationService.sendPaymentPayableOverdue(payable, load, daysOverdue);

        await PaymentPayable.findByIdAndUpdate(payable._id, {
          $set: {
            'notified.overdueAt': now,
            nextNotifyAt: null
          }
        });

        console.log(`[PaymentNotificationsCron] Sent overdue notification for payable ${payable._id}, load ${load.orderId}`);
      } catch (error) {
        console.error(`[PaymentNotificationsCron] Error processing overdue payable ${payable._id}:`, error);
      }
    }

    console.log(`[PaymentNotificationsCron] Completed checking payment notifications`);
  } catch (error) {
    console.error('[PaymentNotificationsCron] Error checking payment notifications:', error);
  }
}

const shouldSchedule = process.env.CRON_DISABLE_SCHEDULE !== 'true';

if (shouldSchedule) {
  // Run every hour
  cron.schedule('0 * * * *', async () => {
    await checkPaymentNotifications();
  });

  // Also run on startup (after 1 minute delay to allow server to initialize)
  setTimeout(async () => {
    console.log('[PaymentNotificationsCron] Running initial payment notifications check');
    await checkPaymentNotifications();
  }, 60000);
}

module.exports = { checkPaymentNotifications };

