const mongoose = require('mongoose');

const statsSnapshotSchema = new mongoose.Schema({
  grain: {
    type: String,
    enum: ['day', 'week', 'month', 'year'],
    required: true,
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
  
  loads: {
    total: { type: Number, default: 0 },
    byStatus: {
      listed: { type: Number, default: 0 },
      dispatched: { type: Number, default: 0 },
      pickedUp: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      onHold: { type: Number, default: 0 },
      cancelled: { type: Number, default: 0 },
      expired: { type: Number, default: 0 }
    }
  },
  
  receivable: {
    totalCount: { type: Number, default: 0 },
    money: {
      total: { type: Number, default: 0 },
      confirmed: { type: Number, default: 0 },
      outstanding: { type: Number, default: 0 }
    }
  },
  
  payable: {
    totalCount: { type: Number, default: 0 },
    money: {
      total: { type: Number, default: 0 },
      confirmed: { type: Number, default: 0 },
      outstanding: { type: Number, default: 0 }
    }
  },
  
  finance: {
    profitConfirmed: { type: Number, default: 0 }
  },
  
  computedAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  
  version: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true,
  versionKey: false
});

statsSnapshotSchema.index({ grain: 1, dateKey: 1, entityType: 1, entityId: 1 }, { unique: true });
statsSnapshotSchema.index({ entityType: 1, entityId: 1 });
statsSnapshotSchema.index({ rangeStart: 1, rangeEnd: 1 });
statsSnapshotSchema.index({ computedAt: -1 });

module.exports = mongoose.model('StatsSnapshot', statsSnapshotSchema);
