const express = require('express');
const router = express.Router();
const { updateAllStats } = require('../services/statsService');
const { verifyToken } = require('../middlewares/authMiddleware');
const { checkRole } = require('../middlewares/roleMiddleware');

// Admin trigger for manual update
router.post('/update', verifyToken, checkRole(['admin']), async (req, res) => {
  try {
    await updateAllStats();
    res.json({ message: 'Statistics updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update statistics', details: err.message });
  }
});

module.exports = router;
