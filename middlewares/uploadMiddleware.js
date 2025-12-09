const multer = require('multer');
const { uploadToS3, isImage, isPDF } = require('../services/s3Service');

const storage = multer.memoryStorage();
const upload = multer({ storage });

/**
 * Universal file upload middleware for all models and submodels
 * Supports both images and PDFs
 * 
 * @param {String} entity - Entity name (users, carriers, customers, loads, etc.)
 * @param {Object} options - Configuration options
 * @param {Boolean} options.allowImages - Allow image uploads (default: true)
 * @param {Boolean} options.allowPDFs - Allow PDF uploads (default: true)
 * @param {Boolean} options.multiple - Allow multiple files (default: true)
 * @param {String} options.fieldName - Form field name (default: 'files')
 */
const uploadModelFiles = (entity, options = {}) => {
  const {
    allowImages = true,
    allowPDFs = true,
    multiple = true,
    fieldName = 'files'
  } = options;

  return async (req, res, next) => {
    // Get entity ID from params or body
    const entityId = req.params.id || req.body.id || req.body[`${entity}Id`] || 'temp';
    
    const handler = multiple ? upload.array(fieldName) : upload.single(fieldName);

    handler(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ 
          error: 'File upload error', 
          details: err.message 
        });
      }

      // If no files uploaded, continue
      const files = multiple ? (req.files || []) : (req.file ? [req.file] : []);
      if (files.length === 0) return next();

      try {
        req.uploadedFiles = {
          images: [],
          pdfs: []
        };

        for (const file of files) {
          // Validate file type
          if (isImage(file.mimetype)) {
            if (!allowImages) {
              return res.status(400).json({ 
                error: 'Invalid file type', 
                details: 'Image uploads are not allowed for this entity' 
              });
            }
            const url = await uploadToS3(
              file.buffer, 
              file.originalname, 
              entity, 
              entityId, 
              'images'
            );
            req.uploadedFiles.images.push(url);
          } else if (isPDF(file.mimetype)) {
            if (!allowPDFs) {
              return res.status(400).json({ 
                error: 'Invalid file type', 
                details: 'PDF uploads are not allowed for this entity' 
              });
            }
            const url = await uploadToS3(
              file.buffer, 
              file.originalname, 
              entity, 
              entityId, 
              'pdfs'
            );
            req.uploadedFiles.pdfs.push(url);
          } else {
            return res.status(400).json({ 
              error: 'Invalid file type', 
              details: `Only ${allowImages && allowPDFs ? 'images and PDFs' : allowImages ? 'images' : 'PDFs'} are allowed` 
            });
          }
        }

        next();
      } catch (e) {
        res.status(500).json({ error: 'S3 upload failed', details: e.message });
      }
    });
  };
};

/**
 * Upload files with separate field names for images and PDFs
 * @param {String} entity - Entity name
 * @param {Object} options - Configuration options
 */
const uploadSeparateFiles = (entity, options = {}) => {
  const {
    allowImages = true,
    allowPDFs = true
  } = options;

  return async (req, res, next) => {
    const entityId = req.params.id || req.body.id || req.body[`${entity}Id`] || 'temp';
    
    const fields = [];
    if (allowImages) {
      fields.push({ name: 'images', maxCount: 10 });
    }
    if (allowPDFs) {
      fields.push({ name: 'pdfs', maxCount: 10 });
    }

    const handler = upload.fields(fields);

    handler(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ 
          error: 'File upload error', 
          details: err.message 
        });
      }

      // If no files uploaded, continue
      if (!req.files || Object.keys(req.files).length === 0) return next();

      try {
        req.uploadedFiles = {
          images: [],
          pdfs: []
        };

        // Handle images
        if (req.files.images && req.files.images.length > 0) {
          for (const file of req.files.images) {
            if (!isImage(file.mimetype)) {
              return res.status(400).json({ 
                error: 'Invalid file type', 
                details: 'Images field must contain image files only' 
              });
            }
            const url = await uploadToS3(
              file.buffer, 
              file.originalname, 
              entity, 
              entityId, 
              'images'
            );
            req.uploadedFiles.images.push(url);
          }
        }

        // Handle PDFs
        if (req.files.pdfs && req.files.pdfs.length > 0) {
          for (const file of req.files.pdfs) {
            if (!isPDF(file.mimetype)) {
              return res.status(400).json({ 
                error: 'Invalid file type', 
                details: 'PDFs field must contain PDF files only' 
              });
            }
            const url = await uploadToS3(
              file.buffer, 
              file.originalname, 
              entity, 
              entityId, 
              'pdfs'
            );
            req.uploadedFiles.pdfs.push(url);
          }
        }

        next();
      } catch (e) {
        res.status(500).json({ error: 'S3 upload failed', details: e.message });
      }
    });
  };
};

/**
 * Legacy upload functions for backward compatibility
 */
const uploadFiles = (entity, multiple = true) => {
  return uploadModelFiles(entity, { 
    allowImages: true, 
    allowPDFs: true, 
    multiple 
  });
};

const uploadUserFiles = (entity) => {
  return async (req, res, next) => {
    const handler = upload.fields([
      { name: 'profileImage', maxCount: 1 },
      { name: 'userFile', maxCount: 1 }
    ]);

    handler(req, res, async (err) => {
      if (err) return res.status(400).json({ error: 'File upload error', details: err.message });

      if (!req.files || Object.keys(req.files).length === 0) return next();

      try {
        const entityId = req.params.id || req.body.id || 'temp';
        req.uploadedUserFiles = {};

        // Handle profile image
        if (req.files.profileImage && req.files.profileImage[0]) {
          const file = req.files.profileImage[0];
          if (!isImage(file.mimetype)) {
            return res.status(400).json({ 
              error: 'Invalid file type', 
              details: 'profileImage must be an image file' 
            });
          }
          const { uploadToS3 } = require('../services/s3Service');
          const url = await uploadToS3(file.buffer, file.originalname, entity, entityId, 'images');
          req.uploadedUserFiles.profileImage = url;
        }

        // Handle user PDF file
        if (req.files.userFile && req.files.userFile[0]) {
          const file = req.files.userFile[0];
          if (!isPDF(file.mimetype)) {
            return res.status(400).json({ 
              error: 'Invalid file type', 
              details: 'userFile must be a PDF file' 
            });
          }
          const { uploadToS3 } = require('../services/s3Service');
          const url = await uploadToS3(file.buffer, file.originalname, entity, entityId, 'pdfs');
          req.uploadedUserFiles.userFile = url;
        }

        next();
      } catch (e) {
        res.status(500).json({ error: 'S3 upload failed', details: e.message });
      }
    });
  };
};

const uploadEntityFile = (entity) => {
  return async (req, res, next) => {
    const handler = upload.single('file');

    handler(req, res, async (err) => {
      if (err) return res.status(400).json({ error: 'File upload error', details: err.message });

      if (!req.file) return next();

      try {
        const entityId = req.params.id || req.body.id || 'temp';
        
        if (!isPDF(req.file.mimetype)) {
          return res.status(400).json({ 
            error: 'Invalid file type', 
            details: 'File must be a PDF' 
          });
        }

        const { uploadToS3 } = require('../services/s3Service');
        const url = await uploadToS3(req.file.buffer, req.file.originalname, entity, entityId, 'pdfs');
        req.uploadedFile = url;

        next();
      } catch (e) {
        res.status(500).json({ error: 'S3 upload failed', details: e.message });
      }
    });
  };
};

module.exports = { 
  uploadModelFiles,      // New universal upload
  uploadSeparateFiles,   // Separate fields for images and PDFs
  uploadFiles,           // Legacy - backward compatibility
  uploadUserFiles,       // Legacy - for users
  uploadEntityFile       // Legacy - single PDF
};
