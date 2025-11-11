const express = require('express');
const router = express.Router();
const performanceMonitor = require('../utils/performanceMonitor');
const { verifyToken } = require('../middlewares/authMiddleware');
const { checkRole } = require('../middlewares/roleMiddleware');

// Get performance statistics
router.get('/stats', verifyToken, checkRole(['admin']), (req, res) => {
  try {
    const stats = performanceMonitor.getStats();
    const slowestRequests = performanceMonitor.getSlowestRequests(10);
    const requestsByEndpoint = performanceMonitor.getRequestsByEndpoint();

    res.status(200).json({
      success: true,
      data: {
        stats,
        slowestRequests,
        requestsByEndpoint
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get performance stats',
      details: error.message
    });
  }
});

// Export performance metrics
router.post('/export', verifyToken, checkRole(['admin']), (req, res) => {
  try {
    const { filename } = req.body;
    const filePath = performanceMonitor.exportMetrics(filename);

    res.status(200).json({
      success: true,
      data: {
        filePath,
        message: 'Performance metrics exported successfully'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to export performance metrics',
      details: error.message
    });
  }
});

// Clear performance metrics
router.delete('/clear', verifyToken, checkRole(['admin']), (req, res) => {
  try {
    performanceMonitor.clearMetrics();

    res.status(200).json({
      success: true,
      message: 'Performance metrics cleared successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to clear performance metrics',
      details: error.message
    });
  }
});

module.exports = router;
















