const { getISOWeekUTC5 } = require('./dateKeyUtils');

function getMonthKeyFromDay(dayKey) {
  if (!dayKey || typeof dayKey !== 'string') {
    return null;
  }
  
  const parts = dayKey.split('-');
  if (parts.length < 2) {
    return null;
  }
  
  return `${parts[0]}-${parts[1]}`;
}

function getISOWeekKeyFromDay(dayKey) {
  if (!dayKey || typeof dayKey !== 'string') {
    return null;
  }
  
  const parts = dayKey.split('-');
  if (parts.length < 3) {
    return null;
  }
  
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    return null;
  }
  
  const date = new Date(Date.UTC(year, month, day));
  const { year: isoYear, week: isoWeek } = getISOWeekUTC5(date);
  
  return `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;
}

function getYearKeyFromDay(dayKey) {
  if (!dayKey || typeof dayKey !== 'string') {
    return null;
  }
  
  const parts = dayKey.split('-');
  if (parts.length < 1) {
    return null;
  }
  
  return parts[0];
}

function getPeriodKeysFromDay(dayKey) {
  return {
    day: dayKey,
    week: getISOWeekKeyFromDay(dayKey),
    month: getMonthKeyFromDay(dayKey),
    year: getYearKeyFromDay(dayKey)
  };
}

module.exports = {
  getMonthKeyFromDay,
  getISOWeekKeyFromDay,
  getYearKeyFromDay,
  getPeriodKeysFromDay
};
