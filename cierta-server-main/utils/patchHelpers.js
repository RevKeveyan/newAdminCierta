/**
 * Professional PATCH helpers for safe Load updates
 * Implements deep merge for nested objects and proper array handling
 */

/**
 * Deep merge two objects, with patch values taking precedence
 * Arrays are replaced (not merged) unless special handling needed
 */
function deepMerge(target, source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return source; // Replace primitives and arrays
  }

  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    return source; // Replace if target is not object
  }

  const merged = { ...target };

  // CRITICAL: Only merge fields that are PRESENT in source (patch)
  // This ensures fields not in patch are NOT overwritten
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      const sourceValue = source[key];
      const targetValue = target[key];

      // Skip if sourceValue is undefined (field not in patch)
      if (sourceValue === undefined) {
        continue; // Keep target value, don't overwrite
      }

      if (
        sourceValue !== null &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue !== null &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        // Both are objects -> deep merge
        merged[key] = deepMerge(targetValue, sourceValue);
      } else {
        // Replace: primitives, arrays, null, or one is not object
        merged[key] = sourceValue;
      }
    }
  }

  return merged;
}

/**
 * Deep merge patch into old document for nested objects
 * Nested objects: pickup, delivery, dates, insurance, vehicle, freight
 */
function deepMergePatch(oldDoc, patch) {
  const merged = { ...oldDoc.toObject ? oldDoc.toObject() : oldDoc };

  // Fields that require deep merge
  const nestedFields = ['pickup', 'delivery', 'dates', 'insurance', 'vehicle', 'freight'];

  for (const key in patch) {
    if (!patch.hasOwnProperty(key)) continue;

    const patchValue = patch[key];

    // Skip undefined (field not in patch)
    if (patchValue === undefined) continue;

    if (nestedFields.includes(key) && patchValue !== null) {
      // Deep merge nested objects
      if (patchValue && typeof patchValue === 'object' && !Array.isArray(patchValue)) {
        // CRITICAL: For nested objects, only merge fields that are PRESENT in patch
        // This prevents overwriting fields that weren't in patch
        merged[key] = deepMerge(merged[key] || {}, patchValue);
      } else {
        // null or non-object -> replace
        merged[key] = patchValue;
      }
    } else {
      // Top-level fields or arrays -> replace
      merged[key] = patchValue;
    }
  }

  return merged;
}

/**
 * Normalize clearable fields: empty string -> null
 * Clearable fields: orderId, tracking, notes, customerRate, carrierRate, paymentMethod, paymentTerms
 */
function normalizeClearables(patch) {
  const clearableFields = [
    'orderId',
    'tracking',
    'notes',
    'customerRate',
    'carrierRate',
    'paymentMethod',
    'paymentTerms',
  ];

  const normalized = { ...patch };

  for (const field of clearableFields) {
    if (field in normalized && typeof normalized[field] === 'string' && normalized[field].trim() === '') {
      normalized[field] = null;
    }
  }

  return normalized;
}

/**
 * Normalize image arrays: remove signed URLs, keep only S3 keys
 */
function normalizeImagesToKeys(patch) {
  const normalized = { ...patch };

  const extractKeyFromUrl = (url) => {
    if (!url || typeof url !== 'string') return null;
    if (url.startsWith('/api/files/') || url.startsWith('/files/')) {
      return url.replace(/^\/api\/files\//, '').replace(/^\/files\//, '');
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
      try {
        const parsed = new URL(url);
        let path = parsed.pathname || '';
        if (path.startsWith('/')) path = path.slice(1);
        return path || null;
      } catch (e) {
        return null;
      }
    }
    if (url.startsWith('blob:')) return null;
    return url;
  };

  const normalizeArray = (arr) => {
    if (!Array.isArray(arr)) return arr;
    return arr
      .map((item) => {
        if (typeof item === 'string') {
          return extractKeyFromUrl(item);
        }
        if (item && typeof item === 'object' && item.key) {
          return item.key;
        }
        if (item && typeof item === 'object' && item.url) {
          return extractKeyFromUrl(item.url);
        }
        return null;
      })
      .filter((key) => key !== null && key !== '');
  };

  // Normalize image arrays
  if (normalized.pickup?.images) {
    normalized.pickup.images = normalizeArray(normalized.pickup.images);
  }
  if (normalized.delivery?.images) {
    normalized.delivery.images = normalizeArray(normalized.delivery.images);
  }
  if (normalized.carrierPhotos) {
    normalized.carrierPhotos = normalizeArray(normalized.carrierPhotos);
  }
  if (normalized.vehicle?.vehicleImages) {
    normalized.vehicle.vehicleImages = normalizeArray(normalized.vehicle.vehicleImages);
  }
  if (normalized.vehicle?.images) {
    normalized.vehicle.images = normalizeArray(normalized.vehicle.images);
  }
  if (normalized.freight?.freightImages) {
    normalized.freight.freightImages = normalizeArray(normalized.freight.freightImages);
  }
  if (normalized.freight?.images) {
    normalized.freight.images = normalizeArray(normalized.freight.images);
  }
  if (normalized.documents) {
    normalized.documents = normalizeArray(normalized.documents);
  }

  return normalized;
}

/**
 * Normalize fees array
 */
function normalizeFees(feesData) {
  if (feesData === undefined) return undefined;
  if (!Array.isArray(feesData)) return undefined;

  if (feesData.length === 0) return [];

  return feesData
    .filter((fee) => fee && fee.type && fee.type.trim() !== '')
    .map((fee) => ({
      type: fee.type || '',
      carrierRate: fee.carrierRate !== undefined && fee.carrierRate !== null ? String(fee.carrierRate) : '',
      customerRate: fee.customerRate !== undefined && fee.customerRate !== null ? String(fee.customerRate) : '',
      total: fee.total !== undefined && fee.total !== null ? String(fee.total) : '',
    }));
}

/**
 * Normalize tonu object
 */
function normalizeTonu(tonuData) {
  if (tonuData === undefined) return undefined;
  if (!tonuData || typeof tonuData !== 'object') return undefined;

  return {
    enabled: Boolean(tonuData.enabled),
    carrierRate: tonuData.carrierRate !== undefined && tonuData.carrierRate !== null ? String(tonuData.carrierRate) : '',
    customerRate: tonuData.customerRate !== undefined && tonuData.customerRate !== null ? String(tonuData.customerRate) : '',
  };
}

/**
 * Apply business rule: reset carrier-related fields when status changes to "Listed"
 */
function applyResetCarrierOnListed(patch, oldDoc) {
  const resetCarrierOnListed = patch.status === 'Listed' && oldDoc.status !== 'Listed';

  if (!resetCarrierOnListed) return patch;

  const resetPatch = {
    ...patch,
    carrier: null,
    carrierEmails: [],
    carrierPhotos: [],
    carrierRate: null,
    tracking: null,
    fees: [],
    tonu: { enabled: false, carrierRate: '', customerRate: '' },
    paymentMethod: null,
    paymentTerms: null,
    insurance: null,
    documents: [],
  };

  // Reset dates
  if (!resetPatch.dates) resetPatch.dates = {};
  resetPatch.dates = {
    ...resetPatch.dates,
    assignedDate: null,
    deadline: null,
    pickupDate: null,
    pickupDateStart: null,
    pickupDateEnd: null,
    pickupDateType: 'Exact',
    deliveryDate: null,
    deliveryDateStart: null,
    deliveryDateEnd: null,
    deliveryDateType: 'Exact',
    aging: null,
  };

  // Reset pickup/delivery images (but keep other fields via deep merge)
  if (!resetPatch.pickup) resetPatch.pickup = {};
  resetPatch.pickup.images = [];
  if (!resetPatch.delivery) resetPatch.delivery = {};
  resetPatch.delivery.images = [];

  return resetPatch;
}

/**
 * Validate transition to "Delivered" status
 */
function validateDeliveredTransition(patch, oldDoc) {
  if (patch.status !== 'Delivered' || oldDoc.status === 'Delivered') {
    return { valid: true };
  }

  const errors = [];

  // Check customer rate
  const customerRate = patch.customerRate !== undefined ? patch.customerRate : oldDoc.customerRate;
  if (!customerRate || customerRate === 0 || customerRate === '0' || customerRate === '') {
    errors.push('Customer rate is required for Delivered status');
  }

  // Check carrier rate
  const carrierRate = patch.carrierRate !== undefined ? patch.carrierRate : oldDoc.carrierRate;
  if (!carrierRate || carrierRate === 0 || carrierRate === '0' || carrierRate === '') {
    errors.push('Carrier rate is required for Delivered status');
  }

  // Check carrier exists
  const carrierId = patch.carrier !== undefined ? patch.carrier : oldDoc.carrier;
  if (!carrierId) {
    errors.push('Carrier is required for Delivered status');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}

/**
 * Handle MongoDB duplicate key error (E11000)
 */
function handleDuplicateKey(error, field = 'orderId') {
  if (error.code === 11000 || error.code === 11001) {
    const duplicateValue = error.keyValue?.[field] || error.keyValue?.[Object.keys(error.keyValue || {})[0]];
    return {
      isDuplicate: true,
      field,
      value: duplicateValue,
      message: `${field} "${duplicateValue}" already exists`,
    };
  }
  return { isDuplicate: false };
}

module.exports = {
  deepMerge,
  deepMergePatch,
  normalizeClearables,
  normalizeImagesToKeys,
  normalizeFees,
  normalizeTonu,
  applyResetCarrierOnListed,
  validateDeliveredTransition,
  handleDuplicateKey,
};
