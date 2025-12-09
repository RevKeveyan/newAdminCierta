const UniversalBaseController = require('./UniversalBaseController');
const PaymentReceivable = require('../models/subModels/PaymentReceivable');
const PaymentPayable = require('../models/subModels/PaymentPayable');
const Carrier = require('../models/Carrier');
const PaymentReceivableDTO = require('../DTO/paymentReceivable.dto');
const PaymentPayableDTO = require('../DTO/paymentPayable.dto');
const mongoose = require('mongoose');

/**
 * Контроллер для PaymentReceivable (платежи от customers)
 */
class PaymentReceivableController extends UniversalBaseController {
  constructor() {
    super(PaymentReceivable, {
      dto: PaymentReceivableDTO,
      populateFields: ['customer', 'loadId'],
      searchFields: ['invoiceStatus'],
      validationRules: {
        create: {
          loadId: { required: true, type: 'string' },
          customer: { required: true, type: 'string' },
          daysToPay: { type: 'number', min: 1, max: 90 }
        },
        update: {
          invoiceStatus: { 
            type: 'string',
            enum: ['pending', 'invoiced', 'received', 'overdue', 'cancelled']
          },
          daysToPay: { type: 'number', min: 1, max: 90 },
          invoicedDate: { type: 'date' }
        }
      }
    });
  }

  /**
   * Получить receivables по customer
   */
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

      const payments = await this.model
        .find({ customer: customerId })
        .populate('customer')
        .populate('loadId')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

      const total = await this.model.countDocuments({ customer: customerId });

      const formattedPayments = PaymentReceivableDTO.formatMany(payments);

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
      const { loadId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(loadId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid load ID format'
        });
      }

      const payment = await this.model
        .findOne({ loadId })
        .populate('customer')
        .populate('loadId');

      if (!payment) {
        return res.status(404).json({
          success: false,
          error: 'Payment receivable not found for this load'
        });
      }

      const formattedPayment = PaymentReceivableDTO.format(payment);

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
      const { status } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const payments = await this.model
        .find({ invoiceStatus: status })
        .populate('customer')
        .populate('loadId')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

      const total = await this.model.countDocuments({ invoiceStatus: status });

      const formattedPayments = PaymentReceivableDTO.formatMany(payments);

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
   * Обновить статус на "received" (автоматически установит invoicedDate)
   */
  markAsReceived = async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format'
        });
      }

      const updated = await this.model.findByIdAndUpdate(
        id,
        {
          invoiceStatus: 'received',
          invoicedDate: new Date()
        },
        { new: true }
      ).populate('customer').populate('loadId');

      if (!updated) {
        return res.status(404).json({
          success: false,
          error: 'Payment receivable not found'
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
}

/**
 * Контроллер для PaymentPayable (платежи carriers)
 */
class PaymentPayableController extends UniversalBaseController {
  constructor() {
    super(PaymentPayable, {
      dto: PaymentPayableDTO,
      populateFields: ['carrier', 'loadId'],
      searchFields: [],
      validationRules: {
        create: {
          loadId: { required: true, type: 'string' },
          carrier: { required: true, type: 'string' },
          bank: { type: 'string' },
          routing: { type: 'string' },
          accountNumber: { type: 'string' }
        },
        update: {
          bank: { type: 'string' },
          routing: { type: 'string' },
          accountNumber: { type: 'string' }
        }
      }
    });
  }

  /**
   * Получить payables по carrier
   */
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

      const payments = await this.model
        .find({ carrier: carrierId })
        .populate('carrier')
        .populate('loadId')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

      const total = await this.model.countDocuments({ carrier: carrierId });

      const formattedPayments = PaymentPayableDTO.formatMany(payments);

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
      const { loadId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(loadId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid load ID format'
        });
      }

      const payment = await this.model
        .findOne({ loadId })
        .populate('carrier')
        .populate('loadId');

      if (!payment) {
        return res.status(404).json({
          success: false,
          error: 'Payment payable not found for this load'
        });
      }

      const formattedPayment = PaymentPayableDTO.format(payment);

      res.status(200).json({
        success: true,
        data: formattedPayment
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to fetch payable by load');
    }
  };
}

// Экспортируем экземпляры контроллеров
module.exports = {
  PaymentReceivableController: new PaymentReceivableController(),
  PaymentPayableController: new PaymentPayableController()
};
