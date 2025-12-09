const mongoose = require("mongoose");
const addressSchema = require("./subModels/Address");

const carrierSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  phoneNumber: {
    type: String
  },
  email: {
    type: String,
    lowercase: true,
    unique: true,
    sparse: true // Allows multiple null/undefined values
  },
  companyName: {
    type: String
  },
  mcNumber: {
    type: String,
    unique: true,
    sparse: true // Allows multiple null/undefined values
  },
  dotNumber: {
    type: String,
    unique: true,
    sparse: true // Allows multiple null/undefined values
  },
  address: {
    type: addressSchema
  },
  // Дополнительные поля
  emails: [{
    type: String,
    lowercase: true,
    unique: true,
  }],
  photos: [String],
  // Информация об оборудовании и возможностях
  equipmentType: {
    type: String
  },
  size: {
    type: String
  },
  capabilities: [{
    type: String
  }],
  certifications: [{
    type: String
  }],
  
  // Банковские реквизиты для выплат
  routing: {
    type: String,
    trim: true
  },
  bankAccount: {
    type: String,
    trim: true
  },
  accountNumber: {
    type: String,
    trim: true
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
carrierSchema.index({ name: 1 });
carrierSchema.index({ mcNumber: 1 }, { unique: true, sparse: true });
carrierSchema.index({ dotNumber: 1 }, { unique: true, sparse: true });
carrierSchema.index({ email: 1 }, { unique: true, sparse: true });
carrierSchema.index({ companyName: 1 });

module.exports = mongoose.model("Carrier", carrierSchema);




