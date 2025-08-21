const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, required: true }, // Например: 'мотоцикл', 'машина'
  description: String,
  price: Number,
  images: [String], // Ссылки на изображения в облачном хранилище
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Product', productSchema);
