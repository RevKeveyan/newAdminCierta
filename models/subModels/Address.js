const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  name: { type: String },
  city: { type: String },
  state: { type: String },
  zip: { type: Number },
  address: { type: String },
  loc: { type: String }, // можно использовать для краткой метки
  contactPhone: { type: String }
}, { _id: false }); // _id: false отключает вложенный _id для sub-схемы

module.exports = addressSchema;
