const mongoose = require("mongoose");
const { getCurrentDateUTC5 } = require("../utils/dateUtils");

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    companyName: { type: String },
    email: { type: String, required: true, unique: true, lowercase: true },
    phoneNumber: { type: String, default: "" },
    password: { type: String, required: true },
    profileImage: { type: String },
    pdfs: [String], // Array of PDF file URLs
    role: {
      type: String,
      enum: [
        "admin",
        "manager",
        "accountingManager",
        "accountingIn",
        "accountingOut",
        "freightBroker",
        "dispatcher",
        "Pre-dispatcher",
        "partner",
        "salesAgent",
        "bidAgent",
      ],
      
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
    },
    // Список разрешенных customers для этого user
    allowedCustomers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer'
    }],
  },
  { timestamps: true, versionKey: false }
);

// Pre-save hook to set dates in UTC-5
userSchema.pre('save', function(next) {
  const now = getCurrentDateUTC5();
  if (this.isNew) {
    this.createdAt = now;
  }
  this.updatedAt = now;
  next();
});

// Индексы для быстрого поиска
userSchema.index({ companyName: 1 }, { sparse: true });

module.exports = mongoose.model("User", userSchema);
