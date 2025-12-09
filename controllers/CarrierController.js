const UniversalBaseController = require('./UniversalBaseController');
const Carrier = require('../models/Carrier');
const mongoose = require('mongoose');

class CarrierController extends UniversalBaseController {
  constructor() {
    super(Carrier, {
      searchFields: ['name', 'companyName', 'mcNumber', 'dotNumber', 'equipmentType', 'size'],
      validationRules: {
        create: {
          name: { required: true, type: 'string' },
          equipmentType: { type: 'string' },
          size: { type: 'string' },
          capabilities: { type: 'array' },
          certifications: { type: 'array' }
        },
        update: {
          name: { type: 'string' },
          phoneNumber: { type: 'string' },
          email: { type: 'email' },
          companyName: { type: 'string' },
          mcNumber: { type: 'string' },
          dotNumber: { type: 'string' },
          'address.address': { type: 'string' },
          'address.city': { type: 'string' },
          'address.state': { type: 'string' },
          'address.zipCode': { type: 'string' },
          emails: { type: 'array' },
          photos: { type: 'array' },
          equipmentType: { type: 'string' },
          size: { type: 'string' },
          capabilities: { type: 'array' },
          certifications: { type: 'array' }
        }
      }
    });
  }

  // Переопределяем create для проверки уникальности email, mcNumber, dotNumber
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

      const carrierData = req.body;
      
      // Проверяем уникальность email, mcNumber, и dotNumber
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
          // Найден дубликат
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
          
          return res.status(400).json({
            success: false,
            error: 'Duplicate carrier',
            message: `Carrier with ${duplicateField} "${duplicateValue}" already exists (Carrier: ${duplicate.name || 'Unknown'})`
          });
        }
      }

      // Подготовка данных
      const data = this.prepareCreateData(req);
      
      // Нормализуем email, mcNumber, dotNumber
      if (data.email) {
        data.email = data.email.trim().toLowerCase();
      }
      if (data.mcNumber) {
        data.mcNumber = data.mcNumber.trim();
      }
      if (data.dotNumber) {
        data.dotNumber = data.dotNumber.trim();
      }
      
      // Handle PDF file upload
      if (req.uploadedFile) {
        data.file = req.uploadedFile;
      }
      
      // Создание записи
      const newDoc = new this.model(data);
      
      try {
        const saved = await newDoc.save();

        // Запись в историю только для статистики (без детальных изменений)
        if (this.historyModel) {
          await this.createHistoryRecord(saved._id, 'created', req.user?.id, []);
        }

        // Применение DTO
        const formattedDoc = this.dto ? this.dto.format(saved) : saved;

        res.status(201).json({
          success: true,
          data: formattedDoc,
          message: `${this.modelName} created successfully`
        });
      } catch (saveError) {
        // Обрабатываем ошибки уникальности от MongoDB
        if (saveError.code === 11000) {
          const duplicateField = Object.keys(saveError.keyPattern)[0];
          return res.status(400).json({
            success: false,
            error: 'Duplicate carrier',
            message: `Carrier with ${duplicateField} "${carrierData[duplicateField]}" already exists`
          });
        }
        throw saveError;
      }
    } catch (error) {
      this.handleError(res, error, 'Failed to create carrier');
    }
  };

  // Переопределяем update для проверки уникальности email, mcNumber, dotNumber
  update = async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format'
        });
      }

      const existingCarrier = await Carrier.findById(id);
      if (!existingCarrier) {
        return res.status(404).json({
          success: false,
          error: 'Carrier not found'
        });
      }

      const carrierData = req.body;

      // Проверяем уникальность email перед обновлением
      if (carrierData.email && carrierData.email.trim() !== '') {
        const newEmail = carrierData.email.trim().toLowerCase();
        if (newEmail !== existingCarrier.email) {
          const existingCarrierWithEmail = await Carrier.findOne({ 
            email: newEmail,
            _id: { $ne: id }
          });
          if (existingCarrierWithEmail) {
            return res.status(400).json({
              success: false,
              error: 'Duplicate carrier',
              message: `Carrier with email "${newEmail}" already exists (Carrier: ${existingCarrierWithEmail.name || 'Unknown'})`
            });
          }
        }
      }

      // Проверяем уникальность mcNumber перед обновлением
      if (carrierData.mcNumber && carrierData.mcNumber.trim() !== '') {
        const newMcNumber = carrierData.mcNumber.trim();
        if (newMcNumber !== existingCarrier.mcNumber) {
          const existingCarrierWithMc = await Carrier.findOne({ 
            mcNumber: newMcNumber,
            _id: { $ne: id }
          });
          if (existingCarrierWithMc) {
            return res.status(400).json({
              success: false,
              error: 'Duplicate carrier',
              message: `Carrier with MC Number "${newMcNumber}" already exists (Carrier: ${existingCarrierWithMc.name || 'Unknown'})`
            });
          }
        }
      }

      // Проверяем уникальность dotNumber перед обновлением
      if (carrierData.dotNumber && carrierData.dotNumber.trim() !== '') {
        const newDotNumber = carrierData.dotNumber.trim();
        if (newDotNumber !== existingCarrier.dotNumber) {
          const existingCarrierWithDot = await Carrier.findOne({ 
            dotNumber: newDotNumber,
            _id: { $ne: id }
          });
          if (existingCarrierWithDot) {
            return res.status(400).json({
              success: false,
              error: 'Duplicate carrier',
              message: `Carrier with DOT Number "${newDotNumber}" already exists (Carrier: ${existingCarrierWithDot.name || 'Unknown'})`
            });
          }
        }
      }

      // Нормализуем email, mcNumber, dotNumber
      if (carrierData.email) {
        carrierData.email = carrierData.email.trim().toLowerCase();
      }
      if (carrierData.mcNumber) {
        carrierData.mcNumber = carrierData.mcNumber.trim();
      }
      if (carrierData.dotNumber) {
        carrierData.dotNumber = carrierData.dotNumber.trim();
      }

      // Подготовка данных
      const data = this.prepareUpdateData(req);

      // Handle PDF file upload
      if (req.uploadedFile) {
        data.file = req.uploadedFile;
      }

      // Обновление записи
      const updated = await Carrier.findByIdAndUpdate(
        id,
        data,
        { new: true, runValidators: true }
      );

      if (!updated) {
        return res.status(404).json({
          success: false,
          error: 'Carrier not found'
        });
      }

      // Запись в историю изменений
      if (this.historyModel) {
        const changes = this.getChanges(existingCarrier, carrierData);
        const userId = req.user?.id;
        if (changes.length > 0 && userId) {
          await this.createHistoryRecord(id, 'updated', userId, changes);
        }
      }

      // Применение DTO
      const formattedDoc = this.dto ? this.dto.format(updated) : updated;

      res.status(200).json({
        success: true,
        data: formattedDoc,
        message: `${this.modelName} updated successfully`
      });
    } catch (error) {
      // Обрабатываем ошибки уникальности от MongoDB
      if (error.code === 11000) {
        const duplicateField = Object.keys(error.keyPattern)[0];
        return res.status(400).json({
          success: false,
          error: 'Duplicate carrier',
          message: `Carrier with ${duplicateField} "${req.body[duplicateField]}" already exists`
        });
      }
      this.handleError(res, error, 'Failed to update carrier');
    }
  };

  // Переопределяем метод search для более точного поиска по конкретным полям
  search = async (req, res) => {
    try {
      const {
        companyName,
        mcNumber,
        dotNumber,
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

      // Поиск по mcNumber (частичное совпадение, case-insensitive)
      if (mcNumber && mcNumber.trim() !== '') {
        const escapedMcNumber = escapeRegex(mcNumber.trim());
        filter.mcNumber = { $regex: escapedMcNumber, $options: 'i' };
      }

      // Поиск по dotNumber (частичное совпадение, case-insensitive)
      if (dotNumber && dotNumber.trim() !== '') {
        const escapedDotNumber = escapeRegex(dotNumber.trim());
        filter.dotNumber = { $regex: escapedDotNumber, $options: 'i' };
      }

      // Общий поиск по всем полям, если передан параметр q и нет конкретных фильтров
      if (searchTerm && searchTerm.trim() !== '' && !companyName && !mcNumber && !dotNumber) {
        const escapedSearchTerm = escapeRegex(searchTerm.trim());
        const searchRegex = { $regex: escapedSearchTerm, $options: 'i' };
        filter.$or = [
          { name: searchRegex },
          { companyName: searchRegex },
          { mcNumber: searchRegex },
          { dotNumber: searchRegex },
          { email: searchRegex },
          { phoneNumber: searchRegex },
          { equipmentType: searchRegex },
          { size: searchRegex }
        ];
      }

      // Построение сортировки
      const sort = {};
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

      // Выполнение запроса
      const carriers = await this.model
        .find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean();

      const total = await this.model.countDocuments(filter);

      res.status(200).json({
        success: true,
        data: carriers,
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to search carriers');
    }
  };

  // Remove carrier file (PDF)
  removeFile = async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format'
        });
      }

      const updated = await Carrier.findByIdAndUpdate(
        id,
        { $unset: { file: 1 } },
        { new: true }
      );

      if (!updated) {
        return res.status(404).json({
          success: false,
          error: 'Carrier not found'
        });
      }

      res.status(200).json({
        success: true,
        data: updated,
        message: 'Carrier file removed successfully'
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to remove carrier file');
    }
  };

  // Получить все loads для конкретного carrier
  getCarrierLoads = async (req, res) => {
    try {
      const { id } = req.params;
      const { page = 1, limit = 10 } = req.query;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format'
        });
      }

      const carrier = await Carrier.findById(id).populate({
        path: 'loads',
        options: {
          sort: { createdAt: -1 },
          skip: (page - 1) * limit,
          limit: parseInt(limit)
        }
      });

      if (!carrier) {
        return res.status(404).json({
          success: false,
          error: 'Carrier not found'
        });
      }

      const total = carrier.loads.length;

      res.status(200).json({
        success: true,
        data: {
          carrier: carrier,
          loads: carrier.loads
        },
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to fetch carrier loads');
    }
  };
}

module.exports = new CarrierController();




