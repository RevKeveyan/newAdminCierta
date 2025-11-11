const Load = require('../models/Load');
const User = require('../models/User');
const { 
  CachedDayStats, 
  CachedMonthStats, 
  CachedUserDayStats, 
  CachedUserMonthStats 
} = require('../models/subModels/CachedStats');

class CachedStatsService {
  
  // Генерация дневной статистики
  async generateDayStats(targetDate = null) {
    const date = targetDate || new Date();
    const startOfDay = new Date(date.setHours(0, 0, 0, 0));
    const endOfDay = new Date(date.setHours(23, 59, 59, 999));
    
    console.log(`Generating day stats for ${startOfDay.toISOString().split('T')[0]}`);
    
    // Проверяем, есть ли уже статистика за этот день
    const existingStats = await CachedDayStats.findOne({ date: startOfDay });
    if (existingStats && existingStats.isComplete) {
      console.log('Day stats already exist and complete, skipping...');
      return existingStats;
    }

    // Агрегация данных за день
    const dayAggregation = await Load.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfDay, $lte: endOfDay }
        }
      },
      {
        $facet: {
          // Общая статистика
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
          // По статусам
          byStatus: [
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 }
              }
            }
          ],
          // По типам
          byType: [
            {
              $group: {
                _id: "$type",
                count: { $sum: 1 }
              }
            }
          ],
          // Топ пользователи
          topUsers: [
            {
              $group: {
                _id: "$createdBy",
                loadsAdded: { $sum: 1 },
                revenueGenerated: { $sum: { $ifNull: ["$value", 0] } }
              }
            },
            { $sort: { loadsAdded: -1 } },
            { $limit: 10 }
          ],
          // Топ перевозчики
          topCarriers: [
            {
              $group: {
                _id: "$carrier.name",
                loadsCount: { $sum: 1 },
                revenue: { $sum: { $ifNull: ["$value", 0] } }
              }
            },
            { $sort: { loadsCount: -1 } },
            { $limit: 5 }
          ],
          // Топ клиенты
          topCustomers: [
            {
              $group: {
                _id: "$customerCompanyName",
                loadsCount: { $sum: 1 },
                revenue: { $sum: { $ifNull: ["$value", 0] } }
              }
            },
            { $sort: { loadsCount: -1 } },
            { $limit: 5 }
          ]
        }
      }
    ]);

    const totals = dayAggregation[0]?.totals[0] || {};
    const byStatus = {};
    const byType = {};
    
    (dayAggregation[0]?.byStatus || []).forEach(s => {
      byStatus[s._id?.replace(/\s+/g, '').toLowerCase()] = s.count;
    });
    
    (dayAggregation[0]?.byType || []).forEach(t => {
      byType[t._id?.toLowerCase()] = t.count;
    });

    // Получаем статистику пользователей
    const usersStats = await User.aggregate([
      {
        $group: {
          _id: "$role",
          count: { $sum: 1 }
        }
      }
    ]);

    const usersByRole = {};
    usersStats.forEach(u => {
      usersByRole[u._id] = u.count;
    });

    // Создаем или обновляем статистику
    const dayStatsData = {
      date: startOfDay,
      totalUsers: await User.countDocuments(),
      totalLoads: totals.totalLoads || 0,
      totalRevenue: totals.totalRevenue || 0,
      totalExpense: totals.totalExpense || 0,
      totalTurnover: (totals.totalRevenue || 0) - (totals.totalExpense || 0),
      loadsByStatus: {
        listed: byStatus.listed || 0,
        dispatched: byStatus.dispatched || 0,
        pickedUp: byStatus.pickedup || 0,
        delivered: byStatus.delivered || 0,
        onHold: byStatus.onhold || 0,
        cancelled: byStatus.cancelled || 0
      },
      loadsByType: {
        boats: byType.boats || 0,
        cars: byType.cars || 0,
        motorcycles: byType.motorcycles || 0,
        rvs: byType.rvs || 0
      },
      usersByRole: {
        admin: usersByRole.admin || 0,
        dispatcher: usersByRole.dispatcher || 0,
        carrier: usersByRole.carrier || 0,
        customer: usersByRole.customer || 0,
        accountant: usersByRole.accountant || 0,
        manager: usersByRole.manager || 0,
        driver: usersByRole.driver || 0
      },
      topUsers: (dayAggregation[0]?.topUsers || []).map(u => ({
        userId: u._id,
        loadsAdded: u.loadsAdded,
        revenueGenerated: u.revenueGenerated,
        earnings: this.calculateEarnings(u._id, u.revenueGenerated)
      })),
      topCarriers: (dayAggregation[0]?.topCarriers || []).map(c => ({
        name: c._id,
        loadsCount: c.loadsCount,
        revenue: c.revenue
      })),
      topCustomers: (dayAggregation[0]?.topCustomers || []).map(c => ({
        name: c._id,
        loadsCount: c.loadsCount,
        revenue: c.revenue
      })),
      averageLoadValue: totals.averageValue || 0,
      lastUpdated: new Date(),
      isComplete: true
    };

    if (existingStats) {
      await CachedDayStats.findByIdAndUpdate(existingStats._id, dayStatsData);
      console.log('Day stats updated');
    } else {
      await CachedDayStats.create(dayStatsData);
      console.log('Day stats created');
    }

    return dayStatsData;
  }

  // Генерация месячной статистики
  async generateMonthStats(targetDate = null) {
    const date = targetDate || new Date();
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
    
    console.log(`Generating month stats for ${year}-${month}`);
    
    // Проверяем, есть ли уже статистика за этот месяц
    const existingStats = await CachedMonthStats.findOne({ year, month });
    if (existingStats && existingStats.isComplete) {
      console.log('Month stats already exist and complete, skipping...');
      return existingStats;
    }

    // Агрегация данных за месяц
    const monthAggregation = await Load.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfMonth, $lte: endOfMonth }
        }
      },
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
          topUsers: [
            {
              $group: {
                _id: "$createdBy",
                loadsAdded: { $sum: 1 },
                revenueGenerated: { $sum: { $ifNull: ["$value", 0] } }
              }
            },
            { $sort: { loadsAdded: -1 } },
            { $limit: 10 }
          ],
          topCarriers: [
            {
              $group: {
                _id: "$carrier.name",
                loadsCount: { $sum: 1 },
                revenue: { $sum: { $ifNull: ["$value", 0] } }
              }
            },
            { $sort: { loadsCount: -1 } },
            { $limit: 5 }
          ],
          topCustomers: [
            {
              $group: {
                _id: "$customerCompanyName",
                loadsCount: { $sum: 1 },
                revenue: { $sum: { $ifNull: ["$value", 0] } }
              }
            },
            { $sort: { loadsCount: -1 } },
            { $limit: 5 }
          ]
        }
      }
    ]);

    const totals = monthAggregation[0]?.totals[0] || {};
    const byStatus = {};
    const byType = {};
    
    (monthAggregation[0]?.byStatus || []).forEach(s => {
      byStatus[s._id?.replace(/\s+/g, '').toLowerCase()] = s.count;
    });
    
    (monthAggregation[0]?.byType || []).forEach(t => {
      byType[t._id?.toLowerCase()] = t.count;
    });

    // Получаем статистику пользователей
    const usersStats = await User.aggregate([
      {
        $group: {
          _id: "$role",
          count: { $sum: 1 }
        }
      }
    ]);

    const usersByRole = {};
    usersStats.forEach(u => {
      usersByRole[u._id] = u.count;
    });

    // Создаем или обновляем статистику
    const monthStatsData = {
      year,
      month,
      date: startOfMonth,
      totalUsers: await User.countDocuments(),
      totalLoads: totals.totalLoads || 0,
      totalRevenue: totals.totalRevenue || 0,
      totalExpense: totals.totalExpense || 0,
      totalTurnover: (totals.totalRevenue || 0) - (totals.totalExpense || 0),
      loadsByStatus: {
        listed: byStatus.listed || 0,
        dispatched: byStatus.dispatched || 0,
        pickedUp: byStatus.pickedup || 0,
        delivered: byStatus.delivered || 0,
        onHold: byStatus.onhold || 0,
        cancelled: byStatus.cancelled || 0
      },
      loadsByType: {
        boats: byType.boats || 0,
        cars: byType.cars || 0,
        motorcycles: byType.motorcycles || 0,
        rvs: byType.rvs || 0
      },
      usersByRole: {
        admin: usersByRole.admin || 0,
        dispatcher: usersByRole.dispatcher || 0,
        carrier: usersByRole.carrier || 0,
        customer: usersByRole.customer || 0,
        accountant: usersByRole.accountant || 0,
        manager: usersByRole.manager || 0,
        driver: usersByRole.driver || 0
      },
      topUsers: (monthAggregation[0]?.topUsers || []).map(u => ({
        userId: u._id,
        loadsAdded: u.loadsAdded,
        revenueGenerated: u.revenueGenerated,
        earnings: this.calculateEarnings(u._id, u.revenueGenerated)
      })),
      topCarriers: (monthAggregation[0]?.topCarriers || []).map(c => ({
        name: c._id,
        loadsCount: c.loadsCount,
        revenue: c.revenue
      })),
      topCustomers: (monthAggregation[0]?.topCustomers || []).map(c => ({
        name: c._id,
        loadsCount: c.loadsCount,
        revenue: c.revenue
      })),
      averageLoadValue: totals.averageValue || 0,
      lastUpdated: new Date(),
      isComplete: true
    };

    if (existingStats) {
      await CachedMonthStats.findByIdAndUpdate(existingStats._id, monthStatsData);
      console.log('Month stats updated');
    } else {
      await CachedMonthStats.create(monthStatsData);
      console.log('Month stats created');
    }

    return monthStatsData;
  }

  // Генерация статистики пользователя за день
  async generateUserDayStats(userId, targetDate = null) {
    const date = targetDate || new Date();
    const startOfDay = new Date(date.setHours(0, 0, 0, 0));
    
    console.log(`Generating user day stats for user ${userId} on ${startOfDay.toISOString().split('T')[0]}`);
    
    // Проверяем, есть ли уже статистика
    const existingStats = await CachedUserDayStats.findOne({ userId, date: startOfDay });
    if (existingStats) {
      console.log('User day stats already exist, skipping...');
      return existingStats;
    }

    // Агрегация данных пользователя за день
    const userAggregation = await Load.aggregate([
      {
        $match: {
          createdBy: userId,
          createdAt: { $gte: startOfDay, $lt: new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000) }
        }
      },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                loadsAdded: { $sum: 1 },
                totalRevenue: { $sum: { $ifNull: ["$value", 0] } },
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
          ]
        }
      }
    ]);

    const totals = userAggregation[0]?.totals[0] || {};
    const byStatus = {};
    const byType = {};
    
    (userAggregation[0]?.byStatus || []).forEach(s => {
      byStatus[s._id?.replace(/\s+/g, '').toLowerCase()] = s.count;
    });
    
    (userAggregation[0]?.byType || []).forEach(t => {
      byType[t._id?.toLowerCase()] = t.count;
    });

    // Получаем роль пользователя для расчета зарплаты
    const user = await User.findById(userId).select('role');
    const earnings = this.calculateEarnings(userId, totals.totalRevenue || 0, user?.role);

    // Создаем статистику пользователя
    const userDayStatsData = {
      userId,
      date: startOfDay,
      loadsAdded: totals.loadsAdded || 0,
      loadsByStatus: {
        listed: byStatus.listed || 0,
        dispatched: byStatus.dispatched || 0,
        pickedUp: byStatus.pickedup || 0,
        delivered: byStatus.delivered || 0,
        onHold: byStatus.onhold || 0,
        cancelled: byStatus.cancelled || 0
      },
      loadsByType: {
        boats: byType.boats || 0,
        cars: byType.cars || 0,
        motorcycles: byType.motorcycles || 0,
        rvs: byType.rvs || 0
      },
      revenueGenerated: totals.totalRevenue || 0,
      earnings,
      averageProcessingTime: 0, // можно добавить расчет
      lastUpdated: new Date()
    };

    await CachedUserDayStats.create(userDayStatsData);
    console.log('User day stats created');
    
    return userDayStatsData;
  }

  // Генерация статистики пользователя за месяц
  async generateUserMonthStats(userId, targetDate = null) {
    const date = targetDate || new Date();
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
    
    console.log(`Generating user month stats for user ${userId} for ${year}-${month}`);
    
    // Проверяем, есть ли уже статистика
    const existingStats = await CachedUserMonthStats.findOne({ userId, year, month });
    if (existingStats) {
      console.log('User month stats already exist, skipping...');
      return existingStats;
    }

    // Агрегация данных пользователя за месяц
    const userAggregation = await Load.aggregate([
      {
        $match: {
          createdBy: userId,
          createdAt: { $gte: startOfMonth, $lte: endOfMonth }
        }
      },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                loadsAdded: { $sum: 1 },
                totalRevenue: { $sum: { $ifNull: ["$value", 0] } },
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
          ]
        }
      }
    ]);

    const totals = userAggregation[0]?.totals[0] || {};
    const byStatus = {};
    const byType = {};
    
    (userAggregation[0]?.byStatus || []).forEach(s => {
      byStatus[s._id?.replace(/\s+/g, '').toLowerCase()] = s.count;
    });
    
    (userAggregation[0]?.byType || []).forEach(t => {
      byType[t._id?.toLowerCase()] = t.count;
    });

    // Получаем роль пользователя для расчета зарплаты
    const user = await User.findById(userId).select('role');
    const earnings = this.calculateEarnings(userId, totals.totalRevenue || 0, user?.role);

    // Создаем статистику пользователя
    const userMonthStatsData = {
      userId,
      year,
      month,
      date: startOfMonth,
      loadsAdded: totals.loadsAdded || 0,
      loadsByStatus: {
        listed: byStatus.listed || 0,
        dispatched: byStatus.dispatched || 0,
        pickedUp: byStatus.pickedup || 0,
        delivered: byStatus.delivered || 0,
        onHold: byStatus.onhold || 0,
        cancelled: byStatus.cancelled || 0
      },
      loadsByType: {
        boats: byType.boats || 0,
        cars: byType.cars || 0,
        motorcycles: byType.motorcycles || 0,
        rvs: byType.rvs || 0
      },
      revenueGenerated: totals.totalRevenue || 0,
      earnings,
      averageProcessingTime: 0,
      lastUpdated: new Date()
    };

    await CachedUserMonthStats.create(userMonthStatsData);
    console.log('User month stats created');
    
    return userMonthStatsData;
  }

  // Расчет зарплаты в зависимости от роли
  calculateEarnings(userId, revenue, role = null) {
    if (!role) return 0;
    
    switch (role) {
      case 'carrier':
        return revenue * 0.7; // 70% от дохода
      case 'dispatcher':
        return revenue * 0.05; // 5% от дохода
      case 'manager':
        return revenue * 0.1; // 10% от дохода
      case 'driver':
        return revenue * 0.6; // 60% от дохода
      default:
        return 0;
    }
  }

  // Получить кэшированную статистику за день
  async getCachedDayStats(date) {
    const startOfDay = new Date(date.setHours(0, 0, 0, 0));
    return await CachedDayStats.findOne({ date: startOfDay });
  }

  // Получить кэшированную статистику за месяц
  async getCachedMonthStats(year, month) {
    return await CachedMonthStats.findOne({ year, month });
  }

  // Получить кэшированную статистику пользователя за день
  async getCachedUserDayStats(userId, date) {
    const startOfDay = new Date(date.setHours(0, 0, 0, 0));
    return await CachedUserDayStats.findOne({ userId, date: startOfDay });
  }

  // Получить кэшированную статистику пользователя за месяц
  async getCachedUserMonthStats(userId, year, month) {
    return await CachedUserMonthStats.findOne({ userId, year, month });
  }

  // Обновить все статистики
  async updateAllCachedStats() {
    console.log('Starting cached stats update...');
    
    // Обновляем дневную статистику
    await this.generateDayStats();
    
    // Обновляем месячную статистику
    await this.generateMonthStats();
    
    // Обновляем статистику всех пользователей за день
    const users = await User.find({}, '_id');
    for (const user of users) {
      await this.generateUserDayStats(user._id);
    }
    
    // Обновляем статистику всех пользователей за месяц
    for (const user of users) {
      await this.generateUserMonthStats(user._id);
    }
    
    console.log('All cached stats updated successfully');
  }
}

module.exports = new CachedStatsService();

