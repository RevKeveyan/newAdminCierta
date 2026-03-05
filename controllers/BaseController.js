class BaseController {
  constructor(model) {
    this.model = model;
  }

  getAll = async (req, res) => {
    try {
      // Security: Always use pagination
      const page = parseInt(req.query.page) || 1;
      const limit = Math.min(parseInt(req.query.limit) || 20, 100); // Default 20, max 100
      const skip = (page - 1) * limit;

      const docs = await this.model.find({}).skip(skip).limit(limit);
      const total = await this.model.countDocuments({});

      res.status(200).json({
        data: docs,
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: page,
          limit
        }
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch all items" });
    }
  };

  getById = async (req, res) => {
    try {
      const doc = await this.model.findById(req.params.id);
      if (!doc) return res.status(404).json({ error: "Not found" });
      res.status(200).json(doc);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch by ID" });
    }
  };

  delete = async (req, res) => {
    try {
      const deleted = await this.model.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Not found" });
      res.status(200).json({ message: "Deleted successfully" });
    } catch (err) {
      res.status(500).json({ error: "Delete failed" });
    }
  };

  update = async (req, res) => {
    try {
      const updated = await this.model.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true }
      );
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.status(200).json(updated);
    } catch (err) {
      res.status(500).json({ error: "Update failed" });
    }
  };

  // advanced search/filter/sort
  searchAndFilter = async (req, res) => {
    try {
      const {
        search,
        sortBy = "createdAt",
        sortOrder = "desc",
        ...filters
      } = req.query;

      const query = {};
      if (search) {
        query.name = { $regex: search, $options: "i" };
      }

      Object.keys(filters).forEach((key) => {
        query[key] = filters[key];
      });

      const result = await this.model
        .find(query)
        .sort({ [sortBy]: sortOrder === "asc" ? 1 : -1 });

      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: "Failed to search and filter" });
    }
  };
  /**
   * Generic handler for filtered and paginated data
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} buildQuery - function that parses req.query and returns {filter, sort, page, limit}
   */
  getFilteredData = async (req, res, buildQuery) => {
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
        currentPage: page,
      });
    } catch (err) {
      res
        .status(500)
        .json({ error: "Failed to fetch filtered data", details: err.message });
    }
  };

  // Generic create - only handles basic model creation
  // Specific logic (files, history, etc.) should be in specific controllers
  create = async (req, res) => {
    try {
      // Generic create - just save the model
      // No history, no special logic - that belongs in specific controllers
      const doc = new this.model(req.body);
      const saved = await doc.save();
      
      res.status(201).json(saved);
    } catch (err) {
      res.status(500).json({ 
        error: "Failed to create record", 
        details: err.message 
      });
    }
  };
}

module.exports = BaseController;
