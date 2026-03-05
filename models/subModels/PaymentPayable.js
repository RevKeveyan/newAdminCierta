const mongoose = require("mongoose");
const { getCurrentDateUTC5 } = require("../../utils/dateUtils");
const { normalizeAmount, calculatePayableConfirmedAmount } = require("../../utils/dateNormalization");

/**
 * PaymentPayable - платежи carrier
 * Создается автоматически когда Load переходит в статус "Delivered"
 */
const paymentPayableSchema = new mongoose.Schema(
  {
    // Ссылка на Load (для связи с грузом)
    loadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Load",
      required: false
    },
    
    // Ссылка на Carrier
    carrier: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Carrier', 
      required: true 
    },
    
    // Статус платежа
    status: {
      type: String,
      enum: ["pending", "invoiced", "withheld", "canceled", "on Hold", "paid", "partially paid", "pay today"],
      default: "pending"
    },
    
    // Метод оплаты
    paymentMethod: {
      type: String,
      enum: ["ACH", "Wire", "Check", "Credit Card", "Cash", "Zelle", "Factoring", "Other"]
    },
    
    // Банковские реквизиты
    bank: { type: String, trim: true },
    routing: { type: String, trim: true },
    accountNumber: { type: String, trim: true },
    
    // Order ID from Load (для отображения)
    orderId: { type: String, trim: true },
    
    // Суммы платежа
    carrierRate: { type: Number, default: 0 }, // Базовая ставка для carrier
    totalAmount: { type: Number, default: 0 }, // Полная сумма (carrierRate + fees + tonu)
    confirmedAmount: { type: Number, default: 0 }, // Подтверждённая сумма для расчёта прибыли (при статусах paid/partially paid)
    
    // Детали fees (доплаты от customer, которые мы платим carrier)
    fees: [{
      type: { type: String, enum: ['Detention', 'Layover', 'Lumper fee'] },
      carrierRate: { type: Number, default: 0 },
      total: { type: Number, default: 0 }
    }],
    
    // TONU (Truck Ordered Not Used) - доплата от customer, которую мы платим carrier
    tonu: {
      enabled: { type: Boolean, default: false },
      carrierRate: { type: Number, default: 0 }
    },
    
    // Deadline and notification fields
    deadlineDays: { type: Number, required: true }, // Comes from frontend (req.body.deadline / load.paymentTerms)
    
    // Invoice and due dates
    invoiceAt: { type: Date, default: null }, // When first became invoiced
    dueAt: { type: Date, default: null }, // Fixed deadline (invoiceAt + deadlineDays)
    
    // Status tracking
    statusSince: { type: Date, default: null }, // When current status started (replaces statusChangedAt)
    holdStartedAt: { type: Date, default: null }, // Only if status is on Hold, else null
    paidAt: { type: Date, default: null }, // When became paid
    
    // Notification scheduling
    nextNotifyAt: { type: Date, default: null }, // "Alarm" for cron/worker
    
    // Notification tracking
    notified: {
      dueSoonAt: { type: Date, default: null }, // "Due soon" (e.g., 1 day before)
      dueTodayAt: { type: Date, default: null }, // "Pay today"
      payTodayAt: { type: Date, default: null }, // "Pay today" (when status is pay today)
      overdueAt: { type: Date, default: null } // Optional: reminders after deadline
    },
    
    notes: { type: String, trim: true },
    
    // Файлы
    images: [String],
    pdfs: [String],
    
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true, versionKey: false }
);

// Индексы
paymentPayableSchema.index({ carrier: 1 });
paymentPayableSchema.index({ status: 1 });
paymentPayableSchema.index({ createdAt: -1 });
paymentPayableSchema.index({ nextNotifyAt: 1 }); // For cron/worker queries
paymentPayableSchema.index({ dueAt: 1 });
paymentPayableSchema.index({ invoiceAt: 1 }); // Для статистики по датам платежей
paymentPayableSchema.index({ status: 1, dueAt: 1 }); // Композитный для статистики
paymentPayableSchema.index({ status: 1, createdAt: -1 }); // Композитный для фильтрации
paymentPayableSchema.index({ status: 1, invoiceAt: 1 }); // Композитный для статистики по датам
paymentPayableSchema.index({ orderId: 1 }); // Индекс для поиска по orderId
paymentPayableSchema.index({ createdBy: 1 });
paymentPayableSchema.index({ updatedAt: -1 });
paymentPayableSchema.index({ status: 1, updatedAt: -1 });
paymentPayableSchema.index({ loadId: 1 }, { unique: true, sparse: true });

// Helper function to add days to a date in UTC-5
function addDaysUTC5(date, days) {
  if (!date) return null;
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

// Pre-save hook: notification scheduling and status tracking
paymentPayableSchema.pre('save', function(next) {
  const now = getCurrentDateUTC5();
  const wasNew = this.isNew;
  const statusChanged = this.isModified('status');
  const deadlineDaysChanged = this.isModified('deadlineDays');
  
  if (this.isModified("totalAmount") || this.isModified("carrierRate") || wasNew) {
    this.totalAmount = normalizeAmount(this.totalAmount);
    this.carrierRate = normalizeAmount(this.carrierRate);
    
    if (this.fees && Array.isArray(this.fees)) {
      this.fees = this.fees.map(fee => ({
        ...fee,
        carrierRate: normalizeAmount(fee.carrierRate),
        total: normalizeAmount(fee.total)
      }));
    }
    
    if (this.tonu && this.tonu.enabled) {
      this.tonu.carrierRate = normalizeAmount(this.tonu.carrierRate);
    }
  }
  
  if (statusChanged || this.isModified("totalAmount") || wasNew) {
    this.confirmedAmount = calculatePayableConfirmedAmount(this);
  }
  
  // Determine if we're exiting from on Hold
  // If holdStartedAt exists and status is changing to something other than on Hold, we're exiting
  const wasOnHold = !wasNew && this.holdStartedAt && this.status !== 'on Hold' && statusChanged;
  
  // Set createdAt and updatedAt in UTC-5
  if (wasNew) {
    this.createdAt = now;
    // Initialize notified object if new
    if (!this.notified) {
      this.notified = {};
    }
  }
  this.updatedAt = now;
  
  // Always update statusSince when status changes
  if (statusChanged) {
    this.statusSince = now;
  }
  
  // Final statuses: paid, canceled, withheld
  const finalStatuses = ['paid', 'canceled', 'withheld'];
  const isFinalStatus = finalStatuses.includes(this.status);
  
  if (statusChanged) {
    // Handle final statuses
    if (isFinalStatus) {
      this.nextNotifyAt = null;
      this.holdStartedAt = null;
      
      if (this.status === 'paid' && !this.paidAt) {
        this.paidAt = now;
      }
    }
    
    // Handle on Hold status
    if (this.status === 'on Hold') {
      this.holdStartedAt = now;
      this.nextNotifyAt = null; // Disable notifications
      // dueAt stays fixed, don't change it
    } else {
      // Exiting from on Hold
      if (wasOnHold) {
        this.holdStartedAt = null;
        // If returning to invoiced and dueAt hasn't passed, reschedule notification
        if (this.status === 'invoiced' && this.dueAt && this.dueAt > now) {
          const oneDayBefore = addDaysUTC5(this.dueAt, -1);
          if (oneDayBefore > now) {
            this.nextNotifyAt = oneDayBefore;
          } else {
            this.nextNotifyAt = now;
          }
        }
      }
    }
    
    // Handle invoiced status
    if (this.status === 'invoiced') {
      // Set invoiceAt if empty
      if (!this.invoiceAt) {
        this.invoiceAt = now;
      }
      
      // Calculate or update dueAt
      if (!this.dueAt || deadlineDaysChanged) {
        this.dueAt = addDaysUTC5(this.invoiceAt, this.deadlineDays || 0);
      }
      
      // Schedule notification: notify 1 day before due date (proactive)
      if (this.dueAt) {
        const oneDayBefore = addDaysUTC5(this.dueAt, -1);
        if (oneDayBefore > now) {
          this.nextNotifyAt = oneDayBefore;
        } else {
          // Due date is close or passed, notify immediately
          this.nextNotifyAt = now;
        }
      }
    }
    
    // Handle pay today status
    if (this.status === 'pay today') {
      this.nextNotifyAt = now; // Notify immediately
    }
  } else if (deadlineDaysChanged && this.status === 'invoiced' && this.invoiceAt) {
    // If deadlineDays changed while invoiced, recalculate dueAt
    this.dueAt = addDaysUTC5(this.invoiceAt, this.deadlineDays || 0);
    
    // Reschedule notification
    if (this.dueAt) {
      const oneDayBefore = addDaysUTC5(this.dueAt, -1);
      if (oneDayBefore > now) {
        this.nextNotifyAt = oneDayBefore;
      } else {
        this.nextNotifyAt = now;
      }
    }
  }
  
  next();
});

module.exports = mongoose.model("PaymentPayable", paymentPayableSchema);
