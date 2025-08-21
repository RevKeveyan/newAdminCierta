const express = require('express');
const router = express.Router();
const controller = require('../controllers/ProductController');
const { verifyToken } = require('../middlewares/authMiddleware');
const { checkRole } = require('../middlewares/roleMiddleware');
const { productCreateValidation } = require('../validations/productValidation');
const validateRequest = require('../middlewares/validateRequest');
const { uploadFiles } = require('../middlewares/uploadMiddleware');


// Public routes
router.get('/', controller.getAll);
router.get('/search', controller.searchAndFilter);
router.get('/:id', controller.getById);

// Protected
router.post(
  '/',
  verifyToken,
  checkRole(['admin', 'seller']),
  uploadFiles('images', true),
  productCreateValidation,     // 👈 валидация
  validateRequest,             // 👈 проверка
  controller.create
);
router.put('/:id', verifyToken, checkRole(['admin', 'seller']), controller.update);
router.delete('/:id', verifyToken, checkRole(['admin']), controller.delete);

module.exports = router;



//TEST

router.post(
  '/upload',
  uploadFiles('loads', true), // 'loads' — это сущность, true — можно загружать несколько файлов
  (req, res) => {
    res.json({
      message: 'Files uploaded successfully',
      urls: req.uploadedFiles
    });
  }
);

module.exports = router;
