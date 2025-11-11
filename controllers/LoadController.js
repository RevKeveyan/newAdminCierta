const UniversalBaseController = require('./UniversalBaseController');
const Load = require('../models/Load');
const LoadHistory = require('../models/subModels/LoadHistory');
const LoadDTO = require('../DTO/load.dto');
const pdfService = require('../services/pdfService');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

class LoadController extends UniversalBaseController {
  constructor() {
    super(Load, {
      historyModel: LoadHistory,
      dto: LoadDTO.LoadDTO,
      populateFields: ['createdBy', 'carrier', 'customerEmails'],
      searchFields: ['vin', 'type', 'customerCompanyName', 'carrier.name'],
      validationRules: {
        create: {
          type: { required: true, type: 'string' },
          vin: { required: true, type: 'string' },
          'carrier.name': { required: true, type: 'string' },
          'carrier.contact': { required: true, type: 'string' }
        },
        update: {
          type: { type: 'string' },
          vin: { type: 'string' },
          category: { type: 'string' },
          customerCompanyName: { type: 'string' },
          'carrier.name': { type: 'string' },
          'carrier.mcNumber': { type: 'string' },
          'carrier.contact': { type: 'string' },
          'carrier.email': { type: 'email' },
          'carrier.carrierType': { type: 'string' },
          customerEmails: { type: 'array' },
          assignedDate: { type: 'date' },
          deliveryDate: { type: 'date' },
          pickUpDate: { type: 'date' },
          status: { type: 'string' },
          'carrierPaymentStatus.status': { type: 'string' },
          'carrierPaymentStatus.date': { type: 'date' },
          'customerPaymentStatus.status': { type: 'string' },
          'customerPaymentStatus.date': { type: 'date' },
          aging: { type: 'number' },
          tracking: { type: 'string' },
          specialRequirements: { type: 'string' },
          insurance: { type: 'boolean' },
          value: { type: 'number' },
          tonuPaidToCarrier: { type: 'boolean' },
          detentionPaidToCarrier: { type: 'boolean' },
          layoverPaidToCarrier: { type: 'boolean' },
          tonuReceivedFromCustomer: { type: 'boolean' },
          detentionReceivedFromCustomer: { type: 'boolean' },
          layoverReceivedFromCustomer: { type: 'boolean' }
        }
      }
    });
  }

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

      const loads = await this.model
        .find({ 'carrier._id': carrierId })
        .populate(this.populateFields)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

      const total = await this.model.countDocuments({ 'carrier._id': carrierId });

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

  // Переопределяем create для Load с улучшенной статистикой
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
      
      // Создание записи
      const newDoc = new this.model(data);
      const saved = await newDoc.save();

      // Создаем запись в истории только для статистики (без детальных изменений)
      if (this.historyModel) {
        await this.createHistoryRecord(saved._id, 'created', req.user?.id, []);
      }

      // Применение DTO
      const formattedDoc = this.dto ? this.dto.format(saved) : saved;

      res.status(201).json({
        success: true,
        data: formattedDoc,
        message: 'Load created successfully'
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to create load');
    }
  };

  // Полное обновление load с поддержкой файлов
  updateLoad = async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format'
        });
      }

      // Валидация данных
      if (this.validationRules.update) {
        const validation = this.validateData(req.body, this.validationRules.update);
        if (!validation.isValid) {
          return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: validation.errors
          });
        }
      }

      // Получение старой записи для истории
      const oldDoc = await this.model.findById(id);
      if (!oldDoc) {
        return res.status(404).json({
          success: false,
          error: 'Load not found'
        });
      }

      // Подготовка данных для обновления
      const updateData = { ...req.body };
      
      // Добавление аудиторских полей
      if (req.user?.id) {
        updateData.updatedBy = req.user.id;
        updateData.updatedAt = new Date();
      }

      // Обработка загруженных файлов
      if (req.uploadedFiles && req.uploadedFiles.length > 0) {
        // Если есть новые файлы, добавляем их к существующим
        const existingImages = oldDoc.images || [];
        updateData.images = [...existingImages, ...req.uploadedFiles];
      }

      // Обновление записи
      const updated = await this.model.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      ).populate(this.populateFields);

      // Запись в историю изменений
      if (this.historyModel) {
        const changes = this.getChanges(oldDoc, req.body);
        if (changes.length > 0) {
          await this.createHistoryRecord(id, 'updated', req.user?.id, changes);
        }
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
      );

      // Запись в историю
      if (this.historyModel) {
        await this.createHistoryRecord(id, 'status_updated', req.user?.id, [{
          field: 'status',
          oldValue: oldDoc.status,
          newValue: status
        }]);
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

  // PDF Generation Methods
  generateBOL = async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format'
        });
      }

      const load = await this.model.findById(id).populate('createdBy', 'firstName lastName email');
      
      if (!load) {
        return res.status(404).json({
          success: false,
          error: 'Load not found'
        });
      }

      const loadData = this.dto ? this.dto.format(load) : load;
      const result = await pdfService.generateBOL(loadData);

      res.status(200).json({
        success: true,
        data: result,
        message: 'BOL generated successfully'
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to generate BOL');
    }
  };

  generateRateConfirmation = async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format'
        });
      }

      const load = await this.model.findById(id).populate('createdBy', 'firstName lastName email');
      
      if (!load) {
        return res.status(404).json({
          success: false,
          error: 'Load not found'
        });
      }

      const loadData = this.dto ? this.dto.format(load) : load;
      const result = await pdfService.generateRateConfirmation(loadData);

      res.status(200).json({
        success: true,
        data: result,
        message: 'Rate Confirmation generated successfully'
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to generate Rate Confirmation');
    }
  };

  generateAllDocuments = async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format'
        });
      }

      const load = await this.model.findById(id).populate('createdBy', 'firstName lastName email');
      
      if (!load) {
        return res.status(404).json({
          success: false,
          error: 'Load not found'
        });
      }

      const loadData = this.dto ? this.dto.format(load) : load;
      const result = await pdfService.generateAllDocuments(loadData);

      res.status(200).json({
        success: true,
        data: result,
        message: 'All documents generated successfully'
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to generate documents');
    }
  };

  downloadPDF = async (req, res) => {
    try {
      const { filename } = req.params;
      const pdfPath = path.join(__dirname, '../generated-pdfs', filename);

      // Check if file exists
      if (!fs.existsSync(pdfPath)) {
        return res.status(404).json({
          success: false,
          error: 'PDF file not found'
        });
      }

      // Set appropriate headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Stream the file
      const fileStream = fs.createReadStream(pdfPath);
      fileStream.pipe(res);

      fileStream.on('error', (error) => {
        console.error('Error streaming PDF:', error);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: 'Error streaming PDF file'
          });
        }
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to download PDF');
    }
  };
}

module.exports = new LoadController();
