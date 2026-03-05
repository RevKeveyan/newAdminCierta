const Load = require('../models/Load');
const LoadHistory = require('../models/subModels/LoadHistory');
const mongoose = require('mongoose');
const { buildChanges, getByPath } = require('../utils/diffChanges');
const notificationClient = require('./notificationClient');
const auditFields = require('../audit/fields');
const { getCurrentDateUTC5 } = require('../utils/dateUtils');

/**
 * Whitelist of fields to track in Load history
 * Uses centralized audit fields configuration
 */
const LOAD_AUDIT_FIELDS = auditFields.load;

/**
 * Whitelist of fields that can be updated
 * Security: Only these fields can be modified via updateLoad
 */
const ALLOWED_UPDATE_FIELDS = [
  'status',
  'carrier',
  'customer',
  'customerEmails',
  'customerRate',
  'carrierRate',
  'carrierEmails',
  'carrierPhotos',
  'pickup',
  'delivery',
  'vehicle',
  'freight',
  'type',
  'insurance',
  'tracking',
  'orderId',
  'dates',
  'notes',
  'documents',
  'images',
  'paymentMethod',
  'paymentTerms',
  'fees',
  'tonu',
  // Independent copies of people for this specific load
  'loadCarrierPeople',
  'loadCustomerRepresentativePeoples'
];

/**
 * Truncate long text fields for history
 * @param {*} value - Value to truncate
 * @param {Number} maxLength - Maximum length (default: 300)
 * @returns {*} Truncated value or original if not a string
 */
function truncateForHistory(value, maxLength = 300) {
  if (typeof value === 'string' && value.length > maxLength) {
    return value.substring(0, maxLength) + '... [truncated]';
  }
  return value;
}

/**
 * Auto-detect action type based on changes
 * @param {Object} before - Load before update
 * @param {Object} patch - Fields being updated
 * @returns {String} Action type
 */
/**
 * Auto-detect action type based on changes
 * Единое правило для определения типа действия
 * 
 * @param {Object} before - Load before update
 * @param {Object} patch - Fields being updated
 * @returns {String} Action type
 */
function detectAction(before, patch) {
  if (!before) {
    return 'updated';
  }

  // Priority 1: Status change
  if (patch.status !== undefined && patch.status !== before.status) {
    return 'status_update';
  }
  
  // Priority 2: Carrier assignment (was null/undefined, now has value)
  if (patch.carrier !== undefined) {
    const beforeCarrier = before.carrier?.toString() || null;
    const newCarrier = patch.carrier?.toString() || null;
    
    // Assign: carrier was null/undefined, now has a value
    if (!beforeCarrier && newCarrier) {
      return 'assign';
    }
  }
  
  // Default: regular update
  return 'updated';
}

/**
 * Validate and filter patch data
 * @param {Object} patch - Raw patch data
 * @returns {Object} Filtered patch with only allowed fields
 */
function validatePatch(patch) {
  const filtered = {};
  
  // Fields that are set automatically and should be ignored (not warned about)
  const autoFields = ['updatedBy', 'updatedAt', 'createdBy', 'createdAt'];
  
  console.log(`[LoadService.validatePatch] ===== VALIDATING PATCH =====`);
  console.log(`[LoadService.validatePatch] Patch keys:`, Object.keys(patch));
  console.log(`[LoadService.validatePatch] loadCarrierPeople in patch:`, patch.loadCarrierPeople ? `${patch.loadCarrierPeople.length} people` : 'not present');
  console.log(`[LoadService.validatePatch] loadCustomerRepresentativePeoples in patch:`, patch.loadCustomerRepresentativePeoples ? `${patch.loadCustomerRepresentativePeoples.length} people` : 'not present');
  
  for (const key of Object.keys(patch)) {
    if (ALLOWED_UPDATE_FIELDS.includes(key)) {
      filtered[key] = patch[key];
      if (key === 'loadCarrierPeople' || key === 'loadCustomerRepresentativePeoples') {
        console.log(`[LoadService.validatePatch] ✅ Allowed field "${key}" included in filtered patch`);
      }
    } else if (!autoFields.includes(key)) {
      // Only warn about fields that are not auto-managed
      console.warn(`[LoadService] Attempted to update disallowed field: ${key}`);
      if (key === 'loadCarrierPeople' || key === 'loadCustomerRepresentativePeoples') {
        console.error(`[LoadService] ❌ CRITICAL: ${key} is NOT in ALLOWED_UPDATE_FIELDS!`);
      }
    }
    // Silently ignore auto-managed fields (updatedBy, updatedAt, etc.)
  }
  
  console.log(`[LoadService.validatePatch] Filtered keys:`, Object.keys(filtered));
  console.log(`[LoadService.validatePatch] loadCarrierPeople in filtered:`, filtered.loadCarrierPeople ? `${filtered.loadCarrierPeople.length} people` : 'not present');
  console.log(`[LoadService.validatePatch] loadCustomerRepresentativePeoples in filtered:`, filtered.loadCustomerRepresentativePeoples ? `${filtered.loadCustomerRepresentativePeoples.length} people` : 'not present');
  
  return filtered;
}

/**
 * Update Load with audit logging and transaction support
 * 
 * @param {String} loadId - Load ID
 * @param {Object} patch - Fields to update
 * @param {Object} actor - Actor information from req.user
 * @param {Object} options - Additional options
 * @param {String} options.action - Action type (optional, auto-detected if not provided)
 * @param {Boolean} options.useTransaction - Use transaction (default: false)
 * @param {Function} options.additionalOperations - Additional operations to run in transaction
 * @returns {Promise<Object>} Updated load
 */
async function updateLoad(loadId, patch, actor, options = {}) {
  if (!loadId) {
    throw new Error('Load ID is required');
  }

  if (!actor || !actor.id) {
    throw new Error('Actor information is required');
  }

  // Validate and filter patch
  const validatedPatch = validatePatch(patch);

  // Get before state
  const before = await Load.findById(loadId).lean();
  if (!before) {
    throw new Error('Load not found');
  }

  // Auto-detect action type if not provided
  let actionType = options.action;
  if (!actionType) {
    actionType = detectAction(before, validatedPatch);
  }

  const useTransaction = options.useTransaction || false;
  const additionalOperations = options.additionalOperations || null;

  // Prepare update data
  const updateData = {
    ...validatedPatch,
    updatedBy: actor.id,
    updatedAt: getCurrentDateUTC5()
  };

  // DEBUG: Log updateData before saving
  console.log(`[LoadService.updateLoad] ===== UPDATE DATA BEFORE SAVE =====`);
  console.log(`[LoadService.updateLoad] updateData keys:`, Object.keys(updateData));
  console.log(`[LoadService.updateLoad] updateData.loadCarrierPeople:`, updateData.loadCarrierPeople ? `${updateData.loadCarrierPeople.length} people` : 'not present');
  console.log(`[LoadService.updateLoad] updateData.loadCustomerRepresentativePeoples:`, updateData.loadCustomerRepresentativePeoples ? `${updateData.loadCustomerRepresentativePeoples.length} people` : 'not present');

  // If using transaction, wrap everything in a session
  if (useTransaction) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Apply update
      const updated = await Load.findByIdAndUpdate(
        loadId,
        updateData,
        { new: true, runValidators: true, session }
      ).lean();

      // Compute changes (truncate long fields)
      const changes = buildChanges(before, updated, LOAD_AUDIT_FIELDS)
        .map(change => ({
          field: change.field,
          from: truncateForHistory(change.from),
          to: truncateForHistory(change.to)
        }));

      // Log to history if there are changes
      if (changes.length > 0) {
        await LoadHistory.create([{
          load: loadId,
          action: actionType,
          actor: {
            actorId: actor.id,
            actorRole: actor.role || 'unknown',
            actorEmail: actor.email || null
          },
          changes
        }], { session });

        // Send notification event (non-blocking, outside transaction)
        // Notification is sent after transaction commits
        setImmediate(async () => {
          try {
            const load = await Load.findById(loadId).lean();
            if (load) {
              // Build targets hint
              const targets = {};
              if (load.customer) {
                targets.customerId = load.customer.toString();
              }
              if (load.carrier) {
                targets.carrierId = load.carrier.toString();
              }
              targets.admin = true; // Always notify admins

              await notificationClient.sendUpdatedEvent(
                'load',
                load,
                actor,
                changes,
                { targets, includeEntityData: true }
              );
            }
          } catch (error) {
            console.error('[LoadService] Failed to send notification event:', error);
          }
        });
      }

      // Run additional operations if provided
      if (additionalOperations && typeof additionalOperations === 'function') {
        await additionalOperations(session, updated);
      }

      // Populate before returning
      const populated = await Load.findById(updated._id)
        .populate('customer')
        .populate('carrier')
        .populate('createdBy')
        .populate('updatedBy')
        .populate('paymentReceivable')
        .populate('paymentPayable')
        .session(session)
        .lean();

      // DEBUG: Log saved data
      console.log(`[LoadService.updateLoad] ===== SAVED DATA (TRANSACTION) =====`);
      console.log(`[LoadService.updateLoad] populated.loadCarrierPeople:`, populated.loadCarrierPeople ? `${populated.loadCarrierPeople.length} people` : 'not present');
      console.log(`[LoadService.updateLoad] populated.loadCustomerRepresentativePeoples:`, populated.loadCustomerRepresentativePeoples ? `${populated.loadCustomerRepresentativePeoples.length} people` : 'not present');

      // Commit transaction
      await session.commitTransaction();
      session.endSession();

      return populated;
    } catch (error) {
      // Rollback on error
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } else {
    // Simple update without transaction
    const updated = await Load.findByIdAndUpdate(
      loadId,
      updateData,
      { new: true, runValidators: true }
    )
    .populate('customer')
    .populate('carrier')
    .populate('createdBy')
    .populate('updatedBy')
    .populate('paymentReceivable')
    .populate('paymentPayable')
    .lean();

    // DEBUG: Log saved data
    console.log(`[LoadService.updateLoad] ===== SAVED DATA (NO TRANSACTION) =====`);
    console.log(`[LoadService.updateLoad] updated.loadCarrierPeople:`, updated.loadCarrierPeople ? `${updated.loadCarrierPeople.length} people` : 'not present');
    console.log(`[LoadService.updateLoad] updated.loadCustomerRepresentativePeoples:`, updated.loadCustomerRepresentativePeoples ? `${updated.loadCustomerRepresentativePeoples.length} people` : 'not present');

    // Compute changes (truncate long fields)
    const changes = buildChanges(before, updated, LOAD_AUDIT_FIELDS)
      .map(change => ({
        field: change.field,
        from: truncateForHistory(change.from),
        to: truncateForHistory(change.to)
      }));

    // Log to history if there are changes
    if (changes.length > 0) {
      try {
        await LoadHistory.create({
          load: loadId,
          action: actionType,
          actor: {
            actorId: actor.id,
            actorRole: actor.role || 'unknown',
            actorEmail: actor.email || null
          },
          changes
        });

        // Send notification event (non-blocking)
        setImmediate(async () => {
          try {
            const load = await Load.findById(loadId).lean();
            if (load) {
              // Build targets hint
              const targets = {};
              if (load.customer) {
                targets.customerId = load.customer.toString();
              }
              if (load.carrier) {
                targets.carrierId = load.carrier.toString();
              }
              targets.admin = true;

              await notificationClient.sendUpdatedEvent(
                'load',
                load,
                actor,
                changes,
                { targets, includeEntityData: true }
              );
            }
          } catch (error) {
            console.error('[LoadService] Failed to send notification event:', error);
          }
        });
      } catch (error) {
        // Log error but don't fail the update
        console.error('[LoadService] Failed to create history record:', error);
      }
    }

    return updated;
  }
}

/**
 * Create Load with audit logging
 * 
 * @param {Object} loadData - Load data
 * @param {Object} actor - Actor information from req.user
 * @returns {Promise<Object>} Created load
 */
async function createLoad(loadData, actor) {
  if (!actor || !actor.id) {
    throw new Error('Actor information is required');
  }

  // Create load
  const newLoad = new Load({
    ...loadData,
    createdBy: actor.id,
    updatedBy: actor.id
  });

  const saved = await newLoad.save();
  const savedLean = saved.toObject();

  // Log creation
  try {
    // Get all initial values as changes
    const initialChanges = LOAD_AUDIT_FIELDS
      .filter(field => {
        const value = getByPath(savedLean, field);
        return value !== undefined && value !== null;
      })
      .map(field => ({
        field,
        from: null,
        to: getByPath(savedLean, field)
      }));

    if (initialChanges.length > 0) {
      await LoadHistory.create({
        load: saved._id,
        action: 'created',
        actor: {
          actorId: actor.id,
          actorRole: actor.role || 'unknown',
          actorEmail: actor.email || null
        },
        changes: initialChanges
      });

      // Send notification event (non-blocking)
      setImmediate(async () => {
        try {
          // Build targets hint
          const targets = {};
          if (savedLean.customer) {
            targets.customerId = savedLean.customer.toString();
          }
          if (savedLean.carrier) {
            targets.carrierId = savedLean.carrier.toString();
          }
          targets.admin = true;

          await notificationClient.sendCreatedEvent(
            'load',
            savedLean,
            actor,
            { targets, includeEntityData: true }
          );
        } catch (error) {
          console.error('[LoadService] Failed to send notification event:', error);
        }
      });
    }
  } catch (error) {
    console.error('[LoadService] Failed to create history record:', error);
  }

  return savedLean;
}

/**
 * Delete Load with audit logging
 * 
 * @param {String} loadId - Load ID
 * @param {Object} actor - Actor information from req.user
 * @returns {Promise<Object>} Deleted load
 */
async function deleteLoad(loadId, actor) {
  if (!loadId) {
    throw new Error('Load ID is required');
  }

  if (!actor || !actor.id) {
    throw new Error('Actor information is required');
  }

  // Get before state
  const before = await Load.findById(loadId).lean();
  if (!before) {
    throw new Error('Load not found');
  }

  // Delete load
  await Load.findByIdAndDelete(loadId);

  // Log deletion
  try {
    await LoadHistory.create({
      load: loadId,
      action: 'delete',
      actor: {
        actorId: actor.id,
        actorRole: actor.role || 'unknown',
        actorEmail: actor.email || null
      },
      changes: [] // No field changes on delete
    });
  } catch (error) {
    console.error('[LoadService] Failed to create history record:', error);
  }

  return before;
}


module.exports = {
  updateLoad,
  createLoad,
  deleteLoad,
  LOAD_AUDIT_FIELDS,
  ALLOWED_UPDATE_FIELDS,
  validatePatch,
  detectAction
};

