const userAuditService = require('../services/userAuditService');
const LoadHistory = require('../models/subModels/LoadHistory');
const UserHistory = require('../models/subModels/UserHistory');

/**
 * Audit Controller
 * Handles audit/history API endpoints
 */

class AuditController {
  /**
   * Get user timeline
   * GET /api/audit/user/:id
   */
  async getUserTimeline(req, res) {
    try {
      const { id } = req.params;
      const {
        from,
        to,
        action,
        entityType,
        search,
        limit = 100,
        offset = 0
      } = req.query;

      // Check permissions
      const user = req.user;
      if (user.role !== 'admin' && user.id !== id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const timeline = await userAuditService.getUserTimeline(id, {
        from,
        to,
        action,
        entityType,
        search
      });

      // Paginate
      const paginated = timeline.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

      res.json({
        success: true,
        data: {
          timeline: paginated,
          total: timeline.length,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      console.error('[AuditController] Error getting user timeline:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get user timeline',
        details: error.message
      });
    }
  }

  /**
   * Get load history
   * GET /api/audit/load/:id
   */
  async getLoadHistory(req, res) {
    try {
      const { id } = req.params;
      const {
        from,
        to,
        action,
        limit = 100,
        offset = 0
      } = req.query;

      const query = { load: id };

      if (from || to) {
        query.createdAt = {};
        if (from) query.createdAt.$gte = new Date(from);
        if (to) query.createdAt.$lte = new Date(to);
      }

      if (action) {
        query.action = action;
      }

      const history = await LoadHistory.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(offset))
        .lean();

      const total = await LoadHistory.countDocuments(query);

      res.json({
        success: true,
        data: {
          history,
          total,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      console.error('[AuditController] Error getting load history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get load history',
        details: error.message
      });
    }
  }

  /**
   * Get user history
   * GET /api/audit/user-history/:id
   */
  async getUserHistory(req, res) {
    try {
      const { id } = req.params;
      const {
        from,
        to,
        action,
        limit = 100,
        offset = 0
      } = req.query;

      // Check permissions
      const user = req.user;
      if (user.role !== 'admin' && user.id !== id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const query = { entityId: id };

      if (from || to) {
        query.createdAt = {};
        if (from) query.createdAt.$gte = new Date(from);
        if (to) query.createdAt.$lte = new Date(to);
      }

      if (action) {
        query.action = action;
      }

      const history = await UserHistory.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(offset))
        .lean();

      const total = await UserHistory.countDocuments(query);

      res.json({
        success: true,
        data: {
          history,
          total,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      console.error('[AuditController] Error getting user history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get user history',
        details: error.message
      });
    }
  }
}

module.exports = new AuditController();
