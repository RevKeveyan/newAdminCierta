const StatsSnapshot = require('../models/subModels/StatsSnapshot');
const PaymentReceivable = require('../models/subModels/PaymentReceivable');
const PaymentPayable = require('../models/subModels/PaymentPayable');
const { getStatsScope, hasStatsEntityAccess, hasStatsSectionAccess, resolveStatsScopeForRequest } = require('../utils/statsPermissions');
const Customer = require('../models/Customer');
const Carrier = require('../models/Carrier');
const Load = require('../models/Load');
const User = require('../models/User');
const { STATISTICS_DATE_SOURCES } = require('../config/statisticsDateConstants');
const { getDateKeyUTC5, getMonthKeyUTC5, getWeekKeyUTC5, getYearKeyUTC5, getDateRangeFromKey, getMonthRangeFromKey, getWeekRangeFromKey, getYearRangeFromKey, getDaysInRange } = require('../utils/dateKeyUtils');
const statsWorker = require('../services/statsWorker');
const mongoose = require('mongoose');

class StatsController {
  /**
   * GET /stats/loads
   * Получить статистику по loads
   */
  getLoadsStats = async (req, res) => {
    try {
      const scope = await getStatsScope(req.user);
      
      if (!scope.allowedSections.includes('loads')) {
        return res.status(403).json({
          success: false,
          error: 'Access denied: no access to loads statistics'
        });
      }

      const { from, to, grain = 'day', entityType: queryEntityType = 'system', entityId: queryEntityId, status, email } = req.query;

      if (!from || !to) {
        return res.status(400).json({
          success: false,
          error: 'from and to dates are required'
        });
      }

      const fromDate = new Date(from);
      const toDate = new Date(to);

      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid date format. Use ISO format (YYYY-MM-DD)'
        });
      }

      const scopeType = queryEntityType === 'system' ? 'global' : queryEntityType;
      const scopeId = queryEntityType === 'system' ? null : queryEntityId;
      const resolved = resolveStatsScopeForRequest(scope, scopeType, scopeId);
      let finalEntityType = resolved.entityType;
      let finalEntityId = resolved.entityId;
      const customerIdsForAggregate = resolved.customerIdsForAggregate || null;

      if (finalEntityType == null) {
        return res.status(403).json({
          success: false,
          error: 'Access denied: statistics for this scope are not available for your role'
        });
      }
      if (!customerIdsForAggregate && !scope.allowedEntityTypes.includes(finalEntityType)) {
        return res.status(403).json({
          success: false,
          error: `Access denied: entityType '${finalEntityType}' not allowed`
        });
      }

      if (email) {
        const entity = await this.findEntityByEmail(email);
        if (!entity) {
          return res.status(404).json({
            success: false,
            error: `Entity not found for email: ${email}`
          });
        }
        finalEntityId = entity.id;
        finalEntityType = entity.type;
        
        if (!scope.allowedEntityTypes.includes(finalEntityType)) {
          return res.status(403).json({
            success: false,
            error: `Access denied: entityType '${finalEntityType}' not allowed`
          });
        }

        if (!await hasStatsEntityAccess(req.user, finalEntityType, finalEntityId)) {
          return res.status(403).json({
            success: false,
            error: 'Access denied to this entity'
          });
        }
      } else if (queryEntityId) {
        if (!await hasStatsEntityAccess(req.user, finalEntityType, queryEntityId)) {
          return res.status(403).json({
            success: false,
            error: 'Access denied to this entity'
          });
        }
      } else if (!customerIdsForAggregate && finalEntityType !== 'system') {
        return res.status(400).json({
          success: false,
          error: 'entityId is required for non-system entityType'
        });
      }

      const dateKeys = this.getDateKeysForRange(fromDate, toDate, grain);
      const userId = req.user?._id?.toString?.() || req.user?._id;
      const snapshots = customerIdsForAggregate && customerIdsForAggregate.length > 0
        ? await this.getSnapshotsForDateKeys(dateKeys, grain, 'customer', null, customerIdsForAggregate, userId)
        : await this.getSnapshotsForDateKeys(dateKeys, grain, finalEntityType, finalEntityId);

      let result = snapshots;

      if (status) {
        const statusKey = status.toLowerCase();
        const statusMap = {
          'listed': 'listed',
          'dispatched': 'dispatched',
          'picked up': 'pickedUp',
          'pickedup': 'pickedUp',
          'delivered': 'delivered',
          'on hold': 'onHold',
          'onhold': 'onHold',
          'cancelled': 'cancelled',
          'expired': 'expired'
        };
        const normalizedStatus = statusMap[statusKey] || statusKey;
        
        result = result.map(snapshot => ({
          ...snapshot,
          loads: {
            total: snapshot.loads.byStatus[normalizedStatus] || 0,
            byStatus: {
              [normalizedStatus]: snapshot.loads.byStatus[normalizedStatus] || 0
            }
          }
        }));
      }

      if (grain === 'day') {
        result = result.map(snapshot => ({
          date: snapshot.dateKey,
          ...snapshot.loads,
          receivable: snapshot.receivable,
          payable: snapshot.payable,
          finance: snapshot.finance
        }));
      } else {
        result = result.map(snapshot => ({
          period: snapshot.dateKey,
          ...snapshot.loads,
          receivable: snapshot.receivable,
          payable: snapshot.payable,
          finance: snapshot.finance
        }));
      }

      res.status(200).json({
        success: true,
        data: result,
        meta: {
          grain,
          entityType: finalEntityType,
          entityId: finalEntityId,
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
          count: result.length
        }
      });
    } catch (error) {
      console.error('[StatsController] Error in getLoadsStats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch loads statistics',
        details: error.message
      });
    }
  };

  /**
   * Находит сущность по email
   * @param {string} email - Email для поиска
   * @returns {Promise<{type: string, id: string}|null>}
   */
  async findEntityByEmail(email) {
    const customer = await Customer.findOne({ email: email.toLowerCase() }).select('_id').lean();
    if (customer) {
      return { type: 'customer', id: customer._id.toString() };
    }

    const carrier = await Carrier.findOne({ email: email.toLowerCase() }).select('_id').lean();
    if (carrier) {
      return { type: 'carrier', id: carrier._id.toString() };
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('_id').lean();
    if (user) {
      return { type: 'user', id: user._id.toString() };
    }

    return null;
  }

  /**
   * Получает dateKeys для диапазона дат
   * @param {Date} fromDate - Начальная дата
   * @param {Date} toDate - Конечная дата
   * @param {string} grain - 'day' | 'week' | 'month' | 'year'
   * @returns {string[]} Массив dateKeys
   */
  getDateKeysForRange(fromDate, toDate, grain) {
    const keys = [];
    const current = new Date(fromDate);
    current.setUTCHours(0, 0, 0, 0);
    const end = new Date(toDate);
    end.setUTCHours(23, 59, 59, 999);

    while (current <= end) {
      let key;
      if (grain === 'day') {
        key = getDateKeyUTC5(current);
        current.setUTCDate(current.getUTCDate() + 1);
      } else if (grain === 'week') {
        key = getWeekKeyUTC5(current);
        current.setUTCDate(current.getUTCDate() + 7);
      } else if (grain === 'month') {
        key = getMonthKeyUTC5(current);
        current.setUTCMonth(current.getUTCMonth() + 1);
      } else if (grain === 'year') {
        key = getYearKeyUTC5(current);
        current.setUTCFullYear(current.getUTCFullYear() + 1);
      } else {
        break;
      }
      
      if (!keys.includes(key)) {
        keys.push(key);
      }
    }

    return keys;
  }

  /**
   * Получает snapshots для массива dateKeys
   * @param {string[]} dateKeys - Массив dateKeys
   * @param {string} grain - 'day' | 'week' | 'month' | 'year'
   * @param {string} entityType - 'system' | 'customer' | 'carrier' | 'user'
   * @param {string|null} entityId - ID сущности или null
   * @param {string[]} [customerIdsForAggregate] - массив ID клиентов для агрегации (только при entityType 'customer')
   * @returns {Promise<Object[]>} Массив snapshots
   */
  async getSnapshotsForDateKeys(dateKeys, grain, entityType, entityId, customerIdsForAggregate = null, userId = null) {
    if (entityType === 'customer' && Array.isArray(customerIdsForAggregate)) {
      if (customerIdsForAggregate.length === 0) {
        return dateKeys.map((dateKey) => ({ dateKey, ...this.getEmptySnapshot(dateKey) }));
      }
      if (grain === 'day') {
        if (dateKeys.length > 1) {
          const rangeStart = getDateRangeFromKey(dateKeys[0])?.start;
          const rangeEnd = getDateRangeFromKey(dateKeys[dateKeys.length - 1])?.end;
          if (rangeStart && rangeEnd) {
            const rangeEndExclusive = new Date(rangeEnd.getTime() + 1);
            const batchResult = await statsWorker.computeSnapshotsForCustomerIdsBatch(dateKeys, rangeStart, rangeEndExclusive, customerIdsForAggregate, userId);
            if (batchResult) return batchResult;
          }
        } else if (dateKeys.length === 1) {
          const range = getDateRangeFromKey(dateKeys[0]);
          if (range) {
            const rangeEndExclusive = new Date(range.end.getTime() + 1);
            const snapshotData = await statsWorker.computeSnapshotForCustomerIds(range.start, rangeEndExclusive, customerIdsForAggregate, userId);
            return [{ dateKey: dateKeys[0], ...snapshotData }];
          }
          return [{ dateKey: dateKeys[0], ...this.getEmptySnapshot(dateKeys[0]) }];
        }
        return [];
      }
      if (['week', 'month', 'year'].includes(grain) && dateKeys.length > 0) {
        let rangeStart = null;
        let rangeEnd = null;
        for (const dateKey of dateKeys) {
          const range = grain === 'week' ? getWeekRangeFromKey(dateKey) : grain === 'month' ? getMonthRangeFromKey(dateKey) : getYearRangeFromKey(dateKey);
          if (!range) continue;
          if (rangeStart == null || range.start < rangeStart) rangeStart = range.start;
          if (rangeEnd == null || range.end > rangeEnd) rangeEnd = range.end;
        }
        if (rangeStart && rangeEnd) {
          const dayKeys = getDaysInRange(rangeStart, rangeEnd);
          const rangeEndExclusive = new Date(rangeEnd.getTime() + 1);
          const batchResult = await statsWorker.computeSnapshotsForCustomerIdsBatch(dayKeys, rangeStart, rangeEndExclusive, customerIdsForAggregate, userId);
          if (!batchResult || batchResult.length === 0) {
            return dateKeys.map((dateKey) => ({ dateKey, ...this.getEmptySnapshot(dateKey) }));
          }
          const byDayKey = {};
          batchResult.forEach((row) => {
            byDayKey[row.dateKey] = row;
          });
          const result = [];
          const empty = this.getEmptySnapshot('');
          for (const dateKey of dateKeys) {
            const range = grain === 'week' ? getWeekRangeFromKey(dateKey) : grain === 'month' ? getMonthRangeFromKey(dateKey) : getYearRangeFromKey(dateKey);
            if (!range) {
              result.push({ dateKey, ...this.getEmptySnapshot(dateKey) });
              continue;
            }
            const daysInPeriod = getDaysInRange(range.start, range.end);
            const aggregated = {
              loads: { total: 0, byStatus: { ...empty.loads.byStatus } },
              receivable: { totalCount: 0, money: { total: 0, confirmed: 0, outstanding: 0 } },
              payable: { totalCount: 0, money: { total: 0, confirmed: 0, outstanding: 0 } },
              finance: { profitConfirmed: 0 }
            };
            for (const dk of daysInPeriod) {
              const dayRow = byDayKey[dk];
              if (!dayRow) continue;
              if (dayRow.loads) {
                aggregated.loads.total += dayRow.loads.total || 0;
                if (dayRow.loads.byStatus) {
                  Object.keys(aggregated.loads.byStatus).forEach((k) => {
                    aggregated.loads.byStatus[k] += dayRow.loads.byStatus[k] || 0;
                  });
                }
              }
              if (dayRow.receivable) {
                aggregated.receivable.totalCount += dayRow.receivable.totalCount || 0;
                if (dayRow.receivable.money) {
                  aggregated.receivable.money.total += dayRow.receivable.money.total || 0;
                  aggregated.receivable.money.confirmed += dayRow.receivable.money.confirmed || 0;
                  aggregated.receivable.money.outstanding += dayRow.receivable.money.outstanding || 0;
                }
              }
              if (dayRow.payable) {
                aggregated.payable.totalCount += dayRow.payable.totalCount || 0;
                if (dayRow.payable.money) {
                  aggregated.payable.money.total += dayRow.payable.money.total || 0;
                  aggregated.payable.money.confirmed += dayRow.payable.money.confirmed || 0;
                  aggregated.payable.money.outstanding += dayRow.payable.money.outstanding || 0;
                }
              }
              if (dayRow.finance && typeof dayRow.finance.profitConfirmed === 'number') {
                aggregated.finance.profitConfirmed += dayRow.finance.profitConfirmed;
              }
            }
            result.push({ dateKey, ...aggregated });
          }
          return result;
        }
      }
      return dateKeys.map((dateKey) => ({ dateKey, ...this.getEmptySnapshot(dateKey) }));
    }

    const filter = {
      grain,
      dateKey: { $in: dateKeys },
      entityType,
      entityId: entityId ? (mongoose.Types.ObjectId.isValid(entityId) ? new mongoose.Types.ObjectId(entityId) : entityId) : null
    };

    const snapshots = await StatsSnapshot.find(filter)
      .sort({ dateKey: 1 })
      .lean();

    const snapshotMap = {};
    snapshots.forEach(snapshot => {
      snapshotMap[snapshot.dateKey] = snapshot;
    });

    const result = [];

    for (const dateKey of dateKeys) {
      if (snapshotMap[dateKey]) {
        result.push(snapshotMap[dateKey]);
      } else if (['week', 'month', 'year'].includes(grain)) {
        let rangeStart, rangeEnd;
        
        if (grain === 'week') {
          const range = getWeekRangeFromKey(dateKey);
          if (range) {
            rangeStart = range.start;
            rangeEnd = range.end;
          }
        } else if (grain === 'month') {
          const range = getMonthRangeFromKey(dateKey);
          if (range) {
            rangeStart = range.start;
            rangeEnd = range.end;
          }
        } else if (grain === 'year') {
          const range = getYearRangeFromKey(dateKey);
          if (range) {
            rangeStart = range.start;
            rangeEnd = range.end;
          }
        }

        if (rangeStart && rangeEnd) {
          try {
            const aggregatedData = await statsWorker.aggregatePeriodFromDays(
              grain,
              dateKey,
              rangeStart,
              rangeEnd,
              entityType,
              entityId
            );

            const savedSnapshot = await statsWorker.upsertSnapshot(
              grain,
              dateKey,
              rangeStart,
              rangeEnd,
              entityType,
              entityId,
              aggregatedData
            );

            result.push(savedSnapshot);
          } catch (error) {
            console.error(`[StatsController] Error aggregating ${grain} snapshot for ${dateKey}:`, error);
            result.push(this.getEmptySnapshot(dateKey));
          }
        } else {
          result.push(this.getEmptySnapshot(dateKey));
        }
      } else {
        result.push(this.getEmptySnapshot(dateKey));
      }
    }

    return result;
  }

  /**
   * Возвращает пустой snapshot для отсутствующих данных
   * @param {string} dateKey - DateKey
   * @returns {Object} Пустой snapshot
   */
  getEmptySnapshot(dateKey) {
    return {
      dateKey,
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
  }

  getLoadFilterForStatsUser(scope, user) {
    if (!scope || !user) return null;
    const role = user.role;
    if (role === 'admin' || role === 'manager') return {};
    if (role === 'freightBroker') {
      const uid = user._id || user.id;
      if (!uid) return null;
      return { createdBy: mongoose.Types.ObjectId.isValid(uid) ? new mongoose.Types.ObjectId(uid) : uid };
    }
    if (role === 'dispatcher' || role === 'Pre-dispatcher' || role === 'bidAgent' || role === 'salesAgent') {
      const ids = scope.allowedEntityIds?.customer;
      if (!Array.isArray(ids) || ids.length === 0) return null;
      const objectIds = ids.filter(id => id && mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));
      if (objectIds.length === 0) return null;
      return { customer: { $in: objectIds } };
    }
    return null;
  }

  async getVisibleLoadsTotals(scope, user) {
    const filter = this.getLoadFilterForStatsUser(scope, user);
    if (filter === null) return { total: 0, byStatus: { listed: 0, dispatched: 0, pickedUp: 0, delivered: 0, onHold: 0, cancelled: 0, expired: 0 } };
    const statusMap = { 'Listed': 'listed', 'Dispatched': 'dispatched', 'Picked Up': 'pickedUp', 'Delivered': 'delivered', 'On Hold': 'onHold', 'Cancelled': 'cancelled' };
    const [total, statusAgg] = await Promise.all([
      Load.countDocuments(filter),
      Load.aggregate([{ $match: filter }, { $group: { _id: '$status', count: { $sum: 1 } } }])
    ]);
    const byStatus = { listed: 0, dispatched: 0, pickedUp: 0, delivered: 0, onHold: 0, cancelled: 0, expired: 0 };
    statusAgg.forEach(item => {
      const key = statusMap[item._id] || (item._id && item._id.toLowerCase && item._id.toLowerCase()) || 'listed';
      if (byStatus[key] !== undefined) byStatus[key] = item.count;
      else byStatus.listed = (byStatus.listed || 0) + item.count;
    });
    const deadlinePast = await Load.find({
      ...filter,
      status: { $nin: STATISTICS_DATE_SOURCES.EXPIRED.FINAL_STATUSES }
    }).select('dates.deadlineAt dates.deadline').lean();
    let expired = 0;
    const now = new Date();
    deadlinePast.forEach(load => {
      const v = load.dates?.deadlineAt || load.dates?.deadline;
      if (!v) return;
      const d = v instanceof Date ? v : new Date(v);
      if (!isNaN(d.getTime()) && d < now) expired++;
    });
    byStatus.expired = expired;
    return { total, byStatus };
  }

  /**
   * GET /api/stats (Facade endpoint для фронтенда)
   * Единый endpoint, который возвращает данные в формате фронтенда
   */
  getStatsFacade = async (req, res) => {
    try {
      const scope = await getStatsScope(req.user);

      const {
        period,
        from,
        to,
        scopeType = 'global',
        scopeId,
        statuses,
        paymentType,
        paymentStatus,
        grain: requestedGrain,
        search,
        useDelta,
        useLegacy
      } = req.query;

      if (!from || !to) {
        return res.status(400).json({
          success: false,
          error: 'from and to dates are required'
        });
      }

      const fromDate = new Date(from);
      const toDate = new Date(to);

      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid date format. Use ISO format (YYYY-MM-DD)'
        });
      }

      const resolved = resolveStatsScopeForRequest(scope, scopeType, scopeId);
      const entityType = resolved.entityType;
      const entityId = resolved.entityId;
      const customerIdsForAggregate = resolved.customerIdsForAggregate || null;

      if (entityType == null) {
        return res.status(403).json({
          success: false,
          error: 'Access denied: statistics for this scope are not available for your role'
        });
      }
      if (!customerIdsForAggregate && !scope.allowedEntityTypes.includes(entityType)) {
        return res.status(403).json({
          success: false,
          error: `Access denied: entityType '${entityType}' not allowed`
        });
      }

      if (entityId && !await hasStatsEntityAccess(req.user, entityType, entityId)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this entity'
        });
      }

      let grain = requestedGrain;
      if (!grain) {
        const daysDiff = Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24)) + 1;
        if (daysDiff <= 31) {
          grain = 'day';
        } else if (daysDiff <= 120) {
          grain = 'week';
        } else {
          grain = 'month';
        }
      }

      if (!['day', 'week', 'month', 'year'].includes(grain)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid grain. Use: day, week, month, year'
        });
      }

      const dateKeys = this.getDateKeysForRange(fromDate, toDate, grain);
      const facadeUserId = req.user?._id?.toString?.() || req.user?._id;

      const forceLegacy = useLegacy === '1';
      const isCustomerAggregate = customerIdsForAggregate && customerIdsForAggregate.length > 0;
      const canUseDeltaForLoads = grain === 'day' && !isCustomerAggregate && useDelta === '1';
      const shouldUseDeltaForLoads = !forceLegacy && canUseDeltaForLoads;

      const rawSnapshots = isCustomerAggregate
        ? await this.getSnapshotsForDateKeys(dateKeys, grain, 'customer', null, customerIdsForAggregate, facadeUserId)
        : shouldUseDeltaForLoads
        ? await Promise.all([
            this.getSnapshotsForDateKeys(dateKeys, grain, entityType, entityId),
            statsWorker.getDeltaSnapshotsForDateKeys({ dateKeys, entityType, entityId })
          ]).then(([legacySnapshots, deltaSnapshots]) => {
            const legacyArr = Array.isArray(legacySnapshots)
              ? legacySnapshots
              : legacySnapshots
              ? [legacySnapshots]
              : [];
            const deltaArr = Array.isArray(deltaSnapshots)
              ? deltaSnapshots
              : deltaSnapshots
              ? [deltaSnapshots]
              : [];
            const deltaByKey = {};
            deltaArr.forEach((d) => {
              if (d && d.dateKey) deltaByKey[d.dateKey] = d;
            });
            return legacyArr.map((s) => {
              const d = deltaByKey[s?.dateKey];
              if (!d) return s;
              return {
                ...s,
                loads: d.loads,
                loadsState: d.loadsState,
                loadsEvents: d.loadsEvents
              };
            });
          })
        : await this.getSnapshotsForDateKeys(dateKeys, grain, entityType, entityId);

      const snapshots = Array.isArray(rawSnapshots)
        ? rawSnapshots
        : rawSnapshots
        ? [rawSnapshots]
        : [];

      const statusesArray = statuses ? statuses.split(',').map(s => s.trim().toLowerCase()) : null;
      const paymentStatusesArray = paymentStatus ? paymentStatus.split(',').map(s => s.trim().toLowerCase()) : null;

      const points = snapshots.map(snapshot => {
        return this.adaptSnapshotToPoint(snapshot, statusesArray, paymentType, paymentStatusesArray);
      });

      let totals = this.aggregateTotalsFromPoints(points, statusesArray, paymentType, paymentStatusesArray);
      let breakdowns = this.aggregateBreakdownsFromPoints(points, statusesArray, paymentType, paymentStatusesArray);

      if (paymentType === 'receivable' || paymentType === 'payable') {
        try {
          const [statusBreakdown, liveProfit] = await Promise.all([
            this.getPaymentsBreakdownByStatus(fromDate, toDate, paymentType, entityType, entityId, grain, customerIdsForAggregate),
            this.getLiveProfitConfirmed(fromDate, toDate, entityType, entityId, grain, customerIdsForAggregate)
          ]);
          if (paymentType === 'receivable') {
            breakdowns = { ...breakdowns, receivableByStatus: statusBreakdown };
          } else {
            breakdowns = { ...breakdowns, payableByStatus: statusBreakdown };
          }
          totals = { ...totals, totalProfit: liveProfit.totalProfit };
        } catch (err) {
          console.error('[StatsController] getPaymentsBreakdownByStatus error:', err);
        }
      }

      if (search) {
        const filteredPoints = this.filterPointsBySearch(points, search);
        return res.status(200).json({
          success: true,
          data: {
            totals: this.aggregateTotalsFromPoints(filteredPoints, statusesArray, paymentType, paymentStatusesArray),
            breakdowns: this.aggregateBreakdownsFromPoints(filteredPoints, statusesArray, paymentType, paymentStatusesArray),
            points: filteredPoints
          },
          meta: {
            grain,
            entityType,
            entityId,
            from: fromDate.toISOString(),
            to: toDate.toISOString(),
            count: filteredPoints.length
          }
        });
      }

      res.status(200).json({
        success: true,
        data: {
          totals,
          breakdowns,
          points
        },
        meta: {
          grain,
          entityType,
          entityId,
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
          count: points.length
        }
      });
    } catch (error) {
      console.error('[StatsController] Error in getStatsFacade:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch statistics',
        details: error.message
      });
    }
  };

  /**
   * Адаптирует snapshot в формат point для фронтенда
   */
  adaptSnapshotToPoint(snapshot, statusesArray = null, paymentType = null, paymentStatusesArray = null) {
    const point = {
      periodKey: snapshot.dateKey,
      totals: {},
      breakdowns: {}
    };

    if (snapshot.loads) {
      let loadsByStatus = { ...snapshot.loads.byStatus };
      
      if (statusesArray && statusesArray.length > 0) {
        const statusMap = {
          'listed': 'listed',
          'dispatched': 'dispatched',
          'pickedup': 'pickedUp',
          'picked up': 'pickedUp',
          'pickedup': 'pickedUp',
          'delivered': 'delivered',
          'onhold': 'onHold',
          'on hold': 'onHold',
          'cancelled': 'cancelled',
          'canceled': 'cancelled',
          'expired': 'expired'
        };
        
        const filteredStatuses = {};
        let filteredTotal = 0;
        
        statusesArray.forEach(statusKey => {
          const normalizedStatus = statusMap[statusKey] || statusKey;
          if (loadsByStatus[normalizedStatus] !== undefined) {
            filteredStatuses[normalizedStatus] = loadsByStatus[normalizedStatus];
            filteredTotal += loadsByStatus[normalizedStatus] || 0;
          }
        });
        
        loadsByStatus = filteredStatuses;
        point.totals.totalLoads = filteredTotal;
        point.totals.loadsCreated = filteredTotal;
      } else {
        point.totals.totalLoads = snapshot.loads.total || 0;
        point.totals.loadsCreated = snapshot.loads.total || 0;
      }
      
      point.breakdowns.loadsByStatus = loadsByStatus;
    } else {
      point.totals.totalLoads = 0;
      point.totals.loadsCreated = 0;
      point.breakdowns.loadsByStatus = {
        listed: 0,
        dispatched: 0,
        pickedUp: 0,
        delivered: 0,
        onHold: 0,
        cancelled: 0,
        expired: 0
      };
    }

    if (snapshot.receivable) {
      if (!paymentType || paymentType === 'receivable') {
        point.totals.totalReceivable = snapshot.receivable.money?.total || 0;
        point.totals.confirmedReceivable = snapshot.receivable.money?.confirmed || 0;
        point.totals.outstandingReceivable = snapshot.receivable.money?.outstanding || 0;
        point.breakdowns.receivable = {
          totalCount: snapshot.receivable.totalCount || 0,
          money: snapshot.receivable.money || { total: 0, confirmed: 0, outstanding: 0 }
        };
      }
    }

    if (snapshot.payable) {
      if (!paymentType || paymentType === 'payable') {
        point.totals.totalPayable = snapshot.payable.money?.total || 0;
        point.totals.confirmedPayable = snapshot.payable.money?.confirmed || 0;
        point.totals.outstandingPayable = snapshot.payable.money?.outstanding || 0;
        point.breakdowns.payable = {
          totalCount: snapshot.payable.totalCount || 0,
          money: snapshot.payable.money || { total: 0, confirmed: 0, outstanding: 0 }
        };
      }
    }

    if (snapshot.finance) {
      point.totals.totalProfit = snapshot.finance.profitConfirmed || 0;
      point.totals.totalRevenue = (point.totals.confirmedReceivable || 0);
      point.totals.totalExpense = (point.totals.confirmedPayable || 0);
    }

    return point;
  }

  /**
   * Агрегирует totals из массива points
   */
  aggregateTotalsFromPoints(points, statusesArray = null, paymentType = null, paymentStatusesArray = null) {
    const totals = {
      totalLoads: 0,
      loadsCreated: 0,
      totalRevenue: 0,
      totalExpense: 0,
      totalProfit: 0,
      totalReceivable: 0,
      confirmedReceivable: 0,
      outstandingReceivable: 0,
      totalPayable: 0,
      confirmedPayable: 0,
      outstandingPayable: 0
    };

    points.forEach(point => {
      totals.totalLoads += point.totals.totalLoads || 0;
      totals.loadsCreated += point.totals.loadsCreated || 0;
      totals.totalRevenue += point.totals.totalRevenue || 0;
      totals.totalExpense += point.totals.totalExpense || 0;
      totals.totalProfit += point.totals.totalProfit || 0;
      
      if (!paymentType || paymentType === 'receivable') {
        totals.totalReceivable += point.totals.totalReceivable || 0;
        totals.confirmedReceivable += point.totals.confirmedReceivable || 0;
        totals.outstandingReceivable += point.totals.outstandingReceivable || 0;
      }
      
      if (!paymentType || paymentType === 'payable') {
        totals.totalPayable += point.totals.totalPayable || 0;
        totals.confirmedPayable += point.totals.confirmedPayable || 0;
        totals.outstandingPayable += point.totals.outstandingPayable || 0;
      }
    });

    return totals;
  }

  /**
   * Агрегирует breakdowns из массива points
   */
  aggregateBreakdownsFromPoints(points, statusesArray = null, paymentType = null, paymentStatusesArray = null) {
    const breakdowns = {
      loadsByStatus: {
        listed: 0,
        dispatched: 0,
        pickedUp: 0,
        delivered: 0,
        onHold: 0,
        cancelled: 0,
        expired: 0
      }
    };

    points.forEach(point => {
      if (point.breakdowns.loadsByStatus) {
        Object.keys(breakdowns.loadsByStatus).forEach(status => {
          breakdowns.loadsByStatus[status] += point.breakdowns.loadsByStatus[status] || 0;
        });
      }
    });

    if (!paymentType || paymentType === 'receivable') {
      breakdowns.receivable = {
        totalCount: 0,
        money: { total: 0, confirmed: 0, outstanding: 0 }
      };
      points.forEach(point => {
        if (point.breakdowns.receivable) {
          breakdowns.receivable.totalCount += point.breakdowns.receivable.totalCount || 0;
          breakdowns.receivable.money.total += point.breakdowns.receivable.money?.total || 0;
          breakdowns.receivable.money.confirmed += point.breakdowns.receivable.money?.confirmed || 0;
          breakdowns.receivable.money.outstanding += point.breakdowns.receivable.money?.outstanding || 0;
        }
      });
    }

    if (!paymentType || paymentType === 'payable') {
      breakdowns.payable = {
        totalCount: 0,
        money: { total: 0, confirmed: 0, outstanding: 0 }
      };
      points.forEach(point => {
        if (point.breakdowns.payable) {
          breakdowns.payable.totalCount += point.breakdowns.payable.totalCount || 0;
          breakdowns.payable.money.total += point.breakdowns.payable.money?.total || 0;
          breakdowns.payable.money.confirmed += point.breakdowns.payable.money?.confirmed || 0;
          breakdowns.payable.money.outstanding += point.breakdowns.payable.money?.outstanding || 0;
        }
      });
    }

    return breakdowns;
  }

  async getPaymentsBreakdownByStatus(fromDate, toDate, paymentType, entityType, entityId, grain, customerIdsForAggregate = null) {
    const dateKeys = this.getDateKeysForRange(fromDate, toDate, grain);
    if (dateKeys.length === 0) {
      return paymentType === 'receivable'
        ? { received: { count: 0, amount: 0 }, 'partially received': { count: 0, amount: 0 }, outstanding: { count: 0, amount: 0 } }
        : { paid: { count: 0, amount: 0 }, 'partially paid': { count: 0, amount: 0 }, outstanding: { count: 0, amount: 0 } };
    }
    const firstRange = grain === 'day' ? getDateRangeFromKey(dateKeys[0])
      : grain === 'week' ? getWeekRangeFromKey(dateKeys[0])
        : grain === 'month' ? getMonthRangeFromKey(dateKeys[0])
          : getYearRangeFromKey(dateKeys[0]);
    const lastRange = grain === 'day' ? getDateRangeFromKey(dateKeys[dateKeys.length - 1])
      : grain === 'week' ? getWeekRangeFromKey(dateKeys[dateKeys.length - 1])
        : grain === 'month' ? getMonthRangeFromKey(dateKeys[dateKeys.length - 1])
          : getYearRangeFromKey(dateKeys[dateKeys.length - 1]);
    if (!firstRange || !lastRange) return paymentType === 'receivable'
      ? { received: { count: 0, amount: 0 }, 'partially received': { count: 0, amount: 0 }, outstanding: { count: 0, amount: 0 } }
      : { paid: { count: 0, amount: 0 }, 'partially paid': { count: 0, amount: 0 }, outstanding: { count: 0, amount: 0 } };
    const rangeStart = firstRange.start;
    const rangeEnd = new Date(lastRange.end.getTime() + 1);

    const rangeMatch = { $exists: true, $ne: null, $gte: rangeStart, $lt: rangeEnd };
    const receivableDateField = STATISTICS_DATE_SOURCES.PAYMENTS.RECEIVABLE_DATE;
    const payableDateField = STATISTICS_DATE_SOURCES.PAYMENTS.PAYABLE_DATE;

    const basePaymentFilter = {};
    if (entityType === 'customer') {
      if (Array.isArray(customerIdsForAggregate) && customerIdsForAggregate.length > 0) {
        basePaymentFilter.customer = { $in: customerIdsForAggregate.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id)) };
      } else {
        basePaymentFilter.customer = mongoose.Types.ObjectId.isValid(entityId) ? new mongoose.Types.ObjectId(entityId) : entityId;
      }
    } else if (entityType === 'carrier') {
      basePaymentFilter.carrier = mongoose.Types.ObjectId.isValid(entityId) ? new mongoose.Types.ObjectId(entityId) : entityId;
    } else if (entityType === 'user') {
      basePaymentFilter.createdBy = mongoose.Types.ObjectId.isValid(entityId) ? new mongoose.Types.ObjectId(entityId) : entityId;
    }

    if (paymentType === 'receivable') {
      const paymentMatch = { ...basePaymentFilter, [receivableDateField]: rangeMatch };
      const pipeline = [
        { $match: paymentMatch },
        {
          $group: {
            _id: {
              $switch: {
                branches: [
                  { case: { $eq: ['$status', 'received'] }, then: 'received' },
                  { case: { $eq: ['$status', 'partially received'] }, then: 'partially received' }
                ],
                default: 'outstanding'
              }
            },
            count: { $sum: 1 },
            amount: {
              $sum: {
                $cond: [
                  { $in: ['$status', ['received', 'partially received']] },
                  {
                    $cond: [
                      { $gt: [{ $ifNull: ['$confirmedAmount', 0] }, 0] },
                      { $ifNull: ['$confirmedAmount', 0] },
                      { $ifNull: ['$totalAmount', 0] }
                    ]
                  },
                  { $subtract: [{ $ifNull: ['$totalAmount', 0] }, { $ifNull: ['$confirmedAmount', 0] }] }
                ]
              }
            }
          }
        }
      ];
      const results = await PaymentReceivable.aggregate(pipeline);
      const byKey = (key) => results.find(r => r._id === key) || { count: 0, amount: 0 };
      return {
        received: { count: byKey('received').count, amount: byKey('received').amount || 0 },
        'partially received': { count: byKey('partially received').count, amount: byKey('partially received').amount || 0 },
        outstanding: { count: byKey('outstanding').count, amount: byKey('outstanding').amount || 0 }
      };
    }

    const paymentMatchPayable = { ...basePaymentFilter, [payableDateField]: rangeMatch };
    const pipeline = [
      { $match: paymentMatchPayable },
      {
        $group: {
          _id: {
            $switch: {
              branches: [
                { case: { $eq: ['$status', 'paid'] }, then: 'paid' },
                { case: { $eq: ['$status', 'partially paid'] }, then: 'partially paid' }
              ],
              default: 'outstanding'
            }
          },
          count: { $sum: 1 },
          amount: {
            $sum: {
              $cond: [
                { $in: ['$status', ['paid', 'partially paid']] },
                {
                  $cond: [
                    { $gt: [{ $ifNull: ['$confirmedAmount', 0] }, 0] },
                    { $ifNull: ['$confirmedAmount', 0] },
                    { $ifNull: ['$totalAmount', 0] }
                  ]
                },
                { $subtract: [{ $ifNull: ['$totalAmount', 0] }, { $ifNull: ['$confirmedAmount', 0] }] }
              ]
            }
          }
        }
      }
    ];
    const results = await PaymentPayable.aggregate(pipeline);
    const byKey = (key) => results.find(r => r._id === key) || { count: 0, amount: 0 };
    return {
      paid: { count: byKey('paid').count, amount: byKey('paid').amount || 0 },
      'partially paid': { count: byKey('partially paid').count, amount: byKey('partially paid').amount || 0 },
      outstanding: { count: byKey('outstanding').count, amount: byKey('outstanding').amount || 0 }
    };
  }

  async getLiveProfitConfirmed(fromDate, toDate, entityType, entityId, grain, customerIdsForAggregate = null) {
    const dateKeys = this.getDateKeysForRange(fromDate, toDate, grain);
    if (dateKeys.length === 0) return { confirmedReceivable: 0, confirmedPayable: 0, totalProfit: 0 };
    const firstRange = grain === 'day' ? getDateRangeFromKey(dateKeys[0])
      : grain === 'week' ? getWeekRangeFromKey(dateKeys[0])
        : grain === 'month' ? getMonthRangeFromKey(dateKeys[0])
          : getYearRangeFromKey(dateKeys[0]);
    const lastRange = grain === 'day' ? getDateRangeFromKey(dateKeys[dateKeys.length - 1])
      : grain === 'week' ? getWeekRangeFromKey(dateKeys[dateKeys.length - 1])
        : grain === 'month' ? getMonthRangeFromKey(dateKeys[dateKeys.length - 1])
          : getYearRangeFromKey(dateKeys[dateKeys.length - 1]);
    if (!firstRange || !lastRange) return { confirmedReceivable: 0, confirmedPayable: 0, totalProfit: 0 };
    const rangeStart = firstRange.start;
    const rangeEnd = new Date(lastRange.end.getTime() + 1);

    const rangeMatchLive = { $exists: true, $ne: null, $gte: rangeStart, $lt: rangeEnd };
    const basePaymentFilterLive = {};
    if (entityType === 'customer') {
      if (Array.isArray(customerIdsForAggregate) && customerIdsForAggregate.length > 0) {
        basePaymentFilterLive.customer = { $in: customerIdsForAggregate.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id)) };
      } else {
        basePaymentFilterLive.customer = mongoose.Types.ObjectId.isValid(entityId) ? new mongoose.Types.ObjectId(entityId) : entityId;
      }
    } else if (entityType === 'carrier') {
      basePaymentFilterLive.carrier = mongoose.Types.ObjectId.isValid(entityId) ? new mongoose.Types.ObjectId(entityId) : entityId;
    } else if (entityType === 'user') {
      basePaymentFilterLive.createdBy = mongoose.Types.ObjectId.isValid(entityId) ? new mongoose.Types.ObjectId(entityId) : entityId;
    }
    const receivableMatchLive = { ...basePaymentFilterLive, [STATISTICS_DATE_SOURCES.PAYMENTS.RECEIVABLE_DATE]: rangeMatchLive };
    const payableMatchLive = { ...basePaymentFilterLive, [STATISTICS_DATE_SOURCES.PAYMENTS.PAYABLE_DATE]: rangeMatchLive };

    const recConfExpr = {
      $sum: {
        $cond: [
          { $in: ['$status', ['received', 'partially received']] },
          { $cond: [{ $gt: [{ $ifNull: ['$confirmedAmount', 0] }, 0] }, { $ifNull: ['$confirmedAmount', 0] }, { $ifNull: ['$totalAmount', 0] }] },
          0
        ]
      }
    };
    const payConfExpr = {
      $sum: {
        $cond: [
          { $in: ['$status', ['paid', 'partially paid']] },
          { $cond: [{ $gt: [{ $ifNull: ['$confirmedAmount', 0] }, 0] }, { $ifNull: ['$confirmedAmount', 0] }, { $ifNull: ['$totalAmount', 0] }] },
          0
        ]
      }
    };

    const [recRes, payRes] = await Promise.all([
      PaymentReceivable.aggregate([{ $match: receivableMatchLive }, { $group: { _id: null, confirmed: recConfExpr } }]),
      PaymentPayable.aggregate([{ $match: payableMatchLive }, { $group: { _id: null, confirmed: payConfExpr } }])
    ]);
    const confirmedReceivable = recRes[0]?.confirmed || 0;
    const confirmedPayable = payRes[0]?.confirmed || 0;
    const totalProfit = confirmedReceivable - confirmedPayable;
    return { confirmedReceivable, confirmedPayable, totalProfit };
  }

  /**
   * Фильтрует points по search (заглушка для будущей реализации)
   */
  filterPointsBySearch(points, search) {
    return points;
  }

  /**
   * GET /stats/export
   * Экспорт статистики в Excel
   */
  exportStats = async (req, res) => {
    try {
      const scope = await getStatsScope(req.user);
      
      if (!scope.allowedSections.includes('loads')) {
        return res.status(403).json({
          success: false,
          error: 'Access denied: no access to statistics export'
        });
      }

      const { from, to, grain = 'day', entityType: queryEntityType = 'system', entityId: queryEntityId, format = 'xlsx' } = req.query;

      if (!from || !to) {
        return res.status(400).json({
          success: false,
          error: 'from and to dates are required'
        });
      }

      const fromDate = new Date(from);
      const toDate = new Date(to);

      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid date format. Use ISO format (YYYY-MM-DD)'
        });
      }

      const scopeType = queryEntityType === 'system' ? 'global' : queryEntityType;
      const scopeId = queryEntityType === 'system' ? null : queryEntityId;
      const resolved = resolveStatsScopeForRequest(scope, scopeType, scopeId);
      const entityType = resolved.entityType;
      const entityId = resolved.entityId;
      const customerIdsForAggregate = resolved.customerIdsForAggregate || null;

      if (entityType == null) {
        return res.status(403).json({
          success: false,
          error: 'Access denied: statistics for this scope are not available for your role'
        });
      }
      if (!customerIdsForAggregate && !scope.allowedEntityTypes.includes(entityType)) {
        return res.status(403).json({
          success: false,
          error: `Access denied: entityType '${entityType}' not allowed`
        });
      }

      if (entityId && !await hasStatsEntityAccess(req.user, entityType, entityId)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this entity'
        });
      }

      const dateKeys = this.getDateKeysForRange(fromDate, toDate, grain);
      const exportUserId = req.user?._id?.toString?.() || req.user?._id;
      const snapshots = customerIdsForAggregate && customerIdsForAggregate.length > 0
        ? await this.getSnapshotsForDateKeys(dateKeys, grain, 'customer', null, customerIdsForAggregate, exportUserId)
        : await this.getSnapshotsForDateKeys(dateKeys, grain, entityType, entityId);

      if (format === 'xlsx') {
        const excelBuffer = await this.exportToExcel(snapshots, grain, entityType, entityId, fromDate, toDate);
        
        const filename = `stats_${entityType}_${entityId || 'system'}_${fromDate.toISOString().split('T')[0]}_${toDate.toISOString().split('T')[0]}.xlsx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(excelBuffer);
      } else {
        return res.status(400).json({
          success: false,
          error: 'Unsupported format. Use xlsx'
        });
      }
    } catch (error) {
      console.error('[StatsController] Error in exportStats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to export statistics',
        details: error.message
      });
    }
  };

  /**
   * Экспортирует snapshots в Excel
   * @param {Object[]} snapshots - Массив snapshots
   * @param {string} grain - 'day' | 'week' | 'month' | 'year'
   * @param {string} entityType - 'system' | 'customer' | 'carrier' | 'user'
   * @param {string|null} entityId - ID сущности или null
   * @param {Date} fromDate - Начальная дата
   * @param {Date} toDate - Конечная дата
   * @returns {Promise<Buffer>} Excel buffer
   */
  async exportToExcel(snapshots, grain, entityType, entityId, fromDate, toDate) {
    try {
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Statistics');

      worksheet.columns = [
        { header: 'Date/Period', key: 'dateKey', width: 15 },
        { header: 'Loads Total', key: 'loadsTotal', width: 12 },
        { header: 'Listed', key: 'listed', width: 10 },
        { header: 'Dispatched', key: 'dispatched', width: 12 },
        { header: 'Picked Up', key: 'pickedUp', width: 12 },
        { header: 'Delivered', key: 'delivered', width: 12 },
        { header: 'On Hold', key: 'onHold', width: 10 },
        { header: 'Cancelled', key: 'cancelled', width: 12 },
        { header: 'Expired', key: 'expired', width: 10 },
        { header: 'Receivable Total', key: 'receivableTotal', width: 16 },
        { header: 'Receivable Confirmed', key: 'receivableConfirmed', width: 20 },
        { header: 'Receivable Outstanding', key: 'receivableOutstanding', width: 22 },
        { header: 'Payable Total', key: 'payableTotal', width: 14 },
        { header: 'Payable Confirmed', key: 'payableConfirmed', width: 18 },
        { header: 'Payable Outstanding', key: 'payableOutstanding', width: 20 },
        { header: 'Profit Confirmed', key: 'profitConfirmed', width: 16 }
      ];

      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      snapshots.forEach(snapshot => {
        worksheet.addRow({
          dateKey: snapshot.dateKey,
          loadsTotal: snapshot.loads.total || 0,
          listed: snapshot.loads.byStatus.listed || 0,
          dispatched: snapshot.loads.byStatus.dispatched || 0,
          pickedUp: snapshot.loads.byStatus.pickedUp || 0,
          delivered: snapshot.loads.byStatus.delivered || 0,
          onHold: snapshot.loads.byStatus.onHold || 0,
          cancelled: snapshot.loads.byStatus.cancelled || 0,
          expired: snapshot.loads.byStatus.expired || 0,
          receivableTotal: snapshot.receivable.money.total || 0,
          receivableConfirmed: snapshot.receivable.money.confirmed || 0,
          receivableOutstanding: snapshot.receivable.money.outstanding || 0,
          payableTotal: snapshot.payable.money.total || 0,
          payableConfirmed: snapshot.payable.money.confirmed || 0,
          payableOutstanding: snapshot.payable.money.outstanding || 0,
          profitConfirmed: snapshot.finance.profitConfirmed || 0
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      return buffer;
    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND' && error.message.includes('exceljs')) {
        throw new Error('exceljs package is required for Excel export. Install it with: npm install exceljs');
      }
      throw error;
    }
  }

  getUsersByRole = async (req, res) => {
    try {
      const scope = await getStatsScope(req.user);
      if (!scope.allowedSections.includes('users')) {
        return res.status(403).json({
          success: false,
          error: 'Access denied: no access to users statistics'
        });
      }

      const results = await User.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ]);

      const byRole = {};
      let totalUsers = 0;
      results.forEach((r) => {
        if (r._id) {
          byRole[r._id] = r.count;
          totalUsers += r.count;
        }
      });

      res.status(200).json({
        success: true,
        data: {
          totalUsers,
          byRole
        }
      });
    } catch (error) {
      console.error('[StatsController] Error in getUsersByRole:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch users by role',
        details: error.message
      });
    }
  };

  getTopUsers = async (req, res) => {
    try {
      const scope = await getStatsScope(req.user);
      if (!scope.allowedSections.includes('loads')) {
        return res.status(403).json({
          success: false,
          error: 'Access denied: no access to loads statistics'
        });
      }

      const { from, to, limit = 5 } = req.query;
      if (!from || !to) {
        return res.status(400).json({
          success: false,
          error: 'from and to dates are required'
        });
      }

      const fromDate = new Date(from);
      const toDate = new Date(to);
      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid date format. Use ISO format (YYYY-MM-DD)'
        });
      }

      const fromStr = String(from).slice(0, 10);
      const toStr = String(to).slice(0, 10);
      const diffDays = Math.ceil((toDate - fromDate) / (24 * 60 * 60 * 1000));
      const grain = (fromStr === toStr || diffDays <= 93) ? 'day' : 'month';

      const pipeline = [
        {
          $match: {
            entityType: 'user',
            entityId: { $ne: null },
            grain,
            rangeStart: { $lte: toDate },
            rangeEnd: { $gte: fromDate }
          }
        },
        {
          $group: {
            _id: '$entityId',
            loadsCount: {
              $sum: {
                $add: [
                  { $ifNull: ['$loads.byStatus.dispatched', 0] },
                  { $ifNull: ['$loads.byStatus.pickedUp', 0] },
                  { $ifNull: ['$loads.byStatus.delivered', 0] },
                  { $ifNull: ['$loads.byStatus.onHold', 0] }
                ]
              }
            }
          }
        },
        { $match: { loadsCount: { $gt: 0 } } },
        { $sort: { loadsCount: -1 } },
        { $limit: Math.min(parseInt(limit, 10) || 5, 20) },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            userId: '$_id',
            loadsCount: 1,
            fullName: {
              $concat: [
                { $ifNull: ['$user.firstName', ''] },
                ' ',
                { $ifNull: ['$user.lastName', ''] }
              ]
            }
          }
        }
      ];

      const results = await StatsSnapshot.aggregate(pipeline);
      const data = results.map(r => ({
        userId: r.userId?.toString(),
        fullName: (r.fullName || '').trim() || 'Unknown',
        loadsCount: r.loadsCount || 0
      }));

      res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      console.error('[StatsController] Error in getTopUsers:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch top users',
        details: error.message
      });
    }
  };

  getCarriersSummary = async (req, res) => {
    try {
      const scope = await getStatsScope(req.user);
      if (!scope.allowedSections.includes('loads')) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const { from, to, limit = 7, scopeType, scopeId } = req.query;
      if (!from || !to) {
        return res.status(400).json({ success: false, error: 'from and to dates are required' });
      }

      const fromDate = new Date(from);
      const toDate = new Date(to);
      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        return res.status(400).json({ success: false, error: 'Invalid date format' });
      }

      const loadMatch = {
        createdAt: { $gte: fromDate, $lt: toDate },
        carrier: { $ne: null }
      };
      const entityType = scopeType === 'carrier' ? 'carrier' : scopeType === 'customer' ? 'customer' : scopeType === 'user' ? 'user' : null;
      if (entityType && scopeId && mongoose.Types.ObjectId.isValid(scopeId)) {
        if (!await hasStatsEntityAccess(req.user, entityType, scopeId)) {
          return res.status(403).json({ success: false, error: 'Access denied to this entity' });
        }
        const scopeObjId = new mongoose.Types.ObjectId(scopeId);
        if (scopeType === 'carrier') {
          loadMatch.carrier = scopeObjId;
        } else if (scopeType === 'customer') {
          loadMatch.customer = scopeObjId;
        } else if (scopeType === 'user') {
          loadMatch.createdBy = scopeObjId;
        }
      } else if (!entityType || !scopeId) {
        const customerIds = scope.allowedEntityIds?.customer;
        if (Array.isArray(customerIds) && customerIds.length > 0 && !scope.allowedEntityTypes.includes('system')) {
          const allowedIds = customerIds
            .filter((id) => mongoose.Types.ObjectId.isValid(id))
            .map((id) => new mongoose.Types.ObjectId(id));
          const currentUserId = req.user?._id && mongoose.Types.ObjectId.isValid(req.user._id) ? new mongoose.Types.ObjectId(req.user._id) : null;
          if (allowedIds.length > 0 || currentUserId) {
            const orClause = [];
            if (allowedIds.length > 0) orClause.push({ customer: { $in: allowedIds } });
            if (currentUserId) orClause.push({ createdBy: currentUserId });
            if (orClause.length > 0) loadMatch.$or = orClause;
          }
        }
      }

      let byEquipmentType = {};
      let totalCarriers = 0;
      if (scopeType === 'carrier' && scopeId && mongoose.Types.ObjectId.isValid(scopeId)) {
        const carrier = await Carrier.findById(scopeId).select('equipmentType').lean();
        if (carrier && carrier.equipmentType) {
          carrier.equipmentType.forEach((et) => {
            const key = et || 'Other';
            byEquipmentType[key] = (byEquipmentType[key] || 0) + 1;
          });
        }
        totalCarriers = carrier ? 1 : 0;
      } else {
        const carrierIdsFromLoads = await Load.distinct('carrier', loadMatch);
        const validCarrierIds = carrierIdsFromLoads.filter((id) => id && mongoose.Types.ObjectId.isValid(id));
        totalCarriers = validCarrierIds.length;
        if (validCarrierIds.length > 0) {
          const byEquipmentAgg = await Carrier.aggregate([
            { $match: { _id: { $in: validCarrierIds } } },
            { $unwind: '$equipmentType' },
            { $group: { _id: '$equipmentType', count: { $sum: 1 } } },
            { $project: { equipmentType: '$_id', count: 1, _id: 0 } }
          ]);
          byEquipmentAgg.forEach((item) => {
            const key = item.equipmentType || 'Other';
            byEquipmentType[key] = (byEquipmentType[key] || 0) + item.count;
          });
        }
        if (Object.keys(byEquipmentType).length === 0 && totalCarriers === 0) {
          const byEquipmentAgg = await Carrier.aggregate([
            { $unwind: '$equipmentType' },
            { $group: { _id: '$equipmentType', count: { $sum: 1 } } },
            { $project: { equipmentType: '$_id', count: 1, _id: 0 } }
          ]);
          byEquipmentAgg.forEach((item) => {
            const key = item.equipmentType || 'Other';
            byEquipmentType[key] = (byEquipmentType[key] || 0) + item.count;
          });
          totalCarriers = await Carrier.countDocuments();
        }
      }

      const topCarriersPipeline = [
        {
          $match: loadMatch
        },
        {
          $group: {
            _id: '$carrier',
            loadsCount: {
              $sum: {
                $cond: {
                  if: {
                    $in: [
                      '$status',
                      ['Dispatched', 'Picked Up', 'Delivered', 'On Hold']
                    ]
                  },
                  then: 1,
                  else: 0
                }
              }
            }
          }
        },
        { $match: { loadsCount: { $gt: 0 } } },
        { $sort: { loadsCount: -1 } },
        { $limit: Math.min(parseInt(limit, 10) || 7, 20) },
        {
          $lookup: {
            from: 'carriers',
            localField: '_id',
            foreignField: '_id',
            as: 'carrierDoc'
          }
        },
        { $unwind: { path: '$carrierDoc', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            carrierId: '$_id',
            loadsCount: 1,
            companyName: { $ifNull: ['$carrierDoc.companyName', '$carrierDoc.name'] }
          }
        }
      ];

      const topCarriers = await Load.aggregate(topCarriersPipeline);

      res.status(200).json({
        success: true,
        data: {
          summary: {
            totalCarriers,
            byEquipmentType
          },
          topCarriers: topCarriers.map((c) => ({
            carrierId: c.carrierId?.toString(),
            companyName: (c.companyName || '').trim() || 'Unknown',
            loadsCount: c.loadsCount || 0
          }))
        }
      });
    } catch (error) {
      console.error('[StatsController] Error in getCarriersSummary:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch carriers summary',
        details: error.message
      });
    }
  };

  getCustomersSummary = async (req, res) => {
    try {
      const scope = await getStatsScope(req.user);
      if (!scope.allowedSections.includes('loads')) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const { from, to, limit = 7, scopeType, scopeId } = req.query;
      if (!from || !to) {
        return res.status(400).json({ success: false, error: 'from and to dates are required' });
      }
      const fromDate = new Date(from);
      const toDate = new Date(to);
      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        return res.status(400).json({ success: false, error: 'Invalid date format' });
      }

      let customerFilter = {};
      if (scope.allowedEntityTypes.includes('customer') && (scope.allowedEntityIds?.customer || []).length > 0) {
        const allowedIds = scope.allowedEntityIds.customer
          .filter((id) => mongoose.Types.ObjectId.isValid(id))
          .map((id) => new mongoose.Types.ObjectId(id));
        if (allowedIds.length > 0) {
          customerFilter = { _id: { $in: allowedIds } };
        }
      }

      const loadMatch = {
        createdAt: { $gte: fromDate, $lt: toDate },
        customer: { $ne: null },
        status: { $in: ['Dispatched', 'Picked Up', 'Delivered', 'On Hold'] }
      };

      const entityType = scopeType === 'carrier' ? 'carrier' : scopeType === 'customer' ? 'customer' : scopeType === 'user' ? 'user' : null;
      if (entityType && scopeId && mongoose.Types.ObjectId.isValid(scopeId)) {
        if (!await hasStatsEntityAccess(req.user, entityType, scopeId)) {
          return res.status(403).json({ success: false, error: 'Access denied to this entity' });
        }
        const scopeObjId = new mongoose.Types.ObjectId(scopeId);
        if (scopeType === 'customer') {
          loadMatch.customer = scopeObjId;
          const allowedList = customerFilter._id?.$in;
          if (allowedList && !allowedList.some((id) => id.equals(scopeObjId))) {
            return res.status(403).json({ success: false, error: 'Access denied to this customer' });
          }
        } else if (scopeType === 'user') {
          loadMatch.createdBy = scopeObjId;
        } else if (scopeType === 'carrier') {
          loadMatch.carrier = scopeObjId;
        }
      } else if (Object.keys(customerFilter).length > 0) {
        const currentUserId = req.user?._id && mongoose.Types.ObjectId.isValid(req.user._id) ? new mongoose.Types.ObjectId(req.user._id) : null;
        const orClause = [{ customer: { $in: customerFilter._id.$in } }];
        if (currentUserId) orClause.push({ createdBy: currentUserId });
        loadMatch.$or = orClause;
      }

      let statusAgg;
      if (scopeType === 'customer' && scopeId && mongoose.Types.ObjectId.isValid(scopeId)) {
        const one = await Customer.findById(scopeId).select('status').lean();
        const s = one?.status || 'inactive';
        statusAgg = [{ _id: s, count: 1 }];
      } else if (scopeType === 'user' || scopeType === 'carrier') {
        const customerIdsFromLoads = await Load.distinct('customer', loadMatch);
        const validIds = customerIdsFromLoads.filter((id) => id && mongoose.Types.ObjectId.isValid(id));
        const matchFilter = validIds.length > 0 ? { _id: { $in: validIds } } : {};
        const combinedFilter = Object.keys(customerFilter).length > 0
          ? { $and: [customerFilter, matchFilter] }
          : matchFilter;
        statusAgg = await Customer.aggregate([
          { $match: combinedFilter },
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);
      } else {
        statusAgg = await Customer.aggregate([
          { $match: customerFilter },
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);
      }

      const active = statusAgg.find((s) => s._id === 'active')?.count ?? 0;
      const suspended = statusAgg.find((s) => s._id === 'suspended')?.count ?? 0;
      const inactive = statusAgg.find((s) => s._id === 'inactive')?.count ?? 0;
      const totalCustomers = active + suspended + inactive;

      const topCustomers = await Load.aggregate([
        { $match: loadMatch },
        { $group: { _id: '$customer', loadsCount: { $sum: 1 } } },
        { $sort: { loadsCount: -1 } },
        { $limit: Math.min(parseInt(limit, 10) || 7, 20) },
        {
          $lookup: {
            from: 'customers',
            localField: '_id',
            foreignField: '_id',
            as: 'customerDoc'
          }
        },
        { $unwind: { path: '$customerDoc', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            customerId: '$_id',
            loadsCount: 1,
            companyName: '$customerDoc.companyName'
          }
        }
      ]);

      res.status(200).json({
        success: true,
        data: {
          summary: {
            totalCustomers,
            active,
            suspended,
            inactive
          },
          topCustomers: topCustomers.map((c) => ({
            customerId: c.customerId?.toString(),
            companyName: (c.companyName || '').trim() || 'Unknown',
            loadsCount: c.loadsCount || 0
          }))
        }
      });
    } catch (error) {
      console.error('[StatsController] Error in getCustomersSummary:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch customers summary',
        details: error.message
      });
    }
  };
}

module.exports = new StatsController();
