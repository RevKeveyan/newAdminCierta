const express = require('express');
const router = express.Router();
const statsController = require('../controllers/StatsController');
const { updateAllStats } = require('../services/statsService');
const cachedStatsService = require('../services/cachedStatsService');
const { verifyToken } = require('../middlewares/authMiddleware');
const { checkRole } = require('../middlewares/roleMiddleware');
const { validateRequestWithSchema } = require('../middlewares/validateRequest');
const {
  getGeneralStatsValidation,
  getUserStatsValidation,
  getAllUsersStatsValidation,
  getDetailedStatsValidation,
  updateStatsValidation
} = require('../validations/statisticsValidation');

// Получить общую статистику
router.get('/general', 
  // verifyToken, 
  // validateRequestWithSchema(getGeneralStatsValidation), 
  statsController.getGeneralStats
);

// Получить статистику конкретного пользователя
router.get('/user/:userId', 
  // verifyToken, 
  // validateRequestWithSchema(getUserStatsValidation), 
  statsController.getUserStats
);

// Получить статистику всех пользователей
router.get('/users', 
  // verifyToken, 
  // checkRole(['admin', 'manager']), 
  // validateRequestWithSchema(getAllUsersStatsValidation), 
  statsController.getAllUsersStats
);

// Получить детальную статистику по изменениям
router.get('/detailed', 
  // verifyToken, 
  // validateRequestWithSchema(getDetailedStatsValidation), 
  statsController.getDetailedStats
);

// Admin trigger for manual update (legacy)
router.post('/update', 
  // verifyToken, 
  // checkRole(['admin']), 
  // validateRequestWithSchema(updateStatsValidation),
  async (req, res) => {
    try {
      await updateAllStats();
      res.json({ message: 'Statistics updated successfully' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update statistics', details: err.message });
    }
  }
);

// Admin trigger for cached stats update
router.post('/update-cached', 
  // verifyToken, 
  // checkRole(['admin']), 
  async (req, res) => {
    try {
      await cachedStatsService.updateAllCachedStats();
      res.json({ message: 'Cached statistics updated successfully' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update cached statistics', details: err.message });
    }
  }
);

module.exports = router;
