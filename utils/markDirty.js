const StatsDirty = require('../models/subModels/StatsDirty');
const { getDateKeyUTC5, getStartOfDayUTC5, getMonthRangeFromKey, getWeekRangeFromKey, getYearRangeFromKey } = require('./dateKeyUtils');
const { getMonthKeyFromDay, getISOWeekKeyFromDay, getYearKeyFromDay } = require('./periodKeys');
const mongoose = require('mongoose');

async function markDirtyPeriod(grain, dateKey, rangeStart, rangeEnd, entityType, entityId, sources) {
  if (!grain || !dateKey || !rangeStart || !rangeEnd) {
    return;
  }

  if (!Array.isArray(sources) || sources.length === 0) {
    return;
  }

  const validSources = sources.filter(s => ['loads', 'receivable', 'payable'].includes(s));
  if (validSources.length === 0) {
    return;
  }

  const entityIdObj = entityId ? (mongoose.Types.ObjectId.isValid(entityId) ? new mongoose.Types.ObjectId(entityId) : null) : null;

  const filter = {
    grain,
    dateKey,
    entityType,
    entityId: entityIdObj || null
  };

  const existingTask = await StatsDirty.findOne(filter);
  
  if (existingTask) {
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
        sources: { $each: validSources }
      }
    };

    try {
      await StatsDirty.findOneAndUpdate(filter, update);
    } catch (error) {
      console.error(`[markDirty] Error updating period dirty for ${grain}/${dateKey} ${entityType}/${entityId || 'system'}:`, error.message);
    }
  } else {
    const update = {
      $set: {
        rangeStart,
        rangeEnd,
        lock: {
          locked: false,
          lockedAt: null,
          lockedBy: null
        },
        sources: validSources,
        createdAt: new Date()
      }
    };

    try {
      await StatsDirty.findOneAndUpdate(filter, update, {
        upsert: true,
        new: true
      });
    } catch (error) {
      console.error(`[markDirty] Error marking period dirty for ${grain}/${dateKey} ${entityType}/${entityId || 'system'}:`, error.message);
    }
  }
}

async function markDirtyDay(date, entityType, entityId, sources) {
  if (!date) {
    return;
  }

  if (!Array.isArray(sources) || sources.length === 0) {
    return;
  }

  const validSources = sources.filter(s => ['loads', 'receivable', 'payable'].includes(s));
  if (validSources.length === 0) {
    return;
  }

  const dateObj = date instanceof Date ? date : new Date(date);
  if (isNaN(dateObj.getTime())) {
    return;
  }

  const dateKey = getDateKeyUTC5(dateObj);
  const rangeStart = getStartOfDayUTC5(dateObj);
  
  const nextDay = new Date(rangeStart);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const rangeEnd = getStartOfDayUTC5(nextDay);

  const entityIdObj = entityId ? (mongoose.Types.ObjectId.isValid(entityId) ? new mongoose.Types.ObjectId(entityId) : null) : null;

  const filter = {
    grain: 'day',
    dateKey,
    entityType,
    entityId: entityIdObj || null
  };

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
      sources: { $each: validSources }
    },
    $setOnInsert: {
      createdAt: new Date()
    }
  };

  try {
    await StatsDirty.findOneAndUpdate(filter, update, {
      upsert: true,
      new: true
    });

    const weekKey = getISOWeekKeyFromDay(dateKey);
    const monthKey = getMonthKeyFromDay(dateKey);
    const yearKey = getYearKeyFromDay(dateKey);

    const promises = [];

    if (weekKey) {
      const weekRange = getWeekRangeFromKey(weekKey);
      if (weekRange) {
        promises.push(markDirtyPeriod('week', weekKey, weekRange.start, weekRange.end, entityType, entityId, validSources));
      }
    }

    if (monthKey) {
      const monthRange = getMonthRangeFromKey(monthKey);
      if (monthRange) {
        promises.push(markDirtyPeriod('month', monthKey, monthRange.start, monthRange.end, entityType, entityId, validSources));
      }
    }

    if (yearKey) {
      const yearRange = getYearRangeFromKey(yearKey);
      if (yearRange) {
        promises.push(markDirtyPeriod('year', yearKey, yearRange.start, yearRange.end, entityType, entityId, validSources));
      }
    }

    await Promise.all(promises);
  } catch (error) {
    console.error(`[markDirty] Error marking dirty for ${entityType}/${entityId || 'system'} on ${dateKey}:`, error.message);
  }
}

/**
 * Помечает несколько дней как "грязные" для пересчёта статистики
 * @param {Date[]|string[]} dates - Массив дат для пометки
 * @param {string} entityType - 'system' | 'customer' | 'carrier' | 'user'
 * @param {string|mongoose.Types.ObjectId|null} entityId - ID сущности или null для system
 * @param {string[]} sources - Массив источников
 * @returns {Promise<void>}
 */
async function markDirtyDays(dates, entityType, entityId, sources) {
  if (!Array.isArray(dates) || dates.length === 0) {
    return;
  }

  const uniqueDates = [...new Set(dates.map(d => {
    const dateObj = d instanceof Date ? d : new Date(d);
    if (isNaN(dateObj.getTime())) {
      return null;
    }
    return getDateKeyUTC5(dateObj);
  }).filter(Boolean))];

  await Promise.all(
    uniqueDates.map(dateKey => {
      const [year, month, day] = dateKey.split('-').map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      return markDirtyDay(date, entityType, entityId, sources);
    })
  );
}

/**
 * Помечает Load как "грязный" для пересчёта статистики
 * @param {Object} load - Load документ
 * @param {string[]} sources - Массив источников (обычно ['loads'])
 * @returns {Promise<void>}
 */
async function markDirtyForLoad(load, sources = ['loads']) {
  if (!load) return;

  const dates = [];
  const createdAt = load.createdAt;
  if (createdAt) dates.push(createdAt);

  const promises = [];

  if (dates.length > 0) {
    promises.push(markDirtyDays(dates, 'system', null, sources));
    
    if (load.customer) {
      promises.push(markDirtyDays(dates, 'customer', load.customer, sources));
    }
    
    if (load.carrier) {
      promises.push(markDirtyDays(dates, 'carrier', load.carrier, sources));
    }
    
    if (load.createdBy) {
      promises.push(markDirtyDays(dates, 'user', load.createdBy, sources));
    }
  }

  await Promise.all(promises);
}

/**
 * Помечает Payment как "грязный" для пересчёта статистики
 * @param {Object} payment - Payment документ (PaymentReceivable или PaymentPayable)
 * @param {string} paymentType - 'receivable' | 'payable'
 * @returns {Promise<void>}
 */
async function markDirtyForPayment(payment, paymentType) {
  if (!payment) return;

  const source = paymentType === 'receivable' ? 'receivable' : 'payable';
  const dates = [];
  
  const invoiceAt = payment.invoiceAt;
  const createdAt = payment.createdAt;
  
  if (invoiceAt) {
    dates.push(invoiceAt);
  } else if (createdAt) {
    dates.push(createdAt);
  }

  if (dates.length === 0) return;

  const promises = [];

  promises.push(markDirtyDays(dates, 'system', null, [source]));
  
  if (payment.customer) {
    promises.push(markDirtyDays(dates, 'customer', payment.customer, [source]));
  }
  
  if (payment.carrier) {
    promises.push(markDirtyDays(dates, 'carrier', payment.carrier, [source]));
  }
  
  if (payment.createdBy) {
    promises.push(markDirtyDays(dates, 'user', payment.createdBy, [source]));
  }

  await Promise.all(promises);
}

module.exports = {
  markDirtyDay,
  markDirtyDays,
  markDirtyForLoad,
  markDirtyForPayment
};
