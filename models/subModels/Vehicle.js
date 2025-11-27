const mongoose = require('mongoose');

const vehicleShipmentSchema = new mongoose.Schema({
  vin: { type: String },
  make: { type: String },
  model: { type: String },
  year: { type: String },
  value: { type: String }
}, { _id: false });

const vehicleSchema = new mongoose.Schema({
  shipment: [vehicleShipmentSchema],
  specialRequirements: { type: String },
  vehicleImages: [String]
}, { _id: false });

module.exports = vehicleSchema;




