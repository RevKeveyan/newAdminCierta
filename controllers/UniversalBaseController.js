const mongoose = require('mongoose');
const cacheService = require('../services/cacheService');

/**
 * Универсальный базовый контроллер для всех моделей
 * Поддерживает CRUD операции, пагинацию, фильтрацию, историю изменений, DTO, валидацию
 */
class UniversalBaseController {
  constructor(model, options = {}) {
    this.model = model;
    this.modelName = model.modelName || 'Model';
    this.historyModel = options.historyModel || null;
    this.dto = options.dto || null;
    this.validationRules = options.validationRules || {};
    this.populateFields = options.populateFields || [];
    this.searchFields = options.searchFields || ['name', 'title', 'email'];
    this.defaultSort = options.defaultSort || { createdAt: -1 };
    this.softDelete = options.softDelete || false;
    this.auditFields = options.auditFields || ['createdBy', 'updatedBy'];
  }

  /**
   * Получить все записи с поддержкой пагинации, фильтрации и сортировки
   */
  getAll = async (req, res) => {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        search,
        ...filters
      } = req.query;

      // Построение фильтра
      const filter = this.buildFilter(filters, search);
      
      // Построение сортировки
      const sort = this.buildSort(sortBy, sortOrder);

      // Enable Redis Caching
      const cacheService = require('../services/cacheService');
      const cacheKey = `getAll:${this.modelName}:${JSON.stringify({ filter, sort, page, limit })}`;
      const cached = await cacheService.get(cacheKey);
      
      if (cached) {
        return res.status(200).json(cached);
      }

      // Выполнение запроса с оптимизацией
      const docs = await this.model
        .find(filter)
        .populate(this.populateFields)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean(); // Add lean() for better performance

      const total = await this.model.countDocuments(filter);

      // Применение DTO если есть
      const formattedDocs = this.dto ? docs.map(doc => this.dto.format(doc)) : docs;

      const response = {
        success: true,
        data: formattedDocs,
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          limit: parseInt(limit)
        }
      };

      // Cache the response for 5 minutes (300 seconds)
      await cacheService.set(cacheKey, response, 300);

      res.status(200).json(response);
    } catch (error) {
      this.handleError(res, error, 'Failed to fetch records');
    }
  };

  /**
   * Получить запись по ID
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

      const doc = await this.model
        .findById(id)
        .populate(this.populateFields);

      if (!doc) {
        return res.status(404).json({
          success: false,
          error: `${this.modelName} not found`
        });
      }

      const formattedDoc = this.dto ? this.dto.format(doc) : doc;

      res.status(200).json({
        success: true,
        data: formattedDoc
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to fetch record');
    }
  };

  /**
   * Создать новую запись
   */
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
    } catch (error) {
      this.handleError(res, error, 'Failed to create record');
    }
  };

  /**
   * Обновить запись
   */
  update = async (req, res) => {
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

      // Получение старой записи для истории и сравнения
      const oldDoc = await this.model.findById(id);
      if (!oldDoc) {
        return res.status(404).json({
          success: false,
          error: `${this.modelName} not found`
        });
      }

      // Фильтруем только измененные поля
      const filteredData = this.filterChangedFields(oldDoc, req.body);
      
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

      // Обновление записи
      const updated = await this.model.findByIdAndUpdate(
        id,
        data,
        { new: true, runValidators: true }
      );

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
        message: `${this.modelName} updated successfully`
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to update record');
    }
  };

  /**
   * Удалить запись
   */
  delete = async (req, res) => {
    try {
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
          error: `${this.modelName} not found`
        });
      }

      if (this.softDelete) {
        // Мягкое удаление
        await this.model.findByIdAndUpdate(id, { 
          deletedAt: new Date(),
          deletedBy: req.user?.id 
        });
      } else {
        // Жесткое удаление
        await this.model.findByIdAndDelete(id);
      }

      // Запись в историю
      if (this.historyModel) {
        await this.createHistoryRecord(id, 'deleted', req.user?.id, []);
      }

      res.status(200).json({
        success: true,
        message: `${this.modelName} deleted successfully`
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to delete record');
    }
  };

  /**
   * Поиск и фильтрация
   */
  search = async (req, res) => {
    try {
      const {
        q: searchTerm,
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        ...filters
      } = req.query;

      // Построение фильтра с поиском
      const filter = this.buildSearchFilter(filters, searchTerm);
      
      // Построение сортировки
      const sort = this.buildSort(sortBy, sortOrder);

      // Выполнение запроса
      const docs = await this.model
        .find(filter)
        .populate(this.populateFields)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

      const total = await this.model.countDocuments(filter);

      // Применение DTO
      const formattedDocs = this.dto ? docs.map(doc => this.dto.format(doc)) : docs;

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
      this.handleError(res, error, 'Failed to search records');
    }
  };

  /**
   * Получить статистику
   */
  getStats = async (req, res) => {
    try {
      const { period = 'month', startDate, endDate } = req.query;
      
      let dateFilter = {};
      
      if (startDate && endDate) {
        dateFilter.createdAt = {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        };
      } else {
        const now = new Date();
        if (period === 'day') {
          const startOfDay = new Date(now.setHours(0, 0, 0, 0));
          const endOfDay = new Date(now.setHours(23, 59, 59, 999));
          dateFilter.createdAt = { $gte: startOfDay, $lte: endOfDay };
        } else if (period === 'month') {
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          dateFilter.createdAt = { $gte: startOfMonth, $lte: endOfMonth };
        }
      }

      const stats = await this.model.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            createdAt: { $push: '$createdAt' }
          }
        }
      ]);

      res.status(200).json({
        success: true,
        data: {
          period,
          total: stats[0]?.total || 0,
          dateRange: dateFilter
        }
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to get statistics');
    }
  };

  /**
   * Массовое обновление
   */
  bulkUpdate = async (req, res) => {
    try {
      const { ids, data } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'IDs array is required'
        });
      }

      const result = await this.model.updateMany(
        { _id: { $in: ids } },
        { ...data, updatedBy: req.user?.id, updatedAt: new Date() }
      );

      res.status(200).json({
        success: true,
        message: `${result.modifiedCount} records updated successfully`,
        modifiedCount: result.modifiedCount
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to bulk update records');
    }
  };

  /**
   * Массовое удаление
   */
  bulkDelete = async (req, res) => {
    try {
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'IDs array is required'
        });
      }

      let result;
      if (this.softDelete) {
        result = await this.model.updateMany(
          { _id: { $in: ids } },
          { deletedAt: new Date(), deletedBy: req.user?.id }
        );
      } else {
        result = await this.model.deleteMany({ _id: { $in: ids } });
      }

      res.status(200).json({
        success: true,
        message: `${result.deletedCount || result.modifiedCount} records deleted successfully`,
        deletedCount: result.deletedCount || result.modifiedCount
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to bulk delete records');
    }
  };

  // ========== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ==========

  /**
   * Построение фильтра
   */
  buildFilter(filters, search) {
    const filter = {};

    // Добавление фильтров
    Object.keys(filters).forEach(key => {
      if (filters[key] !== undefined && filters[key] !== '') {
        if (key.includes('Date') || key.includes('At')) {
          // Обработка дат
          if (filters[key].includes('to')) {
            const [start, end] = filters[key].split(' to ');
            filter[key] = {
              $gte: new Date(start),
              $lte: new Date(end)
            };
          } else {
            filter[key] = new Date(filters[key]);
          }
        } else if (key.includes('In')) {
          // Обработка массивов
          filter[key] = { $in: filters[key].split(',') };
        } else {
          filter[key] = filters[key];
        }
      }
    });

    // Добавление поиска
    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      filter.$or = this.searchFields.map(field => ({
        [field]: searchRegex
      }));
    }

    return filter;
  }

  /**
   * Построение фильтра с поиском
   */
  buildSearchFilter(filters, searchTerm) {
    const filter = this.buildFilter(filters, searchTerm);
    
    if (searchTerm) {
      const searchRegex = { $regex: searchTerm, $options: 'i' };
      filter.$or = this.searchFields.map(field => ({
        [field]: searchRegex
      }));
    }

    return filter;
  }

  /**
   * Построение сортировки
   */
  buildSort(sortBy, sortOrder) {
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    return sort;
  }

  /**
   * Подготовка данных для создания
   */
  prepareCreateData(req) {
    const data = { ...req.body };
    
    // Добавление аудиторских полей
    if (req.user?.id) {
      this.auditFields.forEach(field => {
        if (field === 'createdBy' || field === 'updatedBy') {
          data[field] = req.user.id;
        }
      });
    }

    // Обработка загруженных файлов
    if (req.uploadedFiles) {
      if (Array.isArray(req.uploadedFiles)) {
        data.images = req.uploadedFiles;
      } else {
        data.profileImage = req.uploadedFiles;
      }
    }

    return data;
  }

  /**
   * Подготовка данных для обновления
   */
  prepareUpdateData(req, filteredData = null) {
    const data = filteredData ? { ...filteredData } : { ...req.body };
    
    // Добавление аудиторских полей
    if (req.user?.id) {
      data.updatedBy = req.user.id;
      data.updatedAt = new Date();
    }

    // Обработка загруженных файлов
    if (req.uploadedFiles) {
      if (Array.isArray(req.uploadedFiles)) {
        data.images = req.uploadedFiles;
      } else {
        data.profileImage = req.uploadedFiles;
      }
    }

    return data;
  }

  /**
   * Валидация данных
   */
  validateData(data, rules) {
    const errors = [];
    
    Object.keys(rules).forEach(field => {
      const rule = rules[field];
      const value = this.getNestedValue(data, field);

      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push({ field, message: `${field} is required` });
      }

      if (value !== undefined && rule.type) {
        if (rule.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          errors.push({ field, message: `${field} must be a valid email` });
        }
        if (rule.type === 'number' && isNaN(value)) {
          errors.push({ field, message: `${field} must be a number` });
        }
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get nested value from object using dot notation
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Получение изменений между старой и новой записью
   */
  getChanges(oldDoc, newData) {
    const changes = [];
    
    Object.keys(newData).forEach(key => {
      const oldValue = oldDoc[key];
      const newValue = newData[key];
      
      // Пропускаем служебные поля
      if (['_id', 'createdAt', 'updatedAt', '__v'].includes(key)) {
        return;
      }
      
      // Сравниваем значения
      const isChanged = this.compareValues(oldValue, newValue);
      
      if (isChanged) {
        changes.push({
          field: key,
          oldValue: oldValue,
          newValue: newValue
        });
      }
    });

    return changes;
  }

  /**
   * Сравнение значений с учетом различных типов данных
   */
  compareValues(oldValue, newValue) {
    // Если оба значения null/undefined - нет изменений
    if ((oldValue === null || oldValue === undefined) && 
        (newValue === null || newValue === undefined)) {
      return false;
    }
    
    // Если одно null/undefined, а другое нет - есть изменение
    if ((oldValue === null || oldValue === undefined) !== 
        (newValue === null || newValue === undefined)) {
      return true;
    }
    
    // Для строк - нормализуем пробелы и сравниваем
    if (typeof oldValue === 'string' && typeof newValue === 'string') {
      return oldValue.trim() !== newValue.trim();
    }
    
    // Для объектов используем JSON.stringify
    if (typeof oldValue === 'object' && typeof newValue === 'object') {
      return JSON.stringify(oldValue) !== JSON.stringify(newValue);
    }
    
    // Для примитивных типов простое сравнение
    return oldValue !== newValue;
  }

  /**
   * Фильтрует только измененные поля, исключая неизмененные значения
   * @param {Object} existingDoc - существующий документ
   * @param {Object} newData - новые данные
   * @returns {Object} - объект только с измененными полями
   */
  filterChangedFields(existingDoc, newData) {
    const filteredData = {};
    
    Object.keys(newData).forEach(key => {
      const existingValue = existingDoc[key];
      const newValue = newData[key];
      
      // Пропускаем служебные поля
      if (['_id', 'createdAt', 'updatedAt', '__v'].includes(key)) {
        return;
      }
      
      // Сравниваем значения
      const isChanged = this.compareValues(existingValue, newValue);
      
      if (isChanged) {
        filteredData[key] = newValue;
      }
    });

    return filteredData;
  }

  /**
   * Создание записи в истории
   */
  async createHistoryRecord(recordId, action, userId, changes) {
    if (!this.historyModel) return;

    // Если userId не предоставлен, пропускаем создание истории
    if (!userId) {
      console.warn(`Cannot create history record: userId is required for action '${action}'`);
      return;
    }

    try {
      // Для создания записи не записываем детальные изменения, только createdBy
      if (action === 'created') {
        await this.historyModel.create({
          loadId: recordId,
          action,
          changedBy: userId,
          changes: [] // Пустой массив для создания - сохраняем только createdBy
        });
        return;
      }

      // Для обновлений записываем только реальные изменения
      const changesArray = Array.isArray(changes) ? changes : [];
      
      // Фильтруем пустые изменения
      const filteredChanges = changesArray.filter(change => 
        change.oldValue !== change.newValue && 
        (change.oldValue !== null || change.newValue !== null)
      );

      // Создаем запись только если есть реальные изменения
      if (filteredChanges.length > 0 || action === 'deleted') {
        await this.historyModel.create({
          loadId: recordId,
          action,
          changedBy: userId,
          changes: filteredChanges
        });
      }
    } catch (error) {
      console.error('Failed to create history record:', error);
    }
  }

  /**
   * Обработка ошибок
   */
  handleError(res, error, message) {
    console.error(`${this.modelName} Error:`, error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message
      }));
      
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors
      });
    }

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid ID format'
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: 'Duplicate entry',
        details: error.keyValue
      });
    }

    res.status(500).json({
      success: false,
      error: message,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

module.exports = UniversalBaseController;
