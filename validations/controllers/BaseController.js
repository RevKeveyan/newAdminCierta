class BaseController {
  constructor(model) {
    this.model = model;
  }

  getAll = async (req, res) => {
    try {
      const docs = await this.model.find({});
      res.status(200).json(docs);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch all items' });
    }
  };

  getById = async (req, res) => {
    try {
      const doc = await this.model.findById(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Not found' });
      res.status(200).json(doc);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch by ID' });
    }
  };

  delete = async (req, res) => {
    try {
      const deleted = await this.model.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Not found' });
      res.status(200).json({ message: 'Deleted successfully' });
    } catch (err) {
      res.status(500).json({ error: 'Delete failed' });
    }
  };

  update = async (req, res) => {
    try {
      const updated = await this.model.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!updated) return res.status(404).json({ error: 'Not found' });
      res.status(200).json(updated);
    } catch (err) {
      res.status(500).json({ error: 'Update failed' });
    }
  };

  // advanced search/filter/sort
  searchAndFilter = async (req, res) => {
    try {
      const { search, sortBy = 'createdAt', sortOrder = 'desc', ...filters } = req.query;

      const query = {};
      if (search) {
        query.name = { $regex: search, $options: 'i' };
      }

      Object.keys(filters).forEach(key => {
        query[key] = filters[key];
      });

      const result = await this.model.find(query).sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 });

      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: 'Failed to search and filter' });
    }
  };
}

module.exports = BaseController;
