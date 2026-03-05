const UniversalBaseController = require('./UniversalBaseController');
const Customer = require('../models/Customer');
const User = require('../models/User');
const Load = require('../models/Load');
const CustomerDTO = require('../DTO/customer.dto');
const mongoose = require('mongoose');
const notificationClient = require('../services/notificationClient');
const notificationService = require('../services/notificationService');
const { getSignedUrlForObject, deleteFromS3Multiple } = require('../services/s3Service');

const ADMIN_ROLES = new Set(['admin', 'manager']);
const NO_ACCESS_ROLES = new Set(['accountingManager', 'accountingIn', 'accountingOut', 'partner']);

async function getUserContext(req) {
  const userId = req.user?.id;
  if (!userId) {
    return { error: { status: 401, error: 'Authentication required' } };
  }
  const user = await User.findById(userId).select('role allowedCustomers').lean();
  if (!user) {
    return { error: { status: 401, error: 'User not found' } };
  }
  const allowedCustomerIds = Array.isArray(user.allowedCustomers)
    ? user.allowedCustomers.map(id => id.toString())
    : [];
  return { user, role: user.role, allowedCustomerIds };
}

function stripPaymentFields(customer) {
  if (!customer || typeof customer !== 'object') return customer;
  const { paymentMethod, paymentTerms, creditLimit, ...rest } = customer;
  return rest;
}

function shouldStripPaymentFields(role) {
  return !ADMIN_ROLES.has(role);
}

class CustomerController extends UniversalBaseController {
  constructor() {
    super(Customer, {
      dto: CustomerDTO,
      searchFields: ['companyName', 'customerAddress.city', 'customerAddress.state', 'email', 'phoneNumber'],
      validationRules: {
        create: {
          companyName: { required: true, type: 'string' },
          type: { required: false, type: 'string' },
          'customerAddress.address': { required: false, type: 'string' },
          'customerAddress.city': { required: false, type: 'string' },
          'customerAddress.state': { required: false, type: 'string' },
          'customerAddress.zipCode': { required: false, type: 'string' }
        },
        update: {
          companyName: { type: 'string' },
          type: { type: 'string' },
          'customerAddress.address': { type: 'string' },
          'customerAddress.city': { type: 'string' },
          'customerAddress.state': { type: 'string' },
          'customerAddress.zipCode': { type: 'string' },
          email: { type: 'string' },
          phoneNumber: { type: 'string' },
          allowedUsers: { type: 'array' }
        }
      }
    });
  }

  prepareCreateData(req) {
    const data = super.prepareCreateData(req);
    if (data.emails !== undefined) {
      delete data.emails;
    }
    return data;
  }

  prepareUpdateData(req, filteredData = null) {
    const data = super.prepareUpdateData(req, filteredData);
    if (data.emails !== undefined) {
      delete data.emails;
    }
    return data;
  }

  /**
   * Normalize customer data from request (parse JSON strings, handle payment fields)
   * @param {Object} data - Raw data from request
   * @returns {Object} - Normalized data
   */
  normalizeCustomerData(data) {
    const normalized = { ...data };

    // Parse customerAddress if it's a JSON string
    if (normalized.customerAddress && typeof normalized.customerAddress === 'string') {
      try {
        normalized.customerAddress = JSON.parse(normalized.customerAddress);
      } catch (e) {
        console.warn('[CustomerController] Failed to parse customerAddress JSON:', e.message);
      }
    }

    // Нормализуем email - убеждаемся что это строка
    if (normalized.email !== undefined && normalized.email !== null) {
      if (typeof normalized.email === 'string') {
        normalized.email = normalized.email.trim().toLowerCase();
        if (normalized.email === '') {
          normalized.email = undefined;
        }
      } else {
        // Если не строка, пытаемся преобразовать
        normalized.email = String(normalized.email).trim().toLowerCase();
        if (normalized.email === '') {
          normalized.email = undefined;
        }
      }
    }
    
    // Удаляем старое поле emails если оно есть (миграция)
    if (normalized.emails !== undefined) {
      delete normalized.emails;
    }

    // Normalize paymentTerms - ensure it's a string (can be empty)
    if (normalized.paymentTerms !== undefined && normalized.paymentTerms !== null) {
      normalized.paymentTerms = String(normalized.paymentTerms).trim();
    } else if (normalized.paymentTerms === null || normalized.paymentTerms === '') {
      // Allow empty string or null to clear the field
      normalized.paymentTerms = '';
    }

    // Normalize paymentMethod - ensure it's valid enum value
    if (normalized.paymentMethod !== undefined) {
      const validMethods = ['ACH', 'ZELLE', 'Net 30'];
      if (normalized.paymentMethod && !validMethods.includes(normalized.paymentMethod)) {
        console.warn(`[CustomerController] Invalid paymentMethod: ${normalized.paymentMethod}, using default`);
        normalized.paymentMethod = 'Net 30';
      }
    }

    // Normalize creditLimit - ensure it's a number
    if (normalized.creditLimit !== undefined) {
      const creditLimit = parseFloat(normalized.creditLimit);
      normalized.creditLimit = isNaN(creditLimit) ? 0 : creditLimit;
    }

    if (normalized.representativePeoples !== undefined) {
      if (typeof normalized.representativePeoples === 'string') {
        try {
          normalized.representativePeoples = JSON.parse(normalized.representativePeoples);
        } catch (e) {
          normalized.representativePeoples = [];
        }
      }
      if (!Array.isArray(normalized.representativePeoples)) {
        normalized.representativePeoples = [];
      }
      normalized.representativePeoples = normalized.representativePeoples
        .filter(person => person && person.fullName && person.fullName.trim() !== '')
        .map(person => ({
          fullName: person.fullName.trim(),
          email: person.email ? person.email.trim().toLowerCase() : '',
          phoneNumber: person.phoneNumber ? person.phoneNumber.trim() : ''
        }));
    }

    // Normalize allowedUsers - ensure it's an array of ObjectIds
    if (normalized.allowedUsers !== undefined) {
      if (!Array.isArray(normalized.allowedUsers)) {
        normalized.allowedUsers = [];
      }
      // Convert all to strings and filter invalid IDs
      normalized.allowedUsers = normalized.allowedUsers
        .map(uid => {
          if (mongoose.Types.ObjectId.isValid(uid)) {
            return uid.toString();
          }
          return null;
        })
        .filter(uid => uid !== null);
    }

    return normalized;
  }

  /**
   * Helper function to convert S3 keys to signed URLs in customer object
   * @param {Object} customer - Customer object (can be plain object or mongoose document)
   * @returns {Promise<Object>} - Customer object with signed URLs
   */
  async addSignedUrlsToCustomer(customer) {
    if (!customer) return customer;

    const customerObj = customer.toObject ? customer.toObject() : customer;
    const result = { ...customerObj };

    // Helper to convert array of keys to signed URLs
    const convertArrayToSignedUrls = async (arr) => {
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
    };

    // Convert images array
    if (result.images) {
      result.images = await convertArrayToSignedUrls(result.images);
    }

    // Convert pdfs array
    if (result.pdfs) {
      result.pdfs = await convertArrayToSignedUrls(result.pdfs);
    }

    // Convert legacy file field
    if (result.file && typeof result.file === 'string' && !result.file.startsWith('http')) {
      const signedUrl = await getSignedUrlForObject(result.file, 300);
      if (signedUrl) {
        result.file = signedUrl;
      }
    }

    return result;
  }

  /**
   * Override getAll to add signed URLs and filter by allowedCustomers
   */
  getAll = async (req, res) => {
    try {
      const accessContext = await getUserContext(req);
      if (accessContext.error) {
        return res.status(accessContext.error.status).json({
          success: false,
          error: accessContext.error.error
        });
      }
      if (NO_ACCESS_ROLES.has(accessContext.role)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
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

      if (!ADMIN_ROLES.has(accessContext.role)) {
        filter._id = { $in: accessContext.allowedCustomerIds || [] };
        if (accessContext.role === 'salesAgent') {
          filter.type = 'platform';
        }
      }
      
      const sort = this.buildSort(sortBy, sortOrder);

      const docs = await this.model
        .find(filter)
        .populate(this.populateFields)
        .populate('allowedUsers', 'firstName lastName email _id')
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean();

      const total = await this.model.countDocuments(filter);

      // Apply DTO if exists
      let formattedDocs = this.dto ? docs.map(doc => this.dto.format(doc)) : docs;
      
      // Format allowedUsers if populated (not using DTO)
      if (!this.dto) {
        formattedDocs = formattedDocs.map(customer => {
          if (customer && customer.allowedUsers) {
            customer.allowedUsers = customer.allowedUsers.map(user => {
              if (user && typeof user === 'object' && (user.firstName || user.email)) {
                return {
                  id: user._id || user.id,
                  firstName: user.firstName,
                  lastName: user.lastName,
                  email: user.email
                };
              }
              return user._id || user.id || user;
            });
          }
          return customer;
        });
      }
      
      // Add signed URLs to all customers
      formattedDocs = await Promise.all(
        formattedDocs.map(customer => this.addSignedUrlsToCustomer(customer))
      );

      if (shouldStripPaymentFields(accessContext.role)) {
        formattedDocs = formattedDocs.map(customer => stripPaymentFields(customer));
      }

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
      this.handleError(res, error, 'Failed to fetch customers');
    }
  };

  /**
   * Override getById to add signed URLs and check access
   */
  getById = async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format'
        });
      }

      const accessContext = await getUserContext(req);
      if (accessContext.error) {
        return res.status(accessContext.error.status).json({
          success: false,
          error: accessContext.error.error
        });
      }
      if (NO_ACCESS_ROLES.has(accessContext.role)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const doc = await this.model
        .findById(id)
        .populate(this.populateFields)
        .populate('allowedUsers', 'firstName lastName email _id');

      if (!doc) {
        return res.status(404).json({
          success: false,
          error: 'Customer not found'
        });
      }

      if (!ADMIN_ROLES.has(accessContext.role)) {
        const customerId = doc._id.toString();
        if (!accessContext.allowedCustomerIds.includes(customerId)) {
          return res.status(403).json({
            success: false,
            error: 'Access denied'
          });
        }
        if (accessContext.role === 'salesAgent' && doc.type !== 'platform') {
          return res.status(403).json({
            success: false,
            error: 'Access denied'
          });
        }
      }

      let formattedDoc = this.dto ? this.dto.format(doc) : doc;
      
      // Format allowedUsers if populated (not using DTO)
      if (!this.dto && formattedDoc && formattedDoc.allowedUsers) {
        formattedDoc.allowedUsers = formattedDoc.allowedUsers.map(user => {
          if (user && typeof user === 'object' && (user.firstName || user.email)) {
            return {
              id: user._id || user.id,
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email
            };
          }
          return user._id || user.id || user;
        });
      }
      
      formattedDoc = await this.addSignedUrlsToCustomer(formattedDoc);
      if (shouldStripPaymentFields(accessContext.role)) {
        formattedDoc = stripPaymentFields(formattedDoc);
      }

      res.status(200).json({
        success: true,
        data: formattedDoc
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to fetch customer');
    }
  };

  // Override create to handle file upload
  create = async (req, res) => {
    try {
      // Валидация данных
      if (this.validationRules.create) {
        const validation = this.validateData(req.body, this.validationRules.create);
        if (!validation.isValid) {
          return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: validation.errors
          });
        }
      }

      // Проверяем уникальность companyName
      if (req.body.companyName && req.body.companyName.trim() !== '') {
        const companyNameToCheck = req.body.companyName.trim();
        const existingCustomer = await Customer.findOne({ companyName: companyNameToCheck });
        if (existingCustomer) {
          return res.status(400).json({
            success: false,
            error: 'Duplicate customer',
            message: `Customer with Company Name "${companyNameToCheck}" already exists`
          });
        }
      }

      const currentUser = req.user;
      if (!currentUser || !ADMIN_ROLES.has(currentUser.role)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      let data = this.prepareCreateData(req);
      data = this.normalizeCustomerData(data);
      
      if (req.uploadedFiles?.pdfs && req.uploadedFiles.pdfs.length > 0) {
        data.pdfs = req.uploadedFiles.pdfs;
      }

      // Нормализуем email перед сохранением
      if (data.email !== undefined && data.email !== null) {
        if (typeof data.email === 'string' && data.email.trim() !== '') {
          data.email = data.email.trim().toLowerCase();
        } else {
          data.email = undefined;
        }
      }
      
      // Для платформ не добавляем email
      if (data.type === 'platform') {
        data.email = undefined;
      }
      
      // Удаляем старое поле emails если оно есть (миграция)
      if (data.emails !== undefined) {
        delete data.emails;
      }

      // Удаляем все undefined и null значения из data перед сохранением
      const { removeUndefinedNullValues } = require('../utils/dataHelpers');
      const cleanedData = removeUndefinedNullValues(data);

      const newDoc = new this.model(cleanedData);
      const saved = await newDoc.save();

      try {
        const entity = saved.toObject ? saved.toObject() : (saved.toJSON ? saved.toJSON() : saved);
        await notificationClient.sendCreatedEvent('customer', entity, req.user, { includeEntityData: true });
      } catch (notifErr) {
        console.error('[CustomerController] Failed to send customer created notification', notifErr);
      }

      let formattedData = saved;
      formattedData = await this.addSignedUrlsToCustomer(formattedData);

      res.status(201).json({
        success: true,
        data: formattedData,
        message: `${this.modelName} created successfully`
      });
    } catch (error) {
      // Специальная обработка ошибок дублирования для emails
      if (error.code === 11000) {
        const duplicateField = Object.keys(error.keyPattern)[0];
        let displayValue = error.keyValue[duplicateField];
        
        // Для email показываем более понятное сообщение
        if (duplicateField === 'email') {
          if (displayValue === undefined || displayValue === null || displayValue === '') {
            displayValue = 'undefined';
          }
          
          return res.status(400).json({
            success: false,
            error: 'Duplicate entry',
            details: {},
            message: `A record with email "${displayValue}" already exists`
          });
        }
      }
      
      this.handleError(res, error, 'Failed to create customer');
    }
  };

  // Override update to handle file upload
  update = async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format'
        });
      }

      const existingCustomer = await Customer.findById(id).lean();
      if (!existingCustomer) {
        return res.status(404).json({
          success: false,
          error: 'Customer not found'
        });
      }

      const currentUser = req.user;
      if (!currentUser || !ADMIN_ROLES.has(currentUser.role)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      // Проверяем уникальность companyName перед обновлением
      if (req.body.companyName && req.body.companyName.trim() !== '') {
        const newCompanyName = req.body.companyName.trim();
        if (newCompanyName !== existingCustomer.companyName) {
          const existingCustomerWithCompanyName = await Customer.findOne({ 
            companyName: newCompanyName,
            _id: { $ne: id }
          });
          if (existingCustomerWithCompanyName) {
            return res.status(400).json({
              success: false,
              error: 'Duplicate customer',
              message: `Customer with Company Name "${newCompanyName}" already exists`
            });
          }
        }
      }

      // Debug: Log incoming data
      let data = this.prepareUpdateData(req);
      data = this.normalizeCustomerData(data);
      
      // ВАЖНО: representativePeoples всегда должен быть в data, если пришло в запросе
      // (даже если массив пустой - это означает очистку списка)
      if (req.body.representativePeoples !== undefined) {
        data.representativePeoples = data.representativePeoples || [];
      }
      
      if (req.body.allowedUsers !== undefined) {
      }

      // Handle multiple PDF file uploads
      const currentPdfs = existingCustomer.pdfs || [];
      const newUploadedPdfs = req.uploadedFiles?.pdfs || [];
      
      // Получаем existingPdfs от frontend (файлы которые пользователь хочет сохранить)
      let keepPdfs = currentPdfs;
      if (req.body.existingPdfs !== undefined) {
        keepPdfs = typeof req.body.existingPdfs === 'string' 
          ? JSON.parse(req.body.existingPdfs) 
          : req.body.existingPdfs;
        if (!Array.isArray(keepPdfs)) keepPdfs = [];
      }
      
      // Находим файлы которые нужно удалить
      const filesToDelete = currentPdfs.filter(url => !keepPdfs.includes(url));
      
      // Удаляем файлы из S3
      if (filesToDelete.length > 0) {
        setImmediate(async () => {
          try {
            await deleteFromS3Multiple(filesToDelete);
          } catch (deleteError) {
            console.error('[CustomerController] Failed to delete files from S3:', deleteError);
          }
        });
      }
      
      // Обновляем только если есть изменения в файлах
      if (newUploadedPdfs.length > 0 || filesToDelete.length > 0) {
        data.pdfs = [...keepPdfs, ...newUploadedPdfs];
      }

      // Синхронизация allowedUsers с allowedCustomers в User модели (ДО обновления Customer)
      if (data.allowedUsers !== undefined) {
        const User = require('../models/User');
        const customerId = mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
        
        await User.updateMany(
          { allowedCustomers: customerId },
          { $pull: { allowedCustomers: customerId } }
        );
        
        const newUserIds = Array.isArray(data.allowedUsers) 
          ? data.allowedUsers
              .filter(uid => mongoose.Types.ObjectId.isValid(uid))
              .map(uid => new mongoose.Types.ObjectId(uid))
          : [];
        
        if (newUserIds.length > 0) {
          await User.updateMany(
            { _id: { $in: newUserIds } },
            { $addToSet: { allowedCustomers: customerId } }
          );
        }
      }

      const updated = await Customer.findByIdAndUpdate(
        id,
        data,
        { new: true, runValidators: true }
      ).lean();

      const historyChanges = this.getChanges(existingCustomer, req.body);
      if (historyChanges.length > 0) {
        try {
          const changes = historyChanges.map((c) => ({ field: c.field, from: c.oldValue, to: c.newValue }));
          await notificationClient.sendUpdatedEvent('customer', updated, req.user, changes, { includeEntityData: true });
        } catch (notifErr) {
          console.error('[CustomerController] Failed to send customer updated notification', notifErr);
        }
      }

      let formattedData = updated;
      formattedData = await this.addSignedUrlsToCustomer(formattedData);

      res.status(200).json({
        success: true,
        data: formattedData,
        message: `${this.modelName} updated successfully`
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to update customer');
    }
  };

  // Remove customer file (PDF)
  removeFile = async (req, res) => {
    try {
      if (!ADMIN_ROLES.has(req.user?.role)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format'
        });
      }

      const updated = await Customer.findByIdAndUpdate(
        id,
        { $unset: { file: 1 } },
        { new: true }
      );

      if (!updated) {
        return res.status(404).json({
          success: false,
          error: 'Customer not found'
        });
      }

      res.status(200).json({
        success: true,
        data: updated,
        message: 'Customer file removed successfully'
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to remove customer file');
    }
  };

  delete = async (req, res) => {
    try {
      if (!ADMIN_ROLES.has(req.user?.role)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format'
        });
      }

      const doc = await this.model.findById(id);
      if (!doc) {
        return res.status(404).json({
          success: false,
          error: 'Customer not found'
        });
      }

      await this.model.findByIdAndDelete(id);

      res.status(200).json({
        success: true,
        message: 'Customer deleted successfully'
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to delete customer');
    }
  };

  // Поиск customers по email, companyName и другим полям
  search = async (req, res) => {
    try {
      if (req.params && req.params.id) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request',
          message: 'Search endpoint does not accept ID parameter. Use GET /api/customers/:id for single customer.'
        });
      }

      const accessContext = await getUserContext(req);
      if (accessContext.error) {
        return res.status(accessContext.error.status).json({
          success: false,
          error: accessContext.error.error
        });
      }
      if (NO_ACCESS_ROLES.has(accessContext.role)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const {
        companyName,
        email,
        phoneNumber,
        city,
        state,
        paymentMethod,
        paymentTerms,
        status,
        type, // Фильтр по типу (platform или customer)
        createdAt,
        orderId, // Поиск по Load orderId
        'address.address': addressAddress,
        zipCode,
        q: searchTerm, // Общий поиск по всем полям
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Построение фильтра
      const filter = {};

      if (!ADMIN_ROLES.has(accessContext.role)) {
        filter._id = { $in: accessContext.allowedCustomerIds || [] };
        if (accessContext.role === 'salesAgent') {
          filter.type = 'platform';
        }
      }

      // Функция для экранирования специальных символов в regex
      const escapeRegex = (str) => {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      };

      // Поиск по companyName (частичное совпадение, case-insensitive)
      if (companyName && companyName.trim() !== '') {
        const escapedCompanyName = escapeRegex(companyName.trim());
        filter.companyName = { $regex: escapedCompanyName, $options: 'i' };
      }

      // Поиск по email (частичное совпадение, case-insensitive)
      if (email && email.trim() !== '') {
        const escapedEmail = escapeRegex(email.trim().toLowerCase());
        filter.email = { $regex: escapedEmail, $options: 'i' };
      }

      // Поиск по phoneNumber (частичное совпадение)
      if (phoneNumber && phoneNumber.trim() !== '') {
        const escapedPhone = escapeRegex(phoneNumber.trim());
        filter.phoneNumber = { $regex: escapedPhone, $options: 'i' };
      }

      // Поиск по city
      if (city && city.trim() !== '') {
        const escapedCity = escapeRegex(city.trim());
        filter['customerAddress.city'] = { $regex: escapedCity, $options: 'i' };
      }

      // Поиск по state
      if (state && state.trim() !== '') {
        const escapedState = escapeRegex(state.trim());
        filter['customerAddress.state'] = { $regex: escapedState, $options: 'i' };
      }
      if (addressAddress && addressAddress.trim() !== '') {
        const escapedAddress = escapeRegex(addressAddress.trim());
        filter['customerAddress.address'] = { $regex: escapedAddress, $options: 'i' };
      }
      if (zipCode && zipCode.trim() !== '') {
        const escapedZipCode = escapeRegex(zipCode.trim());
        filter['customerAddress.zipCode'] = { $regex: escapedZipCode, $options: 'i' };
      }

      // Поиск по paymentMethod (точное совпадение)
      if (paymentMethod && paymentMethod.trim() !== '') {
        filter.paymentMethod = paymentMethod.trim();
      }

      // Поиск по paymentTerms (частичное совпадение, case-insensitive)
      if (paymentTerms && paymentTerms.trim() !== '') {
        const escapedTerms = escapeRegex(paymentTerms.trim());
        filter.paymentTerms = { $regex: escapedTerms, $options: 'i' };
      }

      // Фильтр по статусу
      if (status && status.trim() !== '') {
        filter.status = status.trim();
      }

      // Фильтр по дате создания (createdAt)
      if (createdAt && createdAt.trim() !== '') {
        if (createdAt.includes('to')) {
          const [start, end] = createdAt.split(' to ');
          const startDate = new Date(start);
          const endDate = new Date(end);
          if (!Number.isNaN(startDate) && !Number.isNaN(endDate)) {
            filter.createdAt = { $gte: startDate, $lte: endDate };
          }
        } else {
          const date = new Date(createdAt);
          if (!Number.isNaN(date)) {
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);
            filter.createdAt = { $gte: startOfDay, $lte: endOfDay };
          }
        }
      }

      // Фильтр по типу (platform или customer)
      if (type && (type === 'platform' || type === 'customer')) {
        filter.type = type;
      }

      const hasSpecificFilters = Boolean(
        companyName ||
          email ||
          phoneNumber ||
          city ||
          state ||
          addressAddress ||
          zipCode ||
          paymentMethod ||
          paymentTerms ||
          status ||
          type ||
          createdAt ||
          orderId
      );

      // Поиск по orderId через связанные Load (для фильтра)
      let customerIdsFromOrderIdFilter = [];
      if (orderId && orderId.trim() !== '') {
        try {
          const loads = await Load.find({ orderId: { $regex: escapeRegex(orderId.trim()), $options: 'i' } })
            .select('customer')
            .lean();
          
          customerIdsFromOrderIdFilter = loads
            .map(load => load.customer)
            .filter(customerId => customerId && mongoose.Types.ObjectId.isValid(customerId));
          
          if (customerIdsFromOrderIdFilter.length > 0) {
            if (filter._id) {
              const existingIds = Array.isArray(filter._id.$in) ? filter._id.$in : [filter._id];
              filter._id = { $in: [...new Set([...existingIds, ...customerIdsFromOrderIdFilter])] };
            } else {
              filter._id = { $in: customerIdsFromOrderIdFilter };
            }
          } else {
            filter._id = { $in: [] };
          }
        } catch (error) {
          console.error('Error searching loads by orderId:', error);
        }
      }

      // Поиск по orderId в searchTerm
      let customerIdsFromSearchTerm = [];
      if (searchTerm && searchTerm.trim() !== '' && !orderId) {
        try {
          const loads = await Load.find({ orderId: { $regex: escapeRegex(searchTerm.trim()), $options: 'i' } })
            .select('customer')
            .lean();
          
          customerIdsFromSearchTerm = loads
            .map(load => load.customer)
            .filter(customerId => customerId && mongoose.Types.ObjectId.isValid(customerId));
        } catch (error) {
          console.error('Error searching loads by orderId in searchTerm:', error);
        }
      }

      if (searchTerm && searchTerm.trim() !== '') {
        const escapedSearchTerm = escapeRegex(searchTerm.trim());
        const searchRegex = { $regex: escapedSearchTerm, $options: 'i' };
        const searchOr = [
          { companyName: searchRegex },
          { email: searchRegex },
          { phoneNumber: searchRegex },
          { 'customerAddress.address': searchRegex },
          { 'customerAddress.city': searchRegex },
          { 'customerAddress.state': searchRegex },
          { 'customerAddress.zipCode': searchRegex },
          { paymentMethod: searchRegex },
          { paymentTerms: searchRegex },
          { 'representativePeoples.fullName': searchRegex },
          { 'representativePeoples.email': searchRegex },
          { 'representativePeoples.phoneNumber': searchRegex }
        ];
        
        if (customerIdsFromSearchTerm.length > 0) {
          searchOr.push({ _id: { $in: customerIdsFromSearchTerm } });
        }
        
        if (hasSpecificFilters) {
          if (!filter.$and) {
            filter.$and = [];
          }
          filter.$and.push({ $or: searchOr });
        } else {
          filter.$or = searchOr;
        }
      }

      // Построение сортировки
      const sort = {};
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

      // Выполнение запроса
      let customers;
      try {
        customers = await this.model
          .find(filter)
          .sort(sort)
          .skip((page - 1) * limit)
          .limit(parseInt(limit))
          .lean();
      } catch (queryError) {
        if (queryError.name === 'CastError') {
          return res.status(400).json({
            success: false,
            error: 'Invalid search parameter format',
            message: `Invalid value in search criteria: ${queryError.message || 'Please check your search parameters'}`
          });
        }
        throw queryError;
      }

      const total = await this.model.countDocuments(filter);

      let formattedCustomers = customers.map(doc => CustomerDTO.format(doc));
      formattedCustomers = await Promise.all(
        formattedCustomers.map(customer => this.addSignedUrlsToCustomer(customer))
      );
      if (shouldStripPaymentFields(accessContext.role)) {
        formattedCustomers = formattedCustomers.map(customer => stripPaymentFields(customer));
      }

      res.status(200).json({
        success: true,
        data: formattedCustomers,
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      console.error('Search customers error:', error);
      
      if (error.name === 'CastError') {
        return res.status(400).json({
          success: false,
          error: 'Invalid search parameter format',
          message: 'Please check your search criteria and try again'
        });
      }
      
      this.handleError(res, error, 'Failed to search customers');
    }
  };

  // Получить все loads для конкретного customer
  getCustomerLoads = async (req, res) => {
    try {
      const { id } = req.params;
      const { page = 1, limit = 10 } = req.query;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format'
        });
      }

      const accessContext = await getUserContext(req);
      if (accessContext.error) {
        return res.status(accessContext.error.status).json({
          success: false,
          error: accessContext.error.error
        });
      }
      if (NO_ACCESS_ROLES.has(accessContext.role)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const customer = await Customer.findById(id).lean();

      if (!customer) {
        return res.status(404).json({
          success: false,
          error: 'Customer not found'
        });
      }

      if (!ADMIN_ROLES.has(accessContext.role)) {
        if (!accessContext.allowedCustomerIds.includes(customer._id.toString())) {
          return res.status(403).json({
            success: false,
            error: 'Access denied'
          });
        }
        if (accessContext.role === 'salesAgent' && customer.type !== 'platform') {
          return res.status(403).json({
            success: false,
            error: 'Access denied'
          });
        }
      }

      const loadFilter = { customer: id };
      if (accessContext.role === 'freightBroker') {
        loadFilter.createdBy = accessContext.user._id;
      }

      const loads = await Load.find(loadFilter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean();

      const total = await Load.countDocuments(loadFilter);

      res.status(200).json({
        success: true,
        data: {
          customer: customer,
          loads: loads
        },
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to fetch customer loads');
    }
  };

  /**
   * GET /customers/:id/allowedUsers
   * Get users that are in allowedUsers of THIS specific customer
   * Returns only firstName, lastName, email
   */
  getAllowedUsers = async (req, res) => {
    try {
      if (!ADMIN_ROLES.has(req.user?.role)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const { id } = req.params; // customerId из URL

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid customer ID format'
        });
      }

      // Get THIS specific customer with populated allowedUsers
      const customer = await this.model
        .findById(id)
        .populate('allowedUsers', 'firstName lastName email _id')
        .lean();

      if (!customer) {
        return res.status(404).json({
          success: false,
          error: 'Customer not found'
        });
      }

      // Extract users from THIS customer's allowedUsers
      const users = [];
      if (customer.allowedUsers && Array.isArray(customer.allowedUsers)) {
        customer.allowedUsers.forEach(user => {
          if (user && typeof user === 'object') {
            users.push({
              id: (user._id || user.id).toString(),
              firstName: user.firstName || '',
              lastName: user.lastName || '',
              email: user.email || ''
            });
          }
        });
      }

      res.status(200).json({
        success: true,
        data: users
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to fetch allowed users');
    }
  };
}

module.exports = new CustomerController();

