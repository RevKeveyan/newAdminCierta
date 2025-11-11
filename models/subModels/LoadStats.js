const mongoose = require('mongoose');

const loadStatsSchema = new mongoose.Schema({
  date: { type: Date, required: true }, // для ежедневного хранения
  totalLoads: { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 }, // прибыль
  totalExpense: { type: Number, default: 0 }, // траты
  totalTurnover: { type: Number, default: 0 }, // оборот (Revenue - Expense)
  dealsCount: { type: Number, default: 0 },

  // Loads by status
  loadsByStatus: {
    listed: { type: Number, default: 0 },
    dispatched: { type: Number, default: 0 },
    pickedUp: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    onHold: { type: Number, default: 0 },
    cancelled: { type: Number, default: 0 }
  },

  // Могут быть добавлены дополнительные агрегаты
  averageDeliveryTime: { type: Number, default: 0 }, // в часах или днях
  averagePickupTime: { type: Number, default: 0 },
  topCarriers: [{ name: String, count: Number }],
  topCustomers: [{ name: String, count: Number }],

  lastUpdated: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports = mongoose.model('LoadStats', loadStatsSchema);
