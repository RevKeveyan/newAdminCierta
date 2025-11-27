const express = require('express');
const router = express.Router();
const CarrierController = require('../controllers/CarrierController');
const { verifyToken } = require('../middlewares/authMiddleware');
const { checkRole } = require('../middlewares/roleMiddleware');

// 🔍 GET /api/carriers - get all carriers
router.get(
  '/',
  // verifyToken,
  // checkRole(['admin', 'dispatcher', 'manager']),
  CarrierController.getAll
);

// 🔍 GET /api/carriers/search - search carriers
router.get(
  '/search',
  // verifyToken,
  // checkRole(['admin', 'dispatcher', 'manager']),
  CarrierController.search
);

// 🔍 GET /api/carriers/:id - get carrier by ID
router.get(
  '/:id',
  // verifyToken,
  // checkRole(['admin', 'dispatcher', 'manager']),
  CarrierController.getById
);

// 🔍 GET /api/carriers/:id/loads - get all loads for carrier
router.get(
  '/:id/loads',
  // verifyToken,
  // checkRole(['admin', 'dispatcher', 'manager']),
  CarrierController.getCarrierLoads
);

// ➕ POST /api/carriers - create carrier
router.post(
  '/',
  // verifyToken,
  // checkRole(['admin', 'dispatcher']),
  CarrierController.create
);

// ✏️ PUT /api/carriers/:id - update carrier
router.put(
  '/:id',
  // verifyToken,
  // checkRole(['admin', 'dispatcher']),
  CarrierController.update
);

// ❌ DELETE /api/carriers/:id - delete carrier
router.delete(
  '/:id',
  // verifyToken,
  // checkRole(['admin']),
  CarrierController.delete
);

module.exports = router;




