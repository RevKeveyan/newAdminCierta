const express = require('express');
const router = express.Router();

LoadController = require('../controllers/LoadController');
const { verifyToken } = require('../middlewares/authMiddleware');
const { checkRole } = require('../middlewares/roleMiddleware');
const { uploadFiles } = require('../middlewares/uploadMiddleware'); // универсальный upload

// 🔍 GET /loads - filtered search, sort, pagination
router.get(
  '/',
  // verifyToken,
  // checkRole(['admin', 'dispatcher', 'manager']),
  LoadController.getAll
);

// 🔍 GET /loads/search - advanced search
router.get(
  '/search',
  verifyToken,
  // checkRole(['admin', 'dispatcher', 'manager']),
  LoadController.search
);

// 🔍 GET /loads/status/:status - get loads by status
router.get(
  '/status/:status',
  verifyToken,
  // checkRole(['admin', 'dispatcher', 'manager']),
  LoadController.getByStatus
);

// 🔍 GET /loads/carrier/:carrierId - get loads by carrier
router.get(
  '/carrier/:carrierId',
  verifyToken,
  // checkRole(['admin', 'dispatcher', 'manager']),
  LoadController.getByCarrier
);

// 🔍 GET /loads/customer/:customerId - get loads by customer
router.get(
  '/customer/:customerId',
  verifyToken,
  // checkRole(['admin', 'dispatcher', 'manager']),
  LoadController.getByCustomer
);

// 🔍 GET /loads/history - list all load history (admin, manager only)
router.get(
  '/history',
  verifyToken,
  checkRole(['admin', 'manager']),
  LoadController.getAllLoadHistory
);

// 🔍 GET /loads/debug/rate-confirmation-field-map - generate test PDF with field labels (index + PDF field name)
router.get(
  '/debug/rate-confirmation-field-map',
  LoadController.getRateConfirmationFieldMap
);

// 🔍 GET /loads/:id/history - get load history
router.get(
  '/:id/history',
  verifyToken,
  // checkRole(['admin', 'dispatcher', 'manager']),
  LoadController.getLoadHistory
);

// 🔍 GET /loads/:id - get load by ID
router.get(
  '/:id',
  verifyToken,
  // checkRole(['admin', 'dispatcher', 'manager']),
  LoadController.getById
);

// 📄 POST /loads/:id/duplicate - duplicate load
router.post(
  '/:id/duplicate',
  verifyToken,
  // checkRole(['admin', 'dispatcher']),
  LoadController.duplicateLoad
);

// ➕ POST /loads - create load with files (images, documents)
router.post(
  '/',
  // verifyToken,
  // checkRole(['admin', 'dispatcher']),
  uploadFiles('loads', true), // from middleware, entity='loads', multi=true
  LoadController.create
);

// ✏️ PUT /loads/:id - update load (with files support)
router.put(
  '/:id',
  verifyToken,
  // checkRole(['admin', 'dispatcher']),
  uploadFiles('loads', true), // support file uploads
  LoadController.updateLoad
);

// ✏️ PUT /loads/:id/full - update load with files support
router.put(
  '/:id/full',
  verifyToken,
  // checkRole(['admin', 'dispatcher']),
  uploadFiles('loads', true), // support file uploads
  LoadController.updateLoad
);

// ✏️ PUT /loads/:id/status - update load status
router.put(
  '/:id/status',
  verifyToken,
  // checkRole(['admin', 'dispatcher']),
  LoadController.updateStatus
);

// ❌ DELETE /loads/:id - delete load
router.delete(
  '/:id',
  verifyToken,
  // checkRole(['admin']),
  LoadController.delete
);

router.post(
  '/bulk-delete',
  verifyToken,
  LoadController.bulkDelete
);

// 📄 PDF Generation (only via generate-pdf-btn in UI)
router.post(
  '/generate-bol',
  verifyToken,
  LoadController.generateBOL
);
router.post(
  '/generate-rate-confirmation',
  verifyToken,
  LoadController.generateRateConfirmation
);
router.post(
  '/send-files',
  verifyToken,
  LoadController.sendFiles
);
router.post(
  '/:id/generate-bol',
  verifyToken,
  LoadController.generateBOL
);
router.post(
  '/:id/generate-rate-confirmation',
  verifyToken,
  LoadController.generateRateConfirmation
);
router.post(
  '/:id/send-files',
  verifyToken,
  LoadController.sendFiles
);

// Note: File serving is now handled by /api/files/* endpoint
// See server/routes/filesRoutes.js for secure file access

module.exports = router;
