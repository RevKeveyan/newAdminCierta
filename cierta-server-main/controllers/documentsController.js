
const Load = require('../models/Load');
const { getSignedUrlForObject, extractKeyFromUrl } = require('../services/s3Service');
const fs = require('fs');
const path = require('path');

/**
 * Download document (PDF) with permission checks
 * Supports both S3 files and local generated-pdfs directory
 */
const downloadDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Get filename from query or use default
    const filename = req.query.filename || req.query.file;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Load ID is required'
      });
    }

    // Find load and verify access
    const load = await Load.findById(id)
      .populate('createdBy')
      .populate('customer')
      .populate('carrier');

    if (!load) {
      return res.status(404).json({
        success: false,
        error: 'Load not found'
      });
    }

    // Check permissions: user must be creator, admin, or associated with load
    const isCreator = load.createdBy?._id?.toString() === userId.toString();
    const isAdmin = req.user?.role === 'admin';
    const isDispatcher = req.user?.role === 'dispatcher';
    const isManager = req.user?.role === 'manager';

    if (!isCreator && !isAdmin && !isDispatcher && !isManager) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: You do not have permission to access this document'
      });
    }

    // Determine document path
    let documentPath = null;
    let isS3 = false;

    // Check for specific document type
    if (filename) {
      // Try to find in load documents
      if (filename.includes('BOL') || filename.includes('bol')) {
        documentPath = load.bolPdfPath;
      } else if (filename.includes('Rate') || filename.includes('rate')) {
        documentPath = load.rateConfirmationPdfPath;
      } else {
        // Search in documents array
        const doc = load.documents?.find(d => d.includes(filename));
        if (doc) documentPath = doc;
      }
    } else {
      // Default to BOL if available
      documentPath = load.bolPdfPath || load.rateConfirmationPdfPath;
    }

    // If document path found, check if it's S3 or local
    if (documentPath) {
      // Check if it's an S3 key/URL
      if (documentPath.includes('amazonaws.com') || !documentPath.startsWith('/')) {
        isS3 = true;
        const s3Key = extractKeyFromUrl(documentPath) || documentPath;
        
        // Generate signed URL for S3 file
        const signedUrl = await getSignedUrlForObject(s3Key, 300); // 5 minutes
        
        if (signedUrl) {
          // Redirect to signed URL
          return res.redirect(signedUrl);
        } else {
          return res.status(404).json({
            success: false,
            error: 'Document not found in S3'
          });
        }
      }
    }

    // Fallback: serve from local generated-pdfs directory
    const localFilename = filename || documentPath || 'default.pdf';
    const pdfPath = path.join(__dirname, '../generated-pdfs', localFilename);

    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({
        success: false,
        error: 'PDF file not found'
      });
    }

    // Set appropriate headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${localFilename}"`);

    // Stream the file
    const fileStream = fs.createReadStream(pdfPath);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      console.error('Error streaming PDF:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Error streaming PDF file'
        });
      }
    });
  } catch (error) {
    console.error('Error in downloadDocument:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download document',
      details: error.message
    });
  }
};

module.exports = {
  downloadDocument
};


