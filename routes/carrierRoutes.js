const express = require('express');
const router = express.Router();
const CarrierController = require('../controllers/CarrierController');
const { verifyToken } = require('../middlewares/authMiddleware');
const { checkRole } = require('../middlewares/roleMiddleware');
const { uploadEntityFile } = require('../middlewares/uploadMiddleware');

// 🔍 GET /carriers - get all carriers
router.get(
  '/',
  // verifyToken,
  // checkRole(['admin', 'dispatcher', 'manager']),
  CarrierController.getAll
);

// 🔍 GET /carriers/search - search carriers
router.get(
  '/search',
  // verifyToken,
  // checkRole(['admin', 'dispatcher', 'manager']),
  CarrierController.search
);

// 🔍 GET /carriers/:id - get carrier by ID
router.get(
  '/:id',
  // verifyToken,
  // checkRole(['admin', 'dispatcher', 'manager']),
  CarrierController.getById
);

// 🔍 GET /carriers/:id/loads - get all loads for carrier
router.get(
  '/:id/loads',
  // verifyToken,
  // checkRole(['admin', 'dispatcher', 'manager']),
  CarrierController.getCarrierLoads
);

// ➕ POST /carriers - create carrier
// Supports: file (PDF)
router.post(
  '/',
  // verifyToken,
  // checkRole(['admin', 'dispatcher']),
  uploadEntityFile('carriers'),
  CarrierController.create
);

// ✏️ PUT /carriers/:id - update carrier
// Supports: file (PDF)
router.put(
  '/:id',
  // verifyToken,
  // checkRole(['admin', 'dispatcher']),
  uploadEntityFile('carriers'),
  CarrierController.update
);

// ❌ DELETE /carriers/:id/file - remove carrier file
router.delete(
  '/:id/file',
  // verifyToken,
  // checkRole(['admin', 'dispatcher']),
  CarrierController.removeFile
);

// ❌ DELETE /carriers/:id - delete carrier
router.delete(
  '/:id',
  // verifyToken,
  // checkRole(['admin']),
  CarrierController.delete
);

module.exports = router;








