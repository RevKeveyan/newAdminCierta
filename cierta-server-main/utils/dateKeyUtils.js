/**
 * Date Key Utilities
 * Generate date keys in UTC-5 timezone for statistics
 */

const { getCurrentDateUTC5, fromMongoDBToUTC5 } = require('./dateUtils');

/**
 * Get current date in UTC-5 (re-export from dateUtils)
 * @returns {Date} - Current date in UTC-5
 */
function getCurrentDateUTC5ForKeys() {
  return getCurrentDateUTC5();
}

/**
 * Format date as YYYY-MM-DD in UTC-5
 * @param {Date} date - Date to format (defaults to now)
 * @returns {string} - Date key in format YYYY-MM-DD
 */
function getDateKeyUTC5(date = null) {
  const d = date ? fromMongoDBToUTC5(date) : fromMongoDBToUTC5(getCurrentDateUTC5());
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format date as YYYY-MM in UTC-5
 * @param {Date} date - Date to format (defaults to now)
 * @returns {string} - Month key in format YYYY-MM
 */
function getMonthKeyUTC5(date = null) {
  const d = date ? fromMongoDBToUTC5(date) : fromMongoDBToUTC5(getCurrentDateUTC5());
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Get start of day in UTC-5
 * @param {Date} date - Date (defaults to now)
 * @returns {Date} - Start of day in UTC-5 (for MongoDB storage)
 */
function getStartOfDayUTC5(date = null) {
  const { toUTC5ForStorage } = require('./dateUtils');
  const d = date ? fromMongoDBToUTC5(date) : fromMongoDBToUTC5(getCurrentDateUTC5());
  d.setUTCHours(0, 0, 0, 0);
  return toUTC5ForStorage(d);
}

/**
 * Get end of day in UTC-5
 * @param {Date} date - Date (defaults to now)
 * @returns {Date} - End of day in UTC-5 (for MongoDB storage)
 */
function getEndOfDayUTC5(date = null) {
  const { toUTC5ForStorage } = require('./dateUtils');
  const d = date ? fromMongoDBToUTC5(date) : fromMongoDBToUTC5(getCurrentDateUTC5());
  d.setUTCHours(23, 59, 59, 999);
  return toUTC5ForStorage(d);
}

/**
 * Get date range for a date key
 * @param {string} dateKey - Date key in format YYYY-MM-DD
 * @returns {Object} - { start, end } dates in UTC-5 (for MongoDB storage)
 */
function getDateRangeFromKey(dateKey) {
  const { toUTC5ForStorage } = require('./dateUtils');
  const [year, month, day] = dateKey.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  return {
    start: toUTC5ForStorage(start),
    end: toUTC5ForStorage(end)
  };
}

/**
 * Get date range for a month key
 * @param {string} monthKey - Month key in format YYYY-MM
 * @returns {Object} - { start, end } dates in UTC-5 (for MongoDB storage)
 */
function getMonthRangeFromKey(monthKey) {
  const { toUTC5ForStorage } = require('./dateUtils');
  const [year, month] = monthKey.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return {
    start: toUTC5ForStorage(start),
    end: toUTC5ForStorage(end)
  };
}

function getISOWeekUTC5(date = null) {
  const d = date ? fromMongoDBToUTC5(date) : fromMongoDBToUTC5(getCurrentDateUTC5());
  const dayOfWeek = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week: weekNo };
}

function getWeekKeyUTC5(date = null) {
  const { year, week } = getISOWeekUTC5(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function getWeekRangeFromKey(weekKey) {
  const { toUTC5ForStorage } = require('./dateUtils');
  const match = weekKey.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return null;
  const [, yearStr, weekStr] = match;
  const year = parseInt(yearStr, 10);
  const week = parseInt(weekStr, 10);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1);
  const start = new Date(monday);
  start.setUTCDate(monday.getUTCDate() + (week - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return {
    start: toUTC5ForStorage(start),
    end: toUTC5ForStorage(end)
  };
}

function getYearKeyUTC5(date = null) {
  const d = date ? fromMongoDBToUTC5(date) : fromMongoDBToUTC5(getCurrentDateUTC5());
  return String(d.getUTCFullYear());
}

function getYearRangeFromKey(yearKey) {
  const { toUTC5ForStorage } = require('./dateUtils');
  const year = parseInt(String(yearKey), 10);
  if (isNaN(year)) return null;
  const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  return {
    start: toUTC5ForStorage(start),
    end: toUTC5ForStorage(end)
  };
}

function getDayBounds(date = null) {
  const periodKey = getDateKeyUTC5(date);
  const { start, end } = getDateRangeFromKey(periodKey);
  return { start, end, periodKey };
}

function getWeekBounds(date = null) {
  const periodKey = getWeekKeyUTC5(date);
  const range = getWeekRangeFromKey(periodKey);
  if (!range) return null;
  return { start: range.start, end: range.end, periodKey };
}

function getMonthBounds(date = null) {
  const periodKey = getMonthKeyUTC5(date);
  const { start, end } = getMonthRangeFromKey(periodKey);
  return { start, end, periodKey };
}

function getYearBounds(date = null) {
  const periodKey = getYearKeyUTC5(date);
  const range = getYearRangeFromKey(periodKey);
  if (!range) return null;
  return { start: range.start, end: range.end, periodKey };
}

function getDaysInRange(start, end) {
  const days = [];
  const current = new Date(start);
  current.setUTCHours(0, 0, 0, 0);
  const endDate = new Date(end);
  endDate.setUTCHours(23, 59, 59, 999);
  
  while (current <= endDate) {
    days.push(getDateKeyUTC5(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  
  return days;
}

module.exports = {
  getCurrentDateUTC5: getCurrentDateUTC5ForKeys,
  getDateKeyUTC5,
  getMonthKeyUTC5,
  getWeekKeyUTC5,
  getYearKeyUTC5,
  getStartOfDayUTC5,
  getEndOfDayUTC5,
  getDateRangeFromKey,
  getMonthRangeFromKey,
  getWeekRangeFromKey,
  getYearRangeFromKey,
  getDaysInRange,
  getISOWeekUTC5,
  getDayBounds,
  getWeekBounds,
  getMonthBounds,
  getYearBounds
};
