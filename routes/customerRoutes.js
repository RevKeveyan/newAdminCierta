const express = require('express');
const router = express.Router();
const CustomerController = require('../controllers/CustomerController');
const { verifyToken } = require('../middlewares/authMiddleware');
const { checkRole } = require('../middlewares/roleMiddleware');

// 🔍 GET /api/customers - get all customers
router.get(
  '/',
  // verifyToken,
  // checkRole(['admin', 'dispatcher', 'manager']),
  CustomerController.getAll
);

// 🔍 GET /api/customers/search - search customers
router.get(
  '/search',
  // verifyToken,
  // checkRole(['admin', 'dispatcher', 'manager']),
  CustomerController.search
);

// 🔍 GET /api/customers/:id - get customer by ID
router.get(
  '/:id',
  // verifyToken,
  // checkRole(['admin', 'dispatcher', 'manager']),
  CustomerController.getById
);

// 🔍 GET /api/customers/:id/loads - get all loads for customer
router.get(
  '/:id/loads',
  // verifyToken,
  // checkRole(['admin', 'dispatcher', 'manager']),
  CustomerController.getCustomerLoads
);

// ➕ POST /api/customers - create customer
router.post(
  '/',
  // verifyToken,
  // checkRole(['admin', 'dispatcher']),
  CustomerController.create
);

// ✏️ PUT /api/customers/:id - update customer
router.put(
  '/:id',
  // verifyToken,
  // checkRole(['admin', 'dispatcher']),
  CustomerController.update
);

// ❌ DELETE /api/customers/:id - delete customer
router.delete(
  '/:id',
  // verifyToken,
  // checkRole(['admin']),
  CustomerController.delete
);

module.exports = router;




