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
      res.status(500).json({ error: 'Failed to fetch sub-resources.' });
    }
  };

  getById = async (req, res) => {
    try {
      const doc = await this.model.findById(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Resource not found.' });
      res.status(200).json(doc);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch resource.' });
    }
  };

  delete = async (req, res) => {
    try {
      const deleted = await this.model.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Resource not found.' });
      res.status(200).json({ message: 'Deleted successfully.' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete resource.' });
    }
  };

  update = async (req, res) => {
    try {
      const updated = await this.model.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!updated) return res.status(404).json({ error: 'Resource not found.' });
      res.status(200).json(updated);
    } catch (err) {
      res.status(500).json({ error: 'Failed to update resource.' });
    }
  };
}

module.exports = BaseSubController;
