const cron = require('node-cron');
const { updateAllStats } = require('../services/statsService');
const cachedStatsService = require('../services/cachedStatsService');

// TEMPORARILY DISABLED FOR PERFORMANCE - These cron jobs were causing 25+ second response times
// Every day at 6 AM - обновляем кэшированную статистику
// cron.schedule('0 6 * * *', async () => {
//   console.log('Running daily cached stats update at 6 AM');
//   try {
//     await cachedStatsService.updateAllCachedStats();
//     console.log('Cached stats updated successfully');
//   } catch (error) {
//     console.error('Error updating cached stats:', error);
//   }
// });

// Every day at 23:59 - финальное обновление дневной статистики
// cron.schedule('59 23 * * *', async () => {
//   console.log('Running end-of-day stats update at 23:59');
//   try {
//     await cachedStatsService.generateDayStats();
//     console.log('End-of-day stats updated successfully');
//   } catch (error) {
//     console.error('Error updating end-of-day stats:', error);
//   }
// });

// Every month on the 1st at 1 AM - обновляем месячную статистику
// cron.schedule('0 1 1 * *', async () => {
//   console.log('Running monthly stats update on 1st of month');
//   try {
//     const lastMonth = new Date();
//     lastMonth.setMonth(lastMonth.getMonth() - 1);
//     await cachedStatsService.generateMonthStats(lastMonth);
//     console.log('Monthly stats updated successfully');
//   } catch (error) {
//     console.error('Error updating monthly stats:', error);
//   }
// });
