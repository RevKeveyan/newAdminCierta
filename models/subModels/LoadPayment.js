const mongoose = require("mongoose");

const loadPaymentSchema = new mongoose.Schema(
  {
    loadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Load', required: true },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    type: {
      type: String,
      enum: ["carrier", "customer"], 
      required: true
    },
    note: String
  },
  { versionKey: false }
);

module.exports = mongoose.model("LoadPayment", loadPaymentSchema);
