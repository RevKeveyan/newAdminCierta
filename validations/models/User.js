const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  companyName: { type: String },
  email: { type: String, required: true, lowercase: true, unique: true },
  password: { type: String, required: true },
  profileImage: { type: String }, // URL в S3
  role: {
    type: String,
    enum: [
      'admin',
      'dispatcher',
      'carrier',
      'customer',
      'accountant',
      'manager',
      'driver'
    ],
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'suspended'],
    default: 'active'
  },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports = mongoose.model('User', userSchema);
