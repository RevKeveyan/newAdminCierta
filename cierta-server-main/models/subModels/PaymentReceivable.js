const mongoose = require("mongoose");
const { getCurrentDateUTC5 } = require("../../utils/dateUtils");
const { normalizeAmount, calculateReceivableConfirmedAmount } = require("../../utils/dateNormalization");

/**
 * PaymentReceivable - платежи от customer
 * Создается автоматически когда Load переходит в статус "Delivered"
 */
const paymentReceivableSchema = new mongoose.Schema(
  {
    // Ссылка на Load (для связи с грузом)
    loadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Load",
      required: false
    },
    
    // Ссылка на Customer
    customer: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Customer",
      required: true,
    },
    
    // Статус платежа
    status: {
      type: String,
      enum: ["pending", "invoiced", "withheld", "canceled", "on Hold", "received", "partially received", "pay today"],
      default: "pending",
    },
    
    // Метод оплаты
    paymentMethod: {
      type: String,
      enum: ["ACH", "Wire", "Check", "Credit Card", "Cash", "Zelle", "Other"],
    },
    
    // Банковские реквизиты
    // bank: { type: String, trim: true },
    // routing: { type: String, trim: true },
    // accountNumber: { type: String, trim: true },
    paymentLink: { type: String, trim: true },
    dtp: { type: String, trim: true }, // для Check или Other
    
    // Order ID from Load (для отображения)
    orderId: { type: String, trim: true },
    
    // Суммы платежа
    customerRate: { type: Number, default: 0 }, // Базовая ставка от customer
    totalAmount: { type: Number, default: 0 }, // Полная сумма (customerRate + fees + tonu)
    confirmedAmount: { type: Number, default: 0 }, // Подтверждённая сумма для расчёта прибыли (при статусах received/partially received)
    
    // Детали fees (доплаты от customer)
    fees: [{
      type: { type: String, enum: ['Detention', 'Layover', 'Lumper fee'] },
      customerRate: { type: Number, default: 0 },
      total: { type: Number, default: 0 }
    }],
    
    // TONU (Truck Ordered Not Used) - доплата от customer
    tonu: {
      enabled: { type: Boolean, default: false },
      customerRate: { type: Number, default: 0 }
    },
    
    // Deadline and notification fields
    deadlineDays: { type: Number, required: true }, // Comes from frontend
    
    // Invoice and due dates
    invoiceAt: { type: Date, default: null }, // When first became invoiced
    dueAt: { type: Date, default: null }, // Fixed deadline (invoiceAt + deadlineDays)
    
    // Status tracking
    statusSince: { type: Date, default: null }, // When current status started (replaces statusChangedAt)
    holdStartedAt: { type: Date, default: null }, // Only if status is on Hold, else null
    receivedAt: { type: Date, default: null }, // When became received
    
    // Notification scheduling
    nextNotifyAt: { type: Date, default: null }, // "Alarm" for cron/worker
    
    // Notification tracking
    notified: {
      overdueAt: { type: Date, default: null }, // First "overdue" notification
      overdueRepeatAt: { type: Date, default: null }, // Last repeat notification (if repeating)
      payTodayAt: { type: Date, default: null }, // Optional: if using pay today as "now require payment"
      dueTodayAt: { type: Date, default: null }, // Due today notification
      overdueDayAt: { type: Date, default: null }, // 1 day overdue
      overdueWeekAt: { type: Date, default: null }, // 7 days overdue
      overdueMonthAt: { type: Date, default: null } // 30 days overdue
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
paymentReceivableSchema.index({ customer: 1 });
paymentReceivableSchema.index({ status: 1 });
paymentReceivableSchema.index({ createdAt: -1 });
paymentReceivableSchema.index({ nextNotifyAt: 1 }); // For cron/worker queries
paymentReceivableSchema.index({ dueAt: 1 });
paymentReceivableSchema.index({ invoiceAt: 1 }); // Для статистики по датам платежей
paymentReceivableSchema.index({ status: 1, dueAt: 1 }); // Композитный для статистики
paymentReceivableSchema.index({ status: 1, createdAt: -1 }); // Композитный для фильтрации
paymentReceivableSchema.index({ status: 1, invoiceAt: 1 }); // Композитный для статистики по датам
paymentReceivableSchema.index({ orderId: 1 }); // Индекс для поиска по orderId
paymentReceivableSchema.index({ createdBy: 1 });
paymentReceivableSchema.index({ updatedAt: -1 });
paymentReceivableSchema.index({ status: 1, updatedAt: -1 });
paymentReceivableSchema.index({ loadId: 1 }, { unique: true, sparse: true });

// Helper function to add days to a date in UTC-5
function addDaysUTC5(date, days) {
  if (!date) return null;
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

// Pre-save hook: notification scheduling and status tracking
paymentReceivableSchema.pre("save", function (next) {
  const now = getCurrentDateUTC5();
  const wasNew = this.isNew;
  const statusChanged = this.isModified("status");
  const deadlineDaysChanged = this.isModified("deadlineDays");
  
  if (this.isModified("totalAmount") || this.isModified("customerRate") || wasNew) {
    this.totalAmount = normalizeAmount(this.totalAmount);
    this.customerRate = normalizeAmount(this.customerRate);
    
    if (this.fees && Array.isArray(this.fees)) {
      this.fees = this.fees.map(fee => ({
        ...fee,
        customerRate: normalizeAmount(fee.customerRate),
        total: normalizeAmount(fee.total)
      }));
    }
    
    if (this.tonu && this.tonu.enabled) {
      this.tonu.customerRate = normalizeAmount(this.tonu.customerRate);
    }
  }
  
  if (statusChanged || this.isModified("totalAmount") || wasNew) {
    this.confirmedAmount = calculateReceivableConfirmedAmount(this);
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
  
  // Final statuses: received, canceled, withheld
  const finalStatuses = ['received', 'canceled', 'withheld'];
  const isFinalStatus = finalStatuses.includes(this.status);
  
  if (statusChanged) {
    // Handle final statuses
    if (isFinalStatus) {
      this.nextNotifyAt = null;
      this.holdStartedAt = null;
      
      if (this.status === 'received' && !this.receivedAt) {
        this.receivedAt = now;
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
        // If returning to invoiced and dueAt hasn't passed, reschedule
        if (this.status === 'invoiced' && this.dueAt && this.dueAt > now) {
          // Notify 1 day after due date (reactive)
          this.nextNotifyAt = addDaysUTC5(this.dueAt, 1);
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
      
      // Schedule notification: notify 1 day after due date (reactive)
      if (this.dueAt) {
        this.nextNotifyAt = addDaysUTC5(this.dueAt, 1);
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
      this.nextNotifyAt = addDaysUTC5(this.dueAt, 1);
    }
  }
  
  next();
});

module.exports = mongoose.model("PaymentReceivable", paymentReceivableSchema);
