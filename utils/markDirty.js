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
 * Marks load changes as dirty for statistics recalculation
 * @param {Object|null} oldLoad - Previous Load document (or null on create)
 * @param {Object|null} newLoad - New Load document (or null on delete)
 * @param {string[]} sources - Sources array (usually ['loads'])
 * @returns {Promise<void>}
 */
async function markDirtyForLoadChange(oldLoad, newLoad, sources = ['loads']) {
  try {
    if (!Array.isArray(sources) || sources.length === 0) {
      return;
    }

    const validSources = sources.filter(s => ['loads', 'receivable', 'payable'].includes(s));
    if (validSources.length === 0) {
      return;
    }

    const oldDoc = oldLoad || {};
    const newDoc = newLoad || {};

    const dateCandidates = [];

    const pushDate = (value) => {
      if (!value) return;
      const d = value instanceof Date ? value : new Date(value);
      if (isNaN(d.getTime())) return;
      dateCandidates.push(d);
    };

    pushDate(oldDoc.createdAt);
    pushDate(newDoc.createdAt);
    pushDate(oldDoc.updatedAt);
    pushDate(newDoc.updatedAt);

    if (oldDoc.dates) {
      pushDate(oldDoc.dates.pickupAt);
      pushDate(oldDoc.dates.deliveryAt);
      pushDate(oldDoc.dates.deadlineAt);
    }
    if (newDoc.dates) {
      pushDate(newDoc.dates.pickupAt);
      pushDate(newDoc.dates.deliveryAt);
      pushDate(newDoc.dates.deadlineAt);
    }

    const hasStatusChange = oldDoc.status && newDoc.status && oldDoc.status !== newDoc.status;
    const hasCreatedAtChange = oldDoc.createdAt && newDoc.createdAt && oldDoc.createdAt.toString() !== newDoc.createdAt.toString();

    const getDatesFieldValue = (doc, key) => {
      if (!doc || !doc.dates) return null;
      if (doc.dates[key]) return doc.dates[key];
      if (key === 'deadlineAt' && doc.dates.deadline) return doc.dates.deadline;
      return null;
    };

    const hasPickupChange = String(getDatesFieldValue(oldDoc, 'pickupAt') || '') !== String(getDatesFieldValue(newDoc, 'pickupAt') || '');
    const hasDeliveryChange = String(getDatesFieldValue(oldDoc, 'deliveryAt') || '') !== String(getDatesFieldValue(newDoc, 'deliveryAt') || '');
    const hasDeadlineChange = String(getDatesFieldValue(oldDoc, 'deadlineAt') || '') !== String(getDatesFieldValue(newDoc, 'deadlineAt') || '');

    const normalizeId = (value) => {
      if (!value) return '';
      if (typeof value === 'string') return value;
      if (value.toString) return value.toString();
      return String(value);
    };

    const hasCustomerChange = normalizeId(oldDoc.customer) !== normalizeId(newDoc.customer);
    const hasCarrierChange = normalizeId(oldDoc.carrier) !== normalizeId(newDoc.carrier);
    const hasCreatedByChange = normalizeId(oldDoc.createdBy) !== normalizeId(newDoc.createdBy);

    const hasSignificantChange =
      hasStatusChange ||
      hasCreatedAtChange ||
      hasPickupChange ||
      hasDeliveryChange ||
      hasDeadlineChange ||
      hasCustomerChange ||
      hasCarrierChange ||
      hasCreatedByChange;

    if (hasSignificantChange) {
      pushDate(new Date());
    }

    if (dateCandidates.length === 0) {
      return;
    }

    const uniqueDatesMap = new Map();
    dateCandidates.forEach((d) => {
      const key = getDateKeyUTC5(d);
      if (!uniqueDatesMap.has(key)) {
        uniqueDatesMap.set(key, d);
      }
    });

    const uniqueDates = Array.from(uniqueDatesMap.values());
    if (uniqueDates.length === 0) {
      return;
    }

    const entities = [];

    entities.push({ entityType: 'system', entityId: null });

    const pushEntity = (entityType, entityId) => {
      if (!entityId) return;
      entities.push({ entityType, entityId });
    };

    pushEntity('customer', oldDoc.customer);
    pushEntity('carrier', oldDoc.carrier);
    pushEntity('user', oldDoc.createdBy);

    pushEntity('customer', newDoc.customer);
    pushEntity('carrier', newDoc.carrier);
    pushEntity('user', newDoc.createdBy);

    const uniqueEntitiesMap = new Map();
    entities.forEach((e) => {
      const idStr = e.entityId && e.entityId.toString ? e.entityId.toString() : String(e.entityId || '');
      const key = `${e.entityType}:${idStr || 'null'}`;
      if (!uniqueEntitiesMap.has(key)) {
        uniqueEntitiesMap.set(key, e);
      }
    });

    const uniqueEntities = Array.from(uniqueEntitiesMap.values());
    if (uniqueEntities.length === 0) {
      return;
    }

    await Promise.all(
      uniqueEntities.map((e) => markDirtyDays(uniqueDates, e.entityType, e.entityId || null, validSources))
    );
  } catch (error) {
    console.error('[markDirty] markDirtyForLoadChange error:', error);
  }
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
  markDirtyForPayment,
  markDirtyForLoadChange
};
