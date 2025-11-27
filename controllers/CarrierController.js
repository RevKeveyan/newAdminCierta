const UniversalBaseController = require('./UniversalBaseController');
const Carrier = require('../models/Carrier');
const mongoose = require('mongoose');

class CarrierController extends UniversalBaseController {
  constructor() {
    super(Carrier, {
      searchFields: ['name', 'companyName', 'mcNumber', 'dotNumber', 'equipmentType', 'size'],
      validationRules: {
        create: {
          name: { required: true, type: 'string' }
        },
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




