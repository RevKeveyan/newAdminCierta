    const mongoose = require('mongoose');

const userStatsSchema = new mongoose.Schema({
  date: { type: Date, required: true }, // дата обновления статистики
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  totalDeals: { type: Number, default: 0 },
  loadsAdded: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 }, // зарплата
  totalPaymentsProcessed: { type: Number, default: 0 }, // количество платежей
  totalRevenueGenerated: { type: Number, default: 0 }, // доход для компании

  // Для менеджеров / диспетчеров — можно добавить KPI
  averageLoadProcessingTime: { type: Number, default: 0 },

  lastUpdated: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports = mongoose.model('UserStats', userStatsSchema);
