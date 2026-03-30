const mongoose = require("mongoose");
const addressSchema = require("./subModels/Address");
const vehicleSchema = require("./subModels/Vehicle");
const freightSchema = require("./subModels/Freight");
const carrierPeopleSchema = require("./subModels/CarrierPeople");
const representativePeopleSchema = require("./subModels/RepresentativePeople");
const { getCurrentDateUTC5 } = require("../utils/dateUtils");

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

  carrier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Carrier'
  },

  carrierEmails: [{
    type: String,
    lowercase: true
  }],

  carrierPhotos: [String],

  loadCarrierPeople: [{
    type: carrierPeopleSchema
  }],
  loadCustomerRepresentativePeoples: [{
    type: representativePeopleSchema
  }],

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
    deadline: { type: String },
    pickupDate: { type: String },
    pickupDateType: { type: String, enum: ['Exact', 'Estimate'], default: 'Exact' },
    pickupDateStart: { type: String },
    pickupDateEnd: { type: String },
    deliveryDate: { type: String },
    deliveryDateType: { type: String, enum: ['Exact', 'Estimate'], default: 'Exact' },
    deliveryDateStart: { type: String },
    deliveryDateEnd: { type: String },
    aging: { type: String },
    
    assignedAt: { type: Date },
    deadlineAt: { type: Date },
    pickupAt: { type: Date },
    pickupStartAt: { type: Date },
    pickupEndAt: { type: Date },
    deliveryAt: { type: Date },
    deliveryStartAt: { type: Date },
    deliveryEndAt: { type: Date }
  },

  // Additional fees for freight loads
  fees: [{
    type: { type: String, enum: ['Detention', 'Layover', 'Lumper fee'] },
    carrierRate: { type: String },
    customerRate: { type: String },
    total: { type: String }
  }],

  // TONU (Truck Ordered Not Used)
  tonu: {
    enabled: { type: Boolean, default: false },
    carrierRate: { type: String },
    customerRate: { type: String }
  },

  tracking: { type: String, trim: true },
  
  // Payment Information
  paymentMethod: {
    type: String,
    trim: true
  },
  paymentTerms: {
    type: String
  },
  
  // Files organized by type
  images: [String],
  pdfs: [String],
  bolDocuments: [String],
  rateConfirmationDocuments: [String],
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
  },

  updatedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }

}, { timestamps: true, versionKey: false });

// Pre-save hook to set dates in UTC-5 and remove undefined/null values
loadSchema.pre('save', function(next) {
  const now = getCurrentDateUTC5();
  if (this.isNew) {
    this.createdAt = now;
  }
  this.updatedAt = now;
  
  // Удаляем undefined и null значения из всех полей документа
  // В pre-save хуке используем set(undefined) для удаления полей
  const doc = this.toObject();
  for (const key in doc) {
    if (doc.hasOwnProperty(key) && key !== '_id' && key !== '__v' && key !== 'createdAt' && key !== 'updatedAt') {
      if (doc[key] === undefined || doc[key] === null) {
        // Устанавливаем поле в undefined, Mongoose не сохранит его
        this.set(key, undefined);
      } else if (doc[key] === 'undefined' || doc[key] === 'null' || (typeof doc[key] === 'string' && doc[key].trim() === '')) {
        // Для строк также удаляем пустые значения
        if (key !== 'orderId' && key !== 'status') { // Не удаляем обязательные поля
          this.set(key, undefined);
        }
      }
    }
  }
  
  // Очищаем массивы от undefined/null элементов
  if (this.customerEmails && Array.isArray(this.customerEmails)) {
    this.customerEmails = this.customerEmails.filter(email => 
      email !== undefined && email !== null && email !== '' && email !== 'undefined' && email !== 'null'
    );
  }
  
  if (this.carrierEmails && Array.isArray(this.carrierEmails)) {
    this.carrierEmails = this.carrierEmails.filter(email => 
      email !== undefined && email !== null && email !== '' && email !== 'undefined' && email !== 'null'
    );
  }
  
  if (this.fees && Array.isArray(this.fees)) {
    this.fees = this.fees.filter(fee => fee && typeof fee === 'object');
  }
  
  next();
});

// Индексы для быстрого поиска
// orderId уже имеет unique: true, который автоматически создает индекс, поэтому не дублируем
loadSchema.index({ customer: 1 });
loadSchema.index({ carrier: 1 });
loadSchema.index({ status: 1 });
loadSchema.index({ 'dates.assignedDate': 1 });
loadSchema.index({ 'dates.pickupDate': 1 });
loadSchema.index({ 'dates.deliveryDate': 1 });
loadSchema.index({ 'dates.pickupDateType': 1 });
loadSchema.index({ 'dates.deliveryDateType': 1 });
loadSchema.index({ 'dates.assignedAt': 1 });
loadSchema.index({ 'dates.deadlineAt': 1 });
loadSchema.index({ 'dates.pickupAt': 1 });
loadSchema.index({ 'dates.deliveryAt': 1 });
loadSchema.index({ 'dates.pickupStartAt': 1 });
loadSchema.index({ 'dates.pickupEndAt': 1 });
loadSchema.index({ 'dates.deliveryStartAt': 1 });
loadSchema.index({ 'dates.deliveryEndAt': 1 });
loadSchema.index({ paymentReceivable: 1 });
loadSchema.index({ paymentPayable: 1 });
loadSchema.index({ createdBy: 1 });
loadSchema.index({ updatedBy: 1 });
loadSchema.index({ createdAt: -1 });
loadSchema.index({ updatedAt: -1 });
loadSchema.index({ 'type.freight': 1, 'type.vehicle': 1 });
loadSchema.index({ createdBy: 1, createdAt: -1 }); // Композитный для статистики пользователя
loadSchema.index({ customer: 1, status: 1 }); // Композитный для фильтрации
loadSchema.index({ carrier: 1, status: 1 }); // Композитный для фильтрации
loadSchema.index({ status: 1, createdAt: -1 }); // Композитный для фильтрации по статусу и дате
loadSchema.index({ customer: 1, createdAt: -1 });
loadSchema.index({ carrier: 1, createdAt: -1 });
loadSchema.index({ customer: 1, 'dates.deliveryAt': 1 });
loadSchema.index({ customer: 1, 'dates.pickupAt': 1 });

module.exports = mongoose.model("Load", loadSchema);
