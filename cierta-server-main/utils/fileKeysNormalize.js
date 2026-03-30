/**
 * File Keys Normalization Utility
 * 
 * CRITICAL: Normalizes file arrays BEFORE processDeletedFiles to prevent accidental deletions
 * Converts signed URLs, objects with url/key, and other formats to pure S3 keys
 * 
 * CONTRACT:
 * - Field omitted/undefined => NO TOUCH (don't normalize, field not in patch)
 * - Field present as [] => CLEAR (normalize to empty array)
 * - Field present as [values...] => REPLACE (normalize all values to keys)
 */

const { extractKeyFromUrl } = require("../services/s3Service");

/**
 * Convert a single value to S3 key
 * Handles: strings (keys or URLs), objects with {key, url}, null/undefined
 */
function toKey(v) {
  if (!v) return null;

  // Object form: { key, url }
  if (typeof v === "object") {
    if (v.key && typeof v.key === "string") {
      return String(v.key);
    }
    if (v.url && typeof v.url === "string") {
      const extracted = extractKeyFromUrl(String(v.url));
      if (extracted) return extracted;
      // If extractKeyFromUrl failed, try to parse manually
      return parseKeyFromUrl(String(v.url));
    }
    return null;
  }

  const s = String(v);

  // Already a key (doesn't start with http/https/blob)
  if (!s.startsWith("http://") && !s.startsWith("https://") && !s.startsWith("blob:")) {
    // Check if it's a path-like key (contains / but not query params)
    if (s.includes("/") && !s.includes("?")) {
      return s;
    }
    // Simple key without slashes
    return s;
  }

  // Blob URL - reject (should never reach server)
  if (s.startsWith("blob:")) {
    return null;
  }

  // Signed URL -> extract key
  const extracted = extractKeyFromUrl(s);
  if (extracted) return extracted;

  // Fallback: try to parse manually
  return parseKeyFromUrl(s);
}

/**
 * Parse key from URL manually (fallback if extractKeyFromUrl fails)
 */
function parseKeyFromUrl(url) {
  if (!url || typeof url !== "string") return null;

  try {
    // Try URL parsing
    const parsed = new URL(url);
    let path = parsed.pathname || "";

    // Remove leading slash
    if (path.startsWith("/")) path = path.slice(1);

    // Remove /api/files/ prefix if present
    if (path.startsWith("api/files/")) {
      path = path.replace(/^api\/files\//, "");
    }
    if (path.startsWith("files/")) {
      path = path.replace(/^files\//, "");
    }

    return path || null;
  } catch (e) {
    // Not a valid URL - might be a key already
    // Remove /api/files/ prefix if present
    let key = url;
    if (key.startsWith("/api/files/")) {
      key = key.replace(/^\/api\/files\//, "");
    }
    if (key.startsWith("/files/")) {
      key = key.replace(/^\/files\//, "");
    }
    // Remove query params if any
    if (key.includes("?")) {
      key = key.split("?")[0];
    }
    return key || null;
  }
}

/**
 * Normalize array of values to array of keys
 */
function normalizeArray(arr) {
  if (!Array.isArray(arr)) return arr;
  return arr.map(toKey).filter((key) => key !== null && key !== "");
}

/**
 * Normalize file arrays in loadData
 * IMPORTANT: Only normalizes fields that are PRESENT in patch (hasOwnProperty)
 * This ensures undefined fields are NOT touched
 */
function normalizeLoadFileArrays(loadData) {
  if (!loadData || typeof loadData !== "object") return loadData;

  // Top-level arrays
  if (Object.prototype.hasOwnProperty.call(loadData, "carrierPhotos")) {
    loadData.carrierPhotos = normalizeArray(loadData.carrierPhotos);
  }
  if (Object.prototype.hasOwnProperty.call(loadData, "documents")) {
    loadData.documents = normalizeArray(loadData.documents);
  }
  if (Object.prototype.hasOwnProperty.call(loadData, "images")) {
    loadData.images = normalizeArray(loadData.images);
  }
  if (Object.prototype.hasOwnProperty.call(loadData, "pdfs")) {
    loadData.pdfs = normalizeArray(loadData.pdfs);
  }

  // Nested pickup/delivery
  if (loadData.pickup && typeof loadData.pickup === "object") {
    if (Object.prototype.hasOwnProperty.call(loadData.pickup, "images")) {
      loadData.pickup.images = normalizeArray(loadData.pickup.images);
    }
  }
  if (loadData.delivery && typeof loadData.delivery === "object") {
    if (Object.prototype.hasOwnProperty.call(loadData.delivery, "images")) {
      loadData.delivery.images = normalizeArray(loadData.delivery.images);
    }
  }

  // Nested vehicle
  if (loadData.vehicle && typeof loadData.vehicle === "object") {
    if (Object.prototype.hasOwnProperty.call(loadData.vehicle, "vehicleImages")) {
      loadData.vehicle.vehicleImages = normalizeArray(loadData.vehicle.vehicleImages);
    }
    if (Object.prototype.hasOwnProperty.call(loadData.vehicle, "images")) {
      loadData.vehicle.images = normalizeArray(loadData.vehicle.images);
    }
    if (Object.prototype.hasOwnProperty.call(loadData.vehicle, "pdfs")) {
      loadData.vehicle.pdfs = normalizeArray(loadData.vehicle.pdfs);
    }
  }

  // Nested freight
  if (loadData.freight && typeof loadData.freight === "object") {
    if (Object.prototype.hasOwnProperty.call(loadData.freight, "freightImages")) {
      loadData.freight.freightImages = normalizeArray(loadData.freight.freightImages);
    }
    if (Object.prototype.hasOwnProperty.call(loadData.freight, "images")) {
      loadData.freight.images = normalizeArray(loadData.freight.images);
    }
    if (Object.prototype.hasOwnProperty.call(loadData.freight, "pdfs")) {
      loadData.freight.pdfs = normalizeArray(loadData.freight.pdfs);
    }
  }

  return loadData;
}

/**
 * Validate that file arrays don't contain invalid values (blob URLs, etc.)
 * Throws error if invalid values found
 */
function validateFileArrays(loadData) {
  if (!loadData || typeof loadData !== "object") return;

  const checkArray = (arr, fieldName) => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (typeof item === "string" && item.startsWith("blob:")) {
        throw new Error(`Invalid blob URL found in ${fieldName}. Blob URLs must not reach server.`);
      }
      if (typeof item === "string" && (item.startsWith("http://") || item.startsWith("https://"))) {
        // Signed URL - try to extract key, if fails it's suspicious
        const key = extractKeyFromUrl(item) || parseKeyFromUrl(item);
        if (!key) {
          console.warn(`[fileKeysNormalize] Could not extract key from URL in ${fieldName}: ${item}`);
        }
      }
    }
  };

  if (loadData.carrierPhotos) checkArray(loadData.carrierPhotos, "carrierPhotos");
  if (loadData.documents) checkArray(loadData.documents, "documents");
  if (loadData.images) checkArray(loadData.images, "images");
  if (loadData.pdfs) checkArray(loadData.pdfs, "pdfs");
  if (loadData.pickup?.images) checkArray(loadData.pickup.images, "pickup.images");
  if (loadData.delivery?.images) checkArray(loadData.delivery.images, "delivery.images");
  if (loadData.vehicle?.vehicleImages) checkArray(loadData.vehicle.vehicleImages, "vehicle.vehicleImages");
  if (loadData.vehicle?.images) checkArray(loadData.vehicle.images, "vehicle.images");
  if (loadData.vehicle?.pdfs) checkArray(loadData.vehicle.pdfs, "vehicle.pdfs");
  if (loadData.freight?.freightImages) checkArray(loadData.freight.freightImages, "freight.freightImages");
  if (loadData.freight?.images) checkArray(loadData.freight.images, "freight.images");
  if (loadData.freight?.pdfs) checkArray(loadData.freight.pdfs, "freight.pdfs");
}

module.exports = {
  normalizeLoadFileArrays,
  validateFileArrays,
  toKey,
  normalizeArray,
};
