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
  // Files organized by type
  images: [String],  // Array of image URLs (replaces vehicleImages)
  pdfs: [String],    // Array of PDF URLs
  // Legacy field for backward compatibility
  vehicleImages: [String]
}, { _id: false });

module.exports = vehicleSchema;








