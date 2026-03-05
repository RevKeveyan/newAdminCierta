const mongoose = require('mongoose');
const { getCurrentDateUTC5 } = require('../../utils/dateUtils');

/**
 * User History / Audit Log
 * Tracks changes to User entity
 */
const userHistorySchema = new mongoose.Schema({
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  action: {
    type: String,
    enum: ['created', 'updated', 'role_change', 'status_change', 'permissions_change', 'delete'],
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
  changes: [{
    field: { type: String, required: true },
    from: mongoose.Schema.Types.Mixed,
    to: mongoose.Schema.Types.Mixed
  }],
  createdAt: {
    type: Date,
    default: getCurrentDateUTC5,
    index: true
  }
}, {
  versionKey: false,
  timestamps: false
});

// Pre-save hook
userHistorySchema.pre('save', function(next) {
  if (this.isNew && !this.createdAt) {
    this.createdAt = getCurrentDateUTC5();
  }
  next();
});

// Indexes for efficient queries
userHistorySchema.index({ entityId: 1, createdAt: -1 });
userHistorySchema.index({ 'actor.actorId': 1, createdAt: -1 });
userHistorySchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('UserHistory', userHistorySchema);
