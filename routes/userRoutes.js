const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/authMiddleware');
const { checkRole } = require('../middlewares/roleMiddleware');
const { uploadFiles } = require('../middlewares/uploadMiddleware');
const UserController = require('../controllers/UserController');

// GET /api/users
router.get(
  '/',
  verifyToken,
  checkRole(['admin']),
  UserController.getAll
);

// GET /api/users/search - advanced search
router.get(
  '/search',
  verifyToken,
  checkRole(['admin']),
  UserController.search
);

// GET /api/users/role/:role - get users by role
router.get(
  '/role/:role',
  verifyToken,
  checkRole(['admin']),
  UserController.getByRole
);

// GET /api/users/profile - get current user profile
router.get(
  '/profile',
  verifyToken,
  UserController.getProfile
);

// POST /api/users
router.post(
  '/',
  verifyToken,
  checkRole(['admin']),
  uploadFiles('users', false), // single avatar
  UserController.create
);

// PUT /api/users/:id
router.put(
  '/:id',
  verifyToken,
  checkRole(['admin']),
  uploadFiles('users', false),
  UserController.update
);

// PUT /api/users/:id/status - update user status
router.put(
  '/:id/status',
  verifyToken,
  checkRole(['admin']),
  UserController.updateStatus
);

// PUT /api/users/profile - update current user profile
router.put(
  '/profile',
  verifyToken,
  uploadFiles('users', false),
  UserController.updateProfile
);

// DELETE /api/users/:id
router.delete(
  '/:id',
  verifyToken,
  checkRole(['admin']),
  UserController.delete
);

module.exports = router;
