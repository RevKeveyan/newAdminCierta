require("dotenv").config();
const mongoose = require("mongoose");
const StatsDailyDelta = require("../models/subModels/StatsDailyDelta");
const { getDateRangeFromKey } = require("../utils/dateKeyUtils");
const { computeSnapshot, upsertSnapshot } = require("../services/statsWorker");

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "cierta_db";

function parseArgs(args) {
  const result = {};
  for (const arg of args) {
    if (!arg.startsWith("--")) continue;
    const [key, ...rest] = arg.slice(2).split("=");
    result[key] = rest.length ? rest.join("=") : true;
  }
  return result;
}

function parseDateKey(dateKey) {
  if (typeof dateKey !== "string") return null;
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const d = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  if (isNaN(d.getTime())) return null;
  return d;
}

function formatDateKeyFromUTCDate(d) {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateKeysInRange(startDateKey, endDateKey) {
  const start = parseDateKey(startDateKey);
  const end = parseDateKey(endDateKey);
  if (!start || !end) return null;
  const days = [];
  const current = new Date(start);
  while (current <= end) {
    days.push(formatDateKeyFromUTCDate(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return days;
}

function normalizeEntityId(entityIdRaw) {
  if (entityIdRaw === undefined || entityIdRaw === null || entityIdRaw === "" || entityIdRaw === "null") return null;
  if (typeof entityIdRaw !== "string") return entityIdRaw;
  const trimmed = entityIdRaw.trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return null;
  return trimmed;
}

function getZeroState() {
  return { listed: 0, dispatched: 0, pickedUp: 0, delivered: 0, onHold: 0, cancelled: 0, expired: 0 };
}

function getZeroEvents() {
  return { created: 0, dispatched: 0, pickedUp: 0, delivered: 0, onHold: 0, cancelled: 0 };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const startDateKey = args.start;
  const endDateKey = args.end;
  const entityType = args.entityType || "system";
  const entityId = normalizeEntityId(args.entityId);
  const dryRun = Boolean(args["dry-run"] || args.dryRun);

  if (!MONGO_URI) {
    console.error("Missing MONGO_URI");
    process.exit(1);
  }
  if (!startDateKey || !endDateKey) {
    console.error("Usage: node server/scripts/rebuild_stats_daily_deltas_from_snapshots.js --start=YYYY-MM-DD --end=YYYY-MM-DD [--entityType=system] [--entityId=null] [--dry-run]");
    process.exit(1);
  }

  const dateKeys = getDateKeysInRange(startDateKey, endDateKey);
  if (!dateKeys || dateKeys.length === 0) {
    console.error("Invalid date range");
    process.exit(1);
  }

  const entityIdNorm = entityId && mongoose.Types.ObjectId.isValid(entityId) ? new mongoose.Types.ObjectId(entityId) : null;

  await mongoose.connect(MONGO_URI, { dbName: MONGO_DB_NAME });

  const prevStart = parseDateKey(startDateKey);
  prevStart.setUTCDate(prevStart.getUTCDate() - 1);
  const prevStartDateKey = formatDateKeyFromUTCDate(prevStart);

  const snapshotDateKeys = Array.from(new Set([prevStartDateKey, ...dateKeys]));
  const snapshotMap = new Map();

  const stateKeys = ["listed", "dispatched", "pickedUp", "delivered", "onHold", "cancelled", "expired"];
  const eventKeys = ["created", "dispatched", "pickedUp", "delivered", "onHold", "cancelled"];

  if (!dryRun) {
    await StatsDailyDelta.deleteMany({
      dateKey: { $in: dateKeys },
      entityType,
      entityId: entityIdNorm
    });
  }

  for (const dateKey of snapshotDateKeys) {
    const range = getDateRangeFromKey(dateKey);
    const rangeStart = range.start;
    const rangeEnd = new Date(range.end.getTime() + 1);
    const snapshotData = await computeSnapshot(rangeStart, rangeEnd, entityType, entityIdNorm);

    snapshotMap.set(dateKey, {
      dateKey,
      loadsState: { ...getZeroState(), ...(snapshotData.loadsState || {}) },
      loadsEvents: { ...getZeroEvents(), ...(snapshotData.loadsEvents || {}) }
    });

    if (!dryRun) {
      await upsertSnapshot("day", dateKey, rangeStart, range.end, entityType, entityIdNorm, snapshotData);
    }
  }

  for (const dateKey of dateKeys) {
    const rangeStart = getDateRangeFromKey(dateKey).start;
    const rangeEnd = new Date(rangeStart);
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
    const currSnapshot = snapshotMap.get(dateKey);
    const prevDateKey = (() => {
      const d = parseDateKey(dateKey);
      d.setUTCDate(d.getUTCDate() - 1);
      return formatDateKeyFromUTCDate(d);
    })();
    const prevSnapshot = snapshotMap.get(prevDateKey);

    const prevState = prevSnapshot && prevSnapshot.loadsState ? { ...getZeroState(), ...prevSnapshot.loadsState } : getZeroState();
    const currState = currSnapshot && currSnapshot.loadsState ? { ...getZeroState(), ...currSnapshot.loadsState } : getZeroState();

    const loadsStateDelta = getZeroState();
    for (const key of stateKeys) {
      loadsStateDelta[key] = Number(currState[key] || 0) - Number(prevState[key] || 0);
    }

    const currEvents = currSnapshot && currSnapshot.loadsEvents ? currSnapshot.loadsEvents : {};
    const loadsEventsDelta = getZeroEvents();
    for (const key of eventKeys) loadsEventsDelta[key] = Number(currEvents[key] || 0);

    if (dryRun) continue;

    await StatsDailyDelta.updateOne(
      { dateKey, entityType, entityId: entityIdNorm },
      {
        $set: {
          dateKey,
          rangeStart,
          rangeEnd,
          entityType,
          entityId: entityIdNorm,
          loadsStateDelta,
          loadsEventsDelta
        }
      },
      { upsert: true }
    );
  }

  await mongoose.disconnect();
  console.log(dryRun ? "Dry run completed" : "Rebuild completed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

