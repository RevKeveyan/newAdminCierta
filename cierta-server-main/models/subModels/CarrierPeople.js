const mongoose = require("mongoose");

/**
 * CarrierPeople - люди связанные с carrier
 * Содержит информацию о людях (driver/dispatcher) связанных с компанией carrier
 */
const carrierPeopleSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['driver', 'dispatcher'],
      required: true,
      trim: true
    },
    fullName: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      lowercase: true,
      trim: true
    },
    phoneNumber: {
      type: String,
      trim: true
    }
  },
  { timestamps: true, versionKey: false }
);

module.exports = carrierPeopleSchema;






