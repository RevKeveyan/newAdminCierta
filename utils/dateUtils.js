/**
 * Date Utilities for UTC-5 (Eastern Time)
 * All dates in the system should be in UTC-5 regardless of server location
 * 
 * MongoDB stores dates in UTC. To store UTC-5 time:
 * - When saving: Create a Date object that represents UTC-5 time but is stored as UTC
 * - When reading: The date is already in UTC, we interpret it as UTC-5
 */

// Simple UTC-5 date utilities without external timezone libraries

/**
 * Get current date/time in UTC-5
 * Returns a Date object that when stored in MongoDB (UTC) represents UTC-5 time
 * @returns {Date} Current date adjusted for UTC-5
 */
function getCurrentDateUTC5() {
  // Get current UTC time
  const now = new Date();
  // To store UTC-5 time in MongoDB (which stores UTC):
  // We subtract 5 hours from UTC to get a date that represents UTC-5
  // When MongoDB stores it as UTC, it will effectively represent UTC-5 time
  const utc5OffsetMs = 5 * 60 * 60 * 1000; // 5 hours in milliseconds
  const utc5Time = new Date(now.getTime() - utc5OffsetMs);
  return utc5Time;
}

/**
 * Convert a date to UTC-5 representation for MongoDB storage
 * @param {Date|string} date - Date to convert
 * @returns {Date} Date adjusted for UTC-5 storage
 */
function toUTC5ForStorage(date) {
  if (!date) return null;
  const dateObj = date instanceof Date ? date : new Date(date);
  if (isNaN(dateObj.getTime())) return null;
  
  // Subtract 5 hours to represent UTC-5
  const utc5OffsetMs = 5 * 60 * 60 * 1000; // 5 hours in milliseconds
  return new Date(dateObj.getTime() - utc5OffsetMs);
}

/**
 * Convert MongoDB date (stored as UTC representing UTC-5) to UTC-5 Date object
 * @param {Date} mongoDate - Date from MongoDB
 * @returns {Date} Date representing UTC-5 time
 */
function fromMongoDBToUTC5(mongoDate) {
  if (!mongoDate) return null;
  const dateObj = mongoDate instanceof Date ? mongoDate : new Date(mongoDate);
  if (isNaN(dateObj.getTime())) return null;
  
  // MongoDB stores UTC, but we interpret it as UTC-5
  // So we add 5 hours to get the actual UTC-5 time
  const utc5OffsetMs = 5 * 60 * 60 * 1000; // 5 hours in milliseconds
  return new Date(dateObj.getTime() + utc5OffsetMs);
}

/**
 * Format date for display in UTC-5
 * @param {Date|string} date - Date to format
 * @param {string} format - Format type ('iso' or 'local')
 * @returns {string} Formatted date string in UTC-5
 */
function formatDateUTC5(date, format = 'iso') {
  if (!date) return null;
  const utc5Date = fromMongoDBToUTC5(date);
  if (!utc5Date) return null;
  
  if (format === 'iso') {
    // Format as ISO string with UTC-5 offset
    const year = utc5Date.getUTCFullYear();
    const month = String(utc5Date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(utc5Date.getUTCDate()).padStart(2, '0');
    const hours = String(utc5Date.getUTCHours()).padStart(2, '0');
    const minutes = String(utc5Date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(utc5Date.getUTCSeconds()).padStart(2, '0');
    const ms = String(utc5Date.getUTCMilliseconds()).padStart(3, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}-05:00`;
  }
  
  return utc5Date.toISOString();
}

/**
 * Create a date from UTC-5 time components
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @param {number} day - Day
 * @param {number} hour - Hour (0-23)
 * @param {number} minute - Minute (0-59)
 * @param {number} second - Second (0-59)
 * @returns {Date} Date object for MongoDB storage
 */
function createDateUTC5(year, month, day, hour = 0, minute = 0, second = 0) {
  // Create date string in UTC-5 format
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}-05:00`;
  const utc5Date = new Date(dateStr);
  // Convert to UTC for MongoDB storage (subtract 5 hours)
  const utc5OffsetMs = 5 * 60 * 60 * 1000;
  return new Date(utc5Date.getTime() - utc5OffsetMs);
}

/**
 * Get date for MongoDB that represents current UTC-5 time
 * @returns {Date} Date for MongoDB storage
 */
function getDateForMongoDB() {
  return getCurrentDateUTC5();
}

module.exports = {
  getCurrentDateUTC5,
  toUTC5ForStorage,
  fromMongoDBToUTC5,
  formatDateUTC5,
  createDateUTC5,
  getDateForMongoDB
};

