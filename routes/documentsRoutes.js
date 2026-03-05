const router = require('express').Router();
const { verifyToken } = require('../middlewares/authMiddleware');
const { downloadDocument } = require('../controllers/documentsController');

/**
 * Download document endpoint
 * GET /documents/:id/download?filename=xxx
 * 
 * Requires authentication and access to the load
 */
router.get('/:id/download', verifyToken, downloadDocument);

module.exports = router;


