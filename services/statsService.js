const Load = require('../models/Load');
const User = require('../models/User');
const LoadStats = require('../models/subModels/LoadStats');
const UserStats = require('../models/subModels/UserStats');

const generateLoadStats = async () => {
  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));

  // Проверяем, есть ли уже статистика за этот день
  const existingStats = await LoadStats.findOne({ date: startOfDay });
  if (existingStats) {
    console.log('Load stats already exist for today, skipping...');
    return;
  }

  // Aggregation for loads
  const loadAggregation = await Load.aggregate([
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              totalLoads: { $sum: 1 },
              totalRevenue: { $sum: { $ifNull: ["$value", 0] } },
              totalExpense: { $sum: { $ifNull: ["$carrierPaymentStatus.amount", 0] } },
              averageValue: { $avg: { $ifNull: ["$value", 0] } }
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
        ],
        byType: [
          {
            $group: {
              _id: "$type",
              count: { $sum: 1 }
            }
          }
        ],
        byCarrier: [
          {
            $group: {
              _id: "$carrier.name",
              count: { $sum: 1 },
              totalRevenue: { $sum: { $ifNull: ["$value", 0] } }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 5 }
        ],
        byCustomer: [
          {
            $group: {
              _id: "$customerCompanyName",
              count: { $sum: 1 },
              totalRevenue: { $sum: { $ifNull: ["$value", 0] } }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 5 }
        ],
        timeStats: [
          {
            $match: {
              $and: [
                { pickUpDate: { $exists: true } },
                { deliveryDate: { $exists: true } }
              ]
            }
          },
          {
            $addFields: {
              processingTime: {
                $divide: [
                  { $subtract: ["$deliveryDate", "$pickUpDate"] },
                  1000 * 60 * 60 * 24 // Convert to days
                ]
              }
            }
          },
          {
            $group: {
              _id: null,
              averageProcessingTime: { $avg: "$processingTime" },
              minProcessingTime: { $min: "$processingTime" },
              maxProcessingTime: { $max: "$processingTime" }
            }
          }
        ]
      }
    }
  ]);

  const totals = loadAggregation[0]?.totals[0] || {};
  const byStatus = {};
  const byType = {};
  
  (loadAggregation[0]?.byStatus || []).forEach(s => {
    byStatus[s._id?.replace(/\s+/g, '').toLowerCase()] = s.count;
  });
  
  (loadAggregation[0]?.byType || []).forEach(t => {
    byType[t._id] = t.count;
  });

  const timeStats = loadAggregation[0]?.timeStats[0] || {};

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
    averageDeliveryTime: timeStats.averageProcessingTime || 0,
    averagePickupTime: timeStats.averageProcessingTime || 0,
    topCarriers: (loadAggregation[0]?.byCarrier || []).map(c => ({
      name: c._id,
      count: c.count
    })),
    topCustomers: (loadAggregation[0]?.byCustomer || []).map(c => ({
      name: c._id,
      count: c.count
    })),
    lastUpdated: new Date()
  });

  await newLoadStats.save();
  console.log('Load stats generated for', startOfDay);
};

const generateUserStats = async () => {
  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));

  // Проверяем, есть ли уже статистика пользователей за этот день
  const existingStats = await UserStats.findOne({ date: startOfDay });
  if (existingStats) {
    console.log('User stats already exist for today, skipping...');
    return;
  }

  // Получаем всех пользователей
  const users = await User.find({}, '_id role');
  
  for (const user of users) {
    // Aggregation for user stats
    const userAggregation = await Load.aggregate([
      { $match: { createdBy: user._id } },
      {
        $group: {
          _id: "$createdBy",
          loadsAdded: { $sum: 1 },
          totalRevenueGenerated: { $sum: { $ifNull: ["$value", 0] } },
          loadsByStatus: { $push: "$status" },
          loadsByType: { $push: "$type" },
          averageValue: { $avg: { $ifNull: ["$value", 0] } }
        }
      }
    ]);

    const userData = userAggregation[0];
    if (!userData) continue;

    // Группируем по статусам
    const statusCounts = {};
    userData.loadsByStatus.forEach(status => {
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    // Группируем по типам
    const typeCounts = {};
    userData.loadsByType.forEach(type => {
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    // Рассчитываем зарплату в зависимости от роли
    let earnings = 0;
    if (user.role === 'carrier') {
      earnings = userData.totalRevenueGenerated * 0.7; // 70% от дохода
    } else if (user.role === 'dispatcher') {
      earnings = userData.totalRevenueGenerated * 0.05; // 5% от дохода
    } else if (user.role === 'manager') {
      earnings = userData.totalRevenueGenerated * 0.1; // 10% от дохода
    }

    // Рассчитываем среднее время обработки
    const processingTimeAggregation = await Load.aggregate([
      { $match: { createdBy: user._id } },
      {
        $match: {
          $and: [
            { pickUpDate: { $exists: true } },
            { deliveryDate: { $exists: true } }
          ]
        }
      },
      {
        $addFields: {
          processingTime: {
            $divide: [
              { $subtract: ["$deliveryDate", "$pickUpDate"] },
              1000 * 60 * 60 * 24 // Convert to days
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          averageProcessingTime: { $avg: "$processingTime" }
        }
      }
    ]);

    const averageProcessingTime = processingTimeAggregation[0]?.averageProcessingTime || 0;

    await UserStats.create({
      date: startOfDay,
      userId: user._id,
      totalDeals: userData.loadsAdded,
      loadsAdded: userData.loadsAdded,
      totalEarnings: earnings,
      totalPaymentsProcessed: statusCounts['Delivered'] || 0, // Количество доставленных грузов
      totalRevenueGenerated: userData.totalRevenueGenerated,
      averageLoadProcessingTime: averageProcessingTime,
      lastUpdated: new Date()
    });
  }
  
  console.log('User stats generated for', startOfDay);
};

// Функция для получения статистики за период
const getStatsForPeriod = async (startDate, endDate) => {
  const loadStats = await LoadStats.find({
    date: { $gte: startDate, $lte: endDate }
  }).sort({ date: 1 });

  const userStats = await UserStats.find({
    date: { $gte: startDate, $lte: endDate }
  }).populate('userId', 'firstName lastName email role').sort({ date: 1 });

  return { loadStats, userStats };
};

// Функция для получения статистики пользователя за период
const getUserStatsForPeriod = async (userId, startDate, endDate) => {
  const userStats = await UserStats.find({
    userId,
    date: { $gte: startDate, $lte: endDate }
  }).sort({ date: 1 });

  // Получаем детальную статистику из Load модели
  const detailedStats = await Load.aggregate([
    { $match: { createdBy: userId } },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" },
          day: { $dayOfMonth: "$createdAt" }
        },
        loadsAdded: { $sum: 1 },
        totalRevenue: { $sum: { $ifNull: ["$value", 0] } },
        loadsByStatus: { $push: "$status" },
        loadsByType: { $push: "$type" }
      }
    },
    { $sort: { "_id.year": -1, "_id.month": -1, "_id.day": -1 } }
  ]);

  return { userStats, detailedStats };
};

// Функция для получения топ пользователей
const getTopUsers = async (limit = 10, period = 'month') => {
  let dateFilter = {};
  
  if (period === 'day') {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));
    dateFilter = { date: { $gte: startOfDay, $lte: endOfDay } };
  } else if (period === 'month') {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    dateFilter = { date: { $gte: startOfMonth, $lte: endOfMonth } };
  }

  const topUsers = await UserStats.find(dateFilter)
    .populate('userId', 'firstName lastName email role')
    .sort({ totalRevenueGenerated: -1 })
    .limit(limit);

  return topUsers;
};

const updateAllStats = async () => {
  await generateLoadStats();
  await generateUserStats();
  console.log('Statistics updated at', new Date());
};

module.exports = { 
  updateAllStats,
  getStatsForPeriod,
  getUserStatsForPeriod,
  getTopUsers
};
