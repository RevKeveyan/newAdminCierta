const Product = require('../models/Product');
const BaseController = require('./BaseController');

class ProductController extends BaseController {
  constructor() {
    super(Product);
  }

  // можешь добавлять свои методы, например:
  create = async (req, res) => {
    try {
      const images = req.files?.map(file => file.cloudUrl) || [];
      const product = new this.model({ ...req.body, images });
      const saved = await product.save();
      res.status(201).json(saved);
    } catch (err) {
      res.status(500).json({ error: 'Create failed', details: err.message });
    }
  };
}

module.exports = new ProductController();
