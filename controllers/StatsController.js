const UniversalBaseController = require('./UniversalBaseController');
const Load = require('../models/Load');
const User = require('../models/User');
const LoadStats = require('../models/subModels/LoadStats');
const UserStats = require('../models/subModels/UserStats');
const StatisticsDTO = require('../DTO/statistics.dto');
const cachedStatsService = require('../services/cachedStatsService');

class StatsController extends UniversalBaseController {
  constructor() {
    super(Load, {
      dto: StatisticsDTO,
      searchFields: ['vin', 'type', 'status', 'carrier.name']
    });
  }
  // Получить общую статистику
  async getGeneralStats(req, res) {
    try {
      const { period = 'month', startDate, endDate } = req.query;
      
      let cachedStats = null;
      
      if (startDate && endDate) {
        // Для конкретного периода - используем кэшированные данные если есть
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        if (period === 'day') {
          cachedStats = await cachedStatsService.getCachedDayStats(start);
        } else if (period === 'month') {
          cachedStats = await cachedStatsService.getCachedMonthStats(start.getFullYear(), start.getMonth() + 1);
        }
      } else {
        // Для текущего периода
        const now = new Date();
        
        if (period === 'day') {
          cachedStats = await cachedStatsService.getCachedDayStats(now);
        } else if (period === 'month') {
          cachedStats = await cachedStatsService.getCachedMonthStats(now.getFullYear(), now.getMonth() + 1);
        }
      }

      // Если кэшированных данных нет, генерируем их
      if (!cachedStats) {
        console.log('No cached stats found, generating...');
        if (period === 'day') {
          cachedStats = await cachedStatsService.generateDayStats();
        } else if (period === 'month') {
          cachedStats = await cachedStatsService.generateMonthStats();
        }
      }

      const generalStats = {
        period,
        dateRange: { startDate, endDate },
        totalUsers: cachedStats.totalUsers,
        totalLoads: cachedStats.totalLoads,
        totalRevenue: cachedStats.totalRevenue,
        totalExpense: cachedStats.totalExpense,
        totalTurnover: cachedStats.totalTurnover,
        loadsByStatus: cachedStats.loadsByStatus,
        loadsByType: cachedStats.loadsByType,
        usersByRole: cachedStats.usersByRole,
        topUsers: cachedStats.topUsers,
        topCarriers: cachedStats.topCarriers,
        topCustomers: cachedStats.topCustomers,
        averageLoadValue: cachedStats.averageLoadValue,
        lastUpdated: cachedStats.lastUpdated
      };

      const formattedData = StatisticsDTO.formatGeneralStats(generalStats);
      
      res.json({
        success: true,
        data: formattedData
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get general statistics',
        details: error.message
      });
    }
  }

  // Получить статистику пользователя
  async getUserStats(req, res) {
    try {
      const { userId } = req.params;
      const { period = 'month', startDate, endDate } = req.query;
      
      let cachedUserStats = null;
      
      if (startDate && endDate) {
        // Для конкретного периода
        const start = new Date(startDate);
        
        if (period === 'day') {
          cachedUserStats = await cachedStatsService.getCachedUserDayStats(userId, start);
        } else if (period === 'month') {
          cachedUserStats = await cachedStatsService.getCachedUserMonthStats(userId, start.getFullYear(), start.getMonth() + 1);
        }
      } else {
        // Для текущего периода
        const now = new Date();
        
        if (period === 'day') {
          cachedUserStats = await cachedStatsService.getCachedUserDayStats(userId, now);
        } else if (period === 'month') {
          cachedUserStats = await cachedStatsService.getCachedUserMonthStats(userId, now.getFullYear(), now.getMonth() + 1);
        }
      }

      // Если кэшированных данных нет, генерируем их
      if (!cachedUserStats) {
        console.log('No cached user stats found, generating...');
        if (period === 'day') {
          cachedUserStats = await cachedStatsService.generateUserDayStats(userId);
        } else if (period === 'month') {
          cachedUserStats = await cachedStatsService.generateUserMonthStats(userId);
        }
      }

      // Получаем информацию о пользователе
      const user = await User.findById(userId).select('firstName lastName email role');

      const userStatistics = {
        user: user,
        period,
        dateRange: { startDate, endDate },
        totalLoads: cachedUserStats.loadsAdded,
        totalRevenue: cachedUserStats.revenueGenerated,
        loadsByStatus: cachedUserStats.loadsByStatus,
        loadsByType: cachedUserStats.loadsByType,
        earnings: cachedUserStats.earnings,
        averageProcessingTime: cachedUserStats.averageProcessingTime,
        lastUpdated: cachedUserStats.lastUpdated
      };

      const formattedData = StatisticsDTO.formatUserStats(userStatistics);
      
      res.json({
        success: true,
        data: formattedData
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get user statistics',
        details: error.message
      });
    }
  }

  // Получить статистику всех пользователей
  async getAllUsersStats(req, res) {
    try {
      const { period = 'month', startDate, endDate } = req.query;
      
      let dateFilter = {};
      
      if (startDate && endDate) {
        dateFilter = {
          date: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          }
        };
      } else {
        const now = new Date();
        if (period === 'day') {
          const startOfDay = new Date(now.setHours(0, 0, 0, 0));
          const endOfDay = new Date(now.setHours(23, 59, 59, 999));
          dateFilter = { date: { $gte: startOfDay, $lte: endOfDay } };
        } else if (period === 'month') {
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          dateFilter = { date: { $gte: startOfMonth, $lte: endOfMonth } };
        }
      }

      // Получаем статистику всех пользователей
      const usersStats = await UserStats.find(dateFilter)
        .populate('userId', 'firstName lastName email role')
        .sort({ totalRevenueGenerated: -1 });

      // Получаем топ пользователей по активности
      const topUsers = await Load.aggregate([
        {
          $group: {
            _id: "$createdBy",
            loadsAdded: { $sum: 1 },
            totalRevenue: { $sum: { $ifNull: ["$value", 0] } }
          }
        },
        { $sort: { loadsAdded: -1 } },
        { $limit: 10 }
      ]);

      // Заполняем информацию о пользователях
      const topUsersWithInfo = await Promise.all(
        topUsers.map(async (user) => {
          const userInfo = await User.findById(user._id).select('firstName lastName email role');
          return {
            ...user,
            user: userInfo
          };
        })
      );

      const formattedData = StatisticsDTO.formatAllUsersStats({
        period,
        dateRange: dateFilter,
        usersStats,
        topUsers: topUsersWithInfo
      });
      
      res.json({
        success: true,
        data: formattedData
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get all users statistics',
        details: error.message
      });
    }
  }

  // Получить детальную статистику по изменениям
  async getDetailedStats(req, res) {
    try {
      const { userId, startDate, endDate } = req.query;
      
      let matchFilter = {};
      
      if (userId) {
        matchFilter.createdBy = userId;
      }
      
      if (startDate && endDate) {
        matchFilter.createdAt = {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        };
      }

      // Получаем детальную статистику по грузам
      const detailedStats = await Load.aggregate([
        { $match: matchFilter },
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

      // Группируем по статусам для каждого дня
      const processedStats = detailedStats.map(stat => {
        const statusCounts = {};
        const typeCounts = {};
        
        stat.loadsByStatus.forEach(status => {
          statusCounts[status] = (statusCounts[status] || 0) + 1;
        });
        
        stat.loadsByType.forEach(type => {
          typeCounts[type] = (typeCounts[type] || 0) + 1;
        });

        return {
          date: `${stat._id.year}-${String(stat._id.month).padStart(2, '0')}-${String(stat._id.day).padStart(2, '0')}`,
          loadsAdded: stat.loadsAdded,
          totalRevenue: stat.totalRevenue,
          loadsByStatus: statusCounts,
          loadsByType: typeCounts
        };
      });

      const formattedData = StatisticsDTO.formatDetailedStats(processedStats);
      
      res.json({
        success: true,
        data: formattedData
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get detailed statistics',
        details: error.message
      });
    }
  }
}

module.exports = new StatsController();
