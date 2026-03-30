const mongoose = require("mongoose");
const StatsDailyDelta = require("../models/subModels/StatsDailyDelta");
const { getDateKeyUTC5, getStartOfDayUTC5 } = require("./dateKeyUtils");
const { STATISTICS_DATE_SOURCES } = require("../config/statisticsDateConstants");

function buildIncPaths(prefix, delta) {
  const inc = {};
  if (!delta) return inc;
  Object.entries(delta).forEach(([key, value]) => {
    const num = Number(value) || 0;
    if (num !== 0) {
      inc[`${prefix}.${key}`] = num;
    }
  });
  return inc;
}

async function upsertStatsDailyDelta({ date, entityType, entityId, stateDelta = {}, eventsDelta = {} }) {
  if (!date || !entityType) return;

  const dateObj = date instanceof Date ? date : new Date(date);
  if (isNaN(dateObj.getTime())) return;

  const dateKey = getDateKeyUTC5(dateObj);
  const rangeStart = getStartOfDayUTC5(dateObj);
  const nextDay = new Date(rangeStart);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const rangeEnd = getStartOfDayUTC5(nextDay);

  const entityIdObj = entityId
    ? mongoose.Types.ObjectId.isValid(entityId)
      ? new mongoose.Types.ObjectId(entityId)
      : entityId
    : null;

  const inc = {
    ...buildIncPaths("loadsStateDelta", stateDelta),
    ...buildIncPaths("loadsEventsDelta", eventsDelta)
  };

  if (Object.keys(inc).length === 0) return;

  const filter = {
    dateKey,
    entityType,
    entityId: entityIdObj || null
  };

  const update = {
    $setOnInsert: {
      dateKey,
      rangeStart,
      rangeEnd,
      entityType,
      entityId: entityIdObj || null
    },
    $inc: inc
  };

  try {
    await StatsDailyDelta.updateOne(filter, update, { upsert: true });
  } catch (error) {
    console.error("[statsDelta] Failed to upsert StatsDailyDelta:", error);
  }
}

function normalizeStatus(statusRaw) {
  if (!statusRaw || typeof statusRaw !== "string") return null;
  const s = statusRaw.trim();
  const map = {
    Listed: "listed",
    Dispatched: "dispatched",
    "Picked Up": "pickedUp",
    Delivered: "delivered",
    "On Hold": "onHold",
    Cancelled: "cancelled"
  };
  if (map[s]) return map[s];
  const lower = s.toLowerCase();
  if (lower === "picked up" || lower === "pickedup") return "pickedUp";
  if (lower === "on hold" || lower === "onhold") return "onHold";
  if (lower === "canceled") return "cancelled";
  if (lower === "listed" || lower === "dispatched" || lower === "delivered") return lower;
  return null;
}

function collectEntities(oldLoad, newLoad) {
  const entities = [{ entityType: "system", entityId: null }];

  const push = (type, id) => {
    if (!id) return;
    entities.push({ entityType: type, entityId: id });
  };

  const ol = oldLoad || {};
  const nl = newLoad || {};

  push("customer", ol.customer);
  push("carrier", ol.carrier);
  push("user", ol.createdBy);

  push("customer", nl.customer);
  push("carrier", nl.carrier);
  push("user", nl.createdBy);

  const unique = new Map();
  entities.forEach((e) => {
    const idStr =
      e.entityId && e.entityId.toString ? e.entityId.toString() : String(e.entityId || "");
    const key = `${e.entityType}:${idStr || "null"}`;
    if (!unique.has(key)) unique.set(key, e);
  });

  return Array.from(unique.values());
}

function getLoadDate(load, key) {
  if (!load) return null;
  if (key === "createdAt") return load.createdAt || null;
  if (!load.dates) return null;
  if (key === "pickupAt") return load.dates.pickupAt || null;
  if (key === "deliveryAt") return load.dates.deliveryAt || null;
  return null;
}

function getLegacyDateForStatusKey(load, statusKey) {
  if (!load || !statusKey) return null;
  if (statusKey === "delivered") return getLoadDate(load, "deliveryAt");
  if (statusKey === "pickedUp") return getLoadDate(load, "pickupAt");
  return getLoadDate(load, "createdAt");
}

async function registerLoadStatsDelta(oldLoad, newLoad) {
  try {
    if (!oldLoad && !newLoad) return;

    const entities = collectEntities(oldLoad, newLoad);
    if (!entities.length) return;

    const ol = oldLoad || {};
    const nl = newLoad || {};

    const oldStatus = normalizeStatus(ol.status);
    const newStatus = normalizeStatus(nl.status);

    const isCreate = !oldLoad && !!newLoad;
    const isDelete = !!oldLoad && !newLoad;
    const isUpdate = !!oldLoad && !!newLoad;

    const stateDeltasByDate = new Map();
    const eventsDeltasByDate = new Map();

    const addDelta = (date, stateDelta, eventsDelta) => {
      if (!date) return;
      const d = date instanceof Date ? date : new Date(date);
      if (isNaN(d.getTime())) return;
      const key = d.toISOString();
      if (!stateDeltasByDate.has(key)) stateDeltasByDate.set(key, {});
      if (!eventsDeltasByDate.has(key)) eventsDeltasByDate.set(key, {});
      const s = stateDeltasByDate.get(key);
      const e = eventsDeltasByDate.get(key);
      if (stateDelta) {
        Object.entries(stateDelta).forEach(([k, v]) => {
          s[k] = (s[k] || 0) + (v || 0);
        });
      }
      if (eventsDelta) {
        Object.entries(eventsDelta).forEach(([k, v]) => {
          e[k] = (e[k] || 0) + (v || 0);
        });
      }
    };

    if (isCreate && newStatus) {
      const createdAt = getLoadDate(nl, "createdAt") || new Date();
      const stateDate =
        getLegacyDateForStatusKey(nl, newStatus) ||
        getLoadDate(nl, "createdAt") ||
        new Date();

      addDelta(stateDate, { [newStatus]: 1 }, null);
      addDelta(createdAt, null, { created: 1 });
    }

    if (isUpdate && oldStatus && newStatus && oldStatus !== newStatus) {
      const oldStateDate =
        getLegacyDateForStatusKey(ol, oldStatus) ||
        getLoadDate(ol, "createdAt") ||
        new Date();
      const newStateDate =
        getLegacyDateForStatusKey(nl, newStatus) ||
        getLoadDate(nl, "createdAt") ||
        new Date();

      addDelta(oldStateDate, { [oldStatus]: -1 }, null);
      addDelta(newStateDate, { [newStatus]: 1 }, null);

      if (oldStatus === "listed" && newStatus === "dispatched") {
        const when = nl.updatedAt || new Date();
        addDelta(when, null, { dispatched: 1 });
      } else if (oldStatus === "dispatched" && newStatus === "pickedUp") {
        const when =
          getLoadDate(nl, "pickupAt") ||
          getLoadDate(ol, "pickupAt") ||
          nl.updatedAt ||
          new Date();
        addDelta(when, null, { pickedUp: 1 });
      } else if (oldStatus === "listed" && newStatus === "pickedUp") {
        const when =
          getLoadDate(nl, "pickupAt") ||
          getLoadDate(ol, "pickupAt") ||
          nl.updatedAt ||
          new Date();
        addDelta(when, null, { pickedUp: 1 });
      } else if (oldStatus === "pickedUp" && newStatus === "delivered") {
        const when =
          getLoadDate(nl, "deliveryAt") ||
          getLoadDate(ol, "deliveryAt") ||
          nl.updatedAt ||
          new Date();
        addDelta(when, null, { delivered: 1 });
      }
    }

    if (isDelete) {
      // На первом этапе delete оставляем на legacy dirty/recompute логике
    }

    if (stateDeltasByDate.size === 0 && eventsDeltasByDate.size === 0) {
      return;
    }

    const upsertPromises = [];
    for (const [iso, stateDelta] of stateDeltasByDate.entries()) {
      const eventsDelta = eventsDeltasByDate.get(iso) || {};
      const date = new Date(iso);
      entities.forEach((e) => {
        upsertPromises.push(
          upsertStatsDailyDelta({
            date,
            entityType: e.entityType,
            entityId: e.entityId,
            stateDelta,
            eventsDelta
          })
        );
      });
    }

    if (upsertPromises.length > 0) {
      await Promise.all(upsertPromises);
    }
  } catch (error) {
    console.error("[statsDelta] Failed to register load stats delta:", error);
  }
}

module.exports = {
  registerLoadStatsDelta
};

