const UniversalBaseController = require('./UniversalBaseController');
const Customer = require('../models/Customer');
const mongoose = require('mongoose');

class CustomerController extends UniversalBaseController {
  constructor() {
    super(Customer, {
      searchFields: ['companyName', 'customerAddress.city', 'customerAddress.state', 'emails', 'phoneNumber'],
      validationRules: {
        create: {
          companyName: { required: true, type: 'string' },
          'customerAddress.address': { required: false, type: 'string' },
          'customerAddress.city': { required: false, type: 'string' },
          'customerAddress.state': { required: false, type: 'string' },
          'customerAddress.zipCode': { required: false, type: 'string' }
        },
        update: {
          companyName: { type: 'string' },
          'customerAddress.address': { type: 'string' },
          'customerAddress.city': { type: 'string' },
          'customerAddress.state': { type: 'string' },
          'customerAddress.zipCode': { type: 'string' },
          emails: { type: 'array' },
          phoneNumber: { type: 'string' }
        }
      }
    });
  }

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

      // Подготовка данных
      const data = this.prepareCreateData(req);
      
      // Handle PDF file upload
      if (req.uploadedFile) {
        data.file = req.uploadedFile;
      }

      // Создание записи
      const newDoc = new this.model(data);
      const saved = await newDoc.save();

      res.status(201).json({
        success: true,
        data: saved,
        message: `${this.modelName} created successfully`
      });
    } catch (error) {
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

      const existingCustomer = await Customer.findById(id);
      if (!existingCustomer) {
        return res.status(404).json({
          success: false,
          error: 'Customer not found'
        });
      }

      // Подготовка данных
      const data = this.prepareUpdateData(req);

      // Handle PDF file upload
      if (req.uploadedFile) {
        data.file = req.uploadedFile;
      }

      // Обновление записи
      const updated = await Customer.findByIdAndUpdate(
        id,
        data,
        { new: true, runValidators: true }
      );

      res.status(200).json({
        success: true,
        data: updated,
        message: `${this.modelName} updated successfully`
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to update customer');
    }
  };

  // Remove customer file (PDF)
  removeFile = async (req, res) => {
    try {
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

  // Поиск customers по email, companyName и другим полям
  search = async (req, res) => {
    try {
      const {
        companyName,
        email,
        phoneNumber,
        city,
        state,
        paymentMethod,
        q: searchTerm, // Общий поиск по всем полям
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Построение фильтра
      const filter = {};

      // Функция для экранирования специальных символов в regex
      const escapeRegex = (str) => {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      };

      // Поиск по companyName (частичное совпадение, case-insensitive)
      if (companyName && companyName.trim() !== '') {
        const escapedCompanyName = escapeRegex(companyName.trim());
        filter.companyName = { $regex: escapedCompanyName, $options: 'i' };
      }

      // Поиск по email (в массиве emails, частичное совпадение, case-insensitive)
      if (email && email.trim() !== '') {
        const escapedEmail = escapeRegex(email.trim().toLowerCase());
        filter.emails = { $regex: escapedEmail, $options: 'i' };
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

      // Поиск по paymentMethod (точное совпадение)
      if (paymentMethod && paymentMethod.trim() !== '') {
        filter.paymentMethod = paymentMethod.trim();
      }

      // Общий поиск по всем полям, если передан параметр q и нет конкретных фильтров
      if (searchTerm && searchTerm.trim() !== '' && !companyName && !email && !phoneNumber && !city && !state) {
        const escapedSearchTerm = escapeRegex(searchTerm.trim());
        const searchRegex = { $regex: escapedSearchTerm, $options: 'i' };
        filter.$or = [
          { companyName: searchRegex },
          { emails: searchRegex },
          { phoneNumber: searchRegex },
          { 'customerAddress.address': searchRegex },
          { 'customerAddress.city': searchRegex },
          { 'customerAddress.state': searchRegex },
          { 'customerAddress.zipCode': searchRegex },
          { paymentMethod: searchRegex },
          { paymentTerms: searchRegex }
        ];
      }

      // Построение сортировки
      const sort = {};
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

      // Выполнение запроса
      const customers = await this.model
        .find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean();

      const total = await this.model.countDocuments(filter);

      res.status(200).json({
        success: true,
        data: customers,
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          limit: parseInt(limit)
        }
      });
    } catch (error) {
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

      const customer = await Customer.findById(id).populate({
        path: 'loads',
        options: {
          sort: { createdAt: -1 },
          skip: (page - 1) * limit,
          limit: parseInt(limit)
        }
      });

      if (!customer) {
        return res.status(404).json({
          success: false,
          error: 'Customer not found'
        });
      }

      const total = customer.loads.length;

      res.status(200).json({
        success: true,
        data: {
          customer: customer,
          loads: customer.loads
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
}

module.exports = new CustomerController();

