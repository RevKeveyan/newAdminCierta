const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/authMiddleware');
const { checkRole } = require('../middlewares/roleMiddleware');
const { uploadUserFiles, uploadSeparateFiles } = require('../middlewares/uploadMiddleware');
const UserController = require('../controllers/UserController');

// GET /users
router.get(
  '/',
  // verifyToken,
  // checkRole(['admin']),
  UserController.getAll
);

// GET /users/search - advanced search
router.get(
  '/search',
  // verifyToken,
  // checkRole(['admin']),
  UserController.search
);

// GET /users/role/:role - get users by role (MUST be before /:id routes)
router.get(
  '/role/:role',
  // verifyToken,
  // checkRole(['admin']),
  UserController.getByRole
);

// GET /users/:id/allowedCustomers - get customers for THIS specific user
router.get(
  '/:id/allowedCustomers',
  // verifyToken,
  // checkRole(['admin']),
  UserController.getAllowedCustomers
);

// GET /users/profile - get current user profile
router.get(
  '/profile',
  verifyToken,
  UserController.getProfile
);

// POST /users
// Supports: profileImage (image), pdfs (multiple PDFs)
router.post(
  '/',
  // verifyToken,
  // checkRole(['admin']),
  uploadSeparateFiles('users', { allowImages: true, allowPDFs: true }),
  UserController.create
);

// PUT /users/:id
// Supports: profileImage (image), pdfs (multiple PDFs)
router.put(
  '/:id',
  // verifyToken,
  // checkRole(['admin']),
  uploadSeparateFiles('users', { allowImages: true, allowPDFs: true }),
  UserController.update
);

// PUT /users/:id/status - update user status
router.put(
  '/:id/status',
  // verifyToken,
  // checkRole(['admin']),
  UserController.updateStatus
);

// PUT /users/profile - update current user profile
// Supports: profileImage (image), pdfs (multiple PDFs)
router.put(
  '/profile/:id',
  verifyToken,
  uploadSeparateFiles('users', { allowImages: true, allowPDFs: true }),
  UserController.updateProfile
);

// DELETE /users/:id/file - remove user PDF file
router.delete(
  '/:id/file',
  // verifyToken,
  // checkRole(['admin']),
  UserController.removeUserFile
);

// DELETE /users/:id
router.delete(
  '/:id',
  // verifyToken,
  // checkRole(['admin']),
  UserController.delete
);

module.exports = router;
