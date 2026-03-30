const mongoose = require('mongoose');
const Load = require('../models/Load');
const User = require('../models/User');
const Customer = require('../models/Customer');
const Carrier = require('../models/Carrier');

/**
 * Check if user has permission to access a file
 * @param {String} key - S3 key (e.g., "images/users/2025-12/userId/file.jpg")
 * @param {Object} user - User object from req.user
 * @returns {Promise<{allowed: Boolean, reason?: String}>}
 */
async function checkFileAccess(key, user) {
  if (!key || !user) {
    return { allowed: false, reason: 'Missing key or user' };
  }

  // Admin has access to all files
  if (user.role === 'admin') {
    return { allowed: true };
  }

  // Parse key structure
  // NEW (simple): Entity/EntityID/FileType/filename
  // OLD: FileType/Entity/Year-Month/EntityID/filename or Year/Month/Entity/EntityID/FileType/filename
  const parts = key.split('/');
  
  if (parts.length < 3) {
    return { allowed: false, reason: 'Invalid key format' };
  }

  // Determine structure and extract entity and entityId
  let entity, entityId;
  
  // NEW Structure: Entity/EntityID/FileType/filename
  // Example: users/507f1f77bcf86cd799439011/images/profile.jpg
  if (parts.length >= 4 && (parts[2] === 'images' || parts[2] === 'pdfs')) {
    entity = parts[0];
    entityId = parts[1];
  }
  // OLD Structure 1: FileType/Entity/Year-Month/EntityID/filename
  else if (parts.length >= 5 && (parts[0] === 'images' || parts[0] === 'pdfs')) {
    entity = parts[1];
    entityId = parts[3];
  }
  // OLD Structure 2: Year/Month/Entity/EntityID/FileType/filename
  else if (parts.length >= 6) {
    entity = parts[2];
    entityId = parts[3];
  }
  // Fallback: try to extract from any structure
  else {
    // Try to find entity and entityId in common positions
    entity = parts[0];
    entityId = parts[1];
  }

  // Check access based on entity type
  switch (entity) {
    case 'users':
      // Users can only access their own files
      if (entityId === user._id.toString() || entityId === user.id) {
        return { allowed: true };
      }
      if (user.role === 'admin' || user.role === 'manager') {
        return { allowed: true };
      }
      return { allowed: false, reason: 'Access denied: not your file' };

    case 'loads':
      // Check if user has access to this load
      return await checkLoadAccess(entityId, user);

    case 'customers':
      // Check if user has access to this customer
      return await checkCustomerAccess(entityId, user);

    case 'carriers':
      // Check if user has access to this carrier
      return await checkCarrierAccess(entityId, user);

    case 'payments-payable':
    case 'payments-receivable':
      // Check if user has access to this payment
      return await checkPaymentAccess(entityId, user, entity);

    default:
      // Unknown entity type - deny by default
      return { allowed: false, reason: `Unknown entity type: ${entity}` };
  }
}

/**
 * Check if user has access to a load
 */
async function checkLoadAccess(loadId, user) {
  try {
    const load = await Load.findById(loadId).lean();
    
    if (!load) {
      return { allowed: false, reason: 'Load not found' };
    }

    const userId = user?._id?.toString() || user?.id?.toString();
    const userDoc = userId
      ? await User.findById(userId).select('role allowedCustomers').lean()
      : null;
    const role = userDoc?.role || user.role;
    const allowedCustomers = Array.isArray(userDoc?.allowedCustomers)
      ? userDoc.allowedCustomers.map((id) => id.toString())
      : [];

    if (role === 'admin' || role === 'manager') {
      return { allowed: true };
    }

    if (role === 'accountingManager' || role === 'accountingIn' || role === 'accountingOut') {
      return { allowed: false, reason: 'Access denied' };
    }

    if (role === 'partner') {
      return { allowed: false, reason: 'Access denied' };
    }

    if (role === 'freightBroker') {
      if (load.createdBy && userId && load.createdBy.toString() === userId) {
        return { allowed: true };
      }
      return { allowed: false, reason: 'Access denied: not your load' };
    }

    if (role === 'dispatcher' || role === 'Pre-dispatcher' || role === 'bidAgent') {
      const customerId = load.customer?.toString();
      if (customerId && allowedCustomers.includes(customerId)) {
        return { allowed: true };
      }
      return { allowed: false, reason: 'Access denied: customer not allowed' };
    }

    if (role === 'salesAgent') {
      const customerId = load.customer?.toString();
      if (!customerId) {
        return { allowed: false, reason: 'Access denied' };
      }
      const customer = await Customer.findById(customerId).select('type').lean();
      if (customer?.type === 'platform') {
        return { allowed: true };
      }
      return { allowed: false, reason: 'Access denied' };
    }

    if (load.createdBy && userId && load.createdBy.toString() === userId) {
      return { allowed: true };
    }

    return { allowed: false, reason: 'Access denied: not your load' };
  } catch (error) {
    console.error('Error checking load access:', error);
    return { allowed: false, reason: 'Error checking access' };
  }
}

/**
 * Check if user has access to a customer
 */
async function checkCustomerAccess(customerId, user) {
  try {
    const customer = await Customer.findById(customerId).lean();
    
    if (!customer) {
      return { allowed: false, reason: 'Customer not found' };
    }

    const userId = user?._id?.toString() || user?.id?.toString();
    const userDoc = userId
      ? await User.findById(userId).select('role allowedCustomers').lean()
      : null;
    const role = userDoc?.role || user.role;
    const allowedCustomers = Array.isArray(userDoc?.allowedCustomers)
      ? userDoc.allowedCustomers.map((id) => id.toString())
      : [];

    if (role === 'admin' || role === 'manager') {
      return { allowed: true };
    }

    if (role === 'accountingManager' || role === 'accountingIn' || role === 'accountingOut') {
      return { allowed: false, reason: 'Access denied' };
    }

    if (role === 'partner') {
      return { allowed: false, reason: 'Access denied' };
    }

    if (role === 'freightBroker' || role === 'dispatcher' || role === 'Pre-dispatcher' || role === 'bidAgent') {
      if (allowedCustomers.includes(customerId.toString())) {
        return { allowed: true };
      }
      return { allowed: false, reason: 'Access denied: customer not allowed' };
    }

    if (role === 'salesAgent') {
      if (!allowedCustomers.includes(customerId.toString())) {
        return { allowed: false, reason: 'Access denied' };
      }
      if (customer.type === 'platform') {
        return { allowed: true };
      }
      return { allowed: false, reason: 'Access denied' };
    }

    return { allowed: false, reason: 'Access denied' };
  } catch (error) {
    console.error('Error checking customer access:', error);
    return { allowed: false, reason: 'Error checking access' };
  }
}

/**
 * Check if user has access to a carrier
 */
async function checkCarrierAccess(carrierId, user) {
  try {
    const carrier = await Carrier.findById(carrierId).lean();
    
    if (!carrier) {
      return { allowed: false, reason: 'Carrier not found' };
    }

    const userId = user?._id?.toString() || user?.id?.toString();
    const userDoc = userId
      ? await User.findById(userId).select('role allowedCustomers').lean()
      : null;
    const role = userDoc?.role || user.role;
    const allowedCustomers = Array.isArray(userDoc?.allowedCustomers)
      ? userDoc.allowedCustomers.map((id) => id.toString())
      : [];

    if (role === 'admin' || role === 'manager') {
      return { allowed: true };
    }

    if (role === 'accountingManager' || role === 'accountingIn' || role === 'accountingOut') {
      return { allowed: false, reason: 'Access denied' };
    }

    if (role === 'partner') {
      return { allowed: false, reason: 'Access denied' };
    }

    if (role === 'freightBroker') {
      const conditions = [];
      if (userId) {
        conditions.push({ createdBy: userId });
      }
      if (allowedCustomers.length > 0) {
        conditions.push({ customer: { $in: allowedCustomers } });
      }
      const filter = conditions.length > 0
        ? { carrier: carrierId, $or: conditions }
        : { carrier: carrierId, createdBy: userId };
      const load = await Load.findOne(filter).select('_id').lean();
      return load ? { allowed: true } : { allowed: false, reason: 'Access denied' };
    }

    if (role === 'dispatcher' || role === 'Pre-dispatcher' || role === 'bidAgent') {
      const load = await Load.findOne({
        carrier: carrierId,
        customer: { $in: allowedCustomers }
      }).select('_id').lean();
      return load ? { allowed: true } : { allowed: false, reason: 'Access denied' };
    }

    if (role === 'salesAgent') {
      const platformCustomers = await Customer.find({
        _id: { $in: allowedCustomers },
        type: 'platform'
      }).select('_id').lean();
      const platformIds = platformCustomers.map(item => item._id.toString());
      const load = await Load.findOne({
        carrier: carrierId,
        customer: { $in: platformIds }
      }).select('_id').lean();
      return load ? { allowed: true } : { allowed: false, reason: 'Access denied' };
    }

    return { allowed: false, reason: 'Access denied' };
  } catch (error) {
    console.error('Error checking carrier access:', error);
    return { allowed: false, reason: 'Error checking access' };
  }
}

/**
 * Check if user has access to a payment
 */
async function checkPaymentAccess(paymentId, user, paymentType) {
  try {
    const PaymentModel = paymentType === 'payments-payable' 
      ? require('../models/subModels/PaymentPayable')
      : require('../models/subModels/PaymentReceivable');

    const payment = await PaymentModel.findById(paymentId).lean();
    
    if (!payment) {
      return { allowed: false, reason: 'Payment not found' };
    }

    const role = user?.role;
    if (role === 'admin' || role === 'accountingManager') {
      return { allowed: true };
    }
    if (paymentType === 'payments-receivable' && role === 'accountingIn') {
      return { allowed: true };
    }
    if (paymentType === 'payments-payable' && role === 'accountingOut') {
      return { allowed: true };
    }

    return { allowed: false, reason: 'Access denied' };
  } catch (error) {
    console.error('Error checking payment access:', error);
    return { allowed: false, reason: 'Error checking access' };
  }
}

module.exports = {
  checkFileAccess
};

