const { getCurrentDateUTC5 } = require('./dateUtils');

function startOfTodayGMT5() {
  const now = new Date();
  const utc5OffsetMs = 5 * 60 * 60 * 1000;
  const utc5Now = new Date(now.getTime() - utc5OffsetMs);
  const y = utc5Now.getUTCFullYear();
  const m = utc5Now.getUTCMonth();
  const d = utc5Now.getUTCDate();
  return new Date(Date.UTC(y, m, d, 5, 0, 0, 0));
}

function parseDeadline(deadlineString) {
  if (!deadlineString || typeof deadlineString !== 'string') {
    return null;
  }
  const trimmed = deadlineString.trim();
  if (trimmed === '') {
    return null;
  }
  try {
    const parsed = new Date(trimmed);
    if (isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
  } catch (error) {
    return null;
  }
}

function isExpiredListed(load) {
  if (!load || !load.dates || !load.dates.deadline) {
    return false;
  }
  if (load.status !== 'Listed') {
    return false;
  }
  const deadlineDate = parseDeadline(load.dates.deadline);
  if (!deadlineDate) {
    return false;
  }
  const todayStart = startOfTodayGMT5();
  return deadlineDate < todayStart;
}

module.exports = {
  parseDeadline,
  isExpiredListed,
  startOfTodayGMT5
};
