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
    lowercase: true
  },
  companyName: {
    type: String
  },
  mcNumber: {
    type: String
  },
  dotNumber: {
    type: String
  },
  address: {
    type: addressSchema
  },
  // Дополнительные поля
  emails: [{
    type: String,
    lowercase: true
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
  // Связь с Loads
  loads: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Load'
  }]
}, { timestamps: true, versionKey: false });

// Индексы для быстрого поиска
carrierSchema.index({ name: 1 });
carrierSchema.index({ mcNumber: 1 });
carrierSchema.index({ dotNumber: 1 });
carrierSchema.index({ companyName: 1 });

module.exports = mongoose.model("Carrier", carrierSchema);




