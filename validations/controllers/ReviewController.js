const BaseSubController = require('./BaseSubController');
const Review = require('../models/subModels/Review');

class ReviewController extends BaseSubController {
  constructor() {
    super(Review, 'productId');
  }

  create = async (req, res) => {
    try {
      const { rating, comment } = req.body;
      const productId = req.params.parentId;
      const userId = req.user?.id; // предполагается, что авторизация уже выполнена

      const review = new this.model({ productId, userId, rating, comment });
      const saved = await review.save();

      res.status(201).json(saved);
    } catch (err) {
      res.status(500).json({ error: 'Failed to create review.' });
    }
  };
}

module.exports = new ReviewController();
