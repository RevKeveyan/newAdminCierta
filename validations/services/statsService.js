const Load = require('../models/Load');
const User = require('../models/User');
const LoadStats = require('../models/subModels/LoadStats');
const UserStats = require('../models/subModels/UserStats');

const generateLoadStats = async () => {
  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));

  // Aggregation for loads
  const loadAggregation = await Load.aggregate([
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              totalLoads: { $sum: 1 },
              totalRevenue: { $sum: "$customerPaymentStatus.amount" || 0 },
              totalExpense: { $sum: "$carrierPaymentStatus.amount" || 0 }
            }
          }
        ],
        byStatus: [
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 }
            }
          }
        ]
      }
    }
  ]);

  const totals = loadAggregation[0]?.totals[0] || {};
  const byStatus = {};
  (loadAggregation[0]?.byStatus || []).forEach(s => {
    byStatus[s._id?.replace(/\s+/g, '').toLowerCase()] = s.count;
  });

  const newLoadStats = new LoadStats({
    date: startOfDay,
    totalLoads: totals.totalLoads || 0,
    totalRevenue: totals.totalRevenue || 0,
    totalExpense: totals.totalExpense || 0,
    totalTurnover: (totals.totalRevenue || 0) - (totals.totalExpense || 0),
    dealsCount: totals.totalLoads || 0,
    loadsByStatus: {
      listed: byStatus.listed || 0,
      dispatched: byStatus.dispatched || 0,
      pickedUp: byStatus.pickedup || 0,
      delivered: byStatus.delivered || 0,
      onHold: byStatus.onhold || 0,
      cancelled: byStatus.cancelled || 0
    },
    lastUpdated: new Date()
  });

  await newLoadStats.save();
};

const generateUserStats = async () => {
  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));

  // Aggregation for user stats
  const userAggregation = await Load.aggregate([
    {
      $group: {
        _id: "$createdBy",
        loadsAdded: { $sum: 1 },
        totalRevenueGenerated: { $sum: "$customerPaymentStatus.amount" || 0 }
      }
    }
  ]);

  for (const userData of userAggregation) {
    await UserStats.create({
      date: startOfDay,
      userId: userData._id,
      totalDeals: userData.loadsAdded,
      loadsAdded: userData.loadsAdded,
      totalEarnings: 0, // сюда можно подставить расчёт зарплаты
      totalPaymentsProcessed: 0,
      totalRevenueGenerated: userData.totalRevenueGenerated,
      lastUpdated: new Date()
    });
  }
};

const updateAllStats = async () => {
  await generateLoadStats();
  await generateUserStats();
  console.log('Statistics updated at', new Date());
};

module.exports = { updateAllStats };
