const mongoose = require("mongoose");

/**
 * RepresentativePeople - представители customer
 * Содержит информацию о контактных лицах компании
 */
const representativePeopleSchema = new mongoose.Schema(
  {
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

module.exports = representativePeopleSchema;

