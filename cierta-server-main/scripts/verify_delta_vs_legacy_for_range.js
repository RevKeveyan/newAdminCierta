require("dotenv").config();
const mongoose = require("mongoose");
const { computeSnapshot, computeSnapshotFromDelta } = require("../services/statsWorker");
const { getDateRangeFromKey } = require("../utils/dateKeyUtils");

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

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const startDateKey = args.start;
  const endDateKey = args.end;
  const entityType = args.entityType || "system";
  const entityId = normalizeEntityId(args.entityId);

  if (!MONGO_URI) {
    console.error("Missing MONGO_URI");
    process.exit(1);
  }
  if (!startDateKey || !endDateKey) {
    console.error("Usage: node server/scripts/verify_delta_vs_legacy_for_range.js --start=YYYY-MM-DD --end=YYYY-MM-DD [--entityType=system] [--entityId=null]");
    process.exit(1);
  }

  const dateKeys = getDateKeysInRange(startDateKey, endDateKey);
  if (!dateKeys || dateKeys.length === 0) {
    console.error("Invalid date range");
    process.exit(1);
  }

  const entityIdNorm = entityId && mongoose.Types.ObjectId.isValid(entityId) ? new mongoose.Types.ObjectId(entityId) : null;

  await mongoose.connect(MONGO_URI, { dbName: MONGO_DB_NAME });

  const statusKeys = ["listed", "dispatched", "pickedUp", "delivered", "onHold", "cancelled", "expired"];

  let mismatchCount = 0;

  for (const dateKey of dateKeys) {
    const rangeStart = getDateRangeFromKey(dateKey).start;
    const rangeEndExclusive = new Date(rangeStart);
    rangeEndExclusive.setUTCDate(rangeEndExclusive.getUTCDate() + 1);

    const [legacySnapshot, deltaSnapshot] = await Promise.all([
      computeSnapshot(rangeStart, rangeEndExclusive, entityType, entityIdNorm),
      computeSnapshotFromDelta(rangeStart, rangeEndExclusive, entityType, entityIdNorm)
    ]);

    const legacyLoads = legacySnapshot.loads;
    const deltaLoads = deltaSnapshot.loads;

    const legacyTotal = legacyLoads?.total || 0;
    const deltaTotal = deltaLoads?.total || 0;

    let statusMismatch = false;
    for (const key of statusKeys) {
      const l = legacyLoads?.byStatus?.[key] ?? 0;
      const d = deltaLoads?.byStatus?.[key] ?? 0;
      if (Number(l) !== Number(d)) {
        statusMismatch = true;
        break;
      }
    }

    const totalMismatch = Number(legacyTotal) !== Number(deltaTotal);

    if (statusMismatch || totalMismatch) {
      mismatchCount++;
      console.log(`Mismatch for ${dateKey}`);
      console.log(JSON.stringify({
        legacyTotal,
        deltaTotal,
        legacyByStatus: legacyLoads.byStatus,
        deltaByStatus: deltaLoads.byStatus
      }, null, 2));
    }
  }

  await mongoose.disconnect();

  if (mismatchCount > 0) {
    console.error(`Verification failed. Mismatches: ${mismatchCount}`);
    process.exit(1);
  }

  console.log("Verification passed: delta matches legacy for all days in range");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

