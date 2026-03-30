const mongoose = require('mongoose');
const User = require('../models/User');
const Customer = require('../models/Customer');

/**
 * Определяет scope доступа пользователя к статистике
 * @param {Object} user - User объект из req.user (может быть неполным)
 * @returns {Promise<Object>} Объект с разрешениями:
 *   - allowedEntityTypes: Array<'system' | 'customer' | 'carrier' | 'user'>
 *   - allowedEntityIds: Object с ключами по entityType и массивами ID
 *   - allowedSections: Array<'loads' | 'payments' | 'users'>
 *   - paymentTypes: Array<'receivable' | 'payable'> | null (null = все типы)
 */
async function getStatsScope(user) {
  if (!user || !user.role) {
    return {
      allowedEntityTypes: [],
      allowedEntityIds: {},
      allowedSections: [],
      paymentTypes: null
    };
  }

  const role = user.role;
  const userId = user._id?.toString() || user.id?.toString();

  let userDoc = null;
  if (userId) {
    userDoc = await User.findById(userId).select('role allowedCustomers').lean();
  }

  const allowedCustomers = Array.isArray(userDoc?.allowedCustomers)
    ? userDoc.allowedCustomers.map(id => id.toString())
    : Array.isArray(user?.allowedCustomers)
    ? user.allowedCustomers.map(id => id.toString())
    : [];

  if (role === 'admin' || role === 'manager') {
    return {
      allowedEntityTypes: ['system', 'customer', 'carrier', 'user'],
      allowedEntityIds: {},
      allowedSections: ['loads', 'payments', 'users'],
      paymentTypes: null
    };
  }

  if (role === 'accountingManager') {
    return {
      allowedEntityTypes: ['system'],
      allowedEntityIds: {},
      allowedSections: ['payments'],
      paymentTypes: null
    };
  }

  if (role === 'accountingIn') {
    return {
      allowedEntityTypes: ['system'],
      allowedEntityIds: {},
      allowedSections: ['payments'],
      paymentTypes: ['receivable']
    };
  }

  if (role === 'accountingOut') {
    return {
      allowedEntityTypes: ['system'],
      allowedEntityIds: {},
      allowedSections: ['payments'],
      paymentTypes: ['payable']
    };
  }

  if (role === 'freightBroker' || role === 'dispatcher' || role === 'Pre-dispatcher' || role === 'bidAgent') {
    return {
      allowedEntityTypes: ['customer'],
      allowedEntityIds: {
        customer: allowedCustomers
      },
      allowedSections: ['loads'],
      paymentTypes: null
    };
  }

  if (role === 'salesAgent') {
    if (allowedCustomers.length === 0) {
      return {
        allowedEntityTypes: [],
        allowedEntityIds: {},
        allowedSections: [],
        paymentTypes: null
      };
    }

    const customerObjectIds = allowedCustomers
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));

    if (customerObjectIds.length === 0) {
      return {
        allowedEntityTypes: [],
        allowedEntityIds: {},
        allowedSections: [],
        paymentTypes: null
      };
    }

    const platformCustomers = await Customer.find({
      _id: { $in: customerObjectIds },
      type: 'platform'
    })
    .select('_id')
    .lean();

    const platformCustomerIds = platformCustomers.map(c => c._id.toString());

    return {
      allowedEntityTypes: ['customer'],
      allowedEntityIds: {
        customer: platformCustomerIds
      },
      allowedSections: ['loads'],
      paymentTypes: null
    };
  }

  if (role === 'partner') {
    return {
      allowedEntityTypes: [],
      allowedEntityIds: {},
      allowedSections: [],
      paymentTypes: null
    };
  }

  return {
    allowedEntityTypes: [],
    allowedEntityIds: {},
    allowedSections: [],
    paymentTypes: null
  };
}

/**
 * Проверяет, имеет ли пользователь доступ к конкретной сущности статистики
 * @param {Object} user - User объект
 * @param {String} entityType - 'system' | 'customer' | 'carrier' | 'user'
 * @param {String|null} entityId - ID сущности или null для system
 * @returns {Promise<Boolean>}
 */
async function hasStatsEntityAccess(user, entityType, entityId) {
  const scope = await getStatsScope(user);

  if (!scope.allowedEntityTypes.includes(entityType)) {
    return false;
  }

  if (entityType === 'system') {
    return true;
  }

  if (entityId) {
    const allowedIds = scope.allowedEntityIds[entityType];
    if (allowedIds === undefined) {
      return true;
    }
    return allowedIds.length > 0 && allowedIds.includes(entityId.toString());
  }

  return false;
}

/**
 * Проверяет, имеет ли пользователь доступ к разделу статистики
 * @param {Object} user - User объект
 * @param {String} section - 'loads' | 'payments' | 'users'
 * @returns {Promise<Boolean>}
 */
async function hasStatsSectionAccess(user, section) {
  const scope = await getStatsScope(user);
  return scope.allowedSections.includes(section);
}

/**
 * Проверяет, имеет ли пользователь доступ к типу платежей
 * @param {Object} user - User объект
 * @param {String} paymentType - 'receivable' | 'payable'
 * @returns {Promise<Boolean>}
 */
async function hasPaymentTypeAccess(user, paymentType) {
  const scope = await getStatsScope(user);

  if (!scope.allowedSections.includes('payments')) {
    return false;
  }

  if (scope.paymentTypes === null) {
    return true;
  }

  return scope.paymentTypes.includes(paymentType);
}

function resolveStatsScopeForRequest(scope, scopeType, scopeId) {
  const isGlobal = scopeType === 'global' || !scopeType;
  const hasSystem = scope.allowedEntityTypes && scope.allowedEntityTypes.includes('system');
  const hasCustomer = scope.allowedEntityTypes && scope.allowedEntityTypes.includes('customer');
  const customerIds = scope.allowedEntityIds && scope.allowedEntityIds.customer;
  const hasCustomerIds = Array.isArray(customerIds) && customerIds.length > 0;

  if (isGlobal && !hasSystem && hasCustomer) {
    return {
      entityType: 'customer',
      entityId: null,
      customerIdsForAggregate: Array.isArray(customerIds) ? customerIds : []
    };
  }

  if (isGlobal && !hasSystem) {
    return {
      entityType: null,
      entityId: null,
      customerIdsForAggregate: null
    };
  }

  const entityType = isGlobal ? 'system' : scopeType;
  const entityId = isGlobal ? null : scopeId;
  return {
    entityType,
    entityId,
    customerIdsForAggregate: null
  };
}

module.exports = {
  getStatsScope,
  hasStatsEntityAccess,
  hasStatsSectionAccess,
  hasPaymentTypeAccess,
  resolveStatsScopeForRequest
};
