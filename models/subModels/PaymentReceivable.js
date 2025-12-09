const mongoose = require("mongoose");

/**
 * PaymentReceivable - модель для платежей, получаемых от customer
 * Создается автоматически когда Load переходит в статус "Delivered"
 */
const paymentReceivableSchema = new mongoose.Schema(
  {
    // Ссылка на Load
    loadId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Load', 
      required: true 
    },
    
    // Ссылка на Customer
    customer: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Customer', 
      required: true 
    },
    
    // Дата инвойса (устанавливается когда статус меняется на "Received")
    invoicedDate: { 
      type: Date 
    },
    
    // Количество дней на оплату (1-90, по умолчанию 30)
    daysToPay: {
      type: Number,
      min: 1,
      max: 90,
      default: 30
    },
    
    // Статус инвойса
    invoiceStatus: {
      type: String,
      enum: ["pending", "invoiced", "received", "overdue", "cancelled"],
      default: "pending"
    },
    
    // Files organized by type
    images: [String],  // Array of image URLs
    pdfs: [String]     // Array of PDF URLs
  },
  { 
    timestamps: true, 
    versionKey: false 
  }
);

// Индексы для быстрого поиска
paymentReceivableSchema.index({ loadId: 1 });
paymentReceivableSchema.index({ customer: 1 });
paymentReceivableSchema.index({ invoiceStatus: 1 });
paymentReceivableSchema.index({ invoicedDate: 1 });
paymentReceivableSchema.index({ createdAt: -1 });

// Pre-save hook: устанавливаем invoicedDate когда статус меняется на "received"
paymentReceivableSchema.pre('save', function(next) {
  if (this.isModified('invoiceStatus') && this.invoiceStatus === 'received' && !this.invoicedDate) {
    this.invoicedDate = new Date();
  }
  next();
});

module.exports = mongoose.model("PaymentReceivable", paymentReceivableSchema);
