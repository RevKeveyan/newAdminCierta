const mongoose = require("mongoose");
const addressSchema = require("./subModels/Address");

const customerSchema = new mongoose.Schema({
  companyName: {
    type: String,
    required: true
  },
  customerAddress: {
    type: addressSchema,
    required: true
  },
  // Дополнительные поля для удобства поиска
  emails: [{
    type: String,
    lowercase: true,
    unique: true,
  }],
  phoneNumber: String,
  
  // Метод оплаты (для PaymentReceivable)
  paymentMethod: {
    type: String,
    enum: ["ACH", "ZELLE", "Net 30"],
    default: "Net 30"
  },
  
  // Дополнительные платежные реквизиты
  paymentTerms: {
    type: String
  },
  
  // Кредитный лимит
  creditLimit: {
    type: Number,
    default: 0
  },
  
  // Files organized by type
  images: [String],  // Array of image URLs
  pdfs: [String],    // Array of PDF URLs
  
  // Legacy field for backward compatibility
  file: {
    type: String
  },
  
  // Связь с Loads
  loads: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Load'
  }]
}, { timestamps: true, versionKey: false });

// Индексы для быстрого поиска
customerSchema.index({ companyName: 1 });
customerSchema.index({ 'customerAddress.city': 1 });
customerSchema.index({ 'customerAddress.state': 1 });

module.exports = mongoose.model("Customer", customerSchema);








