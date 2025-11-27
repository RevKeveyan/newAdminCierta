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
    lowercase: true
  }],
  phoneNumber: String,
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




