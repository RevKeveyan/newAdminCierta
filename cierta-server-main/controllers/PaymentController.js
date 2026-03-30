const UniversalBaseController = require('./UniversalBaseController');
const PaymentReceivable = require('../models/subModels/PaymentReceivable');
const PaymentPayable = require('../models/subModels/PaymentPayable');
const Load = require('../models/Load');
const Carrier = require('../models/Carrier');
const PaymentReceivableDTO = require('../DTO/paymentReceivable.dto');
const PaymentPayableDTO = require('../DTO/paymentPayable.dto');
const { markDirtyForPayment, markDirtyDays } = require('../utils/markDirty');
const mongoose = require('mongoose');
const notificationClient = require('../services/notificationClient');
const notificationService = require('../services/notificationService');
const { buildChanges } = require('../utils/diffChanges');
const auditFields = require('../audit/fields');
const { getSignedUrlForObject } = require('../services/s3Service');

const RECEIVABLE_ROLES = new Set(['admin', 'accountingManager', 'accountingIn']);
const PAYABLE_ROLES = new Set(['admin', 'accountingManager', 'accountingOut']);

function getPaymentAccess(role, type) {
  if (!role) {
    return { allowed: false, status: 401, error: 'Authentication required' };
  }
  const allowed = type === 'receivable'
    ? RECEIVABLE_ROLES.has(role)
    : PAYABLE_ROLES.has(role);
  if (!allowed) {
    return { allowed: false, status: 403, error: 'Access denied' };
  }
  return { allowed: true };
}

/**
 * Helper to convert array of S3 keys to signed URLs
 */
async function convertArrayToSignedUrls(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return arr;
  return Promise.all(
    arr.map(async (key) => {
      if (typeof key === 'string' && !key.startsWith('http')) {
        const signedUrl = await getSignedUrlForObject(key, 300);
        return signedUrl || key;
      }
      return key;
    })
  );
}

/**
 * Helper to add signed URLs to payment object
 */
async function addSignedUrlsToPayment(payment) {
  if (!payment) return payment;
  
  const result = { ...payment };
  
  // Convert pdfs array
  if (result.pdfs && Array.isArray(result.pdfs)) {
    result.pdfs = await convertArrayToSignedUrls(result.pdfs);
  }
  
  // Convert images array
  if (result.images && Array.isArray(result.images)) {
    result.images = await convertArrayToSignedUrls(result.images);
  }
  
  return result;
}

/**
 * Хелпер для обработки изменения статуса платежа
 * Обновляет поля statusChangedAt и payedDate в зависимости от нового статуса
 * @param {Object} existingDoc - существующий документ
 * @param {Object} updateData - данные для обновления
 * @returns {Object} - обновленные данные с датами счетчика
 */
const { getCurrentDateUTC5 } = require('../utils/dateUtils');

/**
 * Legacy function - kept for backward compatibility
 * All notification scheduling logic is now in pre-save hooks
 * This function is kept to avoid breaking existing code but does minimal processing
 */
function processStatusChange(existingDoc, updateData) {
  // Pre-save hooks handle all the logic now
  // This function is kept for backward compatibility but doesn't need to do anything
  // The hooks will handle statusSince, holdStartedAt, paidAt, receivedAt, etc.
  return updateData;
}

/**
 * Контроллер для PaymentReceivable (платежи от customers)
 */
class PaymentReceivableController extends UniversalBaseController {
  constructor() {
    super(PaymentReceivable, {
      dto: PaymentReceivableDTO,
      populateFields: ['customer', 'loadId'],
      searchFields: ['status'],
      validationRules: {
        create: {
          customer: { required: true, type: 'string' }
        },
        update: {
          status: { 
            type: 'string',
            enum: ['pending', 'invoiced', 'withheld', 'canceled', 'on Hold', 'received', 'partially received', 'pay today']
          },
          paymentMethod: {
            type: 'string',
            enum: ['ACH', 'Wire', 'Check', 'Credit Card', 'Cash', 'Zelle', 'Factoring', 'Other'],
            required: true
          },
          deadlineDays: { type: 'number' },
          notes: { type: 'string' },
          paymentLink: { type: 'string' },
          totalAmount: { type: 'number' }
        }
      }
    });
  }

  /**
   * Override getAll to add signed URLs for files
   */
  getAll = async (req, res) => {
    try {
      const access = getPaymentAccess(req.user?.role, 'receivable');
      if (!access.allowed) {
        return res.status(access.status).json({
          success: false,
          error: access.error
        });
      }

      const {
        page = 1,
        limit: requestedLimit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        search,
        ...filters
      } = req.query;
      
      const limit = Math.min(parseInt(requestedLimit), 100);

      const filterParams = { ...filters };
      delete filterParams.page;
      delete filterParams.limit;
      delete filterParams.sortBy;
      delete filterParams.sortOrder;
      delete filterParams.search;

      const filter = this.buildFilter(filterParams, search);
      const sort = this.buildSort(sortBy, sortOrder);

      const docs = await this.model
        .find(filter)
        .populate(this.populateFields)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean();

      const total = await this.model.countDocuments(filter);

      // Apply DTO
      let formattedDocs = this.dto ? docs.map(doc => this.dto.format(doc)) : docs;
      
      // Add signed URLs to all payments
      formattedDocs = await Promise.all(
        formattedDocs.map(payment => addSignedUrlsToPayment(payment))
      );

      res.status(200).json({
        success: true,
        data: formattedDocs,
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      this.handleError(res, error, `Failed to fetch ${this.modelName}`);
    }
  };

  /**
   * Override getById to add signed URLs for files
   */
  getById = async (req, res) => {
    try {
      const access = getPaymentAccess(req.user?.role, 'receivable');
      if (!access.allowed) {
        return res.status(access.status).json({
          success: false,
          error: access.error
        });
      }

      const { id } = req.params;
      
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format'
        });
      }

      const doc = await this.model
        .findById(id)
        .populate(this.populateFields)
        .lean();

      if (!doc) {
        return res.status(404).json({
          success: false,
          error: `${this.modelName} not found`
        });
      }

      let formattedDoc = this.dto ? this.dto.format(doc) : doc;
      formattedDoc = await addSignedUrlsToPayment(formattedDoc);

      res.status(200).json({
        success: true,
        data: formattedDoc
      });
    } catch (error) {
      this.handleError(res, error, `Failed to fetch ${this.modelName}`);
    }
  };

  /**
   * Получить receivables по customer
   */
  getByCustomer = async (req, res) => {
    try {
      const access = getPaymentAccess(req.user?.role, 'receivable');
      if (!access.allowed) {
        return res.status(access.status).json({
          success: false,
          error: access.error
        });
      }

      const { customerId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      if (!mongoose.Types.ObjectId.isValid(customerId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid customer ID format'
        });
      }

      const payments = await this.model
        .find({ customer: customerId })
        .populate('customer')
        .populate('loadId')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean();

      const total = await this.model.countDocuments({ customer: customerId });

      let formattedPayments = PaymentReceivableDTO.formatMany(payments);
      
      // Add signed URLs
      formattedPayments = await Promise.all(
        formattedPayments.map(payment => addSignedUrlsToPayment(payment))
      );

      res.status(200).json({
        success: true,
        data: formattedPayments,
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to fetch receivables by customer');
    }
  };

  /**
   * Получить receivable по loadId
   */
  getByLoad = async (req, res) => {
    try {
      const access = getPaymentAccess(req.user?.role, 'receivable');
      if (!access.allowed) {
        return res.status(access.status).json({
          success: false,
          error: access.error
        });
      }

      const { loadId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(loadId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid load ID format'
        });
      }

      // Find payment through Load's paymentReceivable field
      const Load = require('../models/Load');
      const load = await Load.findById(loadId).populate('paymentReceivable').lean();
      
      if (!load || !load.paymentReceivable) {
        return res.status(404).json({
          success: false,
          error: 'Payment receivable not found for this load'
        });
      }

      const payment = await this.model
        .findById(load.paymentReceivable)
        .populate('customer')
        .populate('loadId')
        .lean();

      if (!payment) {
        return res.status(404).json({
          success: false,
          error: 'Payment receivable not found for this load'
        });
      }

      let formattedPayment = PaymentReceivableDTO.format(payment);
      formattedPayment = await addSignedUrlsToPayment(formattedPayment);

      res.status(200).json({
        success: true,
        data: formattedPayment
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to fetch receivable by load');
    }
  };

  /**
   * Получить receivables по статусу
   */
  getByStatus = async (req, res) => {
    try {
      const access = getPaymentAccess(req.user?.role, 'receivable');
      if (!access.allowed) {
        return res.status(access.status).json({
          success: false,
          error: access.error
        });
      }

      const { status } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const payments = await this.model
        .find({ invoiceStatus: status })
        .populate('customer')
        .populate('loadId')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean();

      const total = await this.model.countDocuments({ invoiceStatus: status });

      let formattedPayments = PaymentReceivableDTO.formatMany(payments);
      
      // Add signed URLs
      formattedPayments = await Promise.all(
        formattedPayments.map(payment => addSignedUrlsToPayment(payment))
      );

      res.status(200).json({
        success: true,
        data: formattedPayments,
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to fetch receivables by status');
    }
  };

  /**
   * Override create to send notification
   */
  create = async (req, res) => {
    try {
      const access = getPaymentAccess(req.user?.role, 'receivable');
      if (!access.allowed) {
        return res.status(access.status).json({
          success: false,
          error: access.error
        });
      }

      const data = this.prepareCreateData(req);
      
      const { normalizeAmount } = require('../utils/dateNormalization');
      
      if (data.totalAmount !== undefined) {
        data.totalAmount = normalizeAmount(data.totalAmount);
      }
      
      if (data.customerRate !== undefined) {
        data.customerRate = normalizeAmount(data.customerRate);
      }
      
      if (data.fees && Array.isArray(data.fees)) {
        data.fees = data.fees.map(fee => ({
          ...fee,
          customerRate: normalizeAmount(fee.customerRate),
          total: normalizeAmount(fee.total)
        }));
      }
      
      if (data.tonu && typeof data.tonu === 'object' && data.tonu.customerRate !== undefined) {
        data.tonu.customerRate = normalizeAmount(data.tonu.customerRate);
      }
      
      if (data.confirmedAmount !== undefined) {
        data.confirmedAmount = normalizeAmount(data.confirmedAmount);
      }
      
      const newDoc = new this.model(data);
      const saved = await newDoc.save();

      // Send notification for payment creation (non-blocking)
      setImmediate(async () => {
        try {
          const actor = req.user
            ? { id: req.user.id, role: req.user.role || 'unknown', email: req.user.email || null }
            : { id: null, role: 'system', email: null };

          const targets = { admin: true };
          if (this.model.modelName === 'PaymentReceivable' && saved.customer) {
            targets.customerId = saved.customer.toString();
          }
          if (this.model.modelName === 'PaymentPayable' && saved.carrier) {
            targets.carrierId = saved.carrier.toString();
          }

          await notificationClient.sendCreatedEvent(
            'payment',
            saved,
            actor,
            { targets, includeEntityData: true }
          );
        } catch (error) {
          console.error('[PaymentController] Failed to send payment created notification:', error);
        }
      });

      const formattedPayment = this.dto ? this.dto.format(saved) : saved;
      
      const paymentType = this.model.modelName === 'PaymentReceivable' ? 'receivable' : 'payable';
      markDirtyForPayment(saved, paymentType)
        .catch((error) => {
          console.error(`[PaymentController] Failed to mark dirty for ${paymentType} create:`, error);
        });

      res.status(201).json({
        success: true,
        data: formattedPayment,
        message: `${this.modelName} created successfully`
      });
    } catch (error) {
      this.handleError(res, error, `Failed to create ${this.modelName}`);
    }
  };

  /**
   * Override update to send notification and handle status changes for day counter
   * Also handles file uploads (images and pdfs)
   */
  update = async (req, res) => {
    try {
      const access = getPaymentAccess(req.user?.role, 'receivable');
      if (!access.allowed) {
        return res.status(access.status).json({
          success: false,
          error: access.error
        });
      }

      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format'
        });
      }

      const existingPayment = await this.model.findById(id).lean();
      if (!existingPayment) {
        return res.status(404).json({
          success: false,
          error: `${this.modelName} not found`
        });
      }

      let data = this.prepareUpdateData(req);
      
      const { normalizeAmount } = require('../utils/dateNormalization');
      
      if (data.totalAmount !== undefined) {
        data.totalAmount = normalizeAmount(data.totalAmount);
        if (data.totalAmount < 0) {
          return res.status(400).json({
            success: false,
            error: 'Total Amount must be a valid positive number'
          });
        }
      }
      
      if (data.customerRate !== undefined) {
        data.customerRate = normalizeAmount(data.customerRate);
      }
      
      if (data.fees && Array.isArray(data.fees)) {
        data.fees = data.fees.map(fee => ({
          ...fee,
          customerRate: normalizeAmount(fee.customerRate),
          total: normalizeAmount(fee.total)
        }));
      }
      
      if (data.tonu && typeof data.tonu === 'object' && data.tonu.customerRate !== undefined) {
        data.tonu.customerRate = normalizeAmount(data.tonu.customerRate);
      }
      
      if (data.confirmedAmount !== undefined) {
        data.confirmedAmount = normalizeAmount(data.confirmedAmount);
      }
      
      if (this.model.modelName === 'PaymentReceivable' && data.status === 'partially received') {
        const notesValue = data.notes !== undefined ? data.notes : existingPayment.notes;
        if (!notesValue || (typeof notesValue === 'string' && notesValue.trim() === '')) {
          return res.status(400).json({
            success: false,
            error: 'Payment notes are required when status is "partially received"'
          });
        }
      }
      
      data = processStatusChange(existingPayment, data);
      
      // Обрабатываем загруженные файлы
      if (req.uploadedFiles) {
        // Добавляем новые файлы к существующим
        if (req.uploadedFiles.images && req.uploadedFiles.images.length > 0) {
          data.images = [...(existingPayment.images || []), ...req.uploadedFiles.images];
        }
        if (req.uploadedFiles.pdfs && req.uploadedFiles.pdfs.length > 0) {
          data.pdfs = [...(existingPayment.pdfs || []), ...req.uploadedFiles.pdfs];
        }
      }
      
      const filteredData = this.filterChangedFields(existingPayment, data);

      // Проверяем есть ли изменения (включая файлы)
      const hasFileChanges = req.uploadedFiles && 
        ((req.uploadedFiles.images && req.uploadedFiles.images.length > 0) ||
         (req.uploadedFiles.pdfs && req.uploadedFiles.pdfs.length > 0));

      if (Object.keys(filteredData).length === 0 && !hasFileChanges) {
        const formattedPayment = this.dto ? this.dto.format(existingPayment) : existingPayment;
        return res.status(200).json({
          success: true,
          data: formattedPayment,
          message: 'No changes detected'
        });
      }

      // Добавляем файлы в filteredData если они были загружены
      if (hasFileChanges) {
        if (req.uploadedFiles.images && req.uploadedFiles.images.length > 0) {
          filteredData.images = data.images;
        }
        if (req.uploadedFiles.pdfs && req.uploadedFiles.pdfs.length > 0) {
          filteredData.pdfs = data.pdfs;
        }
      }

      const oldInvoiceAt = existingPayment.invoiceAt;
      const oldCustomer = existingPayment.customer?.toString() || existingPayment.customer;
      const oldCarrier = existingPayment.carrier?.toString() || existingPayment.carrier;
      const oldCreatedBy = existingPayment.createdBy?.toString() || existingPayment.createdBy;

      const updated = await this.model.findByIdAndUpdate(
        id,
        filteredData,
        { new: true, runValidators: true }
      )
      .populate(this.populateFields)
      .lean();

      const paymentType = this.model.modelName === 'PaymentReceivable' ? 'receivable' : 'payable';
      const source = paymentType === 'receivable' ? 'receivable' : 'payable';
      
      const datesToMark = [];
      const newInvoiceAt = updated.invoiceAt;
      const createdAt = updated.createdAt || existingPayment.createdAt;
      
      if (oldInvoiceAt) datesToMark.push(oldInvoiceAt);
      if (newInvoiceAt && (!oldInvoiceAt || oldInvoiceAt.toString() !== newInvoiceAt.toString())) {
        datesToMark.push(newInvoiceAt);
      } else if (!oldInvoiceAt && !newInvoiceAt && createdAt) {
        datesToMark.push(createdAt);
      }

      if (datesToMark.length > 0) {
        const promises = [];
        
        promises.push(markDirtyDays(datesToMark, 'system', null, [source]));
        
        if (oldCustomer) {
          promises.push(markDirtyDays(datesToMark, 'customer', oldCustomer, [source]));
        }
        const newCustomer = updated.customer?.toString() || updated.customer;
        if (newCustomer && newCustomer !== oldCustomer) {
          promises.push(markDirtyDays(datesToMark, 'customer', newCustomer, [source]));
        }
        
        if (oldCarrier) {
          promises.push(markDirtyDays(datesToMark, 'carrier', oldCarrier, [source]));
        }
        const newCarrier = updated.carrier?.toString() || updated.carrier;
        if (newCarrier && newCarrier !== oldCarrier) {
          promises.push(markDirtyDays(datesToMark, 'carrier', newCarrier, [source]));
        }
        
        if (oldCreatedBy) {
          promises.push(markDirtyDays(datesToMark, 'user', oldCreatedBy, [source]));
        }
        const newCreatedBy = updated.createdBy?.toString() || updated.createdBy;
        if (newCreatedBy && newCreatedBy !== oldCreatedBy) {
          promises.push(markDirtyDays(datesToMark, 'user', newCreatedBy, [source]));
        }
        
        try {
          await Promise.all(promises);
        } catch (error) {
          console.error(`[PaymentController] Failed to mark dirty for ${paymentType} update:`, error);
        }
      }

      // Notifications for payments are handled by cron jobs:
      // - paymentReceivable past due (when dueAt has passed)
      // - paymentPayable need to pay (when dueAt is reached)

      let formattedPayment = this.dto ? this.dto.format(updated) : updated;
      formattedPayment = await addSignedUrlsToPayment(formattedPayment);
      
      res.status(200).json({
        success: true,
        data: formattedPayment,
        message: `${this.modelName} updated successfully`
      });
    } catch (error) {
      this.handleError(res, error, `Failed to update ${this.modelName}`);
    }
  };

  /**
   * Обновить статус на "received" (автоматически установит invoicedDate)
   */
  markAsReceived = async (req, res) => {
    try {
      const access = getPaymentAccess(req.user?.role, 'receivable');
      if (!access.allowed) {
        return res.status(access.status).json({
          success: false,
          error: access.error
        });
      }

      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format'
        });
      }

      const existingPayment = await this.model.findById(id).lean();
      if (!existingPayment) {
        return res.status(404).json({
          success: false,
          error: 'Payment receivable not found'
        });
      }

      const updated = await this.model.findByIdAndUpdate(
        id,
        {
          invoiceStatus: 'received',
          invoicedDate: new Date()
        },
        { new: true }
      ).populate('customer').populate('loadId').lean();

      if (!updated) {
        return res.status(404).json({
          success: false,
          error: 'Payment receivable not found'
        });
      }

      // Compute changes for notification
      const changes = buildChanges(existingPayment, updated, auditFields.paymentReceivable);

      // Send notification event (non-blocking)
      if (changes.length > 0 && req.user) {
        setImmediate(async () => {
          try {
            const actor = {
              id: req.user.id,
              role: req.user.role || 'unknown',
              email: req.user.email || null
            };
            await notificationClient.sendUpdatedEvent(
              'payment',
              updated,
              actor,
              changes,
              { includeEntityData: true }
            );
          } catch (error) {
            console.error('[PaymentController] Failed to send notification event:', error);
          }
        });
      }

      const formattedPayment = PaymentReceivableDTO.format(updated);

      res.status(200).json({
        success: true,
        data: formattedPayment,
        message: 'Payment marked as received'
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to mark payment as received');
    }
  };

  delete = async (req, res) => {
    try {
      const access = getPaymentAccess(req.user?.role, 'receivable');
      if (!access.allowed) {
        return res.status(access.status).json({
          success: false,
          error: access.error
        });
      }

      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format'
        });
      }

      const doc = await this.model.findById(id).lean();
      if (!doc) {
        return res.status(404).json({
          success: false,
          error: `${this.modelName} not found`
        });
      }

      const paymentType = this.model.modelName === 'PaymentReceivable' ? 'receivable' : 'payable';
      markDirtyForPayment(doc, paymentType)
        .catch((error) => {
          console.error(`[PaymentController] Failed to mark dirty for ${paymentType} delete:`, error);
        });

      await this.model.findByIdAndDelete(id);

      res.status(200).json({
        success: true,
        message: `${this.modelName} deleted successfully`
      });
    } catch (error) {
      this.handleError(res, error, `Failed to delete ${this.modelName}`);
    }
  };
}

/**
 * Контроллер для PaymentPayable (платежи carriers)
 */
class PaymentPayableController extends UniversalBaseController {
  constructor() {
    super(PaymentPayable, {
      dto: PaymentPayableDTO,
      populateFields: ['carrier', 'loadId'],
      searchFields: ['status'],
      validationRules: {
        create: {
          carrier: { required: true, type: 'string' }
        },
        update: {
          status: { 
            type: 'string',
            enum: ['pending', 'invoiced', 'withheld', 'canceled', 'on Hold', 'paid', 'partially paid', 'pay today']
          },
          paymentMethod: {
            type: 'string',
            enum: ['ACH', 'Wire', 'Check', 'Credit Card', 'Cash', 'Zelle', 'Factoring', 'Other'],
            required: true
          },
          deadlineDays: { type: 'number' },
          bank: { type: 'string' },
          routing: { type: 'string' },
          accountNumber: { type: 'string' },
          notes: { type: 'string' },
          totalAmount: { type: 'number' }
        }
      }
    });
  }

  /**
   * Override getAll to add signed URLs for files
   */
  getAll = async (req, res) => {
    try {
      const access = getPaymentAccess(req.user?.role, 'payable');
      if (!access.allowed) {
        return res.status(access.status).json({
          success: false,
          error: access.error
        });
      }

      const {
        page = 1,
        limit: requestedLimit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        search,
        ...filters
      } = req.query;
      
      const limit = Math.min(parseInt(requestedLimit), 100);

      const filterParams = { ...filters };
      delete filterParams.page;
      delete filterParams.limit;
      delete filterParams.sortBy;
      delete filterParams.sortOrder;
      delete filterParams.search;

      const filter = this.buildFilter(filterParams, search);
      const sort = this.buildSort(sortBy, sortOrder);

      const docs = await this.model
        .find(filter)
        .populate(this.populateFields)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean();

      const total = await this.model.countDocuments(filter);

      // Apply DTO
      let formattedDocs = this.dto ? docs.map(doc => this.dto.format(doc)) : docs;
      
      // Add signed URLs to all payments
      formattedDocs = await Promise.all(
        formattedDocs.map(payment => addSignedUrlsToPayment(payment))
      );

      res.status(200).json({
        success: true,
        data: formattedDocs,
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      this.handleError(res, error, `Failed to fetch ${this.modelName}`);
    }
  };

  /**
   * Override getById to add signed URLs for files
   */
  getById = async (req, res) => {
    try {
      const access = getPaymentAccess(req.user?.role, 'payable');
      if (!access.allowed) {
        return res.status(access.status).json({
          success: false,
          error: access.error
        });
      }

      const { id } = req.params;
      
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format'
        });
      }

      const doc = await this.model
        .findById(id)
        .populate(this.populateFields)
        .lean();

      if (!doc) {
        return res.status(404).json({
          success: false,
          error: `${this.modelName} not found`
        });
      }

      let formattedDoc = this.dto ? this.dto.format(doc) : doc;
      formattedDoc = await addSignedUrlsToPayment(formattedDoc);

      res.status(200).json({
        success: true,
        data: formattedDoc
      });
    } catch (error) {
      this.handleError(res, error, `Failed to fetch ${this.modelName}`);
    }
  };

  create = async (req, res) => {
    try {
      const access = getPaymentAccess(req.user?.role, 'payable');
      if (!access.allowed) {
        return res.status(access.status).json({
          success: false,
          error: access.error
        });
      }

      const data = this.prepareCreateData(req);
      
      const { normalizeAmount } = require('../utils/dateNormalization');
      
      if (data.totalAmount !== undefined) {
        data.totalAmount = normalizeAmount(data.totalAmount);
      }
      
      if (data.carrierRate !== undefined) {
        data.carrierRate = normalizeAmount(data.carrierRate);
      }
      
      if (data.fees && Array.isArray(data.fees)) {
        data.fees = data.fees.map(fee => ({
          ...fee,
          carrierRate: normalizeAmount(fee.carrierRate),
          total: normalizeAmount(fee.total)
        }));
      }
      
      if (data.tonu && typeof data.tonu === 'object' && data.tonu.carrierRate !== undefined) {
        data.tonu.carrierRate = normalizeAmount(data.tonu.carrierRate);
      }
      
      if (data.confirmedAmount !== undefined) {
        data.confirmedAmount = normalizeAmount(data.confirmedAmount);
      }
      
      const newDoc = new this.model(data);
      const saved = await newDoc.save();

      setImmediate(async () => {
        try {
          const actor = req.user
            ? { id: req.user.id, role: req.user.role || 'unknown', email: req.user.email || null }
            : { id: null, role: 'system', email: null };

          const targets = { admin: true };
          if (this.model.modelName === 'PaymentPayable' && saved.carrier) {
            targets.carrierId = saved.carrier.toString();
          }

          await notificationClient.sendCreatedEvent(
            'payment',
            saved,
            actor,
            { targets, includeEntityData: true }
          );
        } catch (error) {
          console.error('[PaymentController] Failed to send payment created notification:', error);
        }
      });

      const formattedPayment = this.dto ? this.dto.format(saved) : saved;
      res.status(201).json({
        success: true,
        data: formattedPayment,
        message: `${this.modelName} created successfully`
      });
    } catch (error) {
      this.handleError(res, error, `Failed to create ${this.modelName}`);
    }
  };

  /**
   * Override update to handle status changes for day counter
   * Also handles file uploads (images and pdfs)
   */
  update = async (req, res) => {
    try {
      const access = getPaymentAccess(req.user?.role, 'payable');
      if (!access.allowed) {
        return res.status(access.status).json({
          success: false,
          error: access.error
        });
      }

      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format'
        });
      }

      const existingPayment = await this.model.findById(id).lean();
      if (!existingPayment) {
        return res.status(404).json({
          success: false,
          error: `${this.modelName} not found`
        });
      }

      let data = this.prepareUpdateData(req);
      
      const { normalizeAmount } = require('../utils/dateNormalization');
      
      if (data.totalAmount !== undefined) {
        data.totalAmount = normalizeAmount(data.totalAmount);
        if (data.totalAmount < 0) {
          return res.status(400).json({
            success: false,
            error: 'Total Amount must be a valid positive number'
          });
        }
      }
      
      if (data.customerRate !== undefined && this.model.modelName === 'PaymentReceivable') {
        data.customerRate = normalizeAmount(data.customerRate);
      }
      
      if (data.carrierRate !== undefined && this.model.modelName === 'PaymentPayable') {
        data.carrierRate = normalizeAmount(data.carrierRate);
      }
      
      if (data.fees && Array.isArray(data.fees)) {
        data.fees = data.fees.map(fee => ({
          ...fee,
          customerRate: this.model.modelName === 'PaymentReceivable' ? normalizeAmount(fee.customerRate) : fee.customerRate,
          carrierRate: this.model.modelName === 'PaymentPayable' ? normalizeAmount(fee.carrierRate) : fee.carrierRate,
          total: normalizeAmount(fee.total)
        }));
      }
      
      if (data.tonu && typeof data.tonu === 'object') {
        if (data.tonu.customerRate !== undefined && this.model.modelName === 'PaymentReceivable') {
          data.tonu.customerRate = normalizeAmount(data.tonu.customerRate);
        }
        if (data.tonu.carrierRate !== undefined && this.model.modelName === 'PaymentPayable') {
          data.tonu.carrierRate = normalizeAmount(data.tonu.carrierRate);
        }
      }
      
      if (data.confirmedAmount !== undefined) {
        data.confirmedAmount = normalizeAmount(data.confirmedAmount);
      }
      
      if (this.model.modelName === 'PaymentPayable' && data.status === 'partially paid') {
        const notesValue = data.notes !== undefined ? data.notes : existingPayment.notes;
        if (!notesValue || (typeof notesValue === 'string' && notesValue.trim() === '')) {
          return res.status(400).json({
            success: false,
            error: 'Payment notes are required when status is "partially paid"'
          });
        }
      }
      
      data = processStatusChange(existingPayment, data);
      
      // Обрабатываем загруженные файлы
      if (req.uploadedFiles) {
        if (req.uploadedFiles.images && req.uploadedFiles.images.length > 0) {
          data.images = [...(existingPayment.images || []), ...req.uploadedFiles.images];
        }
        if (req.uploadedFiles.pdfs && req.uploadedFiles.pdfs.length > 0) {
          data.pdfs = [...(existingPayment.pdfs || []), ...req.uploadedFiles.pdfs];
        }
      }
      
      const filteredData = this.filterChangedFields(existingPayment, data);

      const hasFileChanges = req.uploadedFiles && 
        ((req.uploadedFiles.images && req.uploadedFiles.images.length > 0) ||
         (req.uploadedFiles.pdfs && req.uploadedFiles.pdfs.length > 0));

      if (Object.keys(filteredData).length === 0 && !hasFileChanges) {
        const formattedPayment = this.dto ? this.dto.format(existingPayment) : existingPayment;
        return res.status(200).json({
          success: true,
          data: formattedPayment,
          message: 'No changes detected'
        });
      }

      // Добавляем файлы в filteredData если они были загружены
      if (hasFileChanges) {
        if (req.uploadedFiles.images && req.uploadedFiles.images.length > 0) {
          filteredData.images = data.images;
        }
        if (req.uploadedFiles.pdfs && req.uploadedFiles.pdfs.length > 0) {
          filteredData.pdfs = data.pdfs;
        }
      }

      const updated = await this.model.findByIdAndUpdate(
        id,
        filteredData,
        { new: true, runValidators: true }
      )
      .populate(this.populateFields)
      .lean();

      const changes = buildChanges(existingPayment, updated, auditFields.paymentPayable);

      if (changes.length > 0 && req.user) {
        setImmediate(async () => {
          try {
            const actor = {
              id: req.user.id,
              role: req.user.role || 'unknown',
              email: req.user.email || null
            };
            await notificationClient.sendUpdatedEvent(
              'payment',
              updated,
              actor,
              changes,
              { includeEntityData: true }
            );
          } catch (error) {
            console.error('[PaymentController] Failed to send notification event:', error);
          }
        });
      }

      let formattedPayment = this.dto ? this.dto.format(updated) : updated;
      formattedPayment = await addSignedUrlsToPayment(formattedPayment);
      
      res.status(200).json({
        success: true,
        data: formattedPayment,
        message: `${this.modelName} updated successfully`
      });
    } catch (error) {
      this.handleError(res, error, `Failed to update ${this.modelName}`);
    }
  };

  /**
   * Получить payables по carrier
   */
  getByCarrier = async (req, res) => {
    try {
      const access = getPaymentAccess(req.user?.role, 'payable');
      if (!access.allowed) {
        return res.status(access.status).json({
          success: false,
          error: access.error
        });
      }

      const { carrierId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      if (!mongoose.Types.ObjectId.isValid(carrierId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid carrier ID format'
        });
      }

      const payments = await this.model
        .find({ carrier: carrierId })
        .populate('carrier')
        .populate('loadId')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean();

      const total = await this.model.countDocuments({ carrier: carrierId });

      let formattedPayments = PaymentPayableDTO.formatMany(payments);
      
      // Add signed URLs
      formattedPayments = await Promise.all(
        formattedPayments.map(payment => addSignedUrlsToPayment(payment))
      );

      res.status(200).json({
        success: true,
        data: formattedPayments,
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to fetch payables by carrier');
    }
  };

  /**
   * Получить payable по loadId
   */
  getByLoad = async (req, res) => {
    try {
      const access = getPaymentAccess(req.user?.role, 'payable');
      if (!access.allowed) {
        return res.status(access.status).json({
          success: false,
          error: access.error
        });
      }

      const { loadId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(loadId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid load ID format'
        });
      }

      // Find payment through Load's paymentPayable field
      const Load = require('../models/Load');
      const load = await Load.findById(loadId).populate('paymentPayable').lean();
      
      if (!load || !load.paymentPayable) {
        return res.status(404).json({
          success: false,
          error: 'Payment payable not found for this load'
        });
      }

      const payment = await this.model
        .findById(load.paymentPayable)
        .populate('carrier')
        .populate('loadId')
        .lean();

      if (!payment) {
        return res.status(404).json({
          success: false,
          error: 'Payment payable not found for this load'
        });
      }

      let formattedPayment = PaymentPayableDTO.format(payment);
      formattedPayment = await addSignedUrlsToPayment(formattedPayment);

      res.status(200).json({
        success: true,
        data: formattedPayment
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to fetch payable by load');
    }
  };

  delete = async (req, res) => {
    try {
      const access = getPaymentAccess(req.user?.role, 'payable');
      if (!access.allowed) {
        return res.status(access.status).json({
          success: false,
          error: access.error
        });
      }

      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format'
        });
      }

      const doc = await this.model.findById(id).lean();
      if (!doc) {
        return res.status(404).json({
          success: false,
          error: `${this.modelName} not found`
        });
      }

      const paymentType = this.model.modelName === 'PaymentReceivable' ? 'receivable' : 'payable';
      markDirtyForPayment(doc, paymentType)
        .catch((error) => {
          console.error(`[PaymentController] Failed to mark dirty for ${paymentType} delete:`, error);
        });

      await this.model.findByIdAndDelete(id);

      res.status(200).json({
        success: true,
        message: `${this.modelName} deleted successfully`
      });
    } catch (error) {
      this.handleError(res, error, `Failed to delete ${this.modelName}`);
    }
  };
}

// Экспортируем экземпляры контроллеров
module.exports = {
  PaymentReceivableController: new PaymentReceivableController(),
  PaymentPayableController: new PaymentPayableController()
};

