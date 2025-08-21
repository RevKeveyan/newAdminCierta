const mongoose = require("mongoose");

const loadHistorySchema = new mongoose.Schema(
  {
    loadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Load', required: true },
    action: {
      type: String,
      enum: ["created", "updated", "deleted", "paid"],
      required: true
    },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    changes: [
      {
        field: String,
        oldValue: mongoose.Schema.Types.Mixed,
        newValue: mongoose.Schema.Types.Mixed
      }
    ],
    date: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

module.exports = mongoose.model("LoadHistory", loadHistorySchema);
