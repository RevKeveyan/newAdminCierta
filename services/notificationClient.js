const axios = require('axios');

/**
 * Notification Client
 * Sends events to Notification Service in unified format
 */

const NOTIF_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:5001';
const INTERNAL_TOKEN = process.env.NOTIFICATION_INTERNAL_TOKEN || process.env.INTERNAL_TOKEN || process.env.INTERNAL_API_TOKEN;
const TIMEOUT = parseInt(process.env.NOTIFICATION_SERVICE_TIMEOUT) || 5000;
const ENABLED = process.env.NOTIFICATION_SERVICE_ENABLED !== 'false';

// Log token configuration status on module load
if (!INTERNAL_TOKEN && ENABLED) {
  console.warn('[NotificationClient] ⚠️  WARNING: Internal token not configured!');
  console.warn('[NotificationClient] Set one of: NOTIFICATION_INTERNAL_TOKEN, INTERNAL_TOKEN, or INTERNAL_API_TOKEN');
  console.warn('[NotificationClient] Notifications will fail with 403 errors until token is configured');
} else if (INTERNAL_TOKEN && ENABLED) {
  console.log('[NotificationClient] ✅ Internal token configured, notifications enabled');
} else if (!ENABLED) {
  console.log('[NotificationClient] ℹ️  Notification service is disabled');
}

/**
 * Send notification event to Notification Service
 * 
 * @param {Object} event - Event payload
 * @param {String} event.type - Event type (e.g., 'load.updated', 'customer.created')
 * @param {Number} event.version - Event version (default: 1)
 * @param {String} event.eventId - Unique event ID
 * @param {String} event.priority - Priority: 'low' | 'normal' | 'high' | 'urgent'
 * @param {Object} event.data - Event data
 * @param {Object} event.actor - Actor information
 * @param {String} event.createdAt - ISO timestamp
 * @returns {Promise<Object>} Response from notification service
 */
async function sendEvent(event) {
  if (!ENABLED) {
    console.log('[NotificationClient] Service is disabled, skipping event');
    return { success: false, message: 'Notification service is disabled' };
  }

  if (!event || !event.type) {
    console.error('[NotificationClient] Invalid event: missing type');
    return { success: false, error: 'Invalid event: missing type' };
  }

  // Check if token is configured before attempting to send
  if (!INTERNAL_TOKEN) {
    console.error('[NotificationClient] ❌ Cannot send event: Internal token not configured');
    console.error('[NotificationClient] Set NOTIFICATION_INTERNAL_TOKEN, INTERNAL_TOKEN, or INTERNAL_API_TOKEN environment variable');
    return { 
      success: false, 
      error: 'Internal token not configured',
      message: 'Set NOTIFICATION_INTERNAL_TOKEN, INTERNAL_TOKEN, or INTERNAL_API_TOKEN environment variable'
    };
  }

  try {
    // Trim token to remove any whitespace
    const tokenToSend = String(INTERNAL_TOKEN).trim();
    
    const headers = {
      'Content-Type': 'application/json',
      'X-Internal-Token': tokenToSend
    };

    const response = await axios.post(
      `${NOTIF_URL}/internal/events`,
      event,
      {
        headers,
        timeout: TIMEOUT
      }
    );

    console.log(`[NotificationClient] ✅ Event sent successfully: ${event.type} (eventId: ${event.eventId})`);
    return {
      success: true,
      data: response.data
    };
  } catch (error) {
    // Don't throw - notification failures shouldn't break main flow
    console.error(`[NotificationClient] ❌ Failed to send event: ${event.type}`, error.message);
    if (error.response) {
      console.error('[NotificationClient] Response status:', error.response.status);
      console.error('[NotificationClient] Response data:', error.response.data);
      
      // Provide helpful error messages
      if (error.response.status === 403) {
        console.error('[NotificationClient] 💡 This is likely a token mismatch. Check that:');
        console.error('[NotificationClient]    1. NOTIFICATION_INTERNAL_TOKEN is set in server/.env');
        console.error('[NotificationClient]    2. The same token is set in notifications/.env');
        console.error('[NotificationClient]    3. Both services are restarted after setting the token');
      }
    } else if (error.code === 'ECONNREFUSED') {
      console.error('[NotificationClient] 💡 Connection refused. Is notification service running on', NOTIF_URL, '?');
    }
    return {
      success: false,
      error: error.message,
      status: error.response?.status,
      data: null
    };
  }
}

/**
 * Build event payload from entity data
 * 
 * @param {String} entityType - Entity type (load, customer, carrier, user, payment)
 * @param {String} action - Action (created, updated, deleted, status_updated)
 * @param {Object} entity - Entity document
 * @param {Object} actor - Actor information from req.user
 * @param {Array} changes - Array of changes [{ field, from, to }]
 * @param {Object} options - Additional options
 * @returns {Object} Event payload
 */
function buildEvent(entityType, action, entity, actor, changes = [], options = {}) {
  const entityId = entity._id?.toString() || entity.id?.toString();
  const timestamp = new Date().toISOString();
  
  // Generate unique event ID with better uniqueness
  const randomSuffix = Math.random().toString(36).substring(2, 9);
  const eventId = `${entityType}:${entityId}:${action}:${timestamp}:${randomSuffix}`;

  // Determine priority based on action and entity type
  let priority = 'normal';
  if (action === 'deleted' || action === 'status_updated') {
    priority = 'high';
  } else if (entityType === 'load' && action === 'status_updated' && entity.status === 'Delivered') {
    priority = 'urgent';
  } else if (action === 'created') {
    priority = 'normal';
  }

  // Build summary
  let summary = `${entityType.charAt(0).toUpperCase() + entityType.slice(1)} ${action}`;
  if (entityType === 'load' && entity.orderId) {
    summary = `Load ${entity.orderId} ${action}`;
  } else if (entityType === 'customer' && entity.companyName) {
    summary = `Customer ${entity.companyName} ${action}`;
  } else if (entityType === 'carrier' && entity.companyName) {
    summary = `Carrier ${entity.companyName} ${action}`;
  } else if (entityType === 'user' && entity.email) {
    summary = `User ${entity.email} ${action}`;
  }

  // Build meta data with more context
  const meta = {};
  if (entityType === 'load') {
    meta.orderId = entity.orderId;
    meta.status = entity.status;
    // Include load data for better notification context
    if (options.includeEntityData) {
      meta.load = {
        orderId: entity.orderId,
        status: entity.status,
        customer: entity.customer,
        carrier: entity.carrier
      };
    }
  } else if (entityType === 'customer') {
    meta.companyName = entity.companyName;
    if (options.includeEntityData) {
      meta.customer = {
        companyName: entity.companyName,
        email: entity.email
      };
    }
  } else if (entityType === 'carrier') {
    meta.companyName = entity.companyName;
    meta.mcNumber = entity.mcNumber;
    if (options.includeEntityData) {
      meta.carrier = {
        companyName: entity.companyName,
        mcNumber: entity.mcNumber,
        email: entity.email
      };
    }
  } else if (entityType === 'user') {
    meta.email = entity.email;
    meta.role = entity.role;
    if (options.includeEntityData) {
      meta.user = {
        email: entity.email,
        role: entity.role,
        firstName: entity.firstName,
        lastName: entity.lastName
      };
    }
  } else if (entityType === 'payment') {
    meta.orderId = entity.orderId;
    meta.paymentType = entity.type || entity.paymentType || null;
    meta.loadId = entity.loadId?._id?.toString() ||
      entity.loadId?.id?.toString() ||
      entity.loadId?.toString() ||
      entity.load?.id?.toString() ||
      entity.load?._id?.toString() ||
      entity.load?.toString();

    if (entity.customer) {
      meta.customerId = entity.customer?._id?.toString() ||
        entity.customer?.id?.toString() ||
        entity.customer?.toString();
    }

    if (entity.carrier) {
      meta.carrierId = entity.carrier?._id?.toString() ||
        entity.carrier?.id?.toString() ||
        entity.carrier?.toString();
    }
  }

  // Add targets hint if provided
  if (options.targets) {
    meta.targets = options.targets;
  }

  // Include full entity data in data field for notifications service
  const eventData = {
    entityId,
    entity: entityType,
    changes,
    summary,
    meta
  };

  // Include entity data if requested (for better notification context)
  if (options.includeEntityData && entity) {
    eventData[entityType] = entity;
  }

  return {
    type: `${entityType}.${action}`,
    version: 1,
    eventId,
    priority,
    data: eventData,
    actor: {
      id: actor?.id?.toString() || actor?._id?.toString() || null,
      role: actor?.role || 'unknown',
      email: actor?.email || null
    },
    createdAt: timestamp
  };
}

/**
 * Send created event
 * 
 * @param {String} entityType - Entity type
 * @param {Object} entity - Created entity
 * @param {Object} actor - Actor information
 * @param {Object} options - Additional options
 */
async function sendCreatedEvent(entityType, entity, actor, options = {}) {
  const event = buildEvent(entityType, 'created', entity, actor, [], options);
  return sendEvent(event);
}

/**
 * Send updated event
 * 
 * @param {String} entityType - Entity type
 * @param {Object} entity - Updated entity
 * @param {Object} actor - Actor information
 * @param {Array} changes - Array of changes
 * @param {Object} options - Additional options
 */
async function sendUpdatedEvent(entityType, entity, actor, changes = [], options = {}) {
  // Only send if there are changes
  if (!changes || changes.length === 0) {
    return { success: false, message: 'No changes to notify' };
  }

  // Determine action type based on changes
  let action = 'updated';
  const statusChange = changes.find(c => c.field === 'status');
  if (statusChange) {
    action = 'status_updated';
  }

  const event = buildEvent(entityType, action, entity, actor, changes, options);
  return sendEvent(event);
}

/**
 * Send deleted event
 * 
 * @param {String} entityType - Entity type
 * @param {Object} entity - Deleted entity (before deletion)
 * @param {Object} actor - Actor information
 * @param {Object} options - Additional options
 */
async function sendDeletedEvent(entityType, entity, actor, options = {}) {
  const event = buildEvent(entityType, 'deleted', entity, actor, [], options);
  return sendEvent(event);
}

module.exports = {
  sendEvent,
  buildEvent,
  sendCreatedEvent,
  sendUpdatedEvent,
  sendDeletedEvent
};


