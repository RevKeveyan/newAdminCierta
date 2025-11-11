const mongoose = require("mongoose");
const addressSchema = require("./subModels/Address")
const vehicleDetailsSchema = require('./subModels/VheicleDetails');

const loadSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ["Boats", "Cars", "Motorcycles", "RVs"],
  },
  vin: { type: String, unique: true, required: true },
  category: String,
  customerCompanyName: String,

  carrier: {
    name: { type: String },
    mcNumber: String,
    contact: { type: String },
    email: { type: String, lowercase: true },
    carrierImageFile: [String],
    carrierType: String
  },

  customerEmails: {
    type: [String],
    lowercase: true,
  },

  assignedDate: Date,

  pickUpLocation: addressSchema,
  deliveryLocation: addressSchema,

  deliveryDate: Date,
  pickUpDate: Date,
  status: {
    type: String,
    enum: ["Listed", "Dispatched", "Picked up", "Delivered", "On Hold", "Cancelled"],
    default: "Listed",
    required: true
  },

  carrierPaymentStatus: {
    status: {
      type: String,
      enum: ["Invoiced", "Paid", "On Hold", "Withheld", "Charges applied"],
    },
    date: Date
  },

  customerPaymentStatus: {
    status: {
      type: String,
      enum: ["Invoiced", "Paid", "On Hold", "Withheld", "Charges applied"],
    },
    date: Date
  },

  images: [String],
  aging: Number,
  tracking: String,

  vehicleDetails: vehicleDetailsSchema,
  specialRequirements: String,
  insurance: Boolean,
  value: Number,
  lastEmailSent: Date,

  tonuPaidToCarrier: Boolean,
  detentionPaidToCarrier: Boolean,
  layoverPaidToCarrier: Boolean,
  tonuReceivedFromCustomer: Boolean,
  detentionReceivedFromCustomer: Boolean,
  layoverReceivedFromCustomer: Boolean,

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }

}, { timestamps: true, versionKey: false });

module.exports = mongoose.model("Load", loadSchema);
