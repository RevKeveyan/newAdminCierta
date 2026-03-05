const multer = require('multer');
const { uploadToS3, isImage, isPDF } = require('../services/s3Service');
const sharp = require('sharp');

// Security: File size and count limits
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const MAX_FILES = 100; // Increased for handling many files (dozens of images)

// Allowed MIME types
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp'
];

const ALLOWED_PDF_TYPES = [
  'application/pdf'
];

// File filter for security
const fileFilter = (req, file, cb) => {
  const mimetype = file.mimetype.toLowerCase();
  
  // Check if file type is allowed
  const isAllowedImage = ALLOWED_IMAGE_TYPES.includes(mimetype);
  const isAllowedPDF = ALLOWED_PDF_TYPES.includes(mimetype);
  
  if (isAllowedImage || isAllowedPDF) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${mimetype}. Only images (${ALLOWED_IMAGE_TYPES.join(', ')}) and PDFs are allowed.`), false);
  }
};

const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES
  },
  fileFilter
});

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
            
            // Optimize image before upload
            let optimizedBuffer = file.buffer;
            try {
              // Skip optimization for SVG (vector graphics don't benefit from compression)
              if (file.mimetype !== 'image/svg+xml') {
                optimizedBuffer = await sharp(file.buffer)
                  .resize(1920, 1080, {
                    fit: 'inside',
                    withoutEnlargement: true
                  })
                  .jpeg({ 
                    quality: 85,
                    progressive: true,
                    mozjpeg: true
                  })
                  .toBuffer();
              }
            } catch (optimizeError) {
              console.warn('Image optimization failed, using original:', optimizeError.message);
              // If optimization fails, use original buffer
              optimizedBuffer = file.buffer;
            }
            
            const url = await uploadToS3(
              optimizedBuffer, 
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
 * For users entity: also supports profileImage field
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
    // For users entity, add profileImage field
    if (entity === 'users') {
      fields.push({ name: 'profileImage', maxCount: 1 });
    }

    // Use fields() to handle file uploads, but also parse all text fields
    const handler = upload.fields(fields);

    handler(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ 
          error: 'File upload error', 
          details: err.message 
        });
      }

      // Debug: Log parsed body data
      console.log('[uploadSeparateFiles] req.body after multer:', JSON.stringify(req.body, null, 2));
      console.log('[uploadSeparateFiles] paymentTerms:', req.body.paymentTerms);
      console.log('[uploadSeparateFiles] paymentMethod:', req.body.paymentMethod);
      console.log('[uploadSeparateFiles] creditLimit:', req.body.creditLimit);
      console.log('[uploadSeparateFiles] req.files:', req.files ? Object.keys(req.files) : 'no files');

      // Parse JSON strings in body if they exist (for FormData with JSON strings)
      if (req.body && typeof req.body === 'object') {
        Object.keys(req.body).forEach(key => {
          const value = req.body[key];
          // Try to parse JSON strings
          if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
            try {
              req.body[key] = JSON.parse(value);
            } catch (e) {
              // Not JSON, keep as string
            }
          }
        });
      }

      // If no files uploaded, continue (but body should still be parsed)
      if (!req.files || Object.keys(req.files).length === 0) {
        console.log('[uploadSeparateFiles] No files, continuing with parsed body');
        return next();
      }

      try {
        req.uploadedFiles = {
          images: [],
          pdfs: []
        };
        
        // Initialize uploadedUserFiles for users entity
        if (entity === 'users') {
          req.uploadedUserFiles = {};
        }

        // Handle profileImage for users
        if (entity === 'users' && req.files.profileImage && req.files.profileImage[0]) {
          const file = req.files.profileImage[0];
          if (!isImage(file.mimetype)) {
            return res.status(400).json({ 
              error: 'Invalid file type', 
              details: 'profileImage must be an image file' 
            });
          }
          
          // Optimize image before upload
          let optimizedBuffer = file.buffer;
          try {
            if (file.mimetype !== 'image/svg+xml') {
              optimizedBuffer = await sharp(file.buffer)
                .resize(500, 500, {
                  fit: 'cover',
                  withoutEnlargement: true
                })
                .jpeg({ 
                  quality: 85,
                  progressive: true,
                  mozjpeg: true
                })
                .toBuffer();
            }
          } catch (optimizeError) {
            console.warn('Image optimization failed, using original:', optimizeError.message);
            optimizedBuffer = file.buffer;
          }
          
          const url = await uploadToS3(
            optimizedBuffer, 
            file.originalname, 
            entity, 
            entityId, 
            'images'
          );
          req.uploadedUserFiles.profileImage = url;
        }

        // Handle images
        if (req.files.images && req.files.images.length > 0) {
          for (const file of req.files.images) {
            if (!isImage(file.mimetype)) {
              return res.status(400).json({ 
                error: 'Invalid file type', 
                details: 'Images field must contain image files only' 
              });
            }
            
            // Optimize image before upload
            let optimizedBuffer = file.buffer;
            try {
              // Skip optimization for SVG (vector graphics don't benefit from compression)
              if (file.mimetype !== 'image/svg+xml') {
                optimizedBuffer = await sharp(file.buffer)
                  .resize(1920, 1080, {
                    fit: 'inside',
                    withoutEnlargement: true
                  })
                  .jpeg({ 
                    quality: 85,
                    progressive: true,
                    mozjpeg: true
                  })
                  .toBuffer();
              }
            } catch (optimizeError) {
              console.warn('Image optimization failed, using original:', optimizeError.message);
              optimizedBuffer = file.buffer;
            }
            
            const url = await uploadToS3(
              optimizedBuffer, 
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
 * Upload files for Loads with separate field types
 * Handles: vehicleImages, freightImages, pickupImages, deliveryImages, carrierPhotos, documents
 */
const uploadFiles = (entity, multiple = true) => {
  return async (req, res, next) => {
    // For new loads (POST), we'll use a temporary ID and update files after load creation
    // For updates (PUT), use the load ID from params
    let entityId = req.params.id;
    
    // If creating new load (POST), we need to use a temporary ID
    // Files will be moved/renamed after load is created with real ID
    if (!entityId && req.method === 'POST') {
      // Use a temporary unique ID for file uploads
      // This will be updated after load creation
      entityId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    if (!entityId) {
      entityId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // Store original entityId and method for later use
    req.tempEntityId = entityId;
    req.isNewLoad = req.method === 'POST' && !req.params.id;
    
    // Define field names for different file types
    // Increased maxCount to handle dozens of files
    const fieldNames = [
      { name: 'vehicleImages', maxCount: 100 },
      { name: 'freightImages', maxCount: 100 },
      { name: 'pickupImages', maxCount: 100 },
      { name: 'deliveryImages', maxCount: 100 },
      { name: 'carrierPhotos', maxCount: 100 },
      { name: 'documents', maxCount: 100 }
    ];
    
    const handler = upload.fields(fieldNames);
    
    handler(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ 
          error: 'File upload error', 
          details: err.message 
        });
      }
      
      if (!req.files || Object.keys(req.files).length === 0) {
        req.uploadedFiles = {};
        return next();
      }
      
      try {
        req.uploadedFiles = {
          vehicleImages: [],
          freightImages: [],
          pickupImages: [],
          deliveryImages: [],
          carrierPhotos: [],
          documents: []
        };
        
        // Process each field type separately, with parallel processing for better performance
        const uploadPromises = [];
        
        const subTypeByField = {
          vehicleImages: 'vehicle',
          freightImages: 'freight',
          pickupImages: 'pickup',
          deliveryImages: 'delivery',
          carrierPhotos: 'carrier',
          documents: 'documents'
        };

        for (const fieldName of fieldNames.map(f => f.name)) {
          if (req.files[fieldName] && req.files[fieldName].length > 0) {
            for (const file of req.files[fieldName]) {
              const isImageFile = isImage(file.mimetype);
              const isPDFFile = isPDF(file.mimetype);
              
              if (!isImageFile && !isPDFFile) {
                return res.status(400).json({ 
                  error: 'Invalid file type', 
                  details: `File ${file.originalname} is not an image or PDF` 
                });
              }
              
              // Process file upload asynchronously
              const uploadPromise = (async () => {
                let fileBuffer = file.buffer;
                
                // Optimize images
                if (isImageFile && file.mimetype !== 'image/svg+xml') {
                  try {
                    fileBuffer = await sharp(file.buffer)
                      .resize(1920, 1080, {
                        fit: 'inside',
                        withoutEnlargement: true
                      })
                      .jpeg({ 
                        quality: 85,
                        progressive: true,
                        mozjpeg: true
                      })
                      .toBuffer();
                  } catch (optimizeError) {
                    console.warn('Image optimization failed, using original:', optimizeError.message);
                    fileBuffer = file.buffer;
                  }
                }
                
                // Upload to S3
                const fileType = isImageFile ? 'images' : 'pdfs';
                const subType = subTypeByField[fieldName] || null;
                const s3Key = await uploadToS3(
                  fileBuffer,
                  file.originalname,
                  entity,
                  entityId,
                  fileType,
                  subType
                );
                
                return { fieldName, s3Key };
              })();
              
              uploadPromises.push(uploadPromise);
            }
          }
        }
        
        // Wait for all uploads to complete
        const uploadResults = await Promise.all(uploadPromises);
        
        // Group results by field name
        for (const { fieldName, s3Key } of uploadResults) {
          req.uploadedFiles[fieldName].push(s3Key);
        }
        
        next();
      } catch (error) {
        console.error('Error processing files:', error);
        return res.status(500).json({ 
          error: 'File processing error', 
          details: error.message 
        });
      }
    });
  };
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
          
          // Optimize image before upload
          let optimizedBuffer = file.buffer;
          try {
            // Skip optimization for SVG (vector graphics)
            if (file.mimetype !== 'image/svg+xml') {
              optimizedBuffer = await sharp(file.buffer)
                .resize(1920, 1080, {
                  fit: 'inside',
                  withoutEnlargement: true
                })
                .jpeg({ 
                  quality: 85,
                  progressive: true,
                  mozjpeg: true
                })
                .toBuffer();
            }
          } catch (optimizeError) {
            console.warn('Image optimization failed, using original:', optimizeError.message);
            optimizedBuffer = file.buffer;
          }
          
          const { uploadToS3 } = require('../services/s3Service');
          const url = await uploadToS3(optimizedBuffer, file.originalname, entity, entityId, 'images');
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
