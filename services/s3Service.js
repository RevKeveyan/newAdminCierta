const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, CopyObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const moment = require('moment');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    // Support both naming conventions
    accessKeyId: process.env.AWS_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY
  }
});

/**
 * Upload file to S3 with simple, direct folder structure
 * Structure: Entity/EntityID/FileType/filename
 * Example: users/507f1f77bcf86cd799439011/images/profile.jpg
 * Example: loads/507f1f77bcf86cd799439011/pdfs/contract.pdf
 * Example: orders/A-1001/pdfs/pickup-doc1.pdf
 * 
 * Simple and direct path for easy file finding
 * 
 * @param {Buffer} fileBuffer - File buffer
 * @param {String} originalName - Original filename
 * @param {String} entity - Entity name (users, carriers, customers, loads, orders, etc.)
 * @param {String} entityId - Entity ID
 * @param {String} fileType - 'images' or 'pdfs'
 * @param {String} subType - Optional subfolder (pickup, delivery, carrier, etc.)
 * @returns {String} - S3 key (direct path, not URL)
 */
const uploadToS3 = async (fileBuffer, originalName, entity, entityId, fileType, subType = null) => {
  const ext = path.extname(originalName);
  const filename = `${uuidv4()}${ext}`;
  
  // Normalize entity name (handle payment entities and pluralize)
  let normalizedEntity = entity;
  if (entity === 'paymentPayable' || entity === 'payments-payable') {
    normalizedEntity = 'payments-payable';
  } else if (entity === 'paymentReceivable' || entity === 'payments-receivable') {
    normalizedEntity = 'payments-receivable';
  } else {
    // Pluralize entity name if needed (load -> loads, user -> users, etc.)
    // But keep as is if already plural or specific name
    const entityMap = {
      'load': 'loads',
      'user': 'users',
      'carrier': 'carriers',
      'customer': 'customers',
      'order': 'orders'
    };
    normalizedEntity = entityMap[entity] || entity;
  }
  
  // Build S3 key: Entity/EntityID/FileType[/SubType]/filename
  // Simple and direct path for easy finding
  const key = `${normalizedEntity}/${entityId}/${fileType}${subType ? `/${subType}` : ''}/${filename}`;

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeTypeByExt(ext),
    // Removed ACL: 'public-read' - files are now private by default
    Metadata: {
      'original-name': originalName,
      'entity': normalizedEntity,
      'entity-id': entityId,
      'file-type': fileType,
      ...(subType ? { 'file-subtype': subType } : {}),
      'upload-date': moment().toISOString(),
      'original-filename': originalName
    }
  });

  await s3.send(command);

  // Return only the key, not a public URL
  // Use getSignedUrl() to generate temporary access URLs
  return key;
};

/**
 * Delete file from S3
 * @param {String} urlOrKey - Full S3 URL or just the key
 * @returns {Promise}
 */
const deleteFromS3 = async (urlOrKey) => {
  if (!urlOrKey) return;
  
  // Extract key from URL if full URL is provided
  let key = urlOrKey;
  if (urlOrKey.includes('.amazonaws.com/')) {
    key = urlOrKey.split('.amazonaws.com/')[1].split('?')[0]; // Remove query params
  }
  
  // If it's a key with /api/files/ prefix, extract the actual key
  if (key.includes('/api/files/')) {
    key = key.replace('/api/files/', '');
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: process.env.AWS_BUCKET,
      Key: key
    });
    
    await s3.send(command);
    console.log(`[S3Service] Deleted file: ${key}`);
  } catch (error) {
    console.error(`[S3Service] Failed to delete file ${key}:`, error.message);
    // Don't throw - file might already be deleted
  }
};

/**
 * Delete multiple files from S3
 * @param {Array<String>} keysOrUrls - Array of S3 keys or URLs
 * @returns {Promise<Array>} - Array of results (success/failure for each)
 */
const deleteFromS3Multiple = async (keysOrUrls) => {
  if (!Array.isArray(keysOrUrls) || keysOrUrls.length === 0) {
    return [];
  }
  
  const deletePromises = keysOrUrls.map(keyOrUrl => 
    deleteFromS3(keyOrUrl).catch(error => {
      console.error(`[S3Service] Failed to delete ${keyOrUrl}:`, error.message);
      return { success: false, key: keyOrUrl, error: error.message };
    })
  );
  
  return Promise.all(deletePromises);
};

/**
 * Get object stream from S3 (for streaming zip, no buffering)
 * @param {String} key - S3 key
 * @returns {Promise<Readable|null>} - Readable stream or null on error
 */
const getObjectStreamFromS3 = async (key) => {
  if (!key) return null;
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET,
      Key: key
    });
    const response = await s3.send(command);
    return response.Body || null;
  } catch (error) {
    console.error(`[S3Service] Failed to get stream for ${key}:`, error.message);
    return null;
  }
};

/**
 * Get object from S3 and return as buffer
 * @param {String} key - S3 key
 * @returns {Promise<Object>} - Object with Body (Buffer), ContentType, and other metadata
 */
const getObjectFromS3 = async (key) => {
  if (!key) return null;

  try {
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET,
      Key: key
    });

    const response = await s3.send(command);
    
    // Convert stream to buffer
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    return {
      Body: buffer,
      ContentType: response.ContentType || 'application/octet-stream',
      ContentLength: response.ContentLength,
      LastModified: response.LastModified,
      Metadata: response.Metadata
    };
  } catch (error) {
    console.error(`[S3Service] Failed to get object ${key}:`, error.message);
    return null;
  }
};

/**
 * Extract S3 key from URL
 * Handles multiple URL formats:
 * - https://bucket.s3.region.amazonaws.com/key
 * - https://s3.region.amazonaws.com/bucket/key
 * - https://bucket.s3-region.amazonaws.com/key
 * - /api/files/key or /files/key
 * - Already a key (no http/https)
 * 
 * @param {String} url - Full S3 URL or key
 * @returns {String} - S3 key (or null if cannot extract)
 */
const extractKeyFromUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  
  // Blob URLs - reject
  if (url.startsWith('blob:')) return null;
  
  // Path-based keys (/api/files/... or /files/...)
  if (url.startsWith('/api/files/') || url.startsWith('/files/')) {
    return url.replace(/^\/api\/files\//, '').replace(/^\/files\//, '');
  }
  
  // S3 URLs (amazonaws.com)
  if (url.includes('.amazonaws.com/')) {
    // Format: https://bucket.s3.region.amazonaws.com/key or https://s3.region.amazonaws.com/bucket/key
    const parts = url.split('.amazonaws.com/');
    if (parts.length > 1) {
      let key = parts[1];
      // Remove query params if any
      if (key.includes('?')) {
        key = key.split('?')[0];
      }
      // Remove hash if any
      if (key.includes('#')) {
        key = key.split('#')[0];
      }
      return key || null;
    }
  }
  
  // HTTP/HTTPS URLs (non-S3) - try to extract pathname
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const parsed = new URL(url);
      let path = parsed.pathname || '';
      if (path.startsWith('/')) path = path.slice(1);
      // Remove /api/files/ prefix if present
      if (path.startsWith('api/files/')) {
        path = path.replace(/^api\/files\//, '');
      }
      if (path.startsWith('files/')) {
        path = path.replace(/^files\//, '');
      }
      return path || null;
    } catch (e) {
      // Not a valid URL
      return null;
    }
  }
  
  // Already a key (doesn't start with http/https/blob)
  // Remove query params if any
  if (url.includes('?')) {
    return url.split('?')[0];
  }
  
  return url;
};

/**
 * Get file metadata from S3 URL
 * Supports multiple structures for backward compatibility:
 * OLD1: Year/Month/Entity/EntityID/FileType/filename
 * OLD2: FileType/Entity/Year-Month/EntityID/filename
 * NEW: Entity/EntityID/FileType/filename (current, simple structure)
 * 
 * @param {String} url - S3 URL or key
 * @returns {Object} - Parsed metadata
 */
const parseS3Url = (url) => {
  if (!url) return null;
  
  const key = extractKeyFromUrl(url);
  if (!key) return null;
  
  const parts = key.split('/');
  
  // NEW Structure: Entity/EntityID/FileType/filename (simple and direct)
  // Example: users/507f1f77bcf86cd799439011/images/profile.jpg
  if (parts.length >= 4) {
    const [entity, entityId, fileType, ...filenameParts] = parts;
    
    // Check if fileType is 'images' or 'pdfs' (new structure)
    if (fileType === 'images' || fileType === 'pdfs') {
      return {
        entity,
        entityId,
        fileType,
        filename: filenameParts.join('/'),
        fullKey: key,
        structure: 'simple'
      };
    }
  }
  
  // OLD Structure 1: FileType/Entity/Year-Month/EntityID/filename
  if (parts.length >= 5 && (parts[0] === 'images' || parts[0] === 'pdfs')) {
    const [fileType, entity, yearMonth, entityId, ...filenameParts] = parts;
    const [year, month] = yearMonth.split('-');
    
    return {
      fileType,
      entity,
      year,
      month: getMonthName(parseInt(month)),
      yearMonth,
      entityId,
      filename: filenameParts.join('/'),
      fullKey: key,
      structure: 'old2'
    };
  }
  
  // OLD Structure 2: Year/Month/Entity/EntityID/FileType/filename
  if (parts.length >= 6) {
    const [year, month, entity, entityId, fileType, ...filenameParts] = parts;
    
    return {
      year,
      month,
      entity,
      entityId,
      fileType,
      filename: filenameParts.join('/'),
      fullKey: key,
      structure: 'old1'
    };
  }
  
  return null;
};

/**
 * Convert month number to month name
 * @param {Number} monthNum - Month number (1-12)
 * @returns {String} - Month name
 */
const getMonthName = (monthNum) => {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[monthNum - 1] || 'Unknown';
};

/**
 * Get MIME type by file extension
 */
const mimeTypeByExt = (ext) => {
  const map = {
    // Images
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    // PDFs
    '.pdf': 'application/pdf',
    // Documents
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.csv': 'text/csv',
    '.txt': 'text/plain'
  };
  return map[ext.toLowerCase()] || 'application/octet-stream';
};

/**
 * Check if file is an image
 */
const isImage = (mimetype) => {
  return mimetype && mimetype.startsWith('image/');
};

/**
 * Check if file is a PDF
 */
const isPDF = (mimetype) => {
  return mimetype === 'application/pdf';
};

/**
 * Generate a signed URL for private S3 objects
 * @param {String} key - S3 object key
 * @param {Number} expiresIn - URL expiration time in seconds (default: 5 minutes)
 * @returns {String} - Signed URL
 */
const getSignedUrlForObject = async (key, expiresIn = 300) => {
  if (!key) return null;
  
  // If key is a full URL, extract the key
  const s3Key = extractKeyFromUrl(key) || key;
  
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET,
      Key: s3Key
    });

    const signedUrl = await getSignedUrl(s3, command, { expiresIn });
    return signedUrl;
  } catch (error) {
    console.error('Error generating signed URL:', error);
    return null;
  }
};

/**
 * Generate signed URLs for multiple objects
 * @param {Array<String>} keys - Array of S3 keys
 * @param {Number} expiresIn - URL expiration time in seconds
 * @returns {Object} - Map of key to signed URL
 */
const getSignedUrlsForObjects = async (keys, expiresIn = 300) => {
  if (!Array.isArray(keys) || keys.length === 0) return {};
  
  const urlMap = {};
  await Promise.all(
    keys.map(async (key) => {
      const signedUrl = await getSignedUrlForObject(key, expiresIn);
      if (signedUrl) {
        urlMap[key] = signedUrl;
      }
    })
  );
  
  return urlMap;
};

/**
 * Check if an S3 object exists
 * @param {String} key - S3 key
 * @returns {Promise<boolean>} - True if object exists
 */
const objectExists = async (key) => {
  if (!key) return false;
  
  const s3Key = extractKeyFromUrl(key) || key;
  
  try {
    const headCommand = new HeadObjectCommand({
      Bucket: process.env.AWS_BUCKET,
      Key: s3Key
    });
    await s3.send(headCommand);
    return true;
  } catch (error) {
    if (error.name === 'NotFound' || error.Code === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
};

/**
 * Move an S3 object from one key to another
 * Uses copy + delete pattern since S3 doesn't have a native move operation
 * @param {String} sourceKey - Source S3 key
 * @param {String} destinationKey - Destination S3 key
 * @returns {Promise<String>} - New key after move
 */
const moveS3Object = async (sourceKey, destinationKey) => {
  if (!sourceKey || !destinationKey) {
    throw new Error('Source and destination keys are required');
  }

  // Extract keys if URLs are provided
  const srcKey = extractKeyFromUrl(sourceKey) || sourceKey;
  const destKey = extractKeyFromUrl(destinationKey) || destinationKey;

  if (srcKey === destKey) {
    return destKey;
  }

  try {
    const sourceExists = await objectExists(srcKey);
    
    if (!sourceExists) {
      const destExists = await objectExists(destKey);
      if (destExists) {
        console.log(`[S3Service] Source file ${srcKey} doesn't exist, but destination ${destKey} already exists. Skipping move.`);
        return destKey;
      }
      console.warn(`[S3Service] Source file ${srcKey} doesn't exist. Cannot move.`);
      return destKey;
    }

    const destExists = await objectExists(destKey);
    if (destExists) {
      console.log(`[S3Service] Destination ${destKey} already exists. Skipping move.`);
      await deleteFromS3(srcKey);
      return destKey;
    }

    const copyCommand = new CopyObjectCommand({
      Bucket: process.env.AWS_BUCKET,
      CopySource: `${process.env.AWS_BUCKET}/${srcKey}`,
      Key: destKey
    });

    await s3.send(copyCommand);

    await deleteFromS3(srcKey);

    console.log(`[S3Service] Moved file from ${srcKey} to ${destKey}`);
    return destKey;
  } catch (error) {
    if (error.Code === 'NoSuchKey' || error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      console.warn(`[S3Service] Source file ${srcKey} doesn't exist. Returning destination key.`);
      return destKey;
    }
    console.error(`[S3Service] Failed to move file from ${srcKey} to ${destKey}:`, error);
    throw error;
  }
};

/**
 * Update S3 keys for an entity when moving from temp ID to real ID
 * Updates keys in format: {entity}/{tempId}/... -> {entity}/{realId}/...
 * @param {Array<String>} keysOrUrls - Array of S3 keys or URLs
 * @param {String} tempId - Temporary entity ID (e.g., "temp-123")
 * @param {String} realId - Real entity ID (e.g., "507f1f77bcf86cd799439011")
 * @param {String} entityType - Entity type (e.g., "loads", "users")
 * @returns {Promise<Array<String>>} - Array of updated keys
 */
const updateS3KeysForEntity = async (keysOrUrls, tempId, realId, entityType) => {
  if (!Array.isArray(keysOrUrls) || keysOrUrls.length === 0) {
    return [];
  }

  if (!tempId || !realId || !entityType) {
    console.warn('[S3Service] Missing required parameters for updateS3KeysForEntity');
    return keysOrUrls; // Return original if invalid params
  }

  const updatedKeys = [];
  const movePromises = [];

  for (const keyOrUrl of keysOrUrls) {
    // Extract key from URL if needed
    let currentKey = extractKeyFromUrl(keyOrUrl) || keyOrUrl;

    // Skip if it's not a key (e.g., blob URL, already processed)
    if (!currentKey || currentKey.startsWith('blob:') || currentKey.startsWith('http://') || currentKey.startsWith('https://')) {
      updatedKeys.push(keyOrUrl); // Keep original if not a valid key
      continue;
    }

    // Check if key contains tempId
    if (currentKey.includes(`/${tempId}/`)) {
      // Replace tempId with realId in the key
      const newKey = currentKey.replace(`/${tempId}/`, `/${realId}/`);
      
      // Only move if keys are different
      if (currentKey !== newKey) {
        movePromises.push(
          moveS3Object(currentKey, newKey)
            .then(movedKey => {
              updatedKeys.push(movedKey);
            })
            .catch(error => {
              if (error.Code === 'NoSuchKey' || error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
                console.warn(`[S3Service] File ${currentKey} doesn't exist. Using destination key ${newKey}.`);
                updatedKeys.push(newKey);
              } else {
                console.error(`[S3Service] Failed to update key ${currentKey}:`, error);
                updatedKeys.push(currentKey);
              }
            })
        );
      } else {
        updatedKeys.push(currentKey);
      }
    } else {
      // Key doesn't contain tempId, keep as is
      updatedKeys.push(currentKey);
    }
  }

  // Wait for all moves to complete
  await Promise.all(movePromises);

  return updatedKeys;
};

module.exports = { 
  uploadToS3, 
  deleteFromS3,
  deleteFromS3Multiple,
  moveS3Object,
  updateS3KeysForEntity,
  extractKeyFromUrl,
  parseS3Url,
  mimeTypeByExt,
  isImage,
  isPDF,
  getSignedUrlForObject,
  getSignedUrlsForObjects,
  getObjectFromS3,
  getObjectStreamFromS3
};
