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

// ➕ POST /loads - create load with files (images, documents)
router.post(
  '/',
  verifyToken,
  checkRole(['admin', 'dispatcher']),
  uploadFiles('loads', true), // from middleware, entity='loads', multi=true
  LoadController.create
);

// ✏️ PUT /loads/:id - update load (basic update)
router.put(
  '/:id',
  verifyToken,
  // checkRole(['admin', 'dispatcher']),
  LoadController.update
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

// 📄 PDF Generation Routes - ВРЕМЕННО ОТКЛЮЧЕНО для тестирования интеграции с UI
// 🔍 GET /loads/:id/bol - generate BOL PDF
// router.get(
//   '/:id/bol',
//   verifyToken,
//   // checkRole(['admin', 'dispatcher', 'manager']),
//   LoadController.generateBOL
// );

// 🔍 GET /loads/:id/rate-confirmation - generate Rate Confirmation PDF
// router.get(
//   '/:id/rate-confirmation',
//   verifyToken,
//   // checkRole(['admin', 'dispatcher', 'manager']),
//   LoadController.generateRateConfirmation
// );

// 🔍 GET /loads/:id/documents - generate all documents (BOL + Rate Confirmation)
// router.get(
//   '/:id/documents',
//   verifyToken,
//   // checkRole(['admin', 'dispatcher', 'manager']),
//   LoadController.generateAllDocuments
// );

// 📥 GET /loads/download/:filename - download generated PDF
// router.get(
//   '/download/:filename',
//   verifyToken,
//   // checkRole(['admin', 'dispatcher', 'manager']),
//   LoadController.downloadPDF
// );

module.exports = router;
