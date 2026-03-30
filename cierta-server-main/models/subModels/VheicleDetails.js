const mongoose = require('mongoose');

const vehicleDetailsSchema = new mongoose.Schema({
  make: { type: String },         // производитель
  model: { type: String },        // модель
  year: { type: Number },         // год выпуска
  color: { type: String },        // цвет
  mileage: { type: Number }       // пробег
}, { _id: false });

module.exports = vehicleDetailsSchema;
