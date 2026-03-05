const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/authMiddleware');
const { serveFile, getSignedUrl, getSignedUrls, downloadFile, downloadZip } = require('../controllers/filesController');

/**
 * Get signed URLs for multiple files
 * POST /files/signed-urls
 * 
 * Body:
 * {
 *   "keys": ["key1", "key2", ...],
 *   "expiresIn": 300 (optional)
 * }
 */
router.post('/signed-urls', verifyToken, getSignedUrls);

/**
 * Download multiple files as a single ZIP (streamed)
 * POST /files/download-zip
 * Body: { keys: string[], zipName?: string }
 */
router.post('/download-zip', verifyToken, downloadZip);

/**
 * Download file through server (avoids CORS issues)
 * GET /files/download/:key
 * 
 * Query params:
 * - filename: Optional filename for download (default: extracted from key)
 * 
 * Example:
 * GET /files/download/loads/123/images/vehicle/file.jpg?filename=vehicle-photo.jpg
 * 
 * NOTE: This route must come BEFORE the catch-all route below
 */
router.get('/download/:key(*)', verifyToken, downloadFile);

/**
 * Get signed URL for a single file (legacy endpoint, kept for backward compatibility)
 * GET /files/signed-url/:key
 * 
 * Query params:
 * - expiresIn: Optional expiration time in seconds (default: 300 = 5 minutes)
 * 
 * Example:
 * GET /files/signed-url/2024/December/users/123/images/file.jpg?expiresIn=600
 * 
 * NOTE: This route must come BEFORE the catch-all route below
 */
router.get('/signed-url/:key(*)', verifyToken, getSignedUrl);

/**
 * Main endpoint for serving files securely
 * GET /files/* or GET /api/files/*
 * 
 * Checks authentication and permissions, then redirects to signed URL (302)
 * 
 * Example: 
 * GET /files/images/users/2025-12/userId/file.jpg
 * GET /api/files/images/users/2025-12/userId/file.jpg
 * 
 * Supports keys with slashes: images/users/2025-12/userId/file.jpg
 * 
 * NOTE: This is a catch-all route, so it must come AFTER specific routes
 */
router.get('/*', verifyToken, serveFile);

module.exports = router;

