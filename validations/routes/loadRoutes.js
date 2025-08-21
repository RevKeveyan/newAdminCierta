const express = require('express');
const router = express.Router();
const loadController = require('../controllers/loadController');
const { verifyToken } = require('../middlewares/authMiddleware');
const { checkRole } = require('../middlewares/roleMiddleware');

router.get('/', verifyToken, checkRole(['admin', 'dispatcher']), loadController.getAllFiltered);
router.put('/:id', verifyToken, checkRole(['admin', 'dispatcher']), loadController.update);

module.exports = router;
