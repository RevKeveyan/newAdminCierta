const mongoose = require('mongoose');

// Кэшированная статистика за день
const cachedDayStatsSchema = new mongoose.Schema({
  date: { type: Date, required: true, unique: true }, // дата (YYYY-MM-DD)
  
  // Общая статистика
  totalUsers: { type: Number, default: 0 },
  totalLoads: { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 },
  totalExpense: { type: Number, default: 0 },
  totalTurnover: { type: Number, default: 0 },
  
  // Статистика по статусам грузов
  loadsByStatus: {
    listed: { type: Number, default: 0 },
    dispatched: { type: Number, default: 0 },
    pickedUp: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    onHold: { type: Number, default: 0 },
    cancelled: { type: Number, default: 0 }
  },
  
  // Статистика по типам грузов
  loadsByType: {
    boats: { type: Number, default: 0 },
    cars: { type: Number, default: 0 },
    motorcycles: { type: Number, default: 0 },
    rvs: { type: Number, default: 0 }
  },
  
  // Статистика по ролям пользователей
  usersByRole: {
    admin: { type: Number, default: 0 },
    dispatcher: { type: Number, default: 0 },
    carrier: { type: Number, default: 0 },
    customer: { type: Number, default: 0 },
    accountant: { type: Number, default: 0 },
    manager: { type: Number, default: 0 },
    driver: { type: Number, default: 0 }
  },
  
  // Топ пользователи за день
  topUsers: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    loadsAdded: { type: Number, default: 0 },
    revenueGenerated: { type: Number, default: 0 },
    earnings: { type: Number, default: 0 }
  }],
  
  // Топ перевозчики за день
  topCarriers: [{
    name: String,
    loadsCount: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 }
  }],
  
  // Топ клиенты за день
  topCustomers: [{
    name: String,
    loadsCount: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 }
  }],
  
  // Временные метрики
  averageProcessingTime: { type: Number, default: 0 }, // в днях
  averageLoadValue: { type: Number, default: 0 },
  
  // Метаданные
  lastUpdated: { type: Date, default: Date.now },
  isComplete: { type: Boolean, default: false } // завершена ли обработка дня
}, { versionKey: false });

// Кэшированная статистика за месяц
const cachedMonthStatsSchema = new mongoose.Schema({
  year: { type: Number, required: true },
  month: { type: Number, required: true }, // 1-12
  date: { type: Date, required: true, unique: true }, // первый день месяца
  
  // Агрегированная статистика за месяц
  totalUsers: { type: Number, default: 0 },
  totalLoads: { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 },
  totalExpense: { type: Number, default: 0 },
  totalTurnover: { type: Number, default: 0 },
  
  // Статистика по статусам
  loadsByStatus: {
    listed: { type: Number, default: 0 },
    dispatched: { type: Number, default: 0 },
    pickedUp: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    onHold: { type: Number, default: 0 },
    cancelled: { type: Number, default: 0 }
  },
  
  // Статистика по типам
  loadsByType: {
    boats: { type: Number, default: 0 },
    cars: { type: Number, default: 0 },
    motorcycles: { type: Number, default: 0 },
    rvs: { type: Number, default: 0 }
  },
  
  // Статистика по ролям
  usersByRole: {
    admin: { type: Number, default: 0 },
    dispatcher: { type: Number, default: 0 },
    carrier: { type: Number, default: 0 },
    customer: { type: Number, default: 0 },
    accountant: { type: Number, default: 0 },
    manager: { type: Number, default: 0 },
    driver: { type: Number, default: 0 }
  },
  
  // Топ пользователи за месяц
  topUsers: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    loadsAdded: { type: Number, default: 0 },
    revenueGenerated: { type: Number, default: 0 },
    earnings: { type: Number, default: 0 }
  }],
  
  // Топ перевозчики за месяц
  topCarriers: [{
    name: String,
    loadsCount: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 }
  }],
  
  // Топ клиенты за месяц
  topCustomers: [{
    name: String,
    loadsCount: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 }
  }],
  
  // Временные метрики
  averageProcessingTime: { type: Number, default: 0 },
  averageLoadValue: { type: Number, default: 0 },
  
  // Метаданные
  lastUpdated: { type: Date, default: Date.now },
  isComplete: { type: Boolean, default: false }
}, { versionKey: false });

// Кэшированная статистика пользователя за день
const cachedUserDayStatsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  
  // Статистика пользователя за день
  loadsAdded: { type: Number, default: 0 },
  loadsByStatus: {
    listed: { type: Number, default: 0 },
    dispatched: { type: Number, default: 0 },
    pickedUp: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    onHold: { type: Number, default: 0 },
    cancelled: { type: Number, default: 0 }
  },
  
  loadsByType: {
    boats: { type: Number, default: 0 },
    cars: { type: Number, default: 0 },
    motorcycles: { type: Number, default: 0 },
    rvs: { type: Number, default: 0 }
  },
  
  revenueGenerated: { type: Number, default: 0 },
  earnings: { type: Number, default: 0 },
  averageProcessingTime: { type: Number, default: 0 },
  
  lastUpdated: { type: Date, default: Date.now }
}, { 
  versionKey: false,
  unique: true,
  index: { userId: 1, date: 1 }
});

// Кэшированная статистика пользователя за месяц
const cachedUserMonthStatsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  year: { type: Number, required: true },
  month: { type: Number, required: true },
  date: { type: Date, required: true },
  
  // Агрегированная статистика пользователя за месяц
  loadsAdded: { type: Number, default: 0 },
  loadsByStatus: {
    listed: { type: Number, default: 0 },
    dispatched: { type: Number, default: 0 },
    pickedUp: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    onHold: { type: Number, default: 0 },
    cancelled: { type: Number, default: 0 }
  },
  
  loadsByType: {
    boats: { type: Number, default: 0 },
    cars: { type: Number, default: 0 },
    motorcycles: { type: Number, default: 0 },
    rvs: { type: Number, default: 0 }
  },
  
  revenueGenerated: { type: Number, default: 0 },
  earnings: { type: Number, default: 0 },
  averageProcessingTime: { type: Number, default: 0 },
  
  lastUpdated: { type: Date, default: Date.now }
}, { 
  versionKey: false,
  unique: true,
  index: { userId: 1, year: 1, month: 1 }
});

module.exports = {
  CachedDayStats: mongoose.model('CachedDayStats', cachedDayStatsSchema),
  CachedMonthStats: mongoose.model('CachedMonthStats', cachedMonthStatsSchema),
  CachedUserDayStats: mongoose.model('CachedUserDayStats', cachedUserDayStatsSchema),
  CachedUserMonthStats: mongoose.model('CachedUserMonthStats', cachedUserMonthStatsSchema)
};

