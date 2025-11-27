const mongoose = require('mongoose');

const freightShipmentSchema = new mongoose.Schema({
  commodity: { type: String },
  dimensionsLength: { type: String },
  dimensionsWidth: { type: String },
  dimensionsHeight: { type: String },
  weight: { type: String },
  poNumber: { type: String },
  pickupNumber: { type: String }
}, { _id: false });

const freightSchema = new mongoose.Schema({
  shipment: [freightShipmentSchema],
  freightImages: [String]
}, { _id: false });

module.exports = freightSchema;




