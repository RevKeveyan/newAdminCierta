/**
 * Audit Service - Centralized audit logging
 * Tracks all changes to entities in the system
 */

const { getCurrentDateUTC5 } = require('../utils/dateUtils');

class AuditService {
  /**
   * Log an audit event
   * @param {Object} params
   * @param {String} params.entity - Entity name (e.g., 'Load', 'User', 'Customer')
   * @param {String|ObjectId} params.entityId - Entity ID
   * @param {String} params.action - Action type (created, updated, deleted, status_updated, etc.)
   * @param {String|ObjectId} params.actorId - User ID who performed the action
   * @param {Array} params.changes - Array of changes [{field, oldValue, newValue}]
   * @param {Object} params.meta - Additional metadata
   * @returns {Promise<Object>} Created audit record
   */
  async log({ entity, entityId, action, actorId, changes = [], meta = {} }) {
    if (!entity || !entityId || !action) {
      console.warn('[AuditService] Missing required fields:', { entity, entityId, action });
      return null;
    }

    try {
      // Get the appropriate history model based on entity
      const historyModel = this.getHistoryModel(entity);
      if (!historyModel) {
        console.warn(`[AuditService] No history model found for entity: ${entity}`);
        return null;
      }

      // Filter out empty changes
      const filteredChanges = Array.isArray(changes) 
        ? changes.filter(change => 
            change && 
            change.field && 
            (change.oldValue !== change.newValue || 
             (change.oldValue === null && change.newValue !== null) ||
             (change.oldValue !== null && change.newValue === null))
          )
        : [];

      // Create audit record
      const auditRecord = await historyModel.create({
        load: entityId, // LoadHistory uses 'load' field
        action,
        changedBy: actorId,
        changes: filteredChanges,
        date: getCurrentDateUTC5(),
        ...meta
      });

      return auditRecord;
    } catch (error) {
      console.error('[AuditService] Failed to create audit record:', error);
      return null;
    }
  }

  /**
   * Get history model for entity
   * @param {String} entity - Entity name
   * @returns {Model|null} History model
   */
  getHistoryModel(entity) {
    try {
      // Map entity names to history models
      const modelMap = {
        'Load': require('../models/subModels/LoadHistory'),
        // Add more mappings as needed
        // 'User': require('../models/subModels/UserHistory'),
        // 'Customer': require('../models/subModels/CustomerHistory'),
      };

      return modelMap[entity] || null;
    } catch (error) {
      console.error(`[AuditService] Error loading history model for ${entity}:`, error);
      return null;
    }
  }

  /**
   * Log entity creation
   */
  async logCreate(entity, entityId, actorId, initialData = {}) {
    const changes = Object.keys(initialData).map(key => ({
      field: key,
      oldValue: null,
      newValue: initialData[key]
    }));

    return this.log({
      entity,
      entityId,
      action: 'created',
      actorId,
      changes
    });
  }

  /**
   * Log entity update
   */
  async logUpdate(entity, entityId, actorId, changes = []) {
    return this.log({
      entity,
      entityId,
      action: 'updated',
      actorId,
      changes
    });
  }

  /**
   * Log entity deletion
   */
  async logDelete(entity, entityId, actorId) {
    return this.log({
      entity,
      entityId,
      action: 'deleted',
      actorId,
      changes: []
    });
  }

  /**
   * Log status change
   */
  async logStatusChange(entity, entityId, actorId, oldStatus, newStatus) {
    return this.log({
      entity,
      entityId,
      action: 'status_updated',
      actorId,
      changes: [{
        field: 'status',
        oldValue: oldStatus,
        newValue: newStatus
      }]
    });
  }
}

module.exports = new AuditService();

