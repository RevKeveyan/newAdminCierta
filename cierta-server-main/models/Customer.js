const mongoose = require("mongoose");
const addressSchema = require("./subModels/Address");
const representativePeopleSchema = require("./subModels/RepresentativePeople");
const { getCurrentDateUTC5 } = require("../utils/dateUtils");

const customerSchema = new mongoose.Schema({
  companyName: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['platform', 'customer'],
    default: 'customer'
  },
  customerAddress: {
    type: addressSchema,
    required: false
  },
  email: {
    type: String,
    lowercase: true,
    sparse: true // Allows multiple null/undefined values
  },
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
  daysToPay: { type: String },        // Конец счетчика (payed)
  // Files organized by type
  images: [String],  // Array of image URLs
  pdfs: [String],    // Array of PDF URLs
  
  
  file: {
    type: String
  },
  
  // Связь с Loads
  loads: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Load'
  }],
  
  // Status
  status: {
    type: String,
    enum: ["active", "suspended", "inactive"],
    default: "active",
    required: true
  },
  // Список разрешенных users для этого customer
  allowedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Список представителей компании (контактных лиц)
  representativePeoples: [{
    type: representativePeopleSchema
  }]
}, { timestamps: true, versionKey: false });

// Pre-save hook to set dates in UTC-5 and remove undefined/null values
customerSchema.pre('save', function(next) {
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
      } else if (doc[key] === 'undefined' || doc[key] === 'null' || doc[key] === '') {
        // Также удаляем строки 'undefined', 'null' и пустые строки
        this.set(key, undefined);
      }
    }
  }
  
  if (this.emails !== undefined || this.emails === null || this.emails === []) {
    this.set('emails', undefined);
    delete this.emails;
  }
  
  if (this.email && typeof this.email === 'string') {
    this.email = this.email.trim().toLowerCase();
    if (this.email === '' || this.email === 'undefined' || this.email === 'null') {
      this.set('email', undefined);
    }
  }
  
  if (this.representativePeoples && Array.isArray(this.representativePeoples)) {
    this.representativePeoples = this.representativePeoples.filter(person => 
      person && typeof person === 'object' && person.fullName
    );
  }
  
  next();
});

// Индексы для быстрого поиска
customerSchema.index({ companyName: 1 }, { unique: true });
customerSchema.index({ 'customerAddress.city': 1 });
customerSchema.index({ 'customerAddress.state': 1 });
customerSchema.index({ status: 1 });
customerSchema.index({ type: 1 });
customerSchema.index({ createdAt: -1 });
customerSchema.index({ updatedAt: -1 });
customerSchema.index({ status: 1, type: 1 }); // Композитный для статистики
// Sparse индекс для email - игнорирует null/undefined, уникальность только для валидных email
customerSchema.index({ email: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Customer", customerSchema);








