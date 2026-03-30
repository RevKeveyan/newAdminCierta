const StatsDirty = require('../models/subModels/StatsDirty');
const StatsSnapshot = require('../models/subModels/StatsSnapshot');
const StatsDailyDelta = require('../models/subModels/StatsDailyDelta');
const Load = require('../models/Load');
const PaymentReceivable = require('../models/subModels/PaymentReceivable');
const PaymentPayable = require('../models/subModels/PaymentPayable');
const { STATISTICS_DATE_SOURCES, StatisticsDateHelpers } = require('../config/statisticsDateConstants');
const { getDaysInRange, getDateRangeFromKey, getDateKeyUTC5 } = require('../utils/dateKeyUtils');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const ZERO_STATE = {
  listed: 0,
  dispatched: 0,
  pickedUp: 0,
  delivered: 0,
  onHold: 0,
  cancelled: 0,
  expired: 0
};

const ZERO_EVENTS = {
  created: 0,
  dispatched: 0,
  pickedUp: 0,
  delivered: 0,
  onHold: 0,
  cancelled: 0
};

function applyStateDelta(prevState, delta) {
  return {
    listed: Math.max(0, (prevState.listed || 0) + (delta.listed || 0)),
    dispatched: Math.max(0, (prevState.dispatched || 0) + (delta.dispatched || 0)),
    pickedUp: Math.max(0, (prevState.pickedUp || 0) + (delta.pickedUp || 0)),
    delivered: Math.max(0, (prevState.delivered || 0) + (delta.delivered || 0)),
    onHold: Math.max(0, (prevState.onHold || 0) + (delta.onHold || 0)),
    cancelled: Math.max(0, (prevState.cancelled || 0) + (delta.cancelled || 0)),
    expired: Math.max(0, (prevState.expired || 0) + (delta.expired || 0))
  };
}

const MAX_RETRY_ATTEMPTS = 3;
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Блокирует задачу для обработки
 * @param {string} workerId - ID воркера
 * @returns {Promise<Object|null>} Заблокированная задача или null
 */
async function lockTask(workerId) {
  const now = new Date();

  const task = await StatsDirty.findOneAndUpdate(
    {
      $or: [
        { 'lock.locked': false },
        { 
          'lock.locked': true,
          'lock.lockedAt': { $lt: new Date(now.getTime() - LOCK_TIMEOUT_MS) }
        }
      ]
    },
    {
      $set: {
        'lock.locked': true,
        'lock.lockedAt': now,
        'lock.lockedBy': workerId || `worker-${uuidv4()}`
      }
    },
    {
      sort: { priority: -1, createdAt: 1 },
      new: true
    }
  );

  return task;
}

/**
 * Вычисляет snapshot статистики для заданного диапазона и сущности
 * @param {Date} rangeStart - Начало диапазона
 * @param {Date} rangeEnd - Конец диапазона
 * @param {string} entityType - 'system' | 'customer' | 'carrier' | 'user'
 * @param {string|null} entityId - ID сущности или null для system
 * @returns {Promise<Object>} Объект snapshot
 */
async function computeSnapshot(rangeStart, rangeEnd, entityType, entityId) {
  const snapshot = {
    loads: {
      total: 0,
      byStatus: {
        listed: 0,
        dispatched: 0,
        pickedUp: 0,
        delivered: 0,
        onHold: 0,
        cancelled: 0,
        expired: 0
      }
    },
    loadsState: {
      listed: 0,
      dispatched: 0,
      pickedUp: 0,
      delivered: 0,
      onHold: 0,
      cancelled: 0,
      expired: 0
    },
    loadsEvents: {
      created: 0,
      dispatched: 0,
      pickedUp: 0,
      delivered: 0,
      onHold: 0,
      cancelled: 0
    },
    receivable: {
      totalCount: 0,
      money: {
        total: 0,
        confirmed: 0,
        outstanding: 0
      }
    },
    payable: {
      totalCount: 0,
      money: {
        total: 0,
        confirmed: 0,
        outstanding: 0
      }
    },
    finance: {
      profitConfirmed: 0
    }
  };

  const baseLoadFilter = {};
  if (entityType === 'customer') {
    baseLoadFilter.customer = mongoose.Types.ObjectId.isValid(entityId) ? new mongoose.Types.ObjectId(entityId) : entityId;
  } else if (entityType === 'carrier') {
    baseLoadFilter.carrier = mongoose.Types.ObjectId.isValid(entityId) ? new mongoose.Types.ObjectId(entityId) : entityId;
  } else if (entityType === 'user') {
    baseLoadFilter.createdBy = mongoose.Types.ObjectId.isValid(entityId) ? new mongoose.Types.ObjectId(entityId) : entityId;
  }

  const rangeQuery = { $gte: rangeStart, $lt: rangeEnd };
  const deliveredMatch = { ...baseLoadFilter, [STATISTICS_DATE_SOURCES.LOADS.DELIVERED_DATE]: rangeQuery };
  const pickedUpMatch = { ...baseLoadFilter, [STATISTICS_DATE_SOURCES.LOADS.PICKED_UP_DATE]: rangeQuery };
  const createdMatch = { ...baseLoadFilter, createdAt: rangeQuery };

  const [deliveredAgg, pickedUpAgg, createdAgg] = await Promise.all([
    Load.aggregate([{ $match: deliveredMatch }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Load.aggregate([{ $match: pickedUpMatch }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Load.aggregate([{ $match: createdMatch }, { $group: { _id: '$status', count: { $sum: 1 } } }])
  ]);

  const statusMap = {
    'Listed': 'listed',
    'Dispatched': 'dispatched',
    'Picked Up': 'pickedUp',
    'Delivered': 'delivered',
    'On Hold': 'onHold',
    'Cancelled': 'cancelled'
  };

  let pickedUpEvents = 0;
  let deliveredEvents = 0;

  deliveredAgg.forEach(item => {
    const statusKey = statusMap[item._id] || item._id?.toLowerCase() || 'unknown';
    if (snapshot.loads.byStatus.hasOwnProperty(statusKey) && statusKey === 'delivered') {
      snapshot.loads.byStatus.delivered = item.count;
      snapshot.loads.total += item.count;
    }
    if (statusKey === 'delivered') {
      deliveredEvents += item.count;
    }
  });
  pickedUpAgg.forEach(item => {
    const statusKey = statusMap[item._id] || item._id?.toLowerCase() || 'unknown';
    if (snapshot.loads.byStatus.hasOwnProperty(statusKey) && statusKey === 'pickedUp') {
      snapshot.loads.byStatus.pickedUp = item.count;
      snapshot.loads.total += item.count;
    }
    if (statusKey === 'pickedUp') {
      pickedUpEvents += item.count;
    }
  });
  createdAgg.forEach(item => {
    const statusKey = statusMap[item._id] || item._id?.toLowerCase() || 'unknown';
    if (statusKey === 'delivered' || statusKey === 'pickedUp') return;
    const key = snapshot.loads.byStatus.hasOwnProperty(statusKey) ? statusKey : 'listed';
    snapshot.loads.byStatus[key] = (snapshot.loads.byStatus[key] || 0) + item.count;
    snapshot.loads.total += item.count;
  });

  const expiredLoads = await Load.find({
    ...baseLoadFilter,
    createdAt: rangeQuery,
    status: { $nin: STATISTICS_DATE_SOURCES.EXPIRED.FINAL_STATUSES }
  }).select('dates.deadlineAt dates.deadline status').lean();

  let expiredCount = 0;
  const now = new Date();
  
  expiredLoads.forEach(load => {
    const deadlineValue = load.dates?.deadlineAt || load.dates?.deadline;
    if (!deadlineValue) return;
    
    const deadline = deadlineValue instanceof Date ? deadlineValue : new Date(deadlineValue);
    if (isNaN(deadline.getTime())) return;
    
    const now = new Date();
    if (deadline < now) {
      expiredCount++;
    }
  });

  snapshot.loads.byStatus.expired = expiredCount;

  snapshot.loadsEvents.created = createdAgg.reduce((sum, item) => sum + (item.count || 0), 0);
  snapshot.loadsEvents.pickedUp = pickedUpEvents;
  snapshot.loadsEvents.delivered = deliveredEvents;

  snapshot.loadsState = {
    listed: snapshot.loads.byStatus.listed || 0,
    dispatched: snapshot.loads.byStatus.dispatched || 0,
    pickedUp: snapshot.loads.byStatus.pickedUp || 0,
    delivered: snapshot.loads.byStatus.delivered || 0,
    onHold: snapshot.loads.byStatus.onHold || 0,
    cancelled: snapshot.loads.byStatus.cancelled || 0,
    expired: snapshot.loads.byStatus.expired || 0
  };

  const basePaymentFilter = {};
  if (entityType === 'customer') {
    basePaymentFilter.customer = mongoose.Types.ObjectId.isValid(entityId) ? new mongoose.Types.ObjectId(entityId) : entityId;
  } else if (entityType === 'carrier') {
    basePaymentFilter.carrier = mongoose.Types.ObjectId.isValid(entityId) ? new mongoose.Types.ObjectId(entityId) : entityId;
  } else if (entityType === 'user') {
    basePaymentFilter.createdBy = mongoose.Types.ObjectId.isValid(entityId) ? new mongoose.Types.ObjectId(entityId) : entityId;
  }

  const receivableMatch = {
    ...basePaymentFilter,
    [STATISTICS_DATE_SOURCES.PAYMENTS.RECEIVABLE_DATE]: { $exists: true, $ne: null, $gte: rangeStart, $lt: rangeEnd }
  };

  const payableMatch = {
    ...basePaymentFilter,
    [STATISTICS_DATE_SOURCES.PAYMENTS.PAYABLE_DATE]: { $exists: true, $ne: null, $gte: rangeStart, $lt: rangeEnd }
  };

  const receivablePipeline = [
    { $match: receivableMatch },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: { $ifNull: ['$totalAmount', 0] } },
        confirmedAmount: {
          $sum: {
            $cond: {
              if: { $in: ['$status', STATISTICS_DATE_SOURCES.PROFIT.RECEIVABLE.CONFIRMED_STATUSES] },
              then: {
                $cond: [
                  { $gt: [{ $ifNull: ['$confirmedAmount', 0] }, 0] },
                  { $ifNull: ['$confirmedAmount', 0] },
                  { $ifNull: ['$totalAmount', 0] }
                ]
              },
              else: 0
            }
          }
        }
      }
    }
  ];

  const receivableStats = await PaymentReceivable.aggregate(receivablePipeline);

  receivableStats.forEach(item => {
    snapshot.receivable.totalCount += item.count;
    snapshot.receivable.money.total += item.totalAmount || 0;
    snapshot.receivable.money.confirmed += item.confirmedAmount || 0;
  });

  snapshot.receivable.money.outstanding = snapshot.receivable.money.total - snapshot.receivable.money.confirmed;

  const payablePipeline = [
    { $match: payableMatch },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: { $ifNull: ['$totalAmount', 0] } },
        confirmedAmount: {
          $sum: {
            $cond: {
              if: { $in: ['$status', STATISTICS_DATE_SOURCES.PROFIT.PAYABLE.CONFIRMED_STATUSES] },
              then: {
                $cond: [
                  { $gt: [{ $ifNull: ['$confirmedAmount', 0] }, 0] },
                  { $ifNull: ['$confirmedAmount', 0] },
                  { $ifNull: ['$totalAmount', 0] }
                ]
              },
              else: 0
            }
          }
        }
      }
    }
  ];

  const payableStats = await PaymentPayable.aggregate(payablePipeline);

  payableStats.forEach(item => {
    snapshot.payable.totalCount += item.count;
    snapshot.payable.money.total += item.totalAmount || 0;
    snapshot.payable.money.confirmed += item.confirmedAmount || 0;
  });

  snapshot.payable.money.outstanding = snapshot.payable.money.total - snapshot.payable.money.confirmed;

  snapshot.finance.profitConfirmed = snapshot.receivable.money.confirmed - snapshot.payable.money.confirmed;

  return snapshot;
}

async function computeSnapshotFromDelta(rangeStart, rangeEnd, entityType, entityId) {
  const dateKey = getDateKeyUTC5(rangeStart);
  const prevDay = new Date(rangeStart);
  prevDay.setUTCDate(prevDay.getUTCDate() - 1);
  const prevDateKey = getDateKeyUTC5(prevDay);
  const entityIdNorm = entityId && mongoose.Types.ObjectId.isValid(entityId) ? new mongoose.Types.ObjectId(entityId) : null;

  const [prevSnapshot, deltaDoc] = await Promise.all([
    StatsSnapshot.findOne({
      grain: 'day',
      dateKey: prevDateKey,
      entityType,
      entityId: entityIdNorm
    }).lean(),
    StatsDailyDelta.findOne({
      dateKey,
      entityType,
      entityId: entityIdNorm
    }).lean()
  ]);

  const prevState = prevSnapshot?.loadsState && typeof prevSnapshot.loadsState === 'object'
    ? { ...ZERO_STATE, ...prevSnapshot.loadsState }
    : { ...ZERO_STATE };
  const deltaState = deltaDoc?.loadsStateDelta && typeof deltaDoc.loadsStateDelta === 'object'
    ? deltaDoc.loadsStateDelta
    : {};
  const deltaEvents = deltaDoc?.loadsEventsDelta && typeof deltaDoc.loadsEventsDelta === 'object'
    ? deltaDoc.loadsEventsDelta
    : {};

  const loadsState = applyStateDelta(prevState, deltaState);
  const loadsEvents = {
    created: deltaEvents.created || 0,
    dispatched: deltaEvents.dispatched || 0,
    pickedUp: deltaEvents.pickedUp || 0,
    delivered: deltaEvents.delivered || 0,
    onHold: deltaEvents.onHold || 0,
    cancelled: deltaEvents.cancelled || 0
  };

  const total = (loadsState.listed || 0) + (loadsState.dispatched || 0) + (loadsState.pickedUp || 0) +
    (loadsState.delivered || 0) + (loadsState.onHold || 0) + (loadsState.cancelled || 0);

  return {
    loads: {
      total,
      byStatus: { ...loadsState }
    },
    loadsState: { ...loadsState },
    loadsEvents,
    receivable: {
      totalCount: 0,
      money: { total: 0, confirmed: 0, outstanding: 0 }
    },
    payable: {
      totalCount: 0,
      money: { total: 0, confirmed: 0, outstanding: 0 }
    },
    finance: { profitConfirmed: 0 }
  };
}

async function getDeltaSnapshotsForDateKeys({ dateKeys, entityType, entityId }) {
  if (!Array.isArray(dateKeys) || dateKeys.length === 0) return [];
  if (!entityType) return [];
  if (entityType !== 'system' && !entityId) return [];

  const entityIdNorm = entityId && mongoose.Types.ObjectId.isValid(entityId) ? new mongoose.Types.ObjectId(entityId) : null;

  const results = [];
  for (const dateKey of dateKeys) {
    const range = getDateRangeFromKey(dateKey);
    if (!range || !range.start) {
      results.push({
        grain: 'day',
        dateKey,
        entityType,
        entityId: entityIdNorm,
        ...emptySnapshotData()
      });
      continue;
    }
    const rangeEndExclusive = new Date(range.start);
    rangeEndExclusive.setUTCDate(rangeEndExclusive.getUTCDate() + 1);
    const snapshotData = await computeSnapshotFromDelta(range.start, rangeEndExclusive, entityType, entityIdNorm);
    results.push({
      grain: 'day',
      dateKey,
      entityType,
      entityId: entityIdNorm,
      ...snapshotData
    });
  }
  return results;
}

const TZ_UTC5 = '-05:00';

function emptySnapshotData() {
  return {
    loads: { total: 0, byStatus: { listed: 0, dispatched: 0, pickedUp: 0, delivered: 0, onHold: 0, cancelled: 0, expired: 0 } },
    loadsState: { listed: 0, dispatched: 0, pickedUp: 0, delivered: 0, onHold: 0, cancelled: 0, expired: 0 },
    loadsEvents: { created: 0, dispatched: 0, pickedUp: 0, delivered: 0, onHold: 0, cancelled: 0 },
    receivable: { totalCount: 0, money: { total: 0, confirmed: 0, outstanding: 0 } },
    payable: { totalCount: 0, money: { total: 0, confirmed: 0, outstanding: 0 } },
    finance: { profitConfirmed: 0 }
  };
}

async function computeSnapshotsForCustomerIdsBatch(dateKeys, rangeStart, rangeEnd, customerIds, userId = null) {
  if (!dateKeys.length) return null;
  const baseMatch = buildLoadFilterForNonAdmin(customerIds, userId);
  if (!baseMatch) return null;
  const ids = toObjectIds(customerIds || []);
  const basePaymentMatch = ids.length > 0 ? { customer: { $in: ids } } : { _id: null };
  const rangeMatch = { $gte: rangeStart, $lt: rangeEnd };
  const dateKeyProject = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ_UTC5 } };
  const deliveredDateKey = { $dateToString: { format: '%Y-%m-%d', date: '$dates.deliveryAt', timezone: TZ_UTC5 } };
  const pickupDateKey = { $dateToString: { format: '%Y-%m-%d', date: '$dates.pickupAt', timezone: TZ_UTC5 } };
  const recDateKey = { $dateToString: { format: '%Y-%m-%d', date: `$${STATISTICS_DATE_SOURCES.PAYMENTS.RECEIVABLE_DATE}`, timezone: TZ_UTC5 } };
  const payDateKey = { $dateToString: { format: '%Y-%m-%d', date: `$${STATISTICS_DATE_SOURCES.PAYMENTS.PAYABLE_DATE}`, timezone: TZ_UTC5 } };

  const statusMap = {
    Listed: 'listed',
    Dispatched: 'dispatched',
    'Picked Up': 'pickedUp',
    Delivered: 'delivered',
    'On Hold': 'onHold',
    Cancelled: 'cancelled'
  };

  const [createdByDay, deliveredByDay, pickedUpByDay, expiredByDay, receivableByDay, payableByDay] = await Promise.all([
    Load.aggregate([
      { $match: { ...baseMatch, createdAt: rangeMatch } },
      { $addFields: { dateKey: dateKeyProject } },
      { $group: { _id: { dateKey: '$dateKey', status: '$status' }, count: { $sum: 1 } } }
    ]),
    Load.aggregate([
      { $match: { ...baseMatch, [STATISTICS_DATE_SOURCES.LOADS.DELIVERED_DATE]: rangeMatch } },
      { $addFields: { dateKey: deliveredDateKey } },
      { $group: { _id: { dateKey: '$dateKey', status: '$status' }, count: { $sum: 1 } } }
    ]),
    Load.aggregate([
      { $match: { ...baseMatch, [STATISTICS_DATE_SOURCES.LOADS.PICKED_UP_DATE]: rangeMatch } },
      { $addFields: { dateKey: pickupDateKey } },
      { $group: { _id: { dateKey: '$dateKey', status: '$status' }, count: { $sum: 1 } } }
    ]),
    Load.aggregate([
      {
        $match: {
          ...baseMatch,
          createdAt: rangeMatch,
          status: { $nin: STATISTICS_DATE_SOURCES.EXPIRED.FINAL_STATUSES }
        }
      },
      { $addFields: { dateKey: dateKeyProject } },
      { $addFields: { isExpired: { $lt: ['$dates.deadlineAt', new Date()] } } },
      { $match: { isExpired: true } },
      { $group: { _id: '$dateKey', count: { $sum: 1 } } }
    ]),
    PaymentReceivable.aggregate([
      { $match: { ...basePaymentMatch, [STATISTICS_DATE_SOURCES.PAYMENTS.RECEIVABLE_DATE]: rangeMatch } },
      { $addFields: { dateKey: recDateKey } },
      {
        $group: {
          _id: '$dateKey',
          totalCount: { $sum: 1 },
          total: { $sum: { $ifNull: ['$totalAmount', 0] } },
          confirmed: {
            $sum: {
              $cond: {
                if: { $in: ['$status', STATISTICS_DATE_SOURCES.PROFIT.RECEIVABLE.CONFIRMED_STATUSES] },
                then: { $cond: [{ $gt: [{ $ifNull: ['$confirmedAmount', 0] }, 0] }, { $ifNull: ['$confirmedAmount', 0] }, { $ifNull: ['$totalAmount', 0] }] },
                else: 0
              }
            }
          }
        }
      }
    ]),
    PaymentPayable.aggregate([
      { $match: { ...basePaymentMatch, [STATISTICS_DATE_SOURCES.PAYMENTS.PAYABLE_DATE]: rangeMatch } },
      { $addFields: { dateKey: payDateKey } },
      {
        $group: {
          _id: '$dateKey',
          totalCount: { $sum: 1 },
          total: { $sum: { $ifNull: ['$totalAmount', 0] } },
          confirmed: {
            $sum: {
              $cond: {
                if: { $in: ['$status', STATISTICS_DATE_SOURCES.PROFIT.PAYABLE.CONFIRMED_STATUSES] },
                then: { $cond: [{ $gt: [{ $ifNull: ['$confirmedAmount', 0] }, 0] }, { $ifNull: ['$confirmedAmount', 0] }, { $ifNull: ['$totalAmount', 0] }] },
                else: 0
              }
            }
          }
        }
      }
    ])
  ]);

  const byDateKey = {};
  dateKeys.forEach((dk) => {
    const base = emptySnapshotData();
    byDateKey[dk] = {
      ...base,
      loads: { ...base.loads, byStatus: { ...base.loads.byStatus } },
      loadsState: { ...base.loadsState },
      loadsEvents: { ...base.loadsEvents }
    };
  });

  createdByDay.forEach(({ _id, count }) => {
    const d = byDateKey[_id.dateKey];
    if (!d) return;
    const rawKey = statusMap[_id.status] || _id.status?.toLowerCase() || 'listed';
    if (rawKey === 'delivered' || rawKey === 'pickedUp') return;
    const key = d.loads.byStatus[rawKey] !== undefined ? rawKey : 'listed';
    d.loads.byStatus[key] = (d.loads.byStatus[key] || 0) + count;
    d.loads.total += count;
  });
  deliveredByDay.forEach(({ _id, count }) => {
    const d = byDateKey[_id.dateKey];
    if (!d) return;
    d.loads.byStatus.delivered = count;
    d.loads.total += count;
  });
  pickedUpByDay.forEach(({ _id, count }) => {
    const d = byDateKey[_id.dateKey];
    if (!d) return;
    d.loads.byStatus.pickedUp = count;
    d.loads.total += count;
  });
  expiredByDay.forEach(({ _id, count }) => {
    const d = byDateKey[_id.dateKey];
    if (!d) return;
    d.loads.byStatus.expired = count;
  });
  receivableByDay.forEach((r) => {
    const d = byDateKey[r._id];
    if (!d) return;
    d.receivable.totalCount = r.totalCount || 0;
    d.receivable.money.total = r.total || 0;
    d.receivable.money.confirmed = r.confirmed || 0;
    d.receivable.money.outstanding = d.receivable.money.total - d.receivable.money.confirmed;
  });
  payableByDay.forEach((r) => {
    const d = byDateKey[r._id];
    if (!d) return;
    d.payable.totalCount = r.totalCount || 0;
    d.payable.money.total = r.total || 0;
    d.payable.money.confirmed = r.confirmed || 0;
    d.payable.money.outstanding = d.payable.money.total - d.payable.money.confirmed;
  });
  dateKeys.forEach((dk) => {
    const d = byDateKey[dk];
    if (d) d.finance.profitConfirmed = (d.receivable.money.confirmed || 0) - (d.payable.money.confirmed || 0);
  });

  return dateKeys.map((dateKey) => ({
    dateKey,
    ...byDateKey[dateKey]
  }));
}

function toObjectIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  return ids
    .filter((id) => id && mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
}

function buildLoadFilterForNonAdmin(customerIds, userId) {
  const ids = toObjectIds(customerIds || []);
  const hasCustomer = ids.length > 0;
  const hasUser = userId && mongoose.Types.ObjectId.isValid(userId);
  if (hasCustomer && hasUser) {
    return { $or: [ { customer: { $in: ids } }, { createdBy: new mongoose.Types.ObjectId(userId) } ] };
  }
  if (hasCustomer) return { customer: { $in: ids } };
  if (hasUser) return { createdBy: new mongoose.Types.ObjectId(userId) };
  return null;
}

async function computeSnapshotForCustomerIds(rangeStart, rangeEnd, customerIds, userId = null) {
  const baseLoadFilter = buildLoadFilterForNonAdmin(customerIds, userId);
  if (!baseLoadFilter) {
    return {
      loads: { total: 0, byStatus: { listed: 0, dispatched: 0, pickedUp: 0, delivered: 0, onHold: 0, cancelled: 0, expired: 0 } },
      loadsState: { listed: 0, dispatched: 0, pickedUp: 0, delivered: 0, onHold: 0, cancelled: 0, expired: 0 },
      loadsEvents: { created: 0, dispatched: 0, pickedUp: 0, delivered: 0, onHold: 0, cancelled: 0 },
      receivable: { totalCount: 0, money: { total: 0, confirmed: 0, outstanding: 0 } },
      payable: { totalCount: 0, money: { total: 0, confirmed: 0, outstanding: 0 } },
      finance: { profitConfirmed: 0 }
    };
  }
  const ids = toObjectIds(customerIds || []);
  const basePaymentFilter = ids.length > 0 ? { customer: { $in: ids } } : { _id: null };

  const snapshot = {
    loads: { total: 0, byStatus: { listed: 0, dispatched: 0, pickedUp: 0, delivered: 0, onHold: 0, cancelled: 0, expired: 0 } },
    loadsState: { listed: 0, dispatched: 0, pickedUp: 0, delivered: 0, onHold: 0, cancelled: 0, expired: 0 },
    loadsEvents: { created: 0, dispatched: 0, pickedUp: 0, delivered: 0, onHold: 0, cancelled: 0 },
    receivable: { totalCount: 0, money: { total: 0, confirmed: 0, outstanding: 0 } },
    payable: { totalCount: 0, money: { total: 0, confirmed: 0, outstanding: 0 } },
    finance: { profitConfirmed: 0 }
  };

  const rangeQuery = { $gte: rangeStart, $lt: rangeEnd };
  const deliveredMatch = { ...baseLoadFilter, [STATISTICS_DATE_SOURCES.LOADS.DELIVERED_DATE]: rangeQuery };
  const pickedUpMatch = { ...baseLoadFilter, [STATISTICS_DATE_SOURCES.LOADS.PICKED_UP_DATE]: rangeQuery };
  const createdMatch = { ...baseLoadFilter, createdAt: rangeQuery };

  const [deliveredAgg, pickedUpAgg, createdAgg] = await Promise.all([
    Load.aggregate([{ $match: deliveredMatch }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Load.aggregate([{ $match: pickedUpMatch }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Load.aggregate([{ $match: createdMatch }, { $group: { _id: '$status', count: { $sum: 1 } } }])
  ]);

  const statusMap = {
    'Listed': 'listed',
    'Dispatched': 'dispatched',
    'Picked Up': 'pickedUp',
    'Delivered': 'delivered',
    'On Hold': 'onHold',
    'Cancelled': 'cancelled'
  };

  deliveredAgg.forEach((item) => {
    const statusKey = statusMap[item._id] || item._id?.toLowerCase() || 'unknown';
    if (snapshot.loads.byStatus.hasOwnProperty(statusKey) && statusKey === 'delivered') {
      snapshot.loads.byStatus.delivered = item.count;
      snapshot.loads.total += item.count;
    }
  });
  pickedUpAgg.forEach((item) => {
    const statusKey = statusMap[item._id] || item._id?.toLowerCase() || 'unknown';
    if (snapshot.loads.byStatus.hasOwnProperty(statusKey) && statusKey === 'pickedUp') {
      snapshot.loads.byStatus.pickedUp = item.count;
      snapshot.loads.total += item.count;
    }
  });
  createdAgg.forEach((item) => {
    const statusKey = statusMap[item._id] || item._id?.toLowerCase() || 'unknown';
    if (statusKey === 'delivered' || statusKey === 'pickedUp') return;
    const key = snapshot.loads.byStatus.hasOwnProperty(statusKey) ? statusKey : 'listed';
    snapshot.loads.byStatus[key] = (snapshot.loads.byStatus[key] || 0) + item.count;
    snapshot.loads.total += item.count;
  });

  const expiredLoads = await Load.find({
    ...baseLoadFilter,
    createdAt: rangeQuery,
    status: { $nin: STATISTICS_DATE_SOURCES.EXPIRED.FINAL_STATUSES }
  }).select('dates.deadlineAt dates.deadline status').lean();

  let expiredCount = 0;
  const now = new Date();
  expiredLoads.forEach((load) => {
    const deadlineValue = load.dates?.deadlineAt || load.dates?.deadline;
    if (!deadlineValue) return;
    const deadline = deadlineValue instanceof Date ? deadlineValue : new Date(deadlineValue);
    if (isNaN(deadline.getTime())) return;
    if (deadline < now) expiredCount++;
  });
  snapshot.loads.byStatus.expired = expiredCount;

  snapshot.loadsEvents.created = createdAgg.reduce((sum, item) => sum + (item.count || 0), 0);
  snapshot.loadsEvents.pickedUp = pickedUpAgg.reduce((sum, item) => {
    const statusKey = statusMap[item._id] || item._id?.toLowerCase() || 'unknown';
    return statusKey === 'pickedUp' ? sum + (item.count || 0) : sum;
  }, 0);
  snapshot.loadsEvents.delivered = deliveredAgg.reduce((sum, item) => {
    const statusKey = statusMap[item._id] || item._id?.toLowerCase() || 'unknown';
    return statusKey === 'delivered' ? sum + (item.count || 0) : sum;
  }, 0);

  snapshot.loadsState = {
    listed: snapshot.loads.byStatus.listed || 0,
    dispatched: snapshot.loads.byStatus.dispatched || 0,
    pickedUp: snapshot.loads.byStatus.pickedUp || 0,
    delivered: snapshot.loads.byStatus.delivered || 0,
    onHold: snapshot.loads.byStatus.onHold || 0,
    cancelled: snapshot.loads.byStatus.cancelled || 0,
    expired: snapshot.loads.byStatus.expired || 0
  };

  const receivableMatch = {
    ...basePaymentFilter,
    [STATISTICS_DATE_SOURCES.PAYMENTS.RECEIVABLE_DATE]: { $exists: true, $ne: null, $gte: rangeStart, $lt: rangeEnd }
  };
  const payableMatch = {
    ...basePaymentFilter,
    [STATISTICS_DATE_SOURCES.PAYMENTS.PAYABLE_DATE]: { $exists: true, $ne: null, $gte: rangeStart, $lt: rangeEnd }
  };

  const receivablePipeline = [
    { $match: receivableMatch },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: { $ifNull: ['$totalAmount', 0] } },
        confirmedAmount: {
          $sum: {
            $cond: {
              if: { $in: ['$status', STATISTICS_DATE_SOURCES.PROFIT.RECEIVABLE.CONFIRMED_STATUSES] },
              then: {
                $cond: [
                  { $gt: [{ $ifNull: ['$confirmedAmount', 0] }, 0] },
                  { $ifNull: ['$confirmedAmount', 0] },
                  { $ifNull: ['$totalAmount', 0] }
                ]
              },
              else: 0
            }
          }
        }
      }
    }
  ];
  const payablePipeline = [
    { $match: payableMatch },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: { $ifNull: ['$totalAmount', 0] } },
        confirmedAmount: {
          $sum: {
            $cond: {
              if: { $in: ['$status', STATISTICS_DATE_SOURCES.PROFIT.PAYABLE.CONFIRMED_STATUSES] },
              then: {
                $cond: [
                  { $gt: [{ $ifNull: ['$confirmedAmount', 0] }, 0] },
                  { $ifNull: ['$confirmedAmount', 0] },
                  { $ifNull: ['$totalAmount', 0] }
                ]
              },
              else: 0
            }
          }
        }
      }
    }
  ];

  const [receivableStats, payableStats] = await Promise.all([
    PaymentReceivable.aggregate(receivablePipeline),
    PaymentPayable.aggregate(payablePipeline)
  ]);

  receivableStats.forEach((item) => {
    snapshot.receivable.totalCount += item.count;
    snapshot.receivable.money.total += item.totalAmount || 0;
    snapshot.receivable.money.confirmed += item.confirmedAmount || 0;
  });
  snapshot.receivable.money.outstanding = snapshot.receivable.money.total - snapshot.receivable.money.confirmed;

  payableStats.forEach((item) => {
    snapshot.payable.totalCount += item.count;
    snapshot.payable.money.total += item.totalAmount || 0;
    snapshot.payable.money.confirmed += item.confirmedAmount || 0;
  });
  snapshot.payable.money.outstanding = snapshot.payable.money.total - snapshot.payable.money.confirmed;
  snapshot.finance.profitConfirmed = snapshot.receivable.money.confirmed - snapshot.payable.money.confirmed;

  return snapshot;
}

/**
 * Сохраняет snapshot в базу данных
 * @param {string} grain - 'day' | 'week' | 'month' | 'year'
 * @param {string} dateKey - Ключ даты (YYYY-MM-DD)
 * @param {Date} rangeStart - Начало диапазона
 * @param {Date} rangeEnd - Конец диапазона
 * @param {string} entityType - 'system' | 'customer' | 'carrier' | 'user'
 * @param {string|null} entityId - ID сущности или null
 * @param {Object} snapshotData - Данные snapshot
 * @returns {Promise<Object>} Сохранённый snapshot
 */
async function upsertSnapshot(grain, dateKey, rangeStart, rangeEnd, entityType, entityId, snapshotData) {
  const filter = {
    grain,
    dateKey,
    entityType,
    entityId: entityId ? (mongoose.Types.ObjectId.isValid(entityId) ? new mongoose.Types.ObjectId(entityId) : entityId) : null
  };

  const update = {
    $set: {
      rangeStart,
      rangeEnd,
      ...snapshotData,
      computedAt: new Date(),
      version: 1
    }
  };

  const snapshot = await StatsSnapshot.findOneAndUpdate(
    filter,
    update,
    {
      upsert: true,
      new: true
    }
  );

  return snapshot;
}

/**
 * Завершает задачу (удаляет из StatsDirty)
 * @param {string} taskId - ID задачи
 * @returns {Promise<void>}
 */
async function completeTask(taskId) {
  await StatsDirty.findByIdAndDelete(taskId);
}

/**
 * Помечает задачу как неудачную и разблокирует её для retry
 * @param {string} taskId - ID задачи
 * @param {Error} error - Ошибка
 * @returns {Promise<void>}
 */
async function failTask(taskId, error) {
  const task = await StatsDirty.findById(taskId);
  if (!task) return;

  const attempts = (task.attempts || 0) + 1;
  const shouldRetry = attempts < MAX_RETRY_ATTEMPTS;

  await StatsDirty.findByIdAndUpdate(taskId, {
    $set: {
      'lock.locked': false,
      'lock.lockedAt': null,
      'lock.lockedBy': null,
      attempts,
      lastAttemptAt: new Date(),
      error: {
        message: error.message || String(error),
        occurredAt: new Date()
      }
    }
  });

  if (!shouldRetry) {
    console.error(`[StatsWorker] Task ${taskId} exceeded max retry attempts (${MAX_RETRY_ATTEMPTS})`);
  }
}

async function aggregatePeriodFromDays(grain, dateKey, rangeStart, rangeEnd, entityType, entityId) {
  const dayKeys = getDaysInRange(rangeStart, rangeEnd);
  
  const daySnapshots = await StatsSnapshot.find({
    grain: 'day',
    dateKey: { $in: dayKeys },
    entityType,
    entityId: entityId ? (mongoose.Types.ObjectId.isValid(entityId) ? new mongoose.Types.ObjectId(entityId) : entityId) : null
  }).lean();

  const aggregated = {
    loads: {
      total: 0,
      byStatus: {
        listed: 0,
        dispatched: 0,
        pickedUp: 0,
        delivered: 0,
        onHold: 0,
        cancelled: 0,
        expired: 0
      }
    },
    loadsState: {
      listed: 0,
      dispatched: 0,
      pickedUp: 0,
      delivered: 0,
      onHold: 0,
      cancelled: 0,
      expired: 0
    },
    loadsEvents: {
      created: 0,
      dispatched: 0,
      pickedUp: 0,
      delivered: 0,
      onHold: 0,
      cancelled: 0
    },
    receivable: {
      totalCount: 0,
      money: {
        total: 0,
        confirmed: 0,
        outstanding: 0
      }
    },
    payable: {
      totalCount: 0,
      money: {
        total: 0,
        confirmed: 0,
        outstanding: 0
      }
    },
    finance: {
      profitConfirmed: 0
    }
  };

  daySnapshots.forEach(snapshot => {
    if (snapshot.loads) {
      aggregated.loads.total += snapshot.loads.total || 0;
      if (snapshot.loads.byStatus) {
        aggregated.loads.byStatus.listed += snapshot.loads.byStatus.listed || 0;
        aggregated.loads.byStatus.dispatched += snapshot.loads.byStatus.dispatched || 0;
        aggregated.loads.byStatus.pickedUp += snapshot.loads.byStatus.pickedUp || 0;
        aggregated.loads.byStatus.delivered += snapshot.loads.byStatus.delivered || 0;
        aggregated.loads.byStatus.onHold += snapshot.loads.byStatus.onHold || 0;
        aggregated.loads.byStatus.cancelled += snapshot.loads.byStatus.cancelled || 0;
        aggregated.loads.byStatus.expired += snapshot.loads.byStatus.expired || 0;
      }
    }

    if (snapshot.loadsEvents) {
      aggregated.loadsEvents.created += snapshot.loadsEvents.created || 0;
      aggregated.loadsEvents.dispatched += snapshot.loadsEvents.dispatched || 0;
      aggregated.loadsEvents.pickedUp += snapshot.loadsEvents.pickedUp || 0;
      aggregated.loadsEvents.delivered += snapshot.loadsEvents.delivered || 0;
      aggregated.loadsEvents.onHold += snapshot.loadsEvents.onHold || 0;
      aggregated.loadsEvents.cancelled += snapshot.loadsEvents.cancelled || 0;
    }

    if (snapshot.dateKey && typeof snapshot.dateKey === 'string') {
      if (!aggregated._lastStateSnapshot || snapshot.dateKey > aggregated._lastStateSnapshot.dateKey) {
        aggregated._lastStateSnapshot = snapshot;
      }
    }

    if (snapshot.receivable) {
      aggregated.receivable.totalCount += snapshot.receivable.totalCount || 0;
      if (snapshot.receivable.money) {
        aggregated.receivable.money.total += snapshot.receivable.money.total || 0;
        aggregated.receivable.money.confirmed += snapshot.receivable.money.confirmed || 0;
        aggregated.receivable.money.outstanding += snapshot.receivable.money.outstanding || 0;
      }
    }

    if (snapshot.payable) {
      aggregated.payable.totalCount += snapshot.payable.totalCount || 0;
      if (snapshot.payable.money) {
        aggregated.payable.money.total += snapshot.payable.money.total || 0;
        aggregated.payable.money.confirmed += snapshot.payable.money.confirmed || 0;
        aggregated.payable.money.outstanding += snapshot.payable.money.outstanding || 0;
      }
    }

    if (snapshot.finance && snapshot.finance.profitConfirmed) {
      aggregated.finance.profitConfirmed += snapshot.finance.profitConfirmed || 0;
    }
  });

  if (aggregated._lastStateSnapshot && aggregated._lastStateSnapshot.loadsState) {
    const s = aggregated._lastStateSnapshot.loadsState;
    aggregated.loadsState = {
      listed: s.listed || 0,
      dispatched: s.dispatched || 0,
      pickedUp: s.pickedUp || 0,
      delivered: s.delivered || 0,
      onHold: s.onHold || 0,
      cancelled: s.cancelled || 0,
      expired: s.expired || 0
    };
  }

  delete aggregated._lastStateSnapshot;

  aggregated.receivable.money.outstanding = aggregated.receivable.money.total - aggregated.receivable.money.confirmed;
  aggregated.payable.money.outstanding = aggregated.payable.money.total - aggregated.payable.money.confirmed;
  aggregated.finance.profitConfirmed = aggregated.receivable.money.confirmed - aggregated.payable.money.confirmed;

  return aggregated;
}

async function processTask(workerId) {
  const task = await lockTask(workerId);
  
  if (!task) {
    return false;
  }

  try {
    console.log(`[StatsWorker] Processing task: ${task.grain}/${task.dateKey} ${task.entityType}/${task.entityId || 'system'}`);

    let snapshotData;

    if (task.grain === 'day') {
      snapshotData = await computeSnapshot(
        task.rangeStart,
        task.rangeEnd,
        task.entityType,
        task.entityId
      );
    } else if (['week', 'month', 'year'].includes(task.grain)) {
      snapshotData = await aggregatePeriodFromDays(
        task.grain,
        task.dateKey,
        task.rangeStart,
        task.rangeEnd,
        task.entityType,
        task.entityId
      );
    } else {
      throw new Error(`Unsupported grain: ${task.grain}`);
    }

    await upsertSnapshot(
      task.grain,
      task.dateKey,
      task.rangeStart,
      task.rangeEnd,
      task.entityType,
      task.entityId,
      snapshotData
    );

    await completeTask(task._id);

    console.log(`[StatsWorker] Task completed: ${task.grain}/${task.dateKey} ${task.entityType}/${task.entityId || 'system'}`);
    return true;
  } catch (error) {
    console.error(`[StatsWorker] Error processing task ${task._id}:`, error);
    await failTask(task._id, error);
    return true;
  }
}

/**
 * Запускает воркер для обработки задач статистики
 * @param {string} workerId - ID воркера (по умолчанию генерируется)
 * @param {Object} options - Опции воркера
 * @param {number} options.interval - Интервал проверки задач в мс (по умолчанию 5000)
 * @param {number} options.batchSize - Количество задач за раз (по умолчанию 10)
 * @returns {Promise<Function>} Функция остановки воркера
 */
async function startWorker(workerId = `worker-${uuidv4()}`, options = {}) {
  const { interval = 5000, batchSize = 10 } = options;

  console.log(`[StatsWorker] Starting worker ${workerId}`);

  let isRunning = true;

  const processBatch = async () => {
    if (!isRunning) return;

    try {
      let processed = 0;
      for (let i = 0; i < batchSize; i++) {
        const hasTask = await processTask(workerId);
        if (hasTask) {
          processed++;
        } else {
          break;
        }
      }

      if (processed > 0) {
        console.log(`[StatsWorker] Processed ${processed} tasks`);
      }
    } catch (error) {
      console.error('[StatsWorker] Error in processBatch:', error);
    }

    if (isRunning) {
      setTimeout(processBatch, interval);
    }
  };

  processBatch();

  return () => {
    isRunning = false;
    console.log(`[StatsWorker] Stopping worker ${workerId}`);
  };
}

module.exports = {
  lockTask,
  computeSnapshot,
  computeSnapshotFromDelta,
  getDeltaSnapshotsForDateKeys,
  applyStateDelta,
  computeSnapshotForCustomerIds,
  computeSnapshotsForCustomerIdsBatch,
  upsertSnapshot,
  completeTask,
  failTask,
  processTask,
  startWorker,
  aggregatePeriodFromDays
};
