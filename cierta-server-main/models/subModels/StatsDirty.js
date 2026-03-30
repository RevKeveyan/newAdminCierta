const mongoose = require('mongoose');

const statsDirtySchema = new mongoose.Schema({
  grain: {
    type: String,
    enum: ['day', 'week', 'month', 'year'],
    required: true,
    default: 'day',
    index: true
  },
  
  dateKey: {
    type: String,
    required: true,
    index: true
  },
  
  rangeStart: {
    type: Date,
    required: true
  },
  
  rangeEnd: {
    type: Date,
    required: true
  },
  
  entityType: {
    type: String,
    enum: ['system', 'customer', 'carrier', 'user'],
    required: true,
    index: true
  },
  
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
    index: true
  },
  
  sources: [{
    type: String,
    enum: ['loads', 'receivable', 'payable']
  }],
  
  lock: {
    locked: { type: Boolean, default: false },
    lockedAt: { type: Date, default: null },
    lockedBy: { type: String, default: null }
  },
  
  attempts: {
    type: Number,
    default: 0
  },
  
  priority: {
    type: Number,
    default: 0
  },
  
  lastAttemptAt: {
    type: Date,
    default: null
  },
  
  error: {
    message: { type: String, default: null },
    occurredAt: { type: Date, default: null }
  },
  
  createdAt: {
    type: Date,
    default: Date.now,
    required: true
  }
}, {
  versionKey: false
});

statsDirtySchema.index({ grain: 1, dateKey: 1, entityType: 1, entityId: 1 }, { unique: true });
statsDirtySchema.index({ 'lock.locked': 1, priority: -1, createdAt: 1 });
statsDirtySchema.index({ entityType: 1, entityId: 1 });
statsDirtySchema.index({ rangeStart: 1, rangeEnd: 1 });

module.exports = mongoose.model('StatsDirty', statsDirtySchema);
