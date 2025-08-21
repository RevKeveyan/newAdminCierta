const BaseController = require('./BaseController');
const Load = require('../models/Load');
const { buildQuery } = require('../utils/queryBuilder');
const LoadHistory = require('../models/LoadHistory');

class LoadController extends BaseController {
  constructor() {
    super(Load);
  }

  getAllFiltered = async (req, res) => {
    try {
      const { filter, sort, page, limit } = buildQuery(req.query);

      const docs = await this.model
        .find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit);

      const total = await this.model.countDocuments(filter);

      res.status(200).json({
        data: docs,
        total,
        totalPages: Math.ceil(total / limit),
        currentPage: page
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch loads', details: err.message });
    }
  };

  update = async (req, res) => {
    try {
      const oldDoc = await this.model.findById(req.params.id);
      if (!oldDoc) return res.status(404).json({ error: 'Load not found' });

      const updated = await this.model.findByIdAndUpdate(req.params.id, req.body, { new: true });

      // Save changes to history
      const changes = [];
      Object.keys(req.body).forEach(key => {
        if (req.body[key] !== oldDoc[key]) {
          changes.push({
            field: key,
            oldValue: oldDoc[key],
            newValue: req.body[key]
          });
        }
      });

      if (changes.length) {
        await LoadHistory.create({
          loadId: req.params.id,
          action: 'updated',
          changedBy: req.user.id,
          changes
        });
      }

      res.status(200).json(updated);
    } catch (err) {
      res.status(500).json({ error: 'Failed to update load', details: err.message });
    }
  };
}

module.exports = new LoadController();
