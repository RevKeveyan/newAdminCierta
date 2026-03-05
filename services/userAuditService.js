const UserHistory = require('../models/subModels/UserHistory');

/**
 * User Audit Service
 * Handles audit logging for User entity changes
 */

class UserAuditService {
  /**
   * Log user change
   * @param {Object} params - Audit parameters
   * @param {ObjectId} params.entityId - User ID
   * @param {String} params.action - Action type
   * @param {Object} params.actor - Actor information
   * @param {Array} params.changes - Array of changes
   * @returns {Promise<Object>} - Created history record
   */
  async logUserChange({ entityId, action, actor, changes = [] }) {
    try {
      if (!entityId || !action || !actor || !actor.actorId) {
        console.warn('[UserAuditService] Missing required fields');
        return null;
      }

      // Filter out empty changes
      const filteredChanges = Array.isArray(changes)
        ? changes.filter(change =>
            change &&
            change.field &&
            (change.from !== change.to ||
             (change.from === null && change.to !== null) ||
             (change.from !== null && change.to === null))
          )
        : [];

      if (filteredChanges.length === 0 && action !== 'created' && action !== 'delete') {
        // No actual changes
        return null;
      }

      const historyRecord = await UserHistory.create({
        entityId,
        action,
        actor: {
          actorId: actor.actorId,
          actorRole: actor.actorRole || 'unknown',
          actorEmail: actor.actorEmail || null
        },
        changes: filteredChanges
      });

      return historyRecord;
    } catch (error) {
      console.error('[UserAuditService] Error logging user change:', error);
      return null;
    }
  }

  /**
   * Get user timeline (all activities by a user)
   * @param {ObjectId} userId - User ID
   * @param {Object} filters - Filters (from, to, action, entityType, search)
   * @returns {Promise<Array>} - Timeline entries
   */
  async getUserTimeline(userId, filters = {}) {
    try {
      const LoadHistory = require('../models/subModels/LoadHistory');
      
      const { from, to, action, entityType, search } = filters;

      // Build query for LoadHistory (where user is actor)
      const loadHistoryQuery = {
        'actor.actorId': userId
      };

      if (from || to) {
        loadHistoryQuery.createdAt = {};
        if (from) loadHistoryQuery.createdAt.$gte = new Date(from);
        if (to) loadHistoryQuery.createdAt.$lte = new Date(to);
      }

      if (action) {
        loadHistoryQuery.action = action;
      }

      // Build query for UserHistory (where user is entity)
      const userHistoryQuery = {
        entityId: userId
      };

      if (from || to) {
        userHistoryQuery.createdAt = {};
        if (from) userHistoryQuery.createdAt.$gte = new Date(from);
        if (to) userHistoryQuery.createdAt.$lte = new Date(to);
      }

      if (action) {
        userHistoryQuery.action = action;
      }

      // Fetch both histories
      const [loadHistory, userHistory] = await Promise.all([
        LoadHistory.find(loadHistoryQuery).sort({ createdAt: -1 }).limit(1000).lean(),
        UserHistory.find(userHistoryQuery).sort({ createdAt: -1 }).limit(1000).lean()
      ]);

      // Combine and format
      const timeline = [
        ...loadHistory.map(item => ({
          ...item,
          entityType: 'Load',
          entityId: item.load
        })),
        ...userHistory.map(item => ({
          ...item,
          entityType: 'User',
          entityId: item.entityId
        }))
      ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // Apply search filter if provided
      if (search) {
        const searchLower = search.toLowerCase();
        return timeline.filter(item => {
          return (
            item.action?.toLowerCase().includes(searchLower) ||
            item.changes?.some(c => 
              c.field?.toLowerCase().includes(searchLower) ||
              String(c.from || '').toLowerCase().includes(searchLower) ||
              String(c.to || '').toLowerCase().includes(searchLower)
            )
          );
        });
      }

      // Filter by entityType if provided
      if (entityType) {
        return timeline.filter(item => item.entityType === entityType);
      }

      return timeline;
    } catch (error) {
      console.error('[UserAuditService] Error getting user timeline:', error);
      throw error;
    }
  }
}

module.exports = new UserAuditService();
