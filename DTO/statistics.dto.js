// DTO для статистики
class StatisticsDTO {
  static formatGeneralStats(data) {
    return {
      period: data.period,
      dateRange: data.dateRange,
      totalLoads: data.totalLoads,
      totalRevenue: data.totalRevenue,
      loadsByStatus: data.loadsByStatus,
      historicalData: data.historicalData.map(stat => ({
        date: stat.date,
        totalLoads: stat.totalLoads,
        totalRevenue: stat.totalRevenue,
        totalExpense: stat.totalExpense,
        totalTurnover: stat.totalTurnover,
        loadsByStatus: stat.loadsByStatus,
        averageDeliveryTime: stat.averageDeliveryTime,
        topCarriers: stat.topCarriers,
        topCustomers: stat.topCustomers
      }))
    };
  }

  static formatUserStats(data) {
    return {
      user: {
        id: data.user._id,
        name: `${data.user.firstName} ${data.user.lastName}`,
        email: data.user.email,
        role: data.user.role
      },
      period: data.period,
      dateRange: data.dateRange,
      totalLoads: data.totalLoads,
      totalRevenue: data.totalRevenue,
      loadsByStatus: data.loadsByStatus,
      loadsByType: data.loadsByType,
      historicalData: data.historicalData.map(stat => ({
        date: stat.date,
        totalDeals: stat.totalDeals,
        loadsAdded: stat.loadsAdded,
        totalEarnings: stat.totalEarnings,
        totalPaymentsProcessed: stat.totalPaymentsProcessed,
        totalRevenueGenerated: stat.totalRevenueGenerated,
        averageLoadProcessingTime: stat.averageLoadProcessingTime
      }))
    };
  }

  static formatAllUsersStats(data) {
    return {
      period: data.period,
      dateRange: data.dateRange,
      usersStats: data.usersStats.map(stat => ({
        date: stat.date,
        user: {
          id: stat.userId._id,
          name: `${stat.userId.firstName} ${stat.userId.lastName}`,
          email: stat.userId.email,
          role: stat.userId.role
        },
        totalDeals: stat.totalDeals,
        loadsAdded: stat.loadsAdded,
        totalEarnings: stat.totalEarnings,
        totalPaymentsProcessed: stat.totalPaymentsProcessed,
        totalRevenueGenerated: stat.totalRevenueGenerated,
        averageLoadProcessingTime: stat.averageLoadProcessingTime
      })),
      topUsers: data.topUsers.map(user => ({
        user: {
          id: user.user._id,
          name: `${user.user.firstName} ${user.user.lastName}`,
          email: user.user.email,
          role: user.user.role
        },
        loadsAdded: user.loadsAdded,
        totalRevenue: user.totalRevenue
      }))
    };
  }

  static formatDetailedStats(data) {
    return data.map(stat => ({
      date: stat.date,
      loadsAdded: stat.loadsAdded,
      totalRevenue: stat.totalRevenue,
      loadsByStatus: stat.loadsByStatus,
      loadsByType: stat.loadsByType
    }));
  }
}

module.exports = StatisticsDTO;

