const UniversalBaseController = require('./UniversalBaseController');
const Customer = require('../models/Customer');
const mongoose = require('mongoose');

class CustomerController extends UniversalBaseController {
  constructor() {
    super(Customer, {
      searchFields: ['companyName', 'customerAddress.city', 'customerAddress.state'],
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

