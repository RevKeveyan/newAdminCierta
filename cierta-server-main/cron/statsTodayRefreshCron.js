const cron = require('node-cron');
const { markDirtyDay } = require('../utils/markDirty');
const { getCurrentDateUTC5 } = require('../utils/dateUtils');
const { getDateKeyUTC5 } = require('../utils/dateKeyUtils');
const { getMonthKeyFromDay, getISOWeekKeyFromDay, getYearKeyFromDay } = require('../utils/periodKeys');
const { getMonthRangeFromKey, getWeekRangeFromKey, getYearRangeFromKey } = require('../utils/dateKeyUtils');
const StatsDirty = require('../models/subModels/StatsDirty');

/**
 * Statistics Today Refresh Cron
 * Обновляет статистику за сегодняшний день каждые 1-5 минут
 * Это необходимо для актуальных данных, особенно для expired loads
 */

const REFRESH_INTERVAL_MINUTES = 3;

async function markDirtyPeriod(grain, dateKey, rangeStart, rangeEnd, sources) {
  try {
    const filter = {
      grain,
      dateKey,
      entityType: 'system',
      entityId: null
    };

    const existingTask = await StatsDirty.findOne(filter);
    
    if (existingTask && existingTask.lock && !existingTask.lock.locked) {
      const update = {
        $set: {
          rangeStart,
          rangeEnd,
          lock: {
            locked: false,
            lockedAt: null,
            lockedBy: null
          }
        },
        $addToSet: {
          sources: { $each: sources }
        }
      };
      await StatsDirty.findOneAndUpdate(filter, update);
    } else if (!existingTask) {
      const update = {
        $set: {
          rangeStart,
          rangeEnd,
          lock: {
            locked: false,
            lockedAt: null,
            lockedBy: null
          },
          sources,
          createdAt: new Date()
        }
      };
      await StatsDirty.findOneAndUpdate(filter, update, { upsert: true });
    }
  } catch (error) {
    console.error(`[StatsTodayRefresh] Error marking period dirty for ${grain}/${dateKey}:`, error.message);
  }
}

async function refreshTodayStats() {
  try {
    const today = getCurrentDateUTC5();
    const todayKey = getDateKeyUTC5(today);
    const sources = ['loads', 'receivable', 'payable'];
    
    await markDirtyDay(
      today,
      'system',
      null,
      sources
    );
    
    const weekKey = getISOWeekKeyFromDay(todayKey);
    const monthKey = getMonthKeyFromDay(todayKey);
    const yearKey = getYearKeyFromDay(todayKey);

    const promises = [];

    if (weekKey) {
      const weekRange = getWeekRangeFromKey(weekKey);
      if (weekRange) {
        promises.push(markDirtyPeriod('week', weekKey, weekRange.start, weekRange.end, sources));
      }
    }

    if (monthKey) {
      const monthRange = getMonthRangeFromKey(monthKey);
      if (monthRange) {
        promises.push(markDirtyPeriod('month', monthKey, monthRange.start, monthRange.end, sources));
      }
    }

    if (yearKey) {
      const yearRange = getYearRangeFromKey(yearKey);
      if (yearRange) {
        promises.push(markDirtyPeriod('year', yearKey, yearRange.start, yearRange.end, sources));
      }
    }

    await Promise.all(promises);
    
    console.log(`[StatsTodayRefresh] Marked today (${today.toISOString()}) and periods (week/month/year) as dirty for system statistics`);
  } catch (error) {
    console.error('[StatsTodayRefresh] Error refreshing today stats:', error);
  }
}

if (process.env.NODE_ENV !== 'test') {
  const cronPattern = `*/${REFRESH_INTERVAL_MINUTES} * * * *`;
  
  console.log(`[StatsTodayRefresh] Starting cron: every ${REFRESH_INTERVAL_MINUTES} minutes`);
  
  cron.schedule(cronPattern, async () => {
    await refreshTodayStats();
  });
  
  refreshTodayStats();
}

module.exports = {
  refreshTodayStats
};
