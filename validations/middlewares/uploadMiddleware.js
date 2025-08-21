const multer = require('multer');
const { uploadToS3 } = require('../services/s3Service');

const storage = multer.memoryStorage();
const upload = multer({ storage });

/**
 * Upload files (images, pdf, excel, etc.)
 * @param {String} entity - e.g. 'products', 'loads'
 * @param {Boolean} multiple
 */
const uploadFiles = (entity, multiple = true) => {
  return async (req, res, next) => {
    const handler = multiple ? upload.array('files') : upload.single('file');

    handler(req, res, async (err) => {
      if (err) return res.status(400).json({ error: 'File upload error', details: err.message });

      if (!req.files || req.files.length === 0) return next();

      try {
        const { type, id } = req.body;
        const uploads = [];

        for (const file of req.files) {
          const url = await uploadToS3(file.buffer, file.originalname, entity, type || 'general', id || 'temp');
          uploads.push(url);
        }

        req.uploadedFiles = uploads;
        next();
      } catch (e) {
        res.status(500).json({ error: 'S3 upload failed', details: e.message });
      }
    });
  };
};

module.exports = { uploadFiles };
