const mongoose = require("mongoose");

/**
 * PaymentPayable - модель для платежей, выплачиваемых carrier
 * Создается автоматически когда Load переходит в статус "Delivered"
 */
const paymentPayableSchema = new mongoose.Schema(
  {
    // Ссылка на Load
    loadId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Load', 
      required: true 
    },
    
    // Ссылка на Carrier
    carrier: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Carrier', 
      required: true 
    },
    
    // Банковские реквизиты для выплаты
    bank: {
      type: String,
      trim: true
    },
    
    routing: {
      type: String,
      trim: true
    },
    
    accountNumber: {
      type: String,
      trim: true
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
paymentPayableSchema.index({ loadId: 1 });
paymentPayableSchema.index({ carrier: 1 });
paymentPayableSchema.index({ createdAt: -1 });

module.exports = mongoose.model("PaymentPayable", paymentPayableSchema);
