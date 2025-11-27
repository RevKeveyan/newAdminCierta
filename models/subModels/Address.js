const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  address: { type: String },
  city: { type: String },
  state: { type: String },
  zipCode: { type: String },
  // Дополнительные поля для обратной совместимости
  name: { type: String },
  zip: { type: Number },
  loc: { type: String },
  contactPhone: { type: String }
}, { _id: false }); // _id: false отключает вложенный _id для sub-схемы

module.exports = addressSchema;
