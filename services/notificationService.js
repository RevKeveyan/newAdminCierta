const axios = require('axios');

/**
 * Notification Service Client
 * Handles communication with the external notification service running on port 5001
 */
class NotificationService {
  constructor() {
    // Get notification service URL from environment or default to localhost:5001
    this.baseURL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:5001';
    this.timeout = parseInt(process.env.NOTIFICATION_SERVICE_TIMEOUT) || 5000;
    this.enabled = process.env.NOTIFICATION_SERVICE_ENABLED !== 'false'; // Enabled by default
    
    // Create axios instance with default config
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Add request interceptor for logging (optional)
    this.client.interceptors.request.use(
      (config) => {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[NotificationService] Sending request to ${config.url}`);
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
  async sendNotification(notificationData) {
    if (!this.enabled) {
      console.log('[NotificationService] Service is disabled, skipping notification');
      return { success: false, message: 'Notification service is disabled' };
    }

    try {
      const response = await this.client.post('/notifications', notificationData);
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      // Log error but don't throw - notifications are non-critical
      console.error('[NotificationService] Failed to send notification:', error.message);
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
    
    // Add customer emails if available
    if (load.customerEmails && Array.isArray(load.customerEmails)) {
      recipients.push(...load.customerEmails);
    }
    
    // Add carrier emails if available
    if (load.carrierEmails && Array.isArray(load.carrierEmails)) {
      recipients.push(...load.carrierEmails);
    }
    
    // Add createdBy user if available
    if (load.createdBy && load.createdBy._id) {
      recipients.push(load.createdBy._id.toString());
    }

    if (recipients.length === 0) {
      return { success: false, message: 'No recipients found' };
    }

    return this.sendNotification({
      type: 'load_status_update',
      title: `Load Status Updated: ${load.orderId || load._id}`,
      message: `Load status changed from "${oldStatus}" to "${newStatus}"`,
      recipients: [...new Set(recipients)], // Remove duplicates
      data: {
        loadId: load._id.toString(),
        orderId: load.orderId,
        oldStatus,
        newStatus,
        updatedBy,
        load: {
          id: load._id.toString(),
          orderId: load.orderId,
          status: newStatus,
          customer: load.customer ? (typeof load.customer === 'object' ? load.customer._id : load.customer) : null,
          carrier: load.carrier ? (typeof load.carrier === 'object' ? load.carrier._id : load.carrier) : null
        }
      },
      priority: this.getStatusPriority(newStatus)
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
    
    // Add customer emails if available
    if (load.customerEmails && Array.isArray(load.customerEmails)) {
      recipients.push(...load.customerEmails);
    }
    
    // Add carrier emails if available
    if (load.carrierEmails && Array.isArray(load.carrierEmails)) {
      recipients.push(...load.carrierEmails);
    }

    if (recipients.length === 0) {
      return { success: false, message: 'No recipients found' };
    }

    return this.sendNotification({
      type: 'load_created',
      title: `New Load Created: ${load.orderId || load._id}`,
      message: `A new load has been created with order ID: ${load.orderId}`,
      recipients: [...new Set(recipients)],
      data: {
        loadId: load._id.toString(),
        orderId: load.orderId,
        createdBy,
        load: {
          id: load._id.toString(),
          orderId: load.orderId,
          status: load.status,
          customer: load.customer ? (typeof load.customer === 'object' ? load.customer._id : load.customer) : null,
          carrier: load.carrier ? (typeof load.carrier === 'object' ? load.carrier._id : load.carrier) : null
        }
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
    
    // Add carrier emails
    if (load.carrierEmails && Array.isArray(load.carrierEmails)) {
      recipients.push(...load.carrierEmails);
    }
    
    // Add carrier ID if available
    if (carrierId) {
      recipients.push(carrierId.toString());
    }

    if (recipients.length === 0) {
      return { success: false, message: 'No recipients found' };
    }

    return this.sendNotification({
      type: 'load_assigned',
      title: `Load Assigned: ${load.orderId || load._id}`,
      message: `You have been assigned to load ${load.orderId}`,
      recipients: [...new Set(recipients)],
      data: {
        loadId: load._id.toString(),
        orderId: load.orderId,
        carrierId: carrierId ? carrierId.toString() : null,
        assignedBy,
        load: {
          id: load._id.toString(),
          orderId: load.orderId,
          status: load.status
        }
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

    if (recipients.length === 0) {
      return { success: false, message: 'No recipients found' };
    }

    return this.sendNotification({
      type: 'load_updated',
      title: `Load Updated: ${load.orderId}`,
      message: `Load ${load.orderId} has been updated`,
      recipients: [...new Set(recipients)],
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
   * @param {Object} paymentReceivable - PaymentReceivable document
   * @param {Object} load - Associated Load document
   * @returns {Promise<Object>} Notification response
   */
  async sendPaymentReceivableCreated(paymentReceivable, load) {
    const recipients = [];
    
    // Notify accounting team (you can configure this)
    // For now, notify the load creator
    if (load.createdBy) {
      const userId = typeof load.createdBy === 'object' ? load.createdBy._id : load.createdBy;
      recipients.push(userId.toString());
    }

    return this.sendNotification({
      type: 'payment_receivable_created',
      title: `Payment Receivable Created: ${load.orderId}`,
      message: `Invoice pending for load ${load.orderId}. Amount: $${paymentReceivable.totalAmount || paymentReceivable.amount}`,
      recipients: [...new Set(recipients)],
      data: {
        paymentReceivableId: paymentReceivable._id.toString(),
        loadId: load._id.toString(),
        orderId: load.orderId,
        customerId: paymentReceivable.customer ? paymentReceivable.customer.toString() : null,
        amount: paymentReceivable.amount,
        totalAmount: paymentReceivable.totalAmount,
        status: paymentReceivable.status,
        dueDate: paymentReceivable.dueDate
      },
      priority: 'high'
    });
  }

  /**
   * Send PaymentPayable created notification
   * @param {Object} paymentPayable - PaymentPayable document
   * @param {Object} load - Associated Load document
   * @returns {Promise<Object>} Notification response
   */
  async sendPaymentPayableCreated(paymentPayable, load) {
    const recipients = [];
    
    // Notify accounting team and carrier
    if (load.createdBy) {
      const userId = typeof load.createdBy === 'object' ? load.createdBy._id : load.createdBy;
      recipients.push(userId.toString());
    }
    
    // Notify carrier
    if (load.carrierEmails && Array.isArray(load.carrierEmails)) {
      recipients.push(...load.carrierEmails);
    }

    return this.sendNotification({
      type: 'payment_payable_created',
      title: `Payment Payable Created: ${load.orderId}`,
      message: `Payment scheduled for carrier on load ${load.orderId}. Amount: $${paymentPayable.netAmount || paymentPayable.grossAmount || paymentPayable.amount}`,
      recipients: [...new Set(recipients)],
      data: {
        paymentPayableId: paymentPayable._id.toString(),
        loadId: load._id.toString(),
        orderId: load.orderId,
        carrierId: paymentPayable.carrier ? paymentPayable.carrier.toString() : null,
        amount: paymentPayable.amount,
        grossAmount: paymentPayable.grossAmount,
        netAmount: paymentPayable.netAmount,
        status: paymentPayable.status,
        scheduledDate: paymentPayable.scheduledDate
      },
      priority: 'high'
    });
  }

  /**
   * Send payment status update notification
   * @param {string} paymentType - 'receivable' or 'payable'
   * @param {Object} payment - Payment document
   * @param {string} oldStatus - Previous status
   * @param {string} newStatus - New status
   * @param {Object} load - Associated Load document
   * @returns {Promise<Object>} Notification response
   */
  async sendPaymentStatusUpdate(paymentType, payment, oldStatus, newStatus, load) {
    const recipients = [];
    
    if (load.createdBy) {
      const userId = typeof load.createdBy === 'object' ? load.createdBy._id : load.createdBy;
      recipients.push(userId.toString());
    }

    const isReceivable = paymentType === 'receivable';
    const amount = isReceivable 
      ? (payment.totalAmount || payment.amount)
      : (payment.netAmount || payment.grossAmount || payment.amount);

    return this.sendNotification({
      type: isReceivable ? 'payment_receivable_status_update' : 'payment_payable_status_update',
      title: `Payment ${isReceivable ? 'Receivable' : 'Payable'} Status Updated: ${load.orderId}`,
      message: `Payment status changed from "${oldStatus}" to "${newStatus}". Amount: $${amount}`,
      recipients: [...new Set(recipients)],
      data: {
        paymentId: payment._id.toString(),
        paymentType,
        loadId: load._id.toString(),
        orderId: load.orderId,
        oldStatus,
        newStatus,
        amount,
        paidAmount: payment.paidAmount,
        remainingAmount: payment.remainingAmount
      },
      priority: newStatus === 'Paid' ? 'high' : 'normal'
    });
  }

  /**
   * Send payment overdue notification
   * @param {Object} payment - PaymentReceivable document
   * @param {Object} load - Associated Load document
   * @returns {Promise<Object>} Notification response
   */
  async sendPaymentOverdue(payment, load) {
    const recipients = [];
    
    if (load.createdBy) {
      const userId = typeof load.createdBy === 'object' ? load.createdBy._id : load.createdBy;
      recipients.push(userId.toString());
    }

    return this.sendNotification({
      type: 'payment_overdue',
      title: `⚠️ Payment Overdue: ${load.orderId}`,
      message: `Payment for load ${load.orderId} is overdue! Amount: $${payment.totalAmount || payment.amount}. Due date: ${payment.dueDate}`,
      recipients: [...new Set(recipients)],
      data: {
        paymentReceivableId: payment._id.toString(),
        loadId: load._id.toString(),
        orderId: load.orderId,
        amount: payment.totalAmount || payment.amount,
        dueDate: payment.dueDate,
        daysOverdue: Math.floor((new Date() - new Date(payment.dueDate)) / (1000 * 60 * 60 * 24))
      },
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


