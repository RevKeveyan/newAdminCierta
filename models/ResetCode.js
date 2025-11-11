const mongoose = require('mongoose');

const resetCodeSchema = new mongoose.Schema({
  email: { type: String, required: true },
  code: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  blocked: { type: Boolean, default: false }
}, { timestamps: true, versionKey: false });

module.exports = mongoose.model('ResetCode', resetCodeSchema);
