/**
 * Money Utilities
 * Safe parsing of money strings to numbers
 * Consistent with UTC-5 timezone business logic
 */

/**
 * Safely parse money string to number
 * Handles empty strings, null, undefined, invalid formats
 * @param {string|number|null|undefined} value - Money value to parse
 * @returns {number} - Parsed number, 0 if invalid
 */
function toMoneyNumber(value) {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === 'number') {
    return isNaN(value) ? 0 : value;
  }

  if (typeof value !== 'string') {
    return 0;
  }

  // Trim and check for empty
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === 'undefined' || trimmed === 'null') {
    return 0;
  }

  // Remove currency symbols and commas
  const cleaned = trimmed.replace(/[$,\s]/g, '');

  // Parse as float
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Calculate Revenue (CustomerTotal) for a Load
 * Revenue = customerRate + sum(fees[].customerRate) + (tonu.enabled ? tonu.customerRate : 0)
 * @param {Object} load - Load document
 * @returns {number} - Total revenue
 */
function calculateRevenue(load) {
  let revenue = 0;

  // Add customerRate
  revenue += toMoneyNumber(load.customerRate);

  // Add fees customerRate
  if (Array.isArray(load.fees)) {
    load.fees.forEach(fee => {
      if (fee && fee.customerRate) {
        revenue += toMoneyNumber(fee.customerRate);
      }
    });
  }

  // Add tonu customerRate if enabled
  if (load.tonu && load.tonu.enabled && load.tonu.customerRate) {
    revenue += toMoneyNumber(load.tonu.customerRate);
  }

  return revenue;
}

/**
 * Calculate Expense (CarrierTotal) for a Load
 * Expense = carrierRate + sum(fees[].carrierRate) + (tonu.enabled ? tonu.carrierRate : 0)
 * @param {Object} load - Load document
 * @returns {number} - Total expense
 */
function calculateExpense(load) {
  let expense = 0;

  // Add carrierRate
  expense += toMoneyNumber(load.carrierRate);

  // Add fees carrierRate
  if (Array.isArray(load.fees)) {
    load.fees.forEach(fee => {
      if (fee && fee.carrierRate) {
        expense += toMoneyNumber(fee.carrierRate);
      }
    });
  }

  // Add tonu carrierRate if enabled
  if (load.tonu && load.tonu.enabled && load.tonu.carrierRate) {
    expense += toMoneyNumber(load.tonu.carrierRate);
  }

  return expense;
}

/**
 * Calculate Profit for a Load
 * Profit = Revenue - Expense
 * @param {Object} load - Load document
 * @returns {number} - Profit
 */
function calculateProfit(load) {
  const revenue = calculateRevenue(load);
  const expense = calculateExpense(load);
  return revenue - expense;
}

/**
 * Calculate Margin percentage
 * Margin = (Profit / Revenue) * 100
 * @param {Object} load - Load document
 * @returns {number} - Margin percentage, 0 if revenue is 0
 */
function calculateMargin(load) {
  const revenue = calculateRevenue(load);
  if (revenue === 0) return 0;
  const profit = calculateProfit(load);
  return (profit / revenue) * 100;
}

module.exports = {
  toMoneyNumber,
  calculateRevenue,
  calculateExpense,
  calculateProfit,
  calculateMargin
};
