const mongoose = require('mongoose');

const freightShipmentSchema = new mongoose.Schema({
  commodity: { type: String },
  dimensionsLength: { type: String },
  dimensionsWidth: { type: String },
  dimensionsHeight: { type: String },
  dimensionsUnit: { type: String, enum: ['feet', 'inches'], default: 'feet' },
  onPallets: { type: Boolean, default: false },
  weight: { type: String },
  shipmentUnits: { type: String },
  poNumber: { type: String },
  pickupNumber: { type: String },
  deliveryReference: { type: String }
}, { _id: false });

const freightSchema = new mongoose.Schema({
  shipment: [freightShipmentSchema],
  pdfs: [String],
  freightImages: [String]
});

module.exports = freightSchema;








