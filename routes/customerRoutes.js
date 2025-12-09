const express = require('express');
const router = express.Router();
const CustomerController = require('../controllers/CustomerController');
const { verifyToken } = require('../middlewares/authMiddleware');
const { checkRole } = require('../middlewares/roleMiddleware');
const { uploadEntityFile } = require('../middlewares/uploadMiddleware');

// 🔍 GET /customers - get all customers
router.get(
  '/',
  // verifyToken,
  // checkRole(['admin', 'dispatcher', 'manager']),
  CustomerController.getAll
);

// 🔍 GET /customers/search - search customers
router.get(
  '/search',
  // verifyToken,
  // checkRole(['admin', 'dispatcher', 'manager']),
  CustomerController.search
);

// 🔍 GET /customers/:id - get customer by ID
router.get(
  '/:id',
  // verifyToken,
  // checkRole(['admin', 'dispatcher', 'manager']),
  CustomerController.getById
);

// 🔍 GET /customers/:id/loads - get all loads for customer
router.get(
  '/:id/loads',
  // verifyToken,
  // checkRole(['admin', 'dispatcher', 'manager']),
  CustomerController.getCustomerLoads
);

// ➕ POST /customers - create customer
// Supports: file (PDF)
router.post(
  '/',
  // verifyToken,
  // checkRole(['admin', 'dispatcher']),
  uploadEntityFile('customers'),
  CustomerController.create
);

// ✏️ PUT /customers/:id - update customer
// Supports: file (PDF)
router.put(
  '/:id',
  // verifyToken,
  // checkRole(['admin', 'dispatcher']),
  uploadEntityFile('customers'),
  CustomerController.update
);

// ❌ DELETE /customers/:id/file - remove customer file
router.delete(
  '/:id/file',
  // verifyToken,
  // checkRole(['admin', 'dispatcher']),
  CustomerController.removeFile
);

// ❌ DELETE /customers/:id - delete customer
router.delete(
  '/:id',
  // verifyToken,
  // checkRole(['admin']),
  CustomerController.delete
);

module.exports = router;








