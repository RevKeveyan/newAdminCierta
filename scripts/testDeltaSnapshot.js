require('dotenv').config();
const mongoose = require('mongoose');
const { getDateRangeFromKey } = require('../utils/dateKeyUtils');
const { computeSnapshotFromDelta } = require('../services/statsWorker');

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'cierta_db';

async function main() {
  const args = process.argv.slice(2);
  const dateKeyArg = args.find(a => a.startsWith('--dateKey='));
  const entityTypeArg = args.find(a => a.startsWith('--entityType='));
  const entityIdArg = args.find(a => a.startsWith('--entityId='));

  const dateKey = dateKeyArg ? dateKeyArg.split('=')[1] : null;
  const entityType = entityTypeArg ? entityTypeArg.split('=')[1] : 'system';
  const entityId = entityIdArg ? entityIdArg.split('=')[1] : null;

  if (!dateKey) {
    console.error('Usage: node testDeltaSnapshot.js --dateKey=YYYY-MM-DD [--entityType=system|customer|carrier|user] [--entityId=ObjectId]');
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGO_URI, { dbName: MONGO_DB_NAME });
    const { start } = getDateRangeFromKey(dateKey);
    const rangeEnd = new Date(start);
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);

    const snapshot = await computeSnapshotFromDelta(start, rangeEnd, entityType, entityId);
    console.log(JSON.stringify({ dateKey, entityType, entityId, snapshot }, null, 2));
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main();
