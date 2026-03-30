const path = require('path');
const archiver = require('archiver');
const { getSignedUrlForObject, extractKeyFromUrl, getObjectFromS3, getObjectStreamFromS3 } = require('../services/s3Service');

const ALLOWED_KEY_PREFIXES = ['loads/', 'users/', 'carriers/', 'customers/', 'payments-payable/', 'payments-receivable/'];

const isKeyAllowed = (key) => {
  if (!key || typeof key !== 'string' || key.includes('..')) return false;
  return ALLOWED_KEY_PREFIXES.some(prefix => key.startsWith(prefix));
};

/**
 * Get signed URL for a single file
 * GET /files/signed-url/:key
 * 
 * @param {String} key - S3 key (can be URL-encoded)
 * @param {Number} expiresIn - Optional expiration time in seconds (default: 300 = 5 minutes)
 */
const getSignedUrl = async (req, res) => {
  try {
    const { key } = req.params;
    const { expiresIn = 300 } = req.query;

    if (!key) {
      return res.status(400).json({
        success: false,
        error: 'File key is required'
      });
    }

    // Decode URL-encoded key
    const decodedKey = decodeURIComponent(key);
    
    // Extract key from URL if full URL is provided
    const s3Key = extractKeyFromUrl(decodedKey) || decodedKey;

    // Generate signed URL
    const signedUrl = await getSignedUrlForObject(s3Key, parseInt(expiresIn));

    if (!signedUrl) {
      return res.status(404).json({
        success: false,
        error: 'File not found or could not generate signed URL'
      });
    }

    res.json({
      success: true,
      key: s3Key,
      url: signedUrl,
      expiresIn: parseInt(expiresIn)
    });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate signed URL',
      message: error.message
    });
  }
};

/**
 * Get signed URLs for multiple files
 * POST /files/signed-urls
 * Body: { keys: ['key1', 'key2', ...], expiresIn?: 300 }
 */
const getSignedUrls = async (req, res) => {
  try {
    const { keys, expiresIn = 300 } = req.body;

    if (!Array.isArray(keys) || keys.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Array of file keys is required'
      });
    }

    // Limit to 50 keys per request to prevent abuse
    if (keys.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 50 keys per request'
      });
    }

    const urlMap = {};
    const errors = [];

    // Generate signed URLs for all keys
    await Promise.all(
      keys.map(async (key) => {
        try {
          const decodedKey = decodeURIComponent(key);
          const s3Key = extractKeyFromUrl(decodedKey) || decodedKey;
          const signedUrl = await getSignedUrlForObject(s3Key, parseInt(expiresIn));
          
          if (signedUrl) {
            urlMap[s3Key] = signedUrl;
          } else {
            errors.push({ key: s3Key, error: 'Failed to generate signed URL' });
          }
        } catch (error) {
          errors.push({ key, error: error.message });
        }
      })
    );

    res.json({
      success: true,
      urls: urlMap,
      expiresIn: parseInt(expiresIn),
      ...(errors.length > 0 && { errors })
    });
  } catch (error) {
    console.error('Error generating signed URLs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate signed URLs',
      message: error.message
    });
  }
};

/**
 * Download a file by proxying through server (avoids CORS issues)
 * GET /files/download/:key
 * 
 * This endpoint downloads the file through the server to avoid CORS issues
 * when downloading files from S3.
 */
const downloadFile = async (req, res) => {
  try {
    const { key } = req.params;
    const { filename } = req.query;

    if (!key) {
      return res.status(400).json({
        success: false,
        error: 'File key is required'
      });
    }

    // Decode URL-encoded key
    const decodedKey = decodeURIComponent(key);
    
    // Extract key from URL if full URL is provided
    const s3Key = extractKeyFromUrl(decodedKey) || decodedKey;

    // Get file from S3
    const fileData = await getObjectFromS3(s3Key);

    if (!fileData) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    // Determine filename
    const fileName = filename || s3Key.split('/').pop() || 'download';

    // Set headers for download
    res.setHeader('Content-Type', fileData.ContentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader('Content-Length', fileData.Body.length);

    // Send file
    res.send(fileData.Body);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download file',
      message: error.message
    });
  }
};

/**
 * Serve a file securely by generating a signed URL and redirecting
 * GET /files/*
 * 
 * This is the main endpoint for serving files. It checks authentication,
 * generates a signed URL, and redirects the client to the S3 URL.
 */
const serveFile = async (req, res) => {
  try {
    // Get the file key from the path (everything after /files/)
    const key = req.params[0];

    if (!key) {
      return res.status(400).json({
        success: false,
        error: 'File key is required'
      });
    }

    // Decode URL-encoded key
    const decodedKey = decodeURIComponent(key);
    
    // Extract key from URL if full URL is provided
    const s3Key = extractKeyFromUrl(decodedKey) || decodedKey;

    // Generate signed URL with 5 minute expiration
    const signedUrl = await getSignedUrlForObject(s3Key, 300);

    if (!signedUrl) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    // Redirect to the signed URL
    res.redirect(302, signedUrl);
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to serve file',
      message: error.message
    });
  }
};

/**
 * Download multiple files as a single ZIP (streamed)
 * POST /files/download-zip
 * Body: { keys: string[], zipName?: string }
 */
const downloadZip = async (req, res, next) => {
  try {
    const { keys, zipName: rawZipName } = req.body;

    if (!Array.isArray(keys) || keys.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'keys must be a non-empty array'
      });
    }

    if (keys.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 50 keys per request'
      });
    }

    const decodedKeys = keys
      .map(k => (typeof k === 'string' ? decodeURIComponent(k).trim() : null))
      .filter(Boolean)
      .map(k => extractKeyFromUrl(k) || k)
      .filter(k => isKeyAllowed(k));

    if (decodedKeys.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid keys provided (allowed prefixes: loads/, users/, carriers/, customers/, payments-payable/, payments-receivable/)'
      });
    }

    const safeZipName = (rawZipName && typeof rawZipName === 'string')
      ? rawZipName.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'vehicle-photos'
      : 'vehicle-photos';
    const filename = `${safeZipName}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('error', (err) => {
      console.error('[downloadZip] archiver error:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Failed to create zip' });
      } else {
        res.end();
      }
    });

    archive.pipe(res);

    for (const key of decodedKeys) {
      const stream = await getObjectStreamFromS3(key);
      if (stream) {
        const entryName = path.basename(key);
        archive.append(stream, { name: entryName });
      }
    }

    await archive.finalize();
  } catch (error) {
    console.error('Error in downloadZip:', error);
    next(error);
  }
};

module.exports = {
  getSignedUrl,
  getSignedUrls,
  serveFile,
  downloadFile,
  downloadZip
};

