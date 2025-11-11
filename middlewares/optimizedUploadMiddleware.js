const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

// Конфигурация multer для памяти
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 10 // максимум 10 файлов
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Middleware для оптимизации изображений
const optimizeImages = async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return next();
  }

  try {
    const optimizedFiles = [];
    
    for (const file of req.files) {
      const isImage = file.mimetype.startsWith('image/');
      
      if (isImage) {
        // Оптимизируем изображения
        const optimizedBuffer = await sharp(file.buffer)
          .resize(1920, 1080, { 
            fit: 'inside',
            withoutEnlargement: true 
          })
          .jpeg({ quality: 85, progressive: true })
          .toBuffer();
        
        optimizedFiles.push({
          ...file,
          buffer: optimizedBuffer,
          size: optimizedBuffer.length,
          optimized: true
        });
      } else {
        // Оставляем другие файлы как есть
        optimizedFiles.push(file);
      }
    }
    
    req.files = optimizedFiles;
    next();
  } catch (error) {
    console.error('Image optimization error:', error);
    next(error);
  }
};

// Middleware для загрузки файлов с оптимизацией
const uploadFiles = (fieldName, multiple = false) => {
  const uploadMiddleware = multiple 
    ? upload.array(fieldName, 10)
    : upload.single(fieldName);
  
  return [
    uploadMiddleware,
    optimizeImages,
    (req, res, next) => {
      // Сохраняем информацию о загруженных файлах
      if (req.files) {
        req.uploadedFiles = req.files.map(file => ({
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          buffer: file.buffer,
          optimized: file.optimized || false
        }));
      } else if (req.file) {
        req.uploadedFiles = [{
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          buffer: req.file.buffer,
          optimized: req.file.optimized || false
        }];
      }
      next();
    }
  ];
};

module.exports = { uploadFiles };


