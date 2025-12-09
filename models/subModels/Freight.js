const mongoose = require('mongoose');

const freightShipmentSchema = new mongoose.Schema({
  commodity: { type: String },
  dimensionsLength: { type: String },
  dimensionsWidth: { type: String },
  dimensionsHeight: { type: String },
  weight: { type: String },
  poNumber: { type: String },
  pickupNumber: { type: String },
  deliveryReference: { type: String }

}, { _id: false });

const freightSchema = new mongoose.Schema({
  shipment: [freightShipmentSchema],
  // Files organized by type
  images: [String],  // Array of image URLs (replaces freightImages)
  pdfs: [String],    // Array of PDF URLs
  // Legacy field for backward compatibility
  freightImages: [String]
}, { _id: false });

module.exports = freightSchema;








