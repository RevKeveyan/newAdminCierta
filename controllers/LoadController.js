const UniversalBaseController = require('./UniversalBaseController');
const Load = require('../models/Load');
const Customer = require('../models/Customer');
const Carrier = require('../models/Carrier');
const LoadHistory = require('../models/subModels/LoadHistory');
const PaymentReceivable = require('../models/subModels/PaymentReceivable');
const PaymentPayable = require('../models/subModels/PaymentPayable');
const LoadDTO = require('../DTO/load.dto');
const pdfService = require('../services/pdfService');
const notificationService = require('../services/notificationService');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

class LoadController extends UniversalBaseController {
  constructor() {
    super(Load, {
      historyModel: LoadHistory,
      dto: LoadDTO.LoadDTO,
      populateFields: ['createdBy', 'carrier', 'customer', 'paymentReceivable', 'paymentPayable'],
      searchFields: ['orderId', 'status', 'tracking'],
      validationRules: {
        create: {
          orderId: { required: false, type: 'string' },
          'customer.companyName': { required: false, type: 'string' },
          'carrier.name': { required: false, type: 'string' }
        },
        update: {
          orderId: { type: 'string' },
          status: { type: 'string' },
          tracking: { type: 'string' }
        }
      }
    });
  }

  // Вспомогательный метод для создания или получения Customer
  async findOrCreateCustomer(customerData) {
    if (!customerData) {
      return null;
    }

    // Если передан ID существующего customer
    if (customerData.id && mongoose.Types.ObjectId.isValid(customerData.id)) {
      const existingCustomer = await Customer.findById(customerData.id);
      if (existingCustomer) {
        // Обновляем данные customer, если пришли новые
        let updated = false;
        if (customerData.companyName && customerData.companyName !== existingCustomer.companyName) {
          existingCustomer.companyName = customerData.companyName;
          updated = true;
        }
        if (customerData.customerAddress) {
          existingCustomer.customerAddress = customerData.customerAddress;
          updated = true;
        }
        if (customerData.emails && customerData.emails.length > 0) {
          const uniqueEmails = [...new Set([...existingCustomer.emails, ...customerData.emails])];
          existingCustomer.emails = uniqueEmails;
          updated = true;
        }
        if (customerData.phoneNumber) {
          existingCustomer.phoneNumber = customerData.phoneNumber;
          updated = true;
        }
        if (updated) {
          await existingCustomer.save();
        }
        return existingCustomer._id;
      }
    }

    // Если нет companyName или это пустая строка, не можем создать/найти customer
    if (!customerData.companyName || customerData.companyName.trim() === '') {
      return null;
    }

    // Ищем существующего customer по companyName (точное совпадение, case-insensitive)
    const companyNameTrimmed = customerData.companyName.trim();
    let customer = await Customer.findOne({ 
      companyName: { $regex: new RegExp(`^${companyNameTrimmed}$`, 'i') }
    });

    if (!customer) {
      // Создаем нового customer
      customer = new Customer({
        companyName: companyNameTrimmed,
        customerAddress: customerData.customerAddress || {},
        emails: customerData.emails || [],
        phoneNumber: customerData.phoneNumber
      });
      await customer.save();
    } else {
      // Обновляем существующего customer, если пришли новые данные
      let updated = false;
      if (customerData.customerAddress) {
        customer.customerAddress = customerData.customerAddress;
        updated = true;
      }
      if (customerData.emails && customerData.emails.length > 0) {
        // Объединяем emails, убирая дубликаты
        const uniqueEmails = [...new Set([...customer.emails, ...customerData.emails])];
        customer.emails = uniqueEmails;
        updated = true;
      }
      if (customerData.phoneNumber) {
        customer.phoneNumber = customerData.phoneNumber;
        updated = true;
      }
      if (updated) {
        await customer.save();
      }
    }

    return customer._id;
  }

  // Вспомогательный метод для создания или получения Carrier
  async findOrCreateCarrier(carrierData) {
    if (!carrierData) {
      return null;
    }

    // Если передан ID существующего carrier
    if (carrierData.id && mongoose.Types.ObjectId.isValid(carrierData.id)) {
      const existingCarrier = await Carrier.findById(carrierData.id);
      if (existingCarrier) {
        // Обновляем данные carrier, если пришли новые
        let updated = false;
        if (carrierData.name && carrierData.name !== existingCarrier.name) {
          existingCarrier.name = carrierData.name;
          updated = true;
        }
        if (carrierData.phoneNumber) {
          existingCarrier.phoneNumber = carrierData.phoneNumber;
          updated = true;
        }
        if (carrierData.email) {
          existingCarrier.email = carrierData.email;
          updated = true;
        }
        if (carrierData.companyName) {
          existingCarrier.companyName = carrierData.companyName;
          updated = true;
        }
        if (carrierData.mcNumber) {
          existingCarrier.mcNumber = carrierData.mcNumber;
          updated = true;
        }
        if (carrierData.dotNumber) {
          existingCarrier.dotNumber = carrierData.dotNumber;
          updated = true;
        }
        if (carrierData.address) {
          existingCarrier.address = carrierData.address;
          updated = true;
        }
        if (carrierData.emails && carrierData.emails.length > 0) {
          const uniqueEmails = [...new Set([...existingCarrier.emails, ...carrierData.emails])];
          existingCarrier.emails = uniqueEmails;
          updated = true;
        }
        if (carrierData.photos && carrierData.photos.length > 0) {
          existingCarrier.photos = [...new Set([...existingCarrier.photos, ...carrierData.photos])];
          updated = true;
        }
        if (carrierData.equipmentType && carrierData.equipmentType.trim() !== '') {
          existingCarrier.equipmentType = carrierData.equipmentType.trim();
          updated = true;
        }
        if (carrierData.size && carrierData.size.trim() !== '') {
          existingCarrier.size = carrierData.size.trim();
          updated = true;
        }
        if (Array.isArray(carrierData.capabilities)) {
          const filteredCapabilities = carrierData.capabilities.filter(c => c && c.trim() !== '');
          if (filteredCapabilities.length > 0) {
            existingCarrier.capabilities = [...new Set([...(existingCarrier.capabilities || []), ...filteredCapabilities])];
            updated = true;
          }
        }
        if (Array.isArray(carrierData.certifications)) {
          const filteredCertifications = carrierData.certifications.filter(c => c && c.trim() !== '');
          if (filteredCertifications.length > 0) {
            existingCarrier.certifications = [...new Set([...(existingCarrier.certifications || []), ...filteredCertifications])];
            updated = true;
          }
        }
        if (updated) {
          await existingCarrier.save();
        }
        return existingCarrier._id;
      }
    }

    // Ищем существующего carrier по уникальным идентификаторам
    let carrier = null;
    
    // Приоритет поиска: email > mcNumber > dotNumber > (name + companyName)
    if (carrierData.email && carrierData.email.trim() !== '') {
      carrier = await Carrier.findOne({ email: carrierData.email.trim().toLowerCase() });
    }
    
    if (!carrier && carrierData.mcNumber && carrierData.mcNumber.trim() !== '') {
      carrier = await Carrier.findOne({ mcNumber: carrierData.mcNumber.trim() });
    }
    
    if (!carrier && carrierData.dotNumber && carrierData.dotNumber.trim() !== '') {
      carrier = await Carrier.findOne({ dotNumber: carrierData.dotNumber.trim() });
    }
    
    // Если не нашли по уникальным полям, ищем по комбинации name и companyName
    if (!carrier && carrierData.name && carrierData.companyName) {
      carrier = await Carrier.findOne({
        name: { $regex: new RegExp(`^${carrierData.name}$`, 'i') },
        companyName: { $regex: new RegExp(`^${carrierData.companyName}$`, 'i') }
      });
    }
    
    // Если не нашли, пробуем только по name
    if (!carrier && carrierData.name) {
      carrier = await Carrier.findOne({ 
        name: { $regex: new RegExp(`^${carrierData.name}$`, 'i') }
      });
    }

    if (!carrier) {
      // Создаем нового carrier, если не нашли существующего
      // Проверяем, что есть хотя бы name или companyName (не пустые строки)
      const hasName = carrierData.name && carrierData.name.trim() !== '';
      const hasCompanyName = carrierData.companyName && carrierData.companyName.trim() !== '';
      
      if (!hasName && !hasCompanyName) {
        // Если нет ни name, ни companyName, не можем создать carrier
        return null;
      }
      
      // Проверяем уникальность email, mcNumber, и dotNumber перед созданием
      const emailToCheck = carrierData.email && carrierData.email.trim() !== '' ? carrierData.email.trim().toLowerCase() : null;
      const mcNumberToCheck = carrierData.mcNumber && carrierData.mcNumber.trim() !== '' ? carrierData.mcNumber.trim() : null;
      const dotNumberToCheck = carrierData.dotNumber && carrierData.dotNumber.trim() !== '' ? carrierData.dotNumber.trim() : null;
      
      // Проверяем на дубликаты
      const duplicateChecks = [];
      if (emailToCheck) {
        duplicateChecks.push(Carrier.findOne({ email: emailToCheck }).select('_id name email'));
      }
      if (mcNumberToCheck) {
        duplicateChecks.push(Carrier.findOne({ mcNumber: mcNumberToCheck }).select('_id name mcNumber'));
      }
      if (dotNumberToCheck) {
        duplicateChecks.push(Carrier.findOne({ dotNumber: dotNumberToCheck }).select('_id name dotNumber'));
      }
      
      if (duplicateChecks.length > 0) {
        const duplicates = await Promise.all(duplicateChecks);
        const duplicate = duplicates.find(d => d !== null);
        
        if (duplicate) {
          // Найден дубликат - выбрасываем ошибку
          let duplicateField = '';
          let duplicateValue = '';
          if (duplicate.email === emailToCheck) {
            duplicateField = 'email';
            duplicateValue = emailToCheck;
          } else if (duplicate.mcNumber === mcNumberToCheck) {
            duplicateField = 'MC Number';
            duplicateValue = mcNumberToCheck;
          } else if (duplicate.dotNumber === dotNumberToCheck) {
            duplicateField = 'DOT Number';
            duplicateValue = dotNumberToCheck;
          }
          
          throw new Error(`Carrier with ${duplicateField} "${duplicateValue}" already exists (Carrier: ${duplicate.name || 'Unknown'})`);
        }
      }
      
      carrier = new Carrier({
        name: hasName ? carrierData.name.trim() : (hasCompanyName ? carrierData.companyName.trim() : ''),
        phoneNumber: carrierData.phoneNumber && carrierData.phoneNumber.trim() !== '' ? carrierData.phoneNumber.trim() : undefined,
        email: emailToCheck,
        companyName: hasCompanyName ? carrierData.companyName.trim() : undefined,
        mcNumber: mcNumberToCheck,
        dotNumber: dotNumberToCheck,
        address: carrierData.address || {},
        emails: carrierData.emails || [],
        photos: carrierData.photos || [],
        equipmentType: carrierData.equipmentType && carrierData.equipmentType.trim() !== '' ? carrierData.equipmentType.trim() : undefined,
        size: carrierData.size && carrierData.size.trim() !== '' ? carrierData.size.trim() : undefined,
        capabilities: Array.isArray(carrierData.capabilities) ? carrierData.capabilities.filter(c => c && c.trim() !== '') : [],
        certifications: Array.isArray(carrierData.certifications) ? carrierData.certifications.filter(c => c && c.trim() !== '') : []
      });
      
      try {
        await carrier.save();
      } catch (saveError) {
        // Обрабатываем ошибки уникальности от MongoDB
        if (saveError.code === 11000) {
          const duplicateField = Object.keys(saveError.keyPattern)[0];
          throw new Error(`Carrier with ${duplicateField} "${carrierData[duplicateField]}" already exists`);
        }
        throw saveError;
      }
    } else {
      // Обновляем существующего carrier, если пришли новые данные
      let updated = false;
      if (carrierData.name && carrierData.name !== carrier.name) {
        carrier.name = carrierData.name;
        updated = true;
      }
      if (carrierData.phoneNumber) {
        carrier.phoneNumber = carrierData.phoneNumber;
        updated = true;
      }
      
      // Проверяем уникальность email перед обновлением
      if (carrierData.email && carrierData.email.trim() !== '') {
        const newEmail = carrierData.email.trim().toLowerCase();
        if (newEmail !== carrier.email) {
          // Проверяем, не используется ли этот email другим carrier
          const existingCarrierWithEmail = await Carrier.findOne({ 
            email: newEmail,
            _id: { $ne: carrier._id }
          });
          if (existingCarrierWithEmail) {
            throw new Error(`Carrier with email "${newEmail}" already exists (Carrier: ${existingCarrierWithEmail.name || 'Unknown'})`);
          }
          carrier.email = newEmail;
          updated = true;
        }
      }
      
      if (carrierData.companyName) {
        carrier.companyName = carrierData.companyName;
        updated = true;
      }
      
      // Проверяем уникальность mcNumber перед обновлением
      if (carrierData.mcNumber && carrierData.mcNumber.trim() !== '') {
        const newMcNumber = carrierData.mcNumber.trim();
        if (newMcNumber !== carrier.mcNumber) {
          // Проверяем, не используется ли этот mcNumber другим carrier
          const existingCarrierWithMc = await Carrier.findOne({ 
            mcNumber: newMcNumber,
            _id: { $ne: carrier._id }
          });
          if (existingCarrierWithMc) {
            throw new Error(`Carrier with MC Number "${newMcNumber}" already exists (Carrier: ${existingCarrierWithMc.name || 'Unknown'})`);
          }
          carrier.mcNumber = newMcNumber;
          updated = true;
        }
      }
      
      // Проверяем уникальность dotNumber перед обновлением
      if (carrierData.dotNumber && carrierData.dotNumber.trim() !== '') {
        const newDotNumber = carrierData.dotNumber.trim();
        if (newDotNumber !== carrier.dotNumber) {
          // Проверяем, не используется ли этот dotNumber другим carrier
          const existingCarrierWithDot = await Carrier.findOne({ 
            dotNumber: newDotNumber,
            _id: { $ne: carrier._id }
          });
          if (existingCarrierWithDot) {
            throw new Error(`Carrier with DOT Number "${newDotNumber}" already exists (Carrier: ${existingCarrierWithDot.name || 'Unknown'})`);
          }
          carrier.dotNumber = newDotNumber;
          updated = true;
        }
      }
      if (carrierData.address) {
        carrier.address = carrierData.address;
        updated = true;
      }
      if (carrierData.emails && carrierData.emails.length > 0) {
        const uniqueEmails = [...new Set([...carrier.emails, ...carrierData.emails])];
        carrier.emails = uniqueEmails;
        updated = true;
      }
      if (carrierData.photos && carrierData.photos.length > 0) {
        carrier.photos = [...new Set([...carrier.photos, ...carrierData.photos])];
        updated = true;
      }
      if (carrierData.equipmentType && carrierData.equipmentType.trim() !== '') {
        carrier.equipmentType = carrierData.equipmentType.trim();
        updated = true;
      }
      if (carrierData.size && carrierData.size.trim() !== '') {
        carrier.size = carrierData.size.trim();
        updated = true;
      }
      if (Array.isArray(carrierData.capabilities)) {
        const filteredCapabilities = carrierData.capabilities.filter(c => c && c.trim() !== '');
        if (filteredCapabilities.length > 0) {
          carrier.capabilities = [...new Set([...(carrier.capabilities || []), ...filteredCapabilities])];
          updated = true;
        }
      }
      if (Array.isArray(carrierData.certifications)) {
        const filteredCertifications = carrierData.certifications.filter(c => c && c.trim() !== '');
        if (filteredCertifications.length > 0) {
          carrier.certifications = [...new Set([...(carrier.certifications || []), ...filteredCertifications])];
          updated = true;
        }
      }
      if (updated) {
        try {
          await carrier.save();
        } catch (saveError) {
          // Обрабатываем ошибки уникальности от MongoDB
          if (saveError.code === 11000) {
            const duplicateField = Object.keys(saveError.keyPattern)[0];
            throw new Error(`Carrier with ${duplicateField} "${carrierData[duplicateField]}" already exists`);
          }
          throw saveError;
        }
      }
    }

    return carrier._id;
  }

  /**
   * Создает платежные записи (PaymentReceivable и PaymentPayable) при переходе в статус "Delivered"
   * Также сохраняет ссылки на созданные payments в Load
   * @param {Object} load - документ Load
   * @param {String} userId - ID пользователя, который создает записи
   */
  async createPaymentsOnDelivered(load, userId) {
    try {
      let receivable = null;
      let payable = null;
      let receivableIsNew = false;
      let payableIsNew = false;

      // Создаем PaymentReceivable (от customer), если есть customer
      if (load.customer) {
        // Проверяем, не создан ли уже PaymentReceivable для этого load
        const existingReceivable = await PaymentReceivable.findOne({ loadId: load._id });
        
        if (!existingReceivable) {
          const receivableData = {
            loadId: load._id,
            customer: load.customer,
            daysToPay: 30, // Default 30 days
            invoiceStatus: 'pending'
          };

          receivable = await PaymentReceivable.create(receivableData);
          receivableIsNew = true;
          console.log(`[LoadController] Created PaymentReceivable ${receivable._id} for load ${load.orderId}`);
        } else {
          receivable = existingReceivable;
        }
      }

      // Создаем PaymentPayable (для carrier), если есть carrier
      if (load.carrier) {
        // Проверяем, не создан ли уже PaymentPayable для этого load
        const existingPayable = await PaymentPayable.findOne({ loadId: load._id });
        
        if (!existingPayable) {
          // Получаем данные carrier для банковских реквизитов
          const carrier = await Carrier.findById(load.carrier);
          
          const payableData = {
            loadId: load._id,
            carrier: load.carrier
          };

          // Копируем банковские реквизиты из carrier
          if (carrier) {
            payableData.bank = carrier.bankAccount || null;
            payableData.routing = carrier.routing || null;
            payableData.accountNumber = carrier.accountNumber || null;
          }

          payable = await PaymentPayable.create(payableData);
          payableIsNew = true;
          console.log(`[LoadController] Created PaymentPayable ${payable._id} for load ${load.orderId}`);
        } else {
          payable = existingPayable;
        }
      }

      // Обновляем Load с ссылками на созданные payments
      const updateData = {};
      if (receivable) {
        updateData.paymentReceivable = receivable._id;
      }
      if (payable) {
        updateData.paymentPayable = payable._id;
      }

      if (Object.keys(updateData).length > 0) {
        await Load.findByIdAndUpdate(load._id, updateData);
        console.log(`[LoadController] Updated Load ${load.orderId} with payment references`);
      }

      // === ОТПРАВКА УВЕДОМЛЕНИЙ ===
      
      // 1. Уведомление о доставке Load (с информацией о платежах)
      notificationService.sendLoadDelivered(load, receivable, payable, userId)
        .catch(error => {
          console.error('[LoadController] Failed to send load delivered notification:', error);
        });

      // 2. Уведомление о создании PaymentReceivable (если новый)
      if (receivable && receivableIsNew) {
        notificationService.sendPaymentReceivableCreated(receivable, load)
          .catch(error => {
            console.error('[LoadController] Failed to send payment receivable created notification:', error);
          });
      }

      // 3. Уведомление о создании PaymentPayable (если новый)
      if (payable && payableIsNew) {
        notificationService.sendPaymentPayableCreated(payable, load)
          .catch(error => {
            console.error('[LoadController] Failed to send payment payable created notification:', error);
          });
      }

    } catch (error) {
      // Логируем ошибку, но не прерываем основной процесс
      console.error(`[LoadController] Error creating payment records for load ${load._id}:`, error);
    }
  }

  // Оптимизированная генерация orderId
  generateOrderId = async () => {
    const baseTimestamp = Math.floor(Date.now() / 1000);
    const random = Math.floor(Math.random() * 9000) + 1000; // 4-значное случайное число
    let orderId = `${baseTimestamp}${random}`;
    
    // Проверяем уникальность (максимум 3 попытки)
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      const existing = await this.model.findOne({ orderId }).select('_id').lean();
      if (!existing) {
        return orderId;
      }
      // Генерируем новый с небольшим изменением
      orderId = `${baseTimestamp}${Math.floor(Math.random() * 9000) + 1000}`;
      attempts++;
    }
    
    // Fallback: используем timestamp + случайное число
    return `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  };


  // Специфичные методы для Load
  getByStatus = async (req, res) => {
    try {
      const { status } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const loads = await this.model
        .find({ status })
        .populate(this.populateFields)
        .sort({ createdAt: -1 }) 
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

      const total = await this.model.countDocuments({ status });

      const formattedLoads = this.dto ? loads.map(load => this.dto.format(load)) : loads;

      res.status(200).json({
        success: true,
        data: formattedLoads,
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to fetch loads by status');
    }
  };

  getByCarrier = async (req, res) => {
    try {
      const { carrierId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      if (!mongoose.Types.ObjectId.isValid(carrierId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid carrier ID format'
        });
      }

      const loads = await this.model
        .find({ carrier: carrierId })
        .populate(this.populateFields)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

      const total = await this.model.countDocuments({ carrier: carrierId });

      const formattedLoads = this.dto ? loads.map(load => this.dto.format(load)) : loads;

      res.status(200).json({
        success: true,
        data: formattedLoads,
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to fetch loads by carrier');
    }
  };

  getByCustomer = async (req, res) => {
    try {
      const { customerId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      if (!mongoose.Types.ObjectId.isValid(customerId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid customer ID format'
        });
      }

      const loads = await this.model
        .find({ customer: customerId })
        .populate(this.populateFields)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

      const total = await this.model.countDocuments({ customer: customerId });

      const formattedLoads = this.dto ? loads.map(load => this.dto.format(load)) : loads;

      res.status(200).json({
        success: true,
        data: formattedLoads,
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to fetch loads by customer');
    }
  };

  // Вспомогательная функция для парсинга JSON строк из form-data
  parseJsonField(value) {
    if (!value) return null;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch (e) {
        // Если не JSON, возвращаем как есть
        return value;
      }
    }
    return value;
  }

  // Вспомогательная функция для фильтрации null и пустых значений из объекта
  filterNullValues(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    
    // Проверяем, является ли объект ObjectId (MongoDB ObjectId)
    // ObjectId имеет свойство _bsontype или является экземпляром mongoose.Types.ObjectId
    if (obj._bsontype === 'ObjectID' || (mongoose.Types.ObjectId && obj instanceof mongoose.Types.ObjectId)) {
      return obj; // Возвращаем ObjectId как есть
    }
    
    if (Array.isArray(obj)) {
      const filtered = obj.map(item => {
        // Проверяем ObjectId в массиве
        if (item && typeof item === 'object' && (item._bsontype === 'ObjectID' || (mongoose.Types.ObjectId && item instanceof mongoose.Types.ObjectId))) {
          return item;
        }
        
        // Если элемент - объект, фильтруем его поля
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
          const filteredItem = {};
          for (const key in item) {
            const val = item[key];
            if (val !== null && val !== undefined && val !== '') {
              // Проверяем ObjectId
              if (val && typeof val === 'object' && (val._bsontype === 'ObjectID' || (mongoose.Types.ObjectId && val instanceof mongoose.Types.ObjectId))) {
                filteredItem[key] = val;
              } else if (typeof val === 'object' && !Array.isArray(val)) {
                // Рекурсивно фильтруем вложенные объекты и массивы
                const filteredVal = this.filterNullValues(val);
                if (Object.keys(filteredVal).length > 0) {
                  filteredItem[key] = filteredVal;
                }
              } else if (Array.isArray(val)) {
                const filteredArr = this.filterNullValues(val);
                if (filteredArr.length > 0) {
                  filteredItem[key] = filteredArr;
                }
              } else {
                filteredItem[key] = val;
              }
            }
          }
          return filteredItem;
        }
        // Для примитивных значений фильтруем null/undefined/пустые строки
        return item !== null && item !== undefined && item !== '' ? item : null;
      }).filter(item => {
        // Удаляем null элементы и пустые объекты
        if (item === null || item === undefined) return false;
        if (typeof item === 'object' && !Array.isArray(item)) {
          // Не удаляем ObjectId
          if (item._bsontype === 'ObjectID' || (mongoose.Types.ObjectId && item instanceof mongoose.Types.ObjectId)) {
            return true;
          }
          return Object.keys(item).length > 0;
        }
        return item !== '';
      });
      return filtered;
    }
    
    const filtered = {};
    for (const key in obj) {
      const value = obj[key];
      // Пропускаем null, undefined и пустые строки
      if (value === null || value === undefined || value === '') {
        continue;
      }
      
      // Проверяем ObjectId
      if (value && typeof value === 'object' && (value._bsontype === 'ObjectID' || (mongoose.Types.ObjectId && value instanceof mongoose.Types.ObjectId))) {
        filtered[key] = value; // Сохраняем ObjectId как есть
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        const filteredObj = this.filterNullValues(value);
        // Оставляем объект только если в нем есть хотя бы одно не-null значение
        if (Object.keys(filteredObj).length > 0) {
          filtered[key] = filteredObj;
        }
      } else if (Array.isArray(value)) {
        const filteredArray = this.filterNullValues(value);
        // Удаляем пустые массивы
        if (filteredArray.length > 0) {
          filtered[key] = filteredArray;
        }
      } else {
        filtered[key] = value;
      }
    }
    return filtered;
  }

  // Переопределяем create для Load с новой структурой
  create = async (req, res) => {
    try {
      const loadData = req.body.load || req.body; // Поддержка вложенной структуры

      // Парсим JSON строки из form-data (если пришли через multipart/form-data)
      let customerData = loadData.customer ? this.parseJsonField(loadData.customer) : null;
      let carrierData = loadData.carrier ? this.parseJsonField(loadData.carrier) : null;
      const typeData = loadData.type ? this.parseJsonField(loadData.type) : { freight: false, vehicle: false };
      
      // Фильтруем пустые строки из customerData и carrierData
      if (customerData) {
        customerData = this.filterNullValues(customerData);
        // Если после фильтрации customerData пустой или нет companyName, устанавливаем null
        if (Object.keys(customerData).length === 0 || !customerData.companyName || customerData.companyName.trim() === '') {
          customerData = null;
        }
      }
      
      if (carrierData) {
        carrierData = this.filterNullValues(carrierData);
        // Если после фильтрации carrierData пустой или нет ни name, ни companyName, устанавливаем null
        if (Object.keys(carrierData).length === 0 || 
            ((!carrierData.name || carrierData.name.trim() === '') && 
             (!carrierData.companyName || carrierData.companyName.trim() === ''))) {
          // Но если есть id, оставляем carrierData для поиска существующего carrier
          if (!carrierData.id) {
            carrierData = null;
          }
        }
      }
      let vehicleData = loadData.vehicle ? this.parseJsonField(loadData.vehicle) : null;
      let freightData = loadData.freight ? this.parseJsonField(loadData.freight) : null;
      const pickupData = loadData.pickup ? this.parseJsonField(loadData.pickup) : {};
      const deliveryData = loadData.delivery ? this.parseJsonField(loadData.delivery) : {};
      const insuranceData = loadData.insurance ? this.parseJsonField(loadData.insurance) : {};
      const datesData = loadData.dates ? this.parseJsonField(loadData.dates) : {};

      // Фильтрация null значений для freight, если тип freight (и нет vehicle)
      if (typeData.freight && !typeData.vehicle && freightData) {
        freightData = this.filterNullValues(freightData);
        // Если после фильтрации freight пустой или shipment пустой, устанавливаем null
        if (!freightData || 
            (freightData.shipment && (!Array.isArray(freightData.shipment) || freightData.shipment.length === 0)) ||
            (Object.keys(freightData).length === 0)) {
          freightData = null;
        }
      }

      // Фильтрация null значений для vehicle, если тип vehicle (и нет freight)
      if (typeData.vehicle && !typeData.freight && vehicleData) {
        vehicleData = this.filterNullValues(vehicleData);
        // Если после фильтрации vehicle пустой или shipment пустой, устанавливаем null
        if (!vehicleData || 
            (vehicleData.shipment && (!Array.isArray(vehicleData.shipment) || vehicleData.shipment.length === 0)) ||
            (Object.keys(vehicleData).length === 0)) {
          vehicleData = null;
        }
      }

      // Оптимизированная проверка уникальности VIN для vehicle (одним запросом)
      let duplicateVin = null;
      if (vehicleData && vehicleData.shipment && Array.isArray(vehicleData.shipment)) {
        const vins = vehicleData.shipment
          .map(s => s.vin?.trim())
          .filter(vin => vin && vin !== '');
        
        if (vins.length > 0) {
          const existingLoad = await this.model.findOne({
            'vehicle.shipment.vin': { $in: vins }
          }).select('orderId vehicle.shipment.vin').lean();
          
          if (existingLoad) {
            // Находим конкретный дублирующийся VIN
            const duplicateVinInLoad = existingLoad.vehicle?.shipment?.find(s => 
              s.vin && vins.includes(s.vin.trim())
            );
            duplicateVin = duplicateVinInLoad?.vin || vins[0];
            
            return res.status(400).json({
              success: false,
              error: 'Duplicate VIN',
              message: `VIN "${duplicateVin}" already exists in another load (Order ID: ${existingLoad.orderId})`
            });
          }
        }
      }

      // Параллельная обработка Customer, Carrier и orderId
      // Проверяем orderId: если пустая строка или не передан, генерируем новый
      const orderIdToUse = (loadData.orderId && loadData.orderId.trim() !== '') 
        ? loadData.orderId.trim() 
        : null;
      
      const [customerIdResult, carrierIdResult, orderIdResult] = await Promise.all([
        // Обработка Customer
        customerData ? this.findOrCreateCustomer(customerData) : Promise.resolve(null),
        // Обработка Carrier
        carrierData ? this.findOrCreateCarrier(carrierData) : Promise.resolve(null),
        // Генерация orderId, если не передан или пустая строка (оптимизированная версия)
        orderIdToUse ? Promise.resolve(orderIdToUse) : this.generateOrderId()
      ]);

      const customerId = customerIdResult;
      const carrierId = carrierIdResult;
      const orderId = orderIdResult;

      // Обработка customerEmails и carrierEmails (могут быть строками или массивами)
      let customerEmails = loadData.customerEmails;
      if (typeof customerEmails === 'string') {
        customerEmails = customerEmails.split(',').map(email => email.trim()).filter(email => email);
      }
      if (!Array.isArray(customerEmails)) {
        customerEmails = customerEmails ? [customerEmails] : [];
      }

      let carrierEmails = loadData.carrierEmails;
      if (typeof carrierEmails === 'string') {
        carrierEmails = carrierEmails.split(',').map(email => email.trim()).filter(email => email);
      }
      if (!Array.isArray(carrierEmails)) {
        carrierEmails = carrierEmails ? [carrierEmails] : [];
      }

      // Автоматически устанавливаем createdBy из токена авторизации
      // Если пользователь авторизован - используем его ID
      // Если не авторизован, но передан createdBy в body - используем его (для тестирования)
      // Если ни того, ни другого - возвращаем ошибку
      let createdBy = req.user?.id || req.body.createdBy;
      
      // Если createdBy не установлен, возвращаем ошибку
      if (!createdBy) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          message: 'You must be authenticated to create a load. Please provide a valid authorization token or createdBy in request body.'
        });
      }

      // Фильтрация пустых строк из pickup, delivery, insurance, dates
      const filteredPickup = this.filterNullValues(pickupData);
      const filteredDelivery = this.filterNullValues(deliveryData);
      const filteredInsurance = this.filterNullValues(insuranceData);
      const filteredDates = this.filterNullValues(datesData);

      // Подготовка данных для Load (только поля с значениями)
      const loadDocument = {
        orderId,
        ...(customerId && { customer: customerId }),
        customerEmails: customerEmails.length > 0 ? customerEmails : undefined,
        ...(loadData.customerRate && loadData.customerRate.trim() !== '' && { customerRate: loadData.customerRate.trim() }),
        ...(loadData.carrierRate && loadData.carrierRate.trim() !== '' && { carrierRate: loadData.carrierRate.trim() }),
        type: typeData,
        ...(Object.keys(filteredPickup).length > 0 && { pickup: filteredPickup }),
        ...(Object.keys(filteredDelivery).length > 0 && { delivery: filteredDelivery }),
        ...(carrierId && { carrier: carrierId }),
        carrierEmails: carrierEmails.length > 0 ? carrierEmails : undefined,
        carrierPhotos: Array.isArray(loadData.carrierPhotos) && loadData.carrierPhotos.filter(photo => photo && photo.trim() !== '').length > 0 
          ? loadData.carrierPhotos.filter(photo => photo && photo.trim() !== '') 
          : undefined,
        ...(Object.keys(filteredInsurance).length > 0 && { insurance: filteredInsurance }),
        status: loadData.status || 'Listed',
        ...(Object.keys(filteredDates).length > 0 && { dates: filteredDates }),
        ...(loadData.tracking && loadData.tracking.trim() !== '' && { tracking: loadData.tracking.trim() }),
        documents: Array.isArray(loadData.documents) && loadData.documents.filter(doc => doc && doc.trim() !== '').length > 0
          ? loadData.documents.filter(doc => doc && doc.trim() !== '')
          : undefined,
        createdBy: createdBy
      };

      // Добавляем vehicle только если он не null и содержит валидные данные
      if (vehicleData && 
          vehicleData.shipment && 
          Array.isArray(vehicleData.shipment) && 
          vehicleData.shipment.length > 0) {
        loadDocument.vehicle = vehicleData;
      }

      // Добавляем freight только если он не null и содержит валидные данные
      if (freightData && 
          freightData.shipment && 
          Array.isArray(freightData.shipment) && 
          freightData.shipment.length > 0) {
        loadDocument.freight = freightData;
      }

      // Обработка загруженных файлов
      if (req.uploadedFiles && req.uploadedFiles.length > 0) {
        // Распределяем файлы по соответствующим полям
        // Это можно улучшить, добавив логику определения типа файла
        loadDocument.documents = [...(loadDocument.documents || []), ...req.uploadedFiles];
      }

      // Фильтруем все null и пустые значения из loadDocument перед сохранением
      const cleanedLoadDocument = this.filterNullValues(loadDocument);

      // Создание записи
      const newDoc = new this.model(cleanedLoadDocument);
      const saved = await newDoc.save();

      // Параллельное обновление Customer и Carrier, добавляя ссылку на Load
      const updatePromises = [];
      if (customerId) {
        updatePromises.push(
          Customer.findByIdAndUpdate(customerId, {
            $addToSet: { loads: saved._id }
          })
        );
      }
      if (carrierId) {
        updatePromises.push(
          Carrier.findByIdAndUpdate(carrierId, {
            $addToSet: { loads: saved._id }
          })
        );
      }
      await Promise.all(updatePromises);

      // Генерация BOL PDF - ВРЕМЕННО ОТКЛЮЧЕНО для тестирования интеграции с UI
      // try {
      //   const formattedLoadData = this.dto ? this.dto.format(saved) : saved;
      //   const bolResult = await pdfService.generateBOL(formattedLoadData, saved._id.toString());
      //   saved.bolPdfPath = bolResult.filename;
      //   await saved.save();
      // } catch (pdfError) {
      //   console.error('Error generating BOL PDF during load creation:', pdfError);
      // }

      // Параллельное создание истории и загрузка полных данных с populate
      const [_, populatedLoad] = await Promise.all([
        // Создаем запись в истории (если нужно)
        this.historyModel && saved.createdBy 
          ? this.createHistoryRecord(saved._id, 'created', saved.createdBy, [])
          : Promise.resolve(),
        // Загружаем полные данные с populate
        this.model.findById(saved._id)
          .populate('customer')
          .populate('carrier')
          .populate('createdBy')
      ]);

      // Применение DTO
      const formattedDoc = this.dto ? this.dto.format(populatedLoad) : populatedLoad;

      // Send notification for load creation (non-blocking)
      notificationService.sendLoadCreated(populatedLoad, createdBy)
        .catch(error => {
          console.error('[LoadController] Failed to send load created notification:', error);
        });

      res.status(201).json({
        success: true,
        data: formattedDoc,
        message: 'Load created successfully'
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to create load');
    }
  };

  // Переопределяем базовый update для обработки customer/carrier объектов
  update = async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format'
        });
      }

      // Получение старой записи
      const oldDoc = await this.model.findById(id);
      if (!oldDoc) {
        return res.status(404).json({
          success: false,
          error: 'Load not found'
        });
      }

      const loadData = req.body.load || req.body;

      // Обработка customer - может быть ObjectId или объект
      let customerId = oldDoc.customer;
      let customerWasProvided = 'customer' in loadData;
      
      if (customerWasProvided) {
        if (loadData.customer === null || loadData.customer === undefined) {
          // Явное удаление customer
          customerId = null;
        }
        // Если это ObjectId (строка или ObjectId)
        else if (mongoose.Types.ObjectId.isValid(loadData.customer)) {
          customerId = loadData.customer;
        } 
        // Если это объект, проверяем наличие id поля
        else if (typeof loadData.customer === 'object') {
          const customerData = this.parseJsonField(loadData.customer);
          if (customerData) {
            // Если объект содержит id, используем его напрямую
            if (customerData.id && mongoose.Types.ObjectId.isValid(customerData.id)) {
              customerId = customerData.id;
            } else {
              // Иначе обрабатываем через findOrCreateCustomer
              try {
                customerId = await this.findOrCreateCustomer(customerData);
              } catch (error) {
                return res.status(400).json({
                  success: false,
                  error: 'Failed to process customer',
                  message: error.message
                });
              }
            }
          } else {
            customerId = null;
          }
        }
      }

      // Обработка carrier - может быть ObjectId или объект
      let carrierId = oldDoc.carrier;
      let carrierWasProvided = 'carrier' in loadData;
      
      if (carrierWasProvided) {
        if (loadData.carrier === null || loadData.carrier === undefined) {
          // Явное удаление carrier
          carrierId = null;
        }
        // Если это ObjectId (строка или ObjectId)
        else if (mongoose.Types.ObjectId.isValid(loadData.carrier)) {
          carrierId = loadData.carrier;
        } 
        // Если это объект, проверяем наличие id поля
        else if (typeof loadData.carrier === 'object') {
          const carrierData = this.parseJsonField(loadData.carrier);
          if (carrierData) {
            // Если объект содержит id, используем его напрямую
            if (carrierData.id && mongoose.Types.ObjectId.isValid(carrierData.id)) {
              carrierId = carrierData.id;
            } else {
              // Иначе обрабатываем через findOrCreateCarrier
              try {
                carrierId = await this.findOrCreateCarrier(carrierData);
              } catch (error) {
                return res.status(400).json({
                  success: false,
                  error: 'Failed to process carrier',
                  message: error.message
                });
              }
            }
          } else {
            carrierId = null;
          }
        }
      }

      // Подготовка данных для обновления (исключаем customer/carrier объекты сразу)
      // Создаем новый объект без customer/carrier, чтобы избежать передачи объектов в MongoDB
      const updateData = {};
      Object.keys(loadData).forEach(key => {
        // Пропускаем customer и carrier - они будут добавлены отдельно как ID
        if (key !== 'customer' && key !== 'carrier') {
          updateData[key] = loadData[key];
        }
      });
      
      // Добавляем customer/carrier только как ID, если они были предоставлены
      if (customerWasProvided) {
        updateData.customer = customerId;
      }

      if (carrierWasProvided) {
        updateData.carrier = carrierId;
      }

      // Фильтруем только измененные поля
      const filteredData = this.filterChangedFields(oldDoc, updateData);
      
      // Если нет изменений, возвращаем существующую запись
      if (Object.keys(filteredData).length === 0) {
        const formattedDoc = this.dto ? this.dto.format(oldDoc) : oldDoc;
        return res.status(200).json({
          success: true,
          data: formattedDoc,
          message: 'No changes detected'
        });
      }

      // Подготовка данных (только для измененных полей)
      const data = this.prepareUpdateData(req, filteredData);

      // Защитная проверка: убеждаемся, что customer и carrier - это ObjectId, а не объекты
      if (data.customer && typeof data.customer === 'object' && !mongoose.Types.ObjectId.isValid(data.customer)) {
        // Если это объект без валидного ObjectId, пытаемся извлечь id
        if (data.customer.id && mongoose.Types.ObjectId.isValid(data.customer.id)) {
          data.customer = data.customer.id;
        } else {
          delete data.customer; // Удаляем если не можем преобразовать
        }
      }
      
      if (data.carrier && typeof data.carrier === 'object' && !mongoose.Types.ObjectId.isValid(data.carrier)) {
        // Если это объект без валидного ObjectId, пытаемся извлечь id
        if (data.carrier.id && mongoose.Types.ObjectId.isValid(data.carrier.id)) {
          data.carrier = data.carrier.id;
        } else {
          delete data.carrier; // Удаляем если не можем преобразовать
        }
      }

      // Обновление записи
      const updated = await this.model.findByIdAndUpdate(
        id,
        data,
        { new: true, runValidators: true }
      )
      .populate('customer')
      .populate('carrier')
      .populate('createdBy');

      // Обновляем связи в Customer и Carrier
      if (customerId && customerId.toString() !== oldDoc.customer?.toString()) {
        // Удаляем старую связь
        if (oldDoc.customer) {
          await Customer.findByIdAndUpdate(oldDoc.customer, {
            $pull: { loads: id }
          });
        }
        // Добавляем новую связь
        if (customerId) {
          await Customer.findByIdAndUpdate(customerId, {
            $addToSet: { loads: id }
          });
        }
      }

      if (carrierId && carrierId.toString() !== oldDoc.carrier?.toString()) {
        // Удаляем старую связь
        if (oldDoc.carrier) {
          await Carrier.findByIdAndUpdate(oldDoc.carrier, {
            $pull: { loads: id }
          });
        }
        // Добавляем новую связь
        if (carrierId) {
          await Carrier.findByIdAndUpdate(carrierId, {
            $addToSet: { loads: id }
          });
        }
      }

      // Запись в историю изменений
      if (this.historyModel) {
        const changes = this.getChanges(oldDoc, updateData);
        const userId = req.user?.id;
        if (changes.length > 0 && userId) {
          await this.createHistoryRecord(id, 'updated', userId, changes);
        }
      }

      // Send notifications (non-blocking) - use already populated updated document
      // Send notification if status changed
      if (updateData.status && updateData.status !== oldDoc.status) {
        notificationService.sendLoadStatusUpdate(updated, oldDoc.status, updateData.status, req.user?.id)
          .catch(error => {
            console.error('[LoadController] Failed to send status update notification:', error);
          });
      }

      // Send notification if carrier was assigned
      if (carrierId && carrierId.toString() !== oldDoc.carrier?.toString()) {
        notificationService.sendLoadAssigned(updated, carrierId, req.user?.id)
          .catch(error => {
            console.error('[LoadController] Failed to send load assigned notification:', error);
          });
      }

      // Send general update notification (if something changed besides status and carrier assignment)
      if (this.historyModel) {
        const changes = this.getChanges(oldDoc, updateData);
        // Only send if there are changes other than status (status notification is sent separately)
        const nonStatusChanges = changes.filter(c => c.field !== 'status');
        if (nonStatusChanges.length > 0) {
          const changesObj = {};
          nonStatusChanges.forEach(c => {
            changesObj[c.field] = { from: c.oldValue, to: c.newValue };
          });
          notificationService.sendLoadUpdated(updated, changesObj, req.user?.id)
            .catch(error => {
              console.error('[LoadController] Failed to send load updated notification:', error);
            });
        }
      }

      // Создаем платежные записи при переходе в статус "Delivered"
      if (updateData.status === 'Delivered' && oldDoc.status !== 'Delivered') {
        this.createPaymentsOnDelivered(updated, req.user?.id)
          .catch(error => {
            console.error('[LoadController] Failed to create payment records:', error);
          });
      }

      // Применение DTO
      const formattedDoc = this.dto ? this.dto.format(updated) : updated;

      res.status(200).json({
        success: true,
        data: formattedDoc,
        message: 'Load updated successfully'
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to update load');
    }
  };

  // Полное обновление load с поддержкой новой структуры
  updateLoad = async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format'
        });
      }

      // Получение старой записи для истории
      const oldDoc = await this.model.findById(id);
      if (!oldDoc) {
        return res.status(404).json({
          success: false,
          error: 'Load not found'
        });
      }

      const loadData = req.body.load || req.body; // Поддержка вложенной структуры

      // Парсим JSON строки из form-data (если пришли через multipart/form-data)
      const customerData = loadData.customer ? this.parseJsonField(loadData.customer) : null;
      const carrierData = loadData.carrier ? this.parseJsonField(loadData.carrier) : null;
      const typeData = loadData.type ? this.parseJsonField(loadData.type) : oldDoc.type;
      
      // Проверяем, был ли vehicle передан в запросе (для различения "не передан" и "передан null")
      const vehicleWasProvided = 'vehicle' in loadData;
      let vehicleData = vehicleWasProvided ? (loadData.vehicle ? this.parseJsonField(loadData.vehicle) : null) : undefined;
      
      // Проверяем, был ли freight передан в запросе
      const freightWasProvided = 'freight' in loadData;
      let freightData = freightWasProvided ? (loadData.freight ? this.parseJsonField(loadData.freight) : null) : undefined;
      const pickupData = loadData.pickup ? this.parseJsonField(loadData.pickup) : null;
      const deliveryData = loadData.delivery ? this.parseJsonField(loadData.delivery) : null;
      const insuranceData = loadData.insurance ? this.parseJsonField(loadData.insurance) : null;
      const datesData = loadData.dates ? this.parseJsonField(loadData.dates) : null;

      // Определяем тип из обновленных данных или используем существующий
      const currentType = typeData || oldDoc.type || { freight: false, vehicle: false };

      // Фильтрация null значений для freight, если тип freight (и нет vehicle)
      // Только если freight был передан в запросе
      if (freightWasProvided && currentType.freight && !currentType.vehicle && freightData) {
        freightData = this.filterNullValues(freightData);
        // Если после фильтрации freight пустой или shipment пустой, устанавливаем null
        if (!freightData || 
            (freightData.shipment && (!Array.isArray(freightData.shipment) || freightData.shipment.length === 0)) ||
            (Object.keys(freightData).length === 0)) {
          freightData = null;
        }
      }

      // Фильтрация null значений для vehicle, если тип vehicle (и нет freight)
      // Только если vehicle был передан в запросе
      if (vehicleWasProvided && currentType.vehicle && !currentType.freight && vehicleData) {
        vehicleData = this.filterNullValues(vehicleData);
        // Если после фильтрации vehicle пустой или shipment пустой, устанавливаем null
        if (!vehicleData || 
            (vehicleData.shipment && (!Array.isArray(vehicleData.shipment) || vehicleData.shipment.length === 0)) ||
            (Object.keys(vehicleData).length === 0)) {
          vehicleData = null;
        }
      }

      // Проверка уникальности VIN для vehicle (только если vin не null)
      // Только если vehicle был передан и содержит данные
      if (vehicleWasProvided && vehicleData && vehicleData.shipment && Array.isArray(vehicleData.shipment)) {
        for (const shipment of vehicleData.shipment) {
          if (shipment.vin && shipment.vin.trim() !== '') {
            // Проверяем, существует ли уже Load с таким VIN (исключая текущий документ)
            const existingLoad = await this.model.findOne({
              'vehicle.shipment.vin': shipment.vin.trim(),
              _id: { $ne: id } // Исключаем текущий документ при обновлении
            });
            
            if (existingLoad) {
              return res.status(400).json({
                success: false,
                error: 'Duplicate VIN',
                message: `VIN "${shipment.vin.trim()}" already exists in another load (Order ID: ${existingLoad.orderId})`
              });
            }
          }
        }
      }

      // Обработка Customer
      let customerId = oldDoc.customer;
      if (customerData) {
        customerId = await this.findOrCreateCustomer(customerData);
      }

      // Обработка Carrier
      let carrierId = oldDoc.carrier;
      if (carrierData) {
        carrierId = await this.findOrCreateCarrier(carrierData);
      }

      // Подготовка данных для обновления
      const updateData = {
        ...(loadData.orderId && { orderId: loadData.orderId }),
        ...(customerId && { customer: customerId }),
        ...(loadData.customerEmails && { customerEmails: loadData.customerEmails }),
        ...(loadData.customerRate && { customerRate: loadData.customerRate }),
        ...(typeData && { type: typeData }),
        ...(pickupData && { pickup: pickupData }),
        ...(deliveryData && { delivery: deliveryData }),
        ...(carrierId && { carrier: carrierId }),
        ...(loadData.carrierEmails && { carrierEmails: loadData.carrierEmails }),
        ...(loadData.carrierPhotos && { carrierPhotos: loadData.carrierPhotos }),
        ...(insuranceData && { insurance: insuranceData }),
        ...(loadData.status && { status: loadData.status }),
        ...(datesData && { dates: datesData }),
        ...(loadData.tracking !== undefined && { tracking: loadData.tracking }),
        ...(loadData.documents && { documents: loadData.documents })
      };

      // Добавляем vehicle только если он был передан в запросе
      // Если vehicleData === null (явно передан null), удаляем vehicle из документа
      // Если vehicleData === undefined (не передан), не трогаем vehicle
      if (vehicleWasProvided) {
        if (vehicleData === null) {
          updateData.vehicle = null;
        } else if (vehicleData && 
                    vehicleData.shipment && 
                    Array.isArray(vehicleData.shipment) && 
                    vehicleData.shipment.length > 0) {
          updateData.vehicle = vehicleData;
        }
      }

      // Добавляем freight только если он был передан в запросе
      // Если freightData === null (явно передан null), удаляем freight из документа
      // Если freightData === undefined (не передан), не трогаем freight
      if (freightWasProvided) {
        if (freightData === null) {
          updateData.freight = null;
        } else if (freightData && 
                    freightData.shipment && 
                    Array.isArray(freightData.shipment) && 
                    freightData.shipment.length > 0) {
          updateData.freight = freightData;
        }
      }

      // Обработка загруженных файлов
      if (req.uploadedFiles && req.uploadedFiles.length > 0) {
        const existingDocuments = oldDoc.documents || [];
        updateData.documents = [...existingDocuments, ...req.uploadedFiles];
      }

      // Фильтруем все null и пустые значения из updateData перед обновлением
      const cleanedUpdateData = this.filterNullValues(updateData);

      // Фильтруем только измененные поля (сравниваем с существующим документом)
      const filteredData = this.filterChangedFields(oldDoc, cleanedUpdateData);
      
      // Если нет изменений, возвращаем существующую запись
      if (Object.keys(filteredData).length === 0) {
        const formattedDoc = this.dto ? this.dto.format(oldDoc) : oldDoc;
        return res.status(200).json({
          success: true,
          data: formattedDoc,
          message: 'No changes detected'
        });
      }

      // Удаляем старый BOL PDF если он существует - ВРЕМЕННО ОТКЛЮЧЕНО для тестирования интеграции с UI
      // if (oldDoc.bolPdfPath) {
      //   try {
      //     await pdfService.deletePDF(oldDoc.bolPdfPath);
      //   } catch (deleteError) {
      //     console.error('Error deleting old BOL PDF:', deleteError);
      //   }
      // }

      // Обновление записи (только измененными полями)
      const updated = await this.model.findByIdAndUpdate(
        id,
        filteredData,
        { new: true, runValidators: true }
      )
      .populate('customer')
      .populate('carrier')
      .populate('createdBy');

      // Обновляем связи в Customer и Carrier только если поле действительно изменилось
      if (filteredData.customer !== undefined) {
        const newCustomerId = filteredData.customer;
        const oldCustomerId = oldDoc.customer;
        
        // Удаляем старую связь
        if (oldCustomerId) {
          await Customer.findByIdAndUpdate(oldCustomerId, {
            $pull: { loads: id }
          });
        }
        // Добавляем новую связь (если не null)
        if (newCustomerId) {
          await Customer.findByIdAndUpdate(newCustomerId, {
            $addToSet: { loads: id }
          });
        }
      }

      if (filteredData.carrier !== undefined) {
        const newCarrierId = filteredData.carrier;
        const oldCarrierId = oldDoc.carrier;
        
        // Удаляем старую связь
        if (oldCarrierId) {
          await Carrier.findByIdAndUpdate(oldCarrierId, {
            $pull: { loads: id }
          });
        }
        // Добавляем новую связь (если не null)
        if (newCarrierId) {
          await Carrier.findByIdAndUpdate(newCarrierId, {
            $addToSet: { loads: id }
          });
        }
      }

      // Регенерируем BOL PDF с обновленными данными - ВРЕМЕННО ОТКЛЮЧЕНО для тестирования интеграции с UI
      // try {
      //   const formattedLoadData = this.dto ? this.dto.format(updated) : updated;
      //   const bolResult = await pdfService.generateBOL(formattedLoadData, updated._id.toString());
      //   updated.bolPdfPath = bolResult.filename;
      //   await updated.save();
      // } catch (pdfError) {
      //   console.error('Error regenerating BOL PDF during load update:', pdfError);
      // }

      // Запись в историю изменений
      if (this.historyModel) {
        const changes = this.getChanges(oldDoc, loadData);
        const userId = req.user?.id;
        if (changes.length > 0 && userId) {
          await this.createHistoryRecord(id, 'updated', userId, changes);
        }
      }

      // Send notification if status changed (non-blocking)
      // Проверяем filteredData, так как это реально измененные поля
      if (filteredData.status && filteredData.status !== oldDoc.status) {
        notificationService.sendLoadStatusUpdate(updated, oldDoc.status, filteredData.status, req.user?.id)
          .catch(error => {
            console.error('[LoadController] Failed to send status update notification:', error);
          });
      }

      // Send notification if carrier was assigned (non-blocking)
      // Проверяем filteredData для carrier
      if (filteredData.carrier && filteredData.carrier.toString() !== oldDoc.carrier?.toString()) {
        notificationService.sendLoadAssigned(updated, filteredData.carrier, req.user?.id)
          .catch(error => {
            console.error('[LoadController] Failed to send load assigned notification:', error);
          });
      }

      // Создаем платежные записи при переходе в статус "Delivered"
      if (filteredData.status === 'Delivered' && oldDoc.status !== 'Delivered') {
        this.createPaymentsOnDelivered(updated, req.user?.id)
          .catch(error => {
            console.error('[LoadController] Failed to create payment records:', error);
          });
      }

      // Применение DTO
      const formattedDoc = this.dto ? this.dto.format(updated) : updated;

      res.status(200).json({
        success: true,
        data: formattedDoc,
        message: 'Load updated successfully'
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to update load');
    }
  };

  updateStatus = async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format'
        });
      }

      const oldDoc = await this.model.findById(id);
      if (!oldDoc) {
        return res.status(404).json({
          success: false,
          error: 'Load not found'
        });
      }

      const updated = await this.model.findByIdAndUpdate(
        id,
        { 
          status,
          updatedBy: req.user?.id,
          updatedAt: new Date()
        },
        { new: true }
      )
      .populate('customer')
      .populate('carrier')
      .populate('createdBy');

      // Запись в историю (сохраняем изменение статуса)
      if (this.historyModel) {
        const userId = req.user?.id || updated.updatedBy;
        if (userId) {
          await this.createHistoryRecord(id, 'status_updated', userId, [{
            field: 'status',
            oldValue: oldDoc.status,
            newValue: status
          }]);
        }
      }

      // Send notification for status update (non-blocking)
      if (status !== oldDoc.status) {
        notificationService.sendLoadStatusUpdate(updated, oldDoc.status, status, req.user?.id)
          .catch(error => {
            console.error('[LoadController] Failed to send status update notification:', error);
          });
      }

      // Создаем платежные записи при переходе в статус "Delivered"
      if (status === 'Delivered' && oldDoc.status !== 'Delivered') {
        this.createPaymentsOnDelivered(updated, req.user?.id)
          .catch(error => {
            console.error('[LoadController] Failed to create payment records:', error);
          });
      }

      const formattedDoc = this.dto ? this.dto.format(updated) : updated;

      res.status(200).json({
        success: true,
        data: formattedDoc,
        message: 'Load status updated successfully'
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to update load status');
    }
  };

  getLoadHistory = async (req, res) => {
    try {
      const { id } = req.params;
      const { page = 1, limit = 10 } = req.query;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format'
        });
      }

      const history = await this.historyModel
        .find({ loadId: id })
        .populate('changedBy', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

      const total = await this.historyModel.countDocuments({ loadId: id });

      res.status(200).json({
        success: true,
        data: history,
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to fetch load history');
    }
  };

  // PDF Inspection Method (for debugging) - ВРЕМЕННО ОТКЛЮЧЕНО для тестирования интеграции с UI
  // inspectBOLFields = async (req, res) => {
  //   try {
  //     const result = await pdfService.inspectPDFFields('BOL');
  //     res.status(200).json({
  //       success: true,
  //       data: result,
  //       message: 'PDF fields inspected successfully'
  //     });
  //   } catch (error) {
  //     this.handleError(res, error, 'Failed to inspect BOL PDF fields');
  //   }
  // };

  // PDF Generation Methods - ВРЕМЕННО ОТКЛЮЧЕНО для тестирования интеграции с UI
  // generateBOL = async (req, res) => {
  //   try {
  //     const { id } = req.params;

  //     if (!mongoose.Types.ObjectId.isValid(id)) {
  //       return res.status(400).json({
  //         success: false,
  //         error: 'Invalid ID format'
  //       });
  //     }

  //     const load = await this.model.findById(id).populate('createdBy', 'firstName lastName email');
      
  //     if (!load) {
  //       return res.status(404).json({
  //         success: false,
  //         error: 'Load not found'
  //       });
  //     }

  //     const loadData = this.dto ? this.dto.format(load) : load;
  //     const result = await pdfService.generateBOL(loadData);

  //     res.status(200).json({
  //       success: true,
  //       data: result,
  //       message: 'BOL generated successfully'
  //     });
  //   } catch (error) {
  //     this.handleError(res, error, 'Failed to generate BOL');
  //   }
  // };

  // generateRateConfirmation = async (req, res) => {
  //   try {
  //     const { id } = req.params;

  //     if (!mongoose.Types.ObjectId.isValid(id)) {
  //       return res.status(400).json({
  //         success: false,
  //         error: 'Invalid ID format'
  //       });
  //     }

  //     const load = await this.model.findById(id).populate('createdBy', 'firstName lastName email');
      
  //     if (!load) {
  //       return res.status(404).json({
  //         success: false,
  //         error: 'Load not found'
  //       });
  //     }

  //     const loadData = this.dto ? this.dto.format(load) : load;
  //     const result = await pdfService.generateRateConfirmation(loadData);

  //     res.status(200).json({
  //       success: true,
  //       data: result,
  //       message: 'Rate Confirmation generated successfully'
  //     });
  //   } catch (error) {
  //     this.handleError(res, error, 'Failed to generate Rate Confirmation');
  //   }
  // };

  // generateAllDocuments = async (req, res) => {
  //   try {
  //     const { id } = req.params;

  //     if (!mongoose.Types.ObjectId.isValid(id)) {
  //       return res.status(400).json({
  //         success: false,
  //         error: 'Invalid ID format'
  //       });
  //     }

  //     const load = await this.model.findById(id).populate('createdBy', 'firstName lastName email');
      
  //     if (!load) {
  //       return res.status(404).json({
  //         success: false,
  //         error: 'Load not found'
  //       });
  //     }

  //     const loadData = this.dto ? this.dto.format(load) : load;
  //     const result = await pdfService.generateAllDocuments(loadData);

  //     res.status(200).json({
  //       success: true,
  //       data: result,
  //       message: 'All documents generated successfully'
  //     });
  //   } catch (error) {
  //     this.handleError(res, error, 'Failed to generate documents');
  //   }
  // };

  // downloadPDF = async (req, res) => {
  //   try {
  //     const { filename } = req.params;
  //     const pdfPath = path.join(__dirname, '../generated-pdfs', filename);

  //     // Check if file exists
  //     if (!fs.existsSync(pdfPath)) {
  //       return res.status(404).json({
  //         success: false,
  //         error: 'PDF file not found'
  //       });
  //     }

  //     // Set appropriate headers
  //     res.setHeader('Content-Type', 'application/pdf');
  //     res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  //     // Stream the file
  //     const fileStream = fs.createReadStream(pdfPath);
  //     fileStream.pipe(res);

  //     fileStream.on('error', (error) => {
  //       console.error('Error streaming PDF:', error);
  //       if (!res.headersSent) {
  //         res.status(500).json({
  //           success: false,
  //           error: 'Error streaming PDF file'
  //         });
  //       }
  //     });
  //   } catch (error) {
  //     this.handleError(res, error, 'Failed to download PDF');
  //   }
  // };
}

module.exports = new LoadController();

