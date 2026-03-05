/**
 * Utility for computing differences between two objects
 * Used for audit logging in Load history
 */

/**
 * Get value by path (supports nested objects)
 * @param {Object} obj - Object to traverse
 * @param {String} path - Dot-separated path (e.g., "pickup.city")
 * @returns {*} Value at path or undefined
 */
function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  
  return path.split('.').reduce((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return acc[key];
  }, obj);
}

/**
 * Deep equality check for objects/arrays/primitives
 * @param {*} a - First value
 * @param {*} b - Second value
 * @returns {Boolean} True if equal
 */
function isEqual(a, b) {
  // Handle null/undefined
  if (a === null || a === undefined) {
    return b === null || b === undefined;
  }
  if (b === null || b === undefined) {
    return false;
  }

  // Handle primitives
  if (typeof a !== 'object' || typeof b !== 'object') {
    return a === b;
  }

  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return JSON.stringify(a) === JSON.stringify(b);
  }

  // Handle objects - use JSON.stringify for deep comparison
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (e) {
    // Fallback for circular references or non-serializable values
    return a === b;
  }
}

/**
 * Build changes array by comparing before and after objects
 * Only tracks changes for fields in the whitelist
 * 
 * @param {Object} before - Object before changes
 * @param {Object} after - Object after changes
 * @param {Array<String>} allowedFields - Whitelist of fields to track (supports dot notation)
 * @returns {Array<{field: String, from: *, to: *}>} Array of changes
 */
function buildChanges(before, after, allowedFields = []) {
  if (!before || !after) {
    return [];
  }

  const changes = [];

  // Fields to always ignore
  const ignoredFields = ['updatedAt', '__v', '_id'];

  for (const field of allowedFields) {
    // Skip ignored fields
    if (ignoredFields.includes(field)) {
      continue;
    }

    const from = getByPath(before, field);
    const to = getByPath(after, field);

    // Only log if values are different
    if (!isEqual(from, to)) {
      changes.push({
        field,
        from: from !== undefined ? from : null,
        to: to !== undefined ? to : null
      });
    }
  }

  return changes;
}

/**
 * Get all changed fields between two objects (without whitelist)
 * Useful for debugging or full audit
 * 
 * @param {Object} before - Object before changes
 * @param {Object} after - Object after changes
 * @param {Array<String>} ignoredFields - Fields to ignore
 * @returns {Array<{field: String, from: *, to: *}>} Array of changes
 */
function getAllChanges(before, after, ignoredFields = ['updatedAt', '__v', '_id', 'createdAt']) {
  if (!before || !after) {
    return [];
  }

  const changes = [];
  const allKeys = new Set([
    ...Object.keys(before),
    ...Object.keys(after)
  ]);

  for (const key of allKeys) {
    if (ignoredFields.includes(key)) {
      continue;
    }

    const from = before[key];
    const to = after[key];

    if (!isEqual(from, to)) {
      changes.push({
        field: key,
        from: from !== undefined ? from : null,
        to: to !== undefined ? to : null
      });
    }
  }

  return changes;
}

module.exports = {
  buildChanges,
  getAllChanges,
  getByPath,
  isEqual
};


