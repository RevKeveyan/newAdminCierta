const mongoose = require("mongoose");
const { getCurrentDateUTC5 } = require("../../utils/dateUtils");

const loadHistorySchema = new mongoose.Schema(
  {
    load: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Load', 
      required: true,
      index: true
    },
    action: {
      type: String,
      enum: ["created", "updated", "status_update", "assign", "delete"],
      required: true
    },
    actor: {
      actorId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true,
        index: true
      },
      actorRole: { 
        type: String, 
        required: true 
      },
      actorEmail: { 
        type: String, 
        required: false 
      }
    },
    changes: [
      {
        field: { type: String, required: true },
        from: mongoose.Schema.Types.Mixed,
        to: mongoose.Schema.Types.Mixed
      }
    ],
    createdAt: { 
      type: Date, 
      default: getCurrentDateUTC5,
      index: true
    }
  },
  { 
    versionKey: false,
    timestamps: false // Используем createdAt вместо timestamps
  }
);

// Pre-save hook to set createdAt in UTC-5
loadHistorySchema.pre('save', function(next) {
  if (this.isNew && !this.createdAt) {
    this.createdAt = getCurrentDateUTC5();
  }
  next();
});

// Индексы для оптимизации запросов
loadHistorySchema.index({ load: 1, createdAt: -1 });
loadHistorySchema.index({ 'actor.actorId': 1, createdAt: -1 });

module.exports = mongoose.model("LoadHistory", loadHistorySchema);
