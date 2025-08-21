const mongoose = require("mongoose");

const loadSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ["Boats", "Cars", "Motorcycles", "RVs"],
    },
    vin: {
      type: String,
      unique: true,
      required: true,
    },
    category: String,
    customerCompanyName: String,

    // Participants
    carrier: {
      name: { type: String, required: true },
      mcNumber: { type: String },
      contact: { type: String, required: true },
      email: { type: String, lowercase: true },
      carrierImageFile: [String],
      carrierType: { type: String }, // e.g. truck type, certification
    },
    customerEmails: {
      type: [String],
      lowercase: true,
    },
    assignedDate: { type: Date },

    // Locations
    pickUpLocation: {
      name: String,
      city: String,
      state: String,
      zip: Number,
      address: String,
      loc: String,
      contactPhone: String,
    },
    deliveryLocation: {
      name: String,
      city: String,
      state: String,
      zip: Number,
      address: String,
      loc: String,
      contactPhone: String,
    },

    // Dates and status
    deliveryDate: Date,
    pickUpDate: Date,
    status: {
      type: String,
      enum: ["Listed", "Dispatched", "Picked up", "Delivered", "On Hold", "Cancelled"],
      default: "Listed",
      required: true,
    },

    // Payment status
    carrierPaymentStatus: {
      status: {
        type: String,
        enum: ["Invoiced", "Paid", "On Hold", "Withheld", "Charges applied"],
      },
      date: Date,
    },
    customerPaymentStatus: {
      status: {
        type: String,
        enum: ["Invoiced", "Paid", "On Hold", "Withheld", "Charges applied"],
      },
      date: Date,
    },

    // Media
    images: [String],
    aging: Number,
    tracking: String,

    // Vehicle details
    vehicleDetails: {
      make: String,
      model: String,
      year: Number,
      color: String,
      mileage: Number,
    },
    specialRequirements: String,
    insurance: Boolean,
    value: Number,
    lastEmailSent: Date,

    // Miscellaneous
    tonuPaidToCarrier: Boolean,
    detentionPaidToCarrier: Boolean,
    layoverPaidToCarrier: Boolean,
    tonuReceivedFromCustomer: Boolean,
    detentionReceivedFromCustomer: Boolean,
    layoverReceivedFromCustomer: Boolean,

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("Load", loadSchema);
