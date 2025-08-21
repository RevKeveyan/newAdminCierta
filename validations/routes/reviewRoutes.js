const express = require('express');
const router = express.Router({ mergeParams: true });
const controller = require('../controllers/ReviewController');
const { verifyToken } = require('../middlewares/authMiddleware');

router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/', verifyToken, controller.create);
router.put('/:id', verifyToken, controller.update);
router.delete('/:id', verifyToken, controller.delete);

module.exports = router;
