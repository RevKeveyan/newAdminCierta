const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    companyName: { type: String },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    profileImage: { type: String }, 
    userFile: { type: String }, // PDF file URL
    role: {
      type: String,
      enum: [
        "admin",
        "manager",
        "accountingManager",
        "accountingIn",
        "accountingOut",
        "dispatcher",
        "partner",
        "BidAgent",
      ],
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
    },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("User", userSchema);
