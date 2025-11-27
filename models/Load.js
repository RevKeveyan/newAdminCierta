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
    enum: ["Listed", "Dispatched", "Picked up", "Delivered", "On Hold", "Cancelled"],
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
  documents: [String],

  // Дополнительные поля для обратной совместимости и функциональности
  billOfLadingNumber: { type: String, unique: true },
  bolPdfPath: String,
  rateConfirmationPdfPath: String,

  carrierPaymentStatus: {
    status: {
      type: String,
      enum: ["Invoiced", "Paid", "On Hold", "Withheld", "Charges applied"],
    },
    date: Date
  },

  customerPaymentStatus: {
    status: {
      type: String,
      enum: ["Invoiced", "Paid", "On Hold", "Withheld", "Charges applied"],
    },
    date: Date
  },

  lastEmailSent: Date,

  tonuPaidToCarrier: Boolean,
  detentionPaidToCarrier: Boolean,
  layoverPaidToCarrier: Boolean,
  tonuReceivedFromCustomer: Boolean,
  detentionReceivedFromCustomer: Boolean,
  layoverReceivedFromCustomer: Boolean,

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

module.exports = mongoose.model("Load", loadSchema);
