const mongoose = require("mongoose");
const addressSchema = require("./subModels/Address");
const vehicleSchema = require("./subModels/Vehicle");
const freightSchema = require("./subModels/Freight");

const loadSchema = new mongoose.Schema({
  orderId: {
    type: String,
    unique: true,
    required: true
  },

  // Ссылка на Customer (отдельная таблица)
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },

  customerEmails: [{
    type: String,
    lowercase: true
  }],

  customerRate: {
    type: String
  },

  carrierRate: {
    type: String
  },

  // Тип груза: freight или vehicle
  type: {
    freight: { type: Boolean, default: false },
    vehicle: { type: Boolean, default: false }
  },

  // Vehicle shipment данные
  vehicle: {
    type: vehicleSchema
  },

  // Freight shipment данные
  freight: {
    type: freightSchema
  },

  // Pickup location
  pickup: {
    locationName: { type: String },
    address: { type: addressSchema },
    contactPhone: { type: String },
    notes: { type: String },
    date: { type: String },
    images: [String]
  },

  // Delivery location
  delivery: {
    locationName: { type: String },
    address: { type: addressSchema },
    contactPhone: { type: String },
    notes: { type: String },
    date: { type: String },
    images: [String]
  },

  // Ссылка на Carrier (отдельная таблица)
  carrier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Carrier'
  },

  carrierEmails: [{
    type: String,
    lowercase: true
  }],

  carrierPhotos: [String],

  // Insurance
  insurance: {
    type: { type: String },
    customAmount: { type: String }
  },

  // Status
  status: {
    type: String,
    enum: ["Listed", "Dispatched", "Picked Up", "Delivered", "On Hold", "Cancelled"],
    default: "Listed",
    required: true
  },

  // Dates
  dates: {
    assignedDate: { type: String },
    pickupDate: { type: String },
    deliveryDate: { type: String },
    aging: { type: String }
  },

  tracking: { type: String },
  
  // Files organized by type
  images: [String],  // Array of image URLs
  pdfs: [String],    // Array of PDF URLs
  
  // Legacy fields for backward compatibility
  documents: [String],
  bolPdfPath: String,
  rateConfirmationPdfPath: String,

  // Ссылки на платежные записи (создаются при статусе "Delivered")
  paymentReceivable: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PaymentReceivable'
  },
  
  paymentPayable: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PaymentPayable'
  },

  lastEmailSent: Date,

  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  }

}, { timestamps: true, versionKey: false });

// Индексы для быстрого поиска
// orderId уже имеет unique: true, который автоматически создает индекс, поэтому не дублируем
loadSchema.index({ customer: 1 });
loadSchema.index({ carrier: 1 });
loadSchema.index({ status: 1 });
loadSchema.index({ 'dates.assignedDate': 1 });
loadSchema.index({ 'dates.pickupDate': 1 });
loadSchema.index({ 'dates.deliveryDate': 1 });
loadSchema.index({ paymentReceivable: 1 });
loadSchema.index({ paymentPayable: 1 });

module.exports = mongoose.model("Load", loadSchema);
