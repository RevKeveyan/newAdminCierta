const mongoose = require("mongoose");

const CountSchema = new mongoose.Schema(
  {
    listed: { type: Number, default: 0 },
    dispatched: { type: Number, default: 0 },
    pickedUp: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    onHold: { type: Number, default: 0 },
    cancelled: { type: Number, default: 0 },
    expired: { type: Number, default: 0 }
  },
  { _id: false }
);

const EventSchema = new mongoose.Schema(
  {
    created: { type: Number, default: 0 },
    dispatched: { type: Number, default: 0 },
    pickedUp: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    onHold: { type: Number, default: 0 },
    cancelled: { type: Number, default: 0 }
  },
  { _id: false }
);

const StatsDailyDeltaSchema = new mongoose.Schema(
  {
    dateKey: { type: String, required: true, index: true },
    rangeStart: { type: Date, required: true },
    rangeEnd: { type: Date, required: true },

    entityType: {
      type: String,
      enum: ["system", "customer", "carrier", "user"],
      required: true,
      index: true
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true
    },

    loadsStateDelta: {
      type: CountSchema,
      default: () => ({})
    },

    loadsEventsDelta: {
      type: EventSchema,
      default: () => ({})
    }
  },
  { timestamps: true }
);

StatsDailyDeltaSchema.index(
  { dateKey: 1, entityType: 1, entityId: 1 },
  { unique: true }
);

module.exports = mongoose.model("StatsDailyDelta", StatsDailyDeltaSchema);

