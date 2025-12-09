const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const moment = require('moment');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY
  }
});

/**
 * Upload file to S3 with organized folder structure
 * Structure: Year/Month/Entity/EntityID/FileType/filename
 * Example: 2024/December/users/507f1f77bcf86cd799439011/images/profile.jpg
 * Example: 2024/December/carriers/507f1f77bcf86cd799439011/pdf/contract.pdf
 * 
 * @param {Buffer} fileBuffer - File buffer
 * @param {String} originalName - Original filename
 * @param {String} entity - Entity name (users, carriers, customers, loads, etc.)
 * @param {String} entityId - Entity ID
 * @param {String} fileType - 'images' or 'pdfs'
 * @returns {String} - S3 URL
 */
const uploadToS3 = async (fileBuffer, originalName, entity, entityId, fileType) => {
  const ext = path.extname(originalName);
  const filename = `${uuidv4()}${ext}`;
  
  // Get current year and month
  const year = moment().format('YYYY');
  const month = moment().format('MMMM');
  
  // Build S3 key: Year/Month/Entity/EntityID/FileType/filename
  const key = `${year}/${month}/${entity}/${entityId}/${fileType}/${filename}`;

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeTypeByExt(ext),
    ACL: 'public-read',
    Metadata: {
      'original-name': originalName,
      'entity': entity,
      'entity-id': entityId,
      'file-type': fileType,
      'upload-date': moment().toISOString()
    }
  });

  await s3.send(command);

  return `https://${process.env.AWS_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};

/**
 * Delete file from S3
 * @param {String} url - Full S3 URL or just the key
 * @returns {Promise}
 */
const deleteFromS3 = async (url) => {
  // Extract key from URL if full URL is provided
  let key = url;
  if (url.includes('.amazonaws.com/')) {
    key = url.split('.amazonaws.com/')[1];
  }

  const command = new DeleteObjectCommand({
    Bucket: process.env.AWS_BUCKET,
    Key: key
  });
  
  await s3.send(command);
};

/**
 * Extract S3 key from URL
 * @param {String} url - Full S3 URL
 * @returns {String} - S3 key
 */
const extractKeyFromUrl = (url) => {
  if (!url) return null;
  if (url.includes('.amazonaws.com/')) {
    return url.split('.amazonaws.com/')[1];
  }
  return url;
};

/**
 * Get file metadata from S3 URL
 * Structure: Year/Month/Entity/EntityID/FileType/filename
 * @param {String} url - S3 URL
 * @returns {Object} - Parsed metadata
 */
const parseS3Url = (url) => {
  if (!url) return null;
  
  const key = extractKeyFromUrl(url);
  if (!key) return null;
  
  const parts = key.split('/');
  if (parts.length < 5) return null;
  
  return {
    year: parts[0],
    month: parts[1],
    entity: parts[2],
    entityId: parts[3],
    fileType: parts[4],
    filename: parts.slice(5).join('/'),
    fullKey: key
  };
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

module.exports = { 
  uploadToS3, 
  deleteFromS3, 
  extractKeyFromUrl,
  parseS3Url,
  mimeTypeByExt,
  isImage,
  isPDF
};
