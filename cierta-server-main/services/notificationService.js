const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

function serializeLoadForEmailNotification(load) {
  if (!load) return {};
  const o = typeof load.toObject === 'function'
    ? load.toObject({ depopulate: false })
    : { ...load };
  let carrier = o.carrier;
  if (carrier && typeof carrier === 'object' && carrier._id) {
    carrier = {
      name: carrier.name,
      companyName: carrier.companyName,
      email: carrier.email,
      phoneNumber: carrier.phoneNumber,
    };
  }
  return {
    _id: o._id,
    orderId: o.orderId,
    status: o.status,
    type: o.type,
    pickup: o.pickup || null,
    delivery: o.delivery || null,
    dates: o.dates || null,
    vehicle: o.vehicle || null,
    freight: o.freight || null,
    loadCarrierPeople: Array.isArray(o.loadCarrierPeople) ? o.loadCarrierPeople : [],
    carrier: carrier || null,
    updatedAt: o.updatedAt,
    createdAt: o.createdAt,
  };
}

function hasStatusChange(changes) {
  if (!changes) {
    return false;
  }
  if (Array.isArray(changes)) {
    return changes.some(change => change.field === 'status');
  }
  if (typeof changes === 'object') {
    return Object.keys(changes).includes('status');
  }
  return false;
}

/**
 * Notification Service Client
 * Handles communication with the external notification service running on port 5001
 */
class NotificationService {
  constructor() {
    // Get notification service URL from environment or default to localhost:5001
    this.baseURL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:5001';
    this.timeout = parseInt(process.env.NOTIFICATION_SERVICE_TIMEOUT) || 30000; // Increased to 30 seconds
    this.enabled = process.env.NOTIFICATION_SERVICE_ENABLED !== 'false'; // Enabled by default
    this.internalToken = process.env.NOTIFICATION_INTERNAL_TOKEN || process.env.INTERNAL_TOKEN || process.env.INTERNAL_API_TOKEN;
    
    // Log token configuration status
    if (!this.internalToken) {
      console.warn('[NotificationService] ⚠️  Internal token not configured!');
      console.warn('[NotificationService] Set one of: NOTIFICATION_INTERNAL_TOKEN, INTERNAL_TOKEN, or INTERNAL_API_TOKEN');
    } else {
      console.log('[NotificationService] ✅ Internal token configured');
    }
    
    // Create axios instance with default config
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        // Add internal token if configured
        ...(this.internalToken && { 'X-Internal-Token': this.internalToken })
      }
    });

    // Add request interceptor for logging (optional)
    this.client.interceptors.request.use(
      (config) => {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[NotificationService] Sending request to ${config.url}`);
          console.log(`[NotificationService] Request headers:`, {
            'Content-Type': config.headers['Content-Type'],
            'X-Internal-Token': config.headers['X-Internal-Token'] ? 'present' : 'missing'
          });
        }
        return config;
      },
      (error) => {
        console.error('[NotificationService] Request error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        // Don't throw errors - just log them so the main request doesn't fail
        console.error('[NotificationService] Response error:', error.message);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Send a notification
   * @param {Object} notificationData - Notification payload
   * @param {string} notificationData.type - Notification type
   * @param {string} notificationData.title - Notification title
   * @param {string} notificationData.message - Notification message
   * @param {string|Array} notificationData.recipients - User IDs or emails
   * @param {Object} notificationData.data - Additional data
   * @param {string} notificationData.priority - Priority level (low, normal, high, urgent)
   * @returns {Promise<Object>} Notification response
   */
  /**
   * Send notification to notification service
   * Uses internal token for authentication if configured
   */
  async sendNotification(notificationData) {
    if (!this.enabled) {
      console.log('[NotificationService] Service is disabled, skipping notification');
      console.log('[NotificationService] Notification data:', JSON.stringify(notificationData, null, 2));
      return { success: false, message: 'Notification service is disabled' };
    }

    try {
      // Always use internal endpoint for creating notifications
      // Public endpoint only supports GET/PATCH/DELETE for user notifications
      const endpoint = '/internal/notifications';
      
      // Check if internal token is configured
      if (!this.internalToken) {
        console.warn('[NotificationService] WARNING: Internal token not configured. Notifications may fail.');
        console.warn('[NotificationService] Set NOTIFICATION_INTERNAL_TOKEN or INTERNAL_TOKEN environment variable');
      }
      
      // Generate eventId for idempotency (required by notification service)
      const eventId = notificationData.eventId || uuidv4();
      
      // Prepare payload with required fields
      const payload = {
        type: notificationData.type,
        version: notificationData.version || 1,
        eventId: eventId,
        title: notificationData.title,
        message: notificationData.message,
        recipients: Array.isArray(notificationData.recipients) 
          ? notificationData.recipients 
          : [notificationData.recipients].filter(Boolean),
        data: notificationData.data || {},
        priority: notificationData.priority || 'normal'
      };
      
      // Validate required fields
      if (!payload.type || !payload.title || !payload.message) {
        throw new Error('Missing required fields: type, title, message');
      }
      
      if (!payload.recipients || payload.recipients.length === 0) {
        console.warn('[NotificationService] No recipients provided, skipping notification');
        return { success: false, message: 'No recipients provided' };
      }
      
      console.log(`[NotificationService] Sending notification to ${this.baseURL}${endpoint}`);
      console.log('[NotificationService] Notification type:', payload.type);
      console.log('[NotificationService] Event ID:', payload.eventId);
      console.log('[NotificationService] Recipients count:', payload.recipients.length);
      
      const response = await this.client.post(endpoint, payload);
      console.log('[NotificationService] Notification sent successfully:', response.status);
      console.log('[NotificationService] Response:', JSON.stringify(response.data, null, 2));
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      // Log error but don't throw - notifications are non-critical
      // Don't break the main flow if notification fails
      console.error('[NotificationService] Failed to send notification:', error.message);
      console.error('[NotificationService] Notification data:', JSON.stringify(notificationData, null, 2));
      
      if (error.code === 'ECONNREFUSED' || error.code === 'ECONNABORTED') {
        console.error('[NotificationService] ❌ Connection error - is notification service running on', this.baseURL);
        console.error('[NotificationService] 💡 Make sure notification service is started: cd notifications && npm start');
      } else if (error.code === 'ETIMEDOUT') {
        console.error('[NotificationService] ⏱️  Request timeout - notification service may be overloaded or not responding');
      }
      
      if (error.response) {
        console.error('[NotificationService] Response status:', error.response.status);
        console.error('[NotificationService] Response data:', error.response.data);
      } else if (error.request) {
        console.error('[NotificationService] No response received from notification service');
        console.error('[NotificationService] Error code:', error.code);
      }
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }

  /**
   * Send notification to multiple recipients
   * @param {Object} notificationData - Notification payload
   * @param {Array} recipients - Array of user IDs or emails
   * @returns {Promise<Object>} Notification response
   */
  async sendBulkNotification(notificationData, recipients) {
    if (!this.enabled) {
      return { success: false, message: 'Notification service is disabled' };
    }

    try {
      const response = await this.client.post('/notifications/bulk', {
        ...notificationData,
        recipients
      });
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('[NotificationService] Failed to send bulk notification:', error.message);
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }

  /**
   * Send load status update notification
   * @param {Object} load - Load document
   * @param {string} oldStatus - Previous status
   * @param {string} newStatus - New status
   * @param {string} updatedBy - User ID who updated the status
   * @returns {Promise<Object>} Notification response
   */
  async sendLoadStatusUpdate(load, oldStatus, newStatus, updatedBy) {
    const recipients = [];
    
    // Add customer
    if (load.customerEmails && Array.isArray(load.customerEmails)) {
      recipients.push(...load.customerEmails);
    }
    if (load.customer && typeof load.customer === 'string') {
      recipients.push(load.customer);
    } else if (load.customer && typeof load.customer === 'object' && load.customer._id) {
      recipients.push(load.customer._id.toString());
      if (load.customer.email) {
        recipients.push(load.customer.email);
      }
      if (Array.isArray(load.customer.emails)) {
        recipients.push(...load.customer.emails);
      }
    }
    
    // Add carrier
    if (load.carrierEmails && Array.isArray(load.carrierEmails)) {
      recipients.push(...load.carrierEmails);
    }
    if (load.carrier && typeof load.carrier === 'string') {
      recipients.push(load.carrier);
    } else if (load.carrier && typeof load.carrier === 'object' && load.carrier._id) {
      recipients.push(load.carrier._id.toString());
      if (load.carrier.email) {
        recipients.push(load.carrier.email);
      }
    }
    
    // Add createdBy user if available
    if (load.createdBy) {
      const userId = typeof load.createdBy === 'object' ? load.createdBy._id : load.createdBy;
      recipients.push(userId.toString());
    }

    // Always send status update emails; use urgent for Delivered
    let priority = 'high';
    if (newStatus === 'Delivered') {
      priority = 'urgent';
    }

    const uniqueRecipients = [...new Set(recipients)];

    if (uniqueRecipients.length === 0) {
      return { success: false, message: 'No recipients found' };
    }

    return this.sendNotification({
      type: 'load_status_update',
      title: `Load Status Updated: ${load.orderId || load._id}`,
      message: `Load Status Updated ${load.orderId || load._id}: ${oldStatus || 'N/A'} -> ${newStatus || 'N/A'}`,
      recipients: uniqueRecipients,
      data: {
        loadId: load._id.toString(),
        orderId: load.orderId,
        oldStatus,
        newStatus,
        load: serializeLoadForEmailNotification(load),
        updatedBy: updatedBy?.toString() || updatedBy
      },
      priority
    });
  }

  /**
   * Send load created notification
   * @param {Object} load - Load document
   * @param {string} createdBy - User ID who created the load
   * @returns {Promise<Object>} Notification response
   */
  async sendLoadCreated(load, createdBy) {
    const recipients = [];
    
    console.log('[NotificationService] sendLoadCreated called for load:', load._id || load.orderId);
    
    // Add customer emails/user IDs
    if (load.customerEmails && Array.isArray(load.customerEmails)) {
      recipients.push(...load.customerEmails);
    }
    if (load.customer && typeof load.customer === 'string') {
      recipients.push(load.customer);
    } else if (load.customer && typeof load.customer === 'object' && load.customer._id) {
      recipients.push(load.customer._id.toString());
    }
    
    // Add carrier emails/user IDs
    if (load.carrierEmails && Array.isArray(load.carrierEmails)) {
      recipients.push(...load.carrierEmails);
    }
    if (load.carrier && typeof load.carrier === 'string') {
      recipients.push(load.carrier);
    } else if (load.carrier && typeof load.carrier === 'object' && load.carrier._id) {
      recipients.push(load.carrier._id.toString());
    }

    // Remove duplicates
    const uniqueRecipients = [...new Set(recipients)];

    console.log('[NotificationService] sendLoadCreated recipients:', uniqueRecipients.length);

    if (uniqueRecipients.length === 0) {
      console.warn('[NotificationService] sendLoadCreated: No recipients found');
      return { success: false, message: 'No recipients found' };
    }

    return this.sendNotification({
      type: 'load_created',
      title: `New Load Created: ${load.orderId || load._id}`,
      message: `A new load has been created with order ID: ${load.orderId || load._id}`,
      recipients: uniqueRecipients,
      data: {
        loadId: load._id.toString(),
        orderId: load.orderId,
        load: serializeLoadForEmailNotification(load),
        createdBy: createdBy?.toString() || createdBy
      },
      priority: 'normal'
    });
  }

  /**
   * Send load assigned notification
   * @param {Object} load - Load document
   * @param {string} carrierId - Carrier ID
   * @param {string} assignedBy - User ID who assigned the load
   * @returns {Promise<Object>} Notification response
   */
  async sendLoadAssigned(load, carrierId, assignedBy) {
    const recipients = [];
    
    // Add carrier emails/user IDs
    if (load.carrierEmails && Array.isArray(load.carrierEmails)) {
      recipients.push(...load.carrierEmails);
    }
    if (carrierId) {
      recipients.push(carrierId.toString());
    }

    const uniqueRecipients = [...new Set(recipients)];

    if (uniqueRecipients.length === 0) {
      return { success: false, message: 'No recipients found' };
    }

    return this.sendNotification({
      type: 'load_assigned',
      title: `Load Assigned: ${load.orderId || load._id}`,
      message: `You have been assigned to load ${load.orderId || load._id}`,
      recipients: uniqueRecipients,
      data: {
        loadId: load._id.toString(),
        orderId: load.orderId,
        carrierId: carrierId?.toString() || carrierId,
        load: {
          id: load._id.toString(),
          orderId: load.orderId,
          status: load.status,
          carrier: carrierId?.toString() || carrierId
        },
        assignedBy: assignedBy?.toString() || assignedBy
      },
      priority: 'high'
    });
  }

  /**
   * Send load delivered notification (triggers payment creation)
   * @param {Object} load - Load document with populated paymentReceivable and paymentPayable
   * @param {Object} paymentReceivable - Created PaymentReceivable document
   * @param {Object} paymentPayable - Created PaymentPayable document
   * @param {string} updatedBy - User ID who updated the status
   * @returns {Promise<Object>} Notification response
   */
  async sendLoadDelivered(load, paymentReceivable, paymentPayable, updatedBy) {
    const recipients = [];
    
    // Add customer emails
    if (load.customerEmails && Array.isArray(load.customerEmails)) {
      recipients.push(...load.customerEmails);
    }
    
    // Add carrier emails
    if (load.carrierEmails && Array.isArray(load.carrierEmails)) {
      recipients.push(...load.carrierEmails);
    }
    
    // Add createdBy user
    if (load.createdBy) {
      const userId = typeof load.createdBy === 'object' ? load.createdBy._id : load.createdBy;
      recipients.push(userId.toString());
    }

    return this.sendNotification({
      type: 'load_delivered',
      title: `Load Delivered: ${load.orderId}`,
      message: `Load ${load.orderId} has been delivered. Payment records created.`,
      recipients: [...new Set(recipients)],
      data: {
        loadId: load._id.toString(),
        orderId: load.orderId,
        updatedBy,
        deliveryDate: new Date().toISOString(),
        load: {
          id: load._id.toString(),
          orderId: load.orderId,
          status: 'Delivered',
          customerRate: load.customerRate,
          carrierRate: load.carrierRate
        },
        paymentReceivable: paymentReceivable ? {
          id: paymentReceivable._id.toString(),
          amount: paymentReceivable.amount,
          totalAmount: paymentReceivable.totalAmount,
          status: paymentReceivable.status,
          dueDate: paymentReceivable.dueDate
        } : null,
        paymentPayable: paymentPayable ? {
          id: paymentPayable._id.toString(),
          amount: paymentPayable.amount,
          grossAmount: paymentPayable.grossAmount,
          netAmount: paymentPayable.netAmount,
          status: paymentPayable.status
        } : null
      },
      priority: 'urgent'
    });
  }

  /**
   * Send load updated notification
   * @param {Object} load - Load document
   * @param {Object} changes - What was changed
   * @param {string} updatedBy - User ID who updated the load
   * @returns {Promise<Object>} Notification response
   */
  async sendLoadUpdated(load, changes, updatedBy) {
    const recipients = [];
    
    console.log('[NotificationService] sendLoadUpdated called for load:', load._id || load.orderId);
    
    if (load.customerEmails && Array.isArray(load.customerEmails)) {
      recipients.push(...load.customerEmails);
    }
    
    if (load.carrierEmails && Array.isArray(load.carrierEmails)) {
      recipients.push(...load.carrierEmails);
    }
    
    if (load.createdBy) {
      const userId = typeof load.createdBy === 'object' ? load.createdBy._id : load.createdBy;
      recipients.push(userId.toString());
    }

    const uniqueRecipients = [...new Set(recipients)];
    console.log('[NotificationService] sendLoadUpdated recipients:', uniqueRecipients.length);

    if (uniqueRecipients.length === 0) {
      console.warn('[NotificationService] sendLoadUpdated: No recipients found');
      return { success: false, message: 'No recipients found' };
    }

    const message = hasStatusChange(changes)
      ? `Load ${load.orderId} status was updated`
      : `Load ${load.orderId} data was updated`;

    return this.sendNotification({
      type: 'load_updated',
      title: `Load Updated: ${load.orderId}`,
      message,
      recipients: uniqueRecipients,
      data: {
        loadId: load._id.toString(),
        orderId: load.orderId,
        updatedBy,
        changes,
        load: {
          id: load._id.toString(),
          orderId: load.orderId,
          status: load.status
        }
      },
      priority: 'normal'
    });
  }

  /**
   * Send PaymentReceivable created notification
   * Populates customer info, CustomerRate, loadId, dates, and statuses
   * @param {Object} paymentReceivable - PaymentReceivable document
   * @param {Object} load - Associated Load document
   * @returns {Promise<Object>} Notification response
   */
  async sendPaymentReceivableCreated(paymentReceivable, load) {
    const recipients = [];
    
    // Add accounting team user IDs (you can configure this)
    // For now, notify the load creator
    if (load.createdBy) {
      const userId = typeof load.createdBy === 'object' ? load.createdBy._id : load.createdBy;
      recipients.push(userId.toString());
    }

    // Fetch customer information if customerId is available
    let customerInfo = null;
    const customerId = load?.customer?.toString() || load?.customer || paymentReceivable?.customerId;
    if (customerId) {
      try {
        // Populate customer if it's a reference, otherwise fetch it
        if (load?.customer && typeof load.customer === 'object' && load.customer._id) {
          customerInfo = {
            id: load.customer._id?.toString(),
            companyName: load.customer.companyName,
            email: load.customer.emails?.[0] || load.customer.email,
            phoneNumber: load.customer.phoneNumber,
            customerAddress: load.customer.customerAddress
          };
        } else {
          // Fetch customer from database
          const Customer = require('../models/Customer');
          const customer = await Customer.findById(customerId).lean();
          if (customer) {
            customerInfo = {
              id: customer._id?.toString(),
              companyName: customer.companyName,
              email: customer.emails?.[0] || customer.email,
              phoneNumber: customer.phoneNumber,
              customerAddress: customer.customerAddress
            };
          }
        }
      } catch (error) {
        console.error('[NotificationService] Error fetching customer info:', error);
      }
    }

    // Build notification data with all required information
    const notificationData = {
      paymentReceivableId: paymentReceivable._id?.toString() || paymentReceivable.id,
      loadId: load?._id?.toString() || load?.id,
      orderId: load?.orderId,
      customerId: customerId,
      customer: customerInfo,
      // Payment amounts and rates
      amount: paymentReceivable.amount || paymentReceivable.totalAmount,
      customerRate: paymentReceivable.customerRate || paymentReceivable.rate || load?.customerRate,
      // Status information
      status: paymentReceivable.status || paymentReceivable.invoiceStatus || 'Pending',
      // Dates
      createdAt: paymentReceivable.createdAt || paymentReceivable.created_at,
      updatedAt: paymentReceivable.updatedAt || paymentReceivable.updated_at,
      dueDate: paymentReceivable.dueDate || paymentReceivable.due_date,
      invoiceDate: paymentReceivable.invoiceDate || paymentReceivable.invoicedDate || paymentReceivable.invoice_date,
      // Load information
      load: {
        id: load?._id?.toString() || load?.id,
        orderId: load?.orderId,
        status: load?.status,
        customer: customerId
      }
    };

    return this.sendNotification({
      type: 'payment_receivable_created',
      title: `Payment Receivable Created: ${load?.orderId || paymentReceivable._id}`,
      message: `Invoice pending for load ${load?.orderId || load?._id || paymentReceivable._id}. Amount: $${paymentReceivable.amount || paymentReceivable.totalAmount}`,
      recipients: [...new Set(recipients)],
      data: notificationData,
      priority: 'high'
    });
  }

  /**
   * Send PaymentPayable created notification
   * Populates carrier info, CarrierRate, loadId, dates, and statuses
   * @param {Object} paymentPayable - PaymentPayable document
   * @param {Object} load - Associated Load document
   * @returns {Promise<Object>} Notification response
   */
  async sendPaymentPayableCreated(paymentPayable, load) {
    const recipients = [];
    
    // Add accounting team and carrier
    if (load.createdBy) {
      const userId = typeof load.createdBy === 'object' ? load.createdBy._id : load.createdBy;
      recipients.push(userId.toString());
    }
    
    // Add carrier
    const carrierId = load?.carrier?.toString() || load?.carrier || paymentPayable?.carrierId;
    if (carrierId && typeof carrierId === 'string') {
      recipients.push(carrierId);
    }
    
    // Add carrier emails
    if (load.carrierEmails && Array.isArray(load.carrierEmails)) {
      recipients.push(...load.carrierEmails);
    }

    // Fetch carrier information if carrierId is available
    let carrierInfo = null;
    if (carrierId) {
      try {
        // Populate carrier if it's a reference, otherwise fetch it
        if (load?.carrier && typeof load.carrier === 'object' && load.carrier._id) {
          carrierInfo = {
            id: load.carrier._id?.toString(),
            name: load.carrier.name,
            companyName: load.carrier.companyName,
            email: load.carrier.email,
            phoneNumber: load.carrier.phoneNumber,
            address: load.carrier.address,
            mcNumber: load.carrier.mcNumber,
            dotNumber: load.carrier.dotNumber
          };
        } else {
          // Fetch carrier from database
          const Carrier = require('../models/Carrier');
          const carrier = await Carrier.findById(carrierId).lean();
          if (carrier) {
            carrierInfo = {
              id: carrier._id?.toString(),
              name: carrier.name,
              companyName: carrier.companyName,
              email: carrier.email,
              phoneNumber: carrier.phoneNumber,
              address: carrier.address,
              mcNumber: carrier.mcNumber,
              dotNumber: carrier.dotNumber
            };
          }
        }
      } catch (error) {
        console.error('[NotificationService] Error fetching carrier info:', error);
      }
    }

    // Build notification data with all required information
    const notificationData = {
      paymentPayableId: paymentPayable._id?.toString() || paymentPayable.id,
      loadId: load?._id?.toString() || load?.id,
      orderId: load?.orderId,
      carrierId: carrierId,
      carrier: carrierInfo,
      // Payment amounts and rates
      amount: paymentPayable.amount || paymentPayable.grossAmount,
      grossAmount: paymentPayable.grossAmount || paymentPayable.amount,
      netAmount: paymentPayable.netAmount,
      carrierRate: paymentPayable.carrierRate || paymentPayable.rate || load?.carrierRate,
      // Status information
      status: paymentPayable.status || 'Pending',
      // Dates
      createdAt: paymentPayable.createdAt || paymentPayable.created_at,
      updatedAt: paymentPayable.updatedAt || paymentPayable.updated_at,
      dueDate: paymentPayable.dueDate || paymentPayable.due_date,
      scheduledDate: paymentPayable.scheduledDate || paymentPayable.paymentDate || paymentPayable.payment_date,
      // Load information
      load: {
        id: load?._id?.toString() || load?.id,
        orderId: load?.orderId,
        status: load?.status,
        carrier: carrierId
      }
    };

    return this.sendNotification({
      type: 'payment_payable_created',
      title: `Payment Payable Created: ${load?.orderId || paymentPayable._id}`,
      message: `Payment scheduled for carrier on load ${load?.orderId || load?._id}. Amount: $${paymentPayable.amount || paymentPayable.grossAmount}`,
      recipients: [...new Set(recipients)],
      data: notificationData,
      priority: 'high'
    });
  }

  /**
   * Send payment status update notification
   * Populates carrier/customer info, rates, loadId, dates, and statuses
   * @param {Object} payment - Payment document
   * @param {string} paymentType - 'receivable' or 'payable'
   * @param {string} oldStatus - Previous status
   * @param {string} newStatus - New status
   * @param {Object} load - Associated Load document
   * @returns {Promise<Object>} Notification response
   */
  async sendPaymentStatusUpdate(payment, paymentType, oldStatus, newStatus, load) {
    const recipients = [];
    
    let customerInfo = null;
    let carrierInfo = null;
    
    // Add relevant recipients and fetch info based on payment type
    if (paymentType === 'receivable') {
      // Add customer
      const customerId = load?.customer?.toString() || load?.customer || payment?.customerId;
      if (customerId) {
        recipients.push(customerId.toString());
        
        // Fetch customer information
        try {
          if (load?.customer && typeof load.customer === 'object' && load.customer._id) {
            customerInfo = {
              id: load.customer._id?.toString(),
              companyName: load.customer.companyName,
              email: load.customer.emails?.[0] || load.customer.email,
              phoneNumber: load.customer.phoneNumber
            };
          } else {
            const Customer = require('../models/Customer');
            const customer = await Customer.findById(customerId).lean();
            if (customer) {
              customerInfo = {
                id: customer._id?.toString(),
                companyName: customer.companyName,
                email: customer.emails?.[0] || customer.email,
                phoneNumber: customer.phoneNumber
              };
            }
          }
        } catch (error) {
          console.error('[NotificationService] Error fetching customer info:', error);
        }
      }
    } else {
      // Add carrier
      const carrierId = load?.carrier?.toString() || load?.carrier || payment?.carrierId;
      if (carrierId) {
        recipients.push(carrierId.toString());
        
        // Fetch carrier information
        try {
          if (load?.carrier && typeof load.carrier === 'object' && load.carrier._id) {
            carrierInfo = {
              id: load.carrier._id?.toString(),
              name: load.carrier.name,
              companyName: load.carrier.companyName,
              email: load.carrier.email,
              phoneNumber: load.carrier.phoneNumber
            };
          } else {
            const Carrier = require('../models/Carrier');
            const carrier = await Carrier.findById(carrierId).lean();
            if (carrier) {
              carrierInfo = {
                id: carrier._id?.toString(),
                name: carrier.name,
                companyName: carrier.companyName,
                email: carrier.email,
                phoneNumber: carrier.phoneNumber
              };
            }
          }
        } catch (error) {
          console.error('[NotificationService] Error fetching carrier info:', error);
        }
      }
    }

    // Add load creator
    if (load.createdBy) {
      const userId = typeof load.createdBy === 'object' ? load.createdBy._id : load.createdBy;
      recipients.push(userId.toString());
    }

    const isReceivable = paymentType === 'receivable';
    const amount = isReceivable 
      ? (payment.totalAmount || payment.amount)
      : (payment.netAmount || payment.grossAmount || payment.amount);

    // Build notification data with all required information
    const notificationData = {
      paymentId: payment._id?.toString() || payment.id,
      paymentType,
      loadId: load?._id?.toString() || load?.id,
      orderId: load?.orderId,
      // Status information
      oldStatus,
      newStatus,
      // Payment amounts and rates
      amount: payment.amount || payment.totalAmount || payment.grossAmount,
      customerRate: paymentType === 'receivable' ? (payment.customerRate || payment.rate || load?.customerRate) : null,
      carrierRate: paymentType === 'payable' ? (payment.carrierRate || payment.rate || load?.carrierRate) : null,
      // Entity information
      customerId: paymentType === 'receivable' ? (load?.customer?.toString() || load?.customer || payment?.customerId) : null,
      customer: customerInfo,
      carrierId: paymentType === 'payable' ? (load?.carrier?.toString() || load?.carrier || payment?.carrierId) : null,
      carrier: carrierInfo,
      // Dates
      createdAt: payment.createdAt || payment.created_at,
      updatedAt: payment.updatedAt || payment.updated_at,
      dueDate: payment.dueDate || payment.due_date,
      // Load information
      load: {
        id: load?._id?.toString() || load?.id,
        orderId: load?.orderId,
        status: load?.status
      }
    };

    return this.sendNotification({
      type: isReceivable ? 'payment_receivable_status_update' : 'payment_payable_status_update',
      title: `Payment ${isReceivable ? 'Receivable' : 'Payable'} Status Updated: ${load?.orderId || payment._id}`,
      message: `Payment status changed from "${oldStatus}" to "${newStatus}". Amount: $${amount}`,
      recipients: [...new Set(recipients)],
      data: notificationData,
      priority: newStatus === 'Paid' ? 'high' : 'normal'
    });
  }

  /**
   * Send payment overdue notification
   * Populates customer info, CustomerRate, loadId, dates, and statuses
   * @param {Object} paymentReceivable - PaymentReceivable document
   * @param {Object} load - Associated Load document
   * @param {number} daysOverdue - Number of days overdue (optional, will calculate if not provided)
   * @returns {Promise<Object>} Notification response
   */
  async sendPaymentOverdue(paymentReceivable, load, daysOverdue = null) {
    const recipients = [];
    
    // Add accounting team and customer
    const customerId = load?.customer?.toString() || load?.customer || paymentReceivable?.customerId;
    if (customerId) {
      recipients.push(customerId.toString());
    }
    
    // Add load creator
    if (load.createdBy) {
      const userId = typeof load.createdBy === 'object' ? load.createdBy._id : load.createdBy;
      recipients.push(userId.toString());
    }

    // Fetch customer information
    let customerInfo = null;
    if (customerId) {
      try {
        if (load?.customer && typeof load.customer === 'object' && load.customer._id) {
          customerInfo = {
            id: load.customer._id?.toString(),
            companyName: load.customer.companyName,
            email: load.customer.emails?.[0] || load.customer.email,
            phoneNumber: load.customer.phoneNumber,
            customerAddress: load.customer.customerAddress
          };
        } else {
          const Customer = require('../models/Customer');
          const customer = await Customer.findById(customerId).lean();
          if (customer) {
            customerInfo = {
              id: customer._id?.toString(),
              companyName: customer.companyName,
              email: customer.emails?.[0] || customer.email,
              phoneNumber: customer.phoneNumber,
              customerAddress: customer.customerAddress
            };
          }
        }
      } catch (error) {
        console.error('[NotificationService] Error fetching customer info:', error);
      }
    }

    // Calculate days overdue if not provided
    const dueAt = paymentReceivable.dueAt || paymentReceivable.dueDate || paymentReceivable.due_date;
    if (daysOverdue === null && dueAt) {
      daysOverdue = Math.floor((new Date() - new Date(dueAt)) / (1000 * 60 * 60 * 24));
    }

    // Build notification data with all required information
    const notificationData = {
      paymentReceivableId: paymentReceivable._id?.toString() || paymentReceivable.id,
      loadId: load?._id?.toString() || load?.id,
      orderId: load?.orderId,
      customerId: customerId,
      customer: customerInfo,
      // Payment amounts and rates
      amount: paymentReceivable.amount || paymentReceivable.totalAmount,
      customerRate: paymentReceivable.customerRate || paymentReceivable.rate || load?.customerRate,
      // Status information
      status: paymentReceivable.status || paymentReceivable.invoiceStatus || 'Overdue',
      // Dates
      createdAt: paymentReceivable.createdAt || paymentReceivable.created_at,
      updatedAt: paymentReceivable.updatedAt || paymentReceivable.updated_at,
      dueDate: dueAt || null,
      invoiceDate: paymentReceivable.invoiceDate || paymentReceivable.invoicedDate || paymentReceivable.invoice_date,
      daysOverdue,
      // Load information
      load: {
        id: load?._id?.toString() || load?.id,
        orderId: load?.orderId,
        status: load?.status,
        customer: customerId
      }
    };

    return this.sendNotification({
      type: 'payment_overdue',
      title: `⚠️ Payment Overdue: ${load?.orderId || paymentReceivable._id}`,
      message: `Payment for load ${load?.orderId || load?._id} is overdue${daysOverdue ? ` (${daysOverdue} day${daysOverdue === 1 ? '' : 's'})` : ''}! Amount: $${paymentReceivable.amount || paymentReceivable.totalAmount}. Due date: ${dueAt}`,
      recipients: [...new Set(recipients)],
      data: notificationData,
      priority: 'urgent'
    });
  }

  async sendPaymentDueToday(paymentReceivable, load) {
    const recipients = [];
    const customerId = load?.customer?.toString() || load?.customer || paymentReceivable?.customerId;
    if (customerId) {
      recipients.push(customerId.toString());
    }
    if (load.createdBy) {
      const userId = typeof load.createdBy === 'object' ? load.createdBy._id : load.createdBy;
      recipients.push(userId.toString());
    }

    const dueAt = paymentReceivable.dueAt || paymentReceivable.dueDate || paymentReceivable.due_date;

    const notificationData = {
      paymentReceivableId: paymentReceivable._id?.toString() || paymentReceivable.id,
      loadId: load?._id?.toString() || load?.id,
      orderId: load?.orderId,
      customerId: customerId,
      status: paymentReceivable.status || paymentReceivable.invoiceStatus || 'pending',
      dueDate: dueAt || null,
      load: {
        id: load?._id?.toString() || load?.id,
        orderId: load?.orderId,
        status: load?.status,
        customer: customerId
      }
    };

    return this.sendNotification({
      type: 'payment_due_today',
      title: `📌 Payment Due Today: ${load?.orderId || paymentReceivable._id}`,
      message: `Payment for load ${load?.orderId || load?._id} is due today. Amount: $${paymentReceivable.amount || paymentReceivable.totalAmount}.`,
      recipients: [...new Set(recipients)],
      data: notificationData,
      priority: 'high'
    });
  }

  /**
   * Send payment payable overdue notification
   * @param {Object} paymentPayable - PaymentPayable document
   * @param {Object} load - Associated Load document
   * @param {number} daysOverdue - Number of days overdue (optional)
   */
  async sendPaymentPayableOverdue(paymentPayable, load, daysOverdue = null) {
    const recipients = [];

    // Add admin users
    try {
      const User = require('../models/User');
      const adminUsers = await User.find({ role: 'admin' }).select('_id').lean();
      adminUsers.forEach(u => recipients.push(u._id.toString()));
    } catch (error) {
      console.error('[NotificationService] Error fetching admin users:', error);
    }

    // Add carrier users
    const carrierId = load?.carrier?.toString() || load?.carrier || paymentPayable?.carrier;
    if (carrierId) {
      try {
        const User = require('../models/User');
        const carrierUsers = await User.find({ role: 'carrier', carrier: carrierId })
          .select('_id')
          .lean();
        carrierUsers.forEach(u => recipients.push(u._id.toString()));
      } catch (error) {
        console.error('[NotificationService] Error fetching carrier users:', error);
      }
    }

    // Add load creator
    if (load.createdBy) {
      const userId = typeof load.createdBy === 'object' ? load.createdBy._id : load.createdBy;
      recipients.push(userId.toString());
    }

    const dueAt = paymentPayable.dueAt || paymentPayable.dueDate || paymentPayable.due_date;
    if (daysOverdue === null && dueAt) {
      daysOverdue = Math.floor((new Date() - new Date(dueAt)) / (1000 * 60 * 60 * 24));
    }

    const notificationData = {
      paymentPayableId: paymentPayable._id?.toString() || paymentPayable.id,
      paymentType: 'payable',
      loadId: load?._id?.toString() || load?.id,
      orderId: load?.orderId,
      carrierId: carrierId,
      carrier: paymentPayable.carrier || null,
      amount: paymentPayable.amount || paymentPayable.totalAmount,
      carrierRate: paymentPayable.carrierRate || load?.carrierRate,
      status: paymentPayable.status || 'Overdue',
      createdAt: paymentPayable.createdAt || paymentPayable.created_at,
      updatedAt: paymentPayable.updatedAt || paymentPayable.updated_at,
      dueDate: dueAt || null,
      daysOverdue,
      load: {
        id: load?._id?.toString() || load?.id,
        orderId: load?.orderId,
        status: load?.status,
        carrier: carrierId
      }
    };

    return this.sendNotification({
      type: 'payment_overdue',
      title: `⚠️ Payment Payable Overdue: ${load?.orderId || paymentPayable._id}`,
      message: `Payment payable for load ${load?.orderId || load?._id} is overdue! Amount: $${paymentPayable.amount || paymentPayable.totalAmount}. Due date: ${dueAt}`,
      recipients: [...new Set(recipients)],
      data: notificationData,
      priority: 'urgent'
    });
  }

  /**
   * Get priority level based on load status
   * @param {string} status - Load status
   * @returns {string} Priority level
   */
  getStatusPriority(status) {
    const priorityMap = {
      'Delivered': 'urgent',
      'Picked up': 'high',
      'Dispatched': 'normal',
      'On Hold': 'normal',
      'Cancelled': 'high',
      'Listed': 'low'
    };
    return priorityMap[status] || 'normal';
  }

  /**
   * Check if notification service is available
   * @returns {Promise<boolean>} Service availability
   */
  async checkHealth() {
    if (!this.enabled) {
      return false;
    }

    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch (error) {
      console.error('[NotificationService] Health check failed:', error.message);
      return false;
    }
  }
}

// Export singleton instance
module.exports = new NotificationService();


