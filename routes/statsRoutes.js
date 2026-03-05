const express = require('express');
const router = express.Router();
const StatsController = require('../controllers/StatsController');
const { verifyToken } = require('../middlewares/authMiddleware');

router.get('/loads', verifyToken, StatsController.getLoadsStats);
router.get('/export', verifyToken, StatsController.exportStats);
router.get('/users/by-role', verifyToken, StatsController.getUsersByRole);
router.get('/top-users', verifyToken, StatsController.getTopUsers);
router.get('/carriers-summary', verifyToken, StatsController.getCarriersSummary);
router.get('/customers-summary', verifyToken, StatsController.getCustomersSummary);
router.get('/', verifyToken, StatsController.getStatsFacade);

module.exports = router;
