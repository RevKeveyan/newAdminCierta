const express = require('express');
const router = express.Router();
const CarrierController = require('../controllers/CarrierController');
const { verifyToken } = require('../middlewares/authMiddleware');
const { uploadSeparateFiles } = require('../middlewares/uploadMiddleware');

router.get('/search', verifyToken, CarrierController.search);
router.get('/', verifyToken, CarrierController.getAll);
router.get('/:id', verifyToken, CarrierController.getById);
router.get('/:id/loads', verifyToken, CarrierController.getCarrierLoads);

router.post(
  '/',
  verifyToken,
  uploadSeparateFiles('carriers', { allowImages: true, allowPDFs: true }),
  CarrierController.create
);

router.put(
  '/:id',
  verifyToken,
  uploadSeparateFiles('carriers', { allowImages: true, allowPDFs: true }),
  CarrierController.update
);

router.delete('/:id/file', verifyToken, CarrierController.removeFile);
router.delete('/:id', verifyToken, CarrierController.delete);

module.exports = router;








