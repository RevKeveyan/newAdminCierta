const express = require('express');
const router = express.Router();

LoadController = require('../controllers/LoadController');
const { verifyToken } = require('../middlewares/authMiddleware');
const { checkRole } = require('../middlewares/roleMiddleware');
const { uploadFiles } = require('../middlewares/uploadMiddleware'); // универсальный upload

// 🔍 GET /api/loads - filtered search, sort, pagination
router.get(
  '/',
  // verifyToken,
  // checkRole(['admin', 'dispatcher', 'manager']),
  LoadController.getAll
);

// 🔍 GET /api/loads/search - advanced search
router.get(
  '/search',
  verifyToken,
  checkRole(['admin', 'dispatcher', 'manager']),
  LoadController.search
);

// 🔍 GET /api/loads/status/:status - get loads by status
router.get(
  '/status/:status',
  verifyToken,
  checkRole(['admin', 'dispatcher', 'manager']),
  LoadController.getByStatus
);

// 🔍 GET /api/loads/carrier/:carrierId - get loads by carrier
router.get(
  '/carrier/:carrierId',
  verifyToken,
  checkRole(['admin', 'dispatcher', 'manager']),
  LoadController.getByCarrier
);

// 🔍 GET /api/loads/:id/history - get load history
router.get(
  '/:id/history',
  verifyToken,
  checkRole(['admin', 'dispatcher', 'manager']),
  LoadController.getLoadHistory
);

// ➕ POST /api/loads - create load with files (images, documents)
router.post(
  '/',
  verifyToken,
  checkRole(['admin', 'dispatcher']),
  uploadFiles('loads', true), // from middleware, entity='loads', multi=true
  LoadController.create
);

// ✏️ PUT /api/loads/:id - update load (basic update)
router.put(
  '/:id',
  verifyToken,
  checkRole(['admin', 'dispatcher']),
  LoadController.update
);

// ✏️ PUT /api/loads/:id/full - update load with files support
router.put(
  '/:id/full',
  verifyToken,
  checkRole(['admin', 'dispatcher']),
  uploadFiles('loads', true), // support file uploads
  LoadController.updateLoad
);

// ✏️ PUT /api/loads/:id/status - update load status
router.put(
  '/:id/status',
  verifyToken,
  checkRole(['admin', 'dispatcher']),
  LoadController.updateStatus
);

// ❌ DELETE /api/loads/:id - delete load
router.delete(
  '/:id',
  verifyToken,
  checkRole(['admin']),
  LoadController.delete
);

// 📄 PDF Generation Routes
// 🔍 GET /api/loads/:id/bol - generate BOL PDF
router.get(
  '/:id/bol',
  verifyToken,
  checkRole(['admin', 'dispatcher', 'manager']),
  LoadController.generateBOL
);

// 🔍 GET /api/loads/:id/rate-confirmation - generate Rate Confirmation PDF
router.get(
  '/:id/rate-confirmation',
  verifyToken,
  checkRole(['admin', 'dispatcher', 'manager']),
  LoadController.generateRateConfirmation
);

// 🔍 GET /api/loads/:id/documents - generate all documents (BOL + Rate Confirmation)
router.get(
  '/:id/documents',
  verifyToken,
  checkRole(['admin', 'dispatcher', 'manager']),
  LoadController.generateAllDocuments
);

// 📥 GET /api/loads/download/:filename - download generated PDF
router.get(
  '/download/:filename',
  verifyToken,
  checkRole(['admin', 'dispatcher', 'manager']),
  LoadController.downloadPDF
);

module.exports = router;
