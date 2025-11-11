class BaseSubController {
  constructor(model, parentField) {
    this.model = model;
    this.parentField = parentField; // e.g., "productId"
  }

  getAll = async (req, res) => {
    try {
      const filter = {};
      if (req.params.parentId) {
        filter[this.parentField] = req.params.parentId;
      }
      const docs = await this.model.find(filter);
      res.status(200).json(docs);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch sub-resources." });
    }
  };

  getById = async (req, res) => {
    try {
      const doc = await this.model.findById(req.params.id);
      if (!doc) return res.status(404).json({ error: "Resource not found." });
      res.status(200).json(doc);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch resource." });
    }
  };

  delete = async (req, res) => {
    try {
      const deleted = await this.model.findByIdAndDelete(req.params.id);
      if (!deleted)
        return res.status(404).json({ error: "Resource not found." });
      res.status(200).json({ message: "Deleted successfully." });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete resource." });
    }
  };

  update = async (req, res) => {
    try {
      const updated = await this.model.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true }
      );
      if (!updated)
        return res.status(404).json({ error: "Resource not found." });
      res.status(200).json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to update resource." });
    }
  };
  /**
   * Generic handler for filtered and paginated submodel data
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} buildQuery - function that parses req.query and returns {filter, sort, page, limit}
   */
  getFilteredSubData = async (req, res, buildQuery) => {
    try {
      const { filter, sort, page, limit } = buildQuery(req.query);

      // Always filter by parentId
      if (req.params.parentId) {
        filter[this.parentField] = req.params.parentId;
      }

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
        currentPage: page,
      });
    } catch (err) {
      res
        .status(500)
        .json({
          error: "Failed to fetch filtered sub-resources.",
          details: err.message,
        });
    }
  };
}

module.exports = BaseSubController;
