const { deleteFromS3, parseS3Url } = require('../services/s3Service');

/**
 * Helper utility for handling file uploads and management
 */
class FileHelper {
  /**
   * Process uploaded files and add them to model data
   * @param {Object} req - Express request object
   * @param {Object} updateData - Data object to update
   * @param {Object} options - Options
   * @param {Boolean} options.append - Append to existing files (default: true)
   * @param {Boolean} options.replace - Replace existing files (default: false)
   */
  static processUploadedFiles(req, updateData, options = {}) {
    const { append = true, replace = false } = options;

    // Handle new universal upload structure
    if (req.uploadedFiles) {
      if (req.uploadedFiles.images && req.uploadedFiles.images.length > 0) {
        if (replace) {
          updateData.images = req.uploadedFiles.images;
        } else {
          updateData.$push = updateData.$push || {};
          updateData.$push.images = { $each: req.uploadedFiles.images };
        }
      }

      if (req.uploadedFiles.pdfs && req.uploadedFiles.pdfs.length > 0) {
        if (replace) {
          updateData.pdfs = req.uploadedFiles.pdfs;
        } else {
          updateData.$push = updateData.$push || {};
          updateData.$push.pdfs = { $each: req.uploadedFiles.pdfs };
        }
      }
    }

    // Handle legacy uploadUserFiles structure
    if (req.uploadedUserFiles) {
      if (req.uploadedUserFiles.profileImage) {
        updateData.profileImage = req.uploadedUserFiles.profileImage;
      }
      if (req.uploadedUserFiles.userFile) {
        updateData.userFile = req.uploadedUserFiles.userFile;
      }
    }

    // Handle legacy uploadEntityFile structure
    if (req.uploadedFile) {
      if (replace) {
        updateData.pdfs = [req.uploadedFile];
      } else {
        updateData.$push = updateData.$push || {};
        updateData.$push.pdfs = req.uploadedFile;
      }
    }
  }

  /**
   * Remove file from model
   * @param {Object} model - Mongoose model instance
   * @param {String} fileUrl - File URL to remove
   * @param {String} fileType - 'images' or 'pdfs'
   * @returns {Promise<Object>} - Updated model
   */
  static async removeFile(model, fileUrl, fileType = 'images') {
    if (!fileUrl) {
      throw new Error('File URL is required');
    }

    // Remove from array
    const update = { $pull: {} };
    update.$pull[fileType] = fileUrl;

    const updated = await model.constructor.findByIdAndUpdate(
      model._id,
      update,
      { new: true }
    );

    // Delete from S3
    try {
      await deleteFromS3(fileUrl);
    } catch (error) {
      console.error(`[FileHelper] Failed to delete file from S3: ${fileUrl}`, error);
      // Continue even if S3 deletion fails
    }

    return updated;
  }

  /**
   * Remove multiple files from model
   * @param {Object} model - Mongoose model instance
   * @param {Array<String>} fileUrls - Array of file URLs to remove
   * @param {String} fileType - 'images' or 'pdfs'
   * @returns {Promise<Object>} - Updated model
   */
  static async removeFiles(model, fileUrls, fileType = 'images') {
    if (!Array.isArray(fileUrls) || fileUrls.length === 0) {
      throw new Error('File URLs array is required');
    }

    // Remove from array
    const update = { $pull: {} };
    update.$pull[fileType] = { $in: fileUrls };

    const updated = await model.constructor.findByIdAndUpdate(
      model._id,
      update,
      { new: true }
    );

    // Delete from S3
    const deletePromises = fileUrls.map(url => {
      return deleteFromS3(url).catch(error => {
        console.error(`[FileHelper] Failed to delete file from S3: ${url}`, error);
        return null;
      });
    });

    await Promise.all(deletePromises);

    return updated;
  }

  /**
   * Get file metadata from URL
   * @param {String} fileUrl - S3 file URL
   * @returns {Object|null} - Parsed metadata
   */
  static getFileMetadata(fileUrl) {
    return parseS3Url(fileUrl);
  }

  /**
   * Filter files by entity and type
   * @param {Array<String>} fileUrls - Array of file URLs
   * @param {String} entity - Entity name to filter by
   * @param {String} fileType - 'images' or 'pdfs' to filter by
   * @returns {Array<String>} - Filtered file URLs
   */
  static filterFiles(fileUrls, entity = null, fileType = null) {
    if (!Array.isArray(fileUrls)) return [];

    return fileUrls.filter(url => {
      const metadata = parseS3Url(url);
      if (!metadata) return false;

      if (entity && metadata.entity !== entity) return false;
      if (fileType && metadata.fileType !== fileType) return false;

      return true;
    });
  }

  /**
   * Get all files for an entity
   * @param {Object} model - Mongoose model instance
   * @param {String} fileType - 'images' or 'pdfs' or null for both
   * @returns {Object} - Object with images and/or pdfs arrays
   */
  static getEntityFiles(model, fileType = null) {
    const result = {};

    if (!fileType || fileType === 'images') {
      result.images = model.images || [];
    }

    if (!fileType || fileType === 'pdfs') {
      result.pdfs = model.pdfs || [];
    }

    return result;
  }
}

module.exports = FileHelper;
