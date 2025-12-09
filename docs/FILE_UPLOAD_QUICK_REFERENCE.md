# File Upload Quick Reference

## Quick Setup for Any Model

### 1. Add Routes

```javascript
// routes/carrierRoutes.js
const { uploadModelFiles } = require('../middlewares/uploadMiddleware');

// Upload files
router.post(
  '/carriers/:id/files',
  uploadModelFiles('carriers'),
  CarrierController.uploadFiles
);

// Get files
router.get(
  '/carriers/:id/files',
  CarrierController.getFiles
);

// Remove file
router.delete(
  '/carriers/:id/files',
  CarrierController.removeFile
);
```

### 2. Add Controller Methods

```javascript
// controllers/CarrierController.js
const FileHelper = require('../utils/fileHelper');

class CarrierController {
  uploadFiles = async (req, res) => {
    try {
      const { id } = req.params;
      const carrier = await Carrier.findById(id);
      if (!carrier) {
        return res.status(404).json({ success: false, error: 'Not found' });
      }

      const updateData = {};
      FileHelper.processUploadedFiles(req, updateData);

      const updated = await Carrier.findByIdAndUpdate(id, updateData, { new: true });

      res.json({ success: true, data: updated });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  };

  getFiles = async (req, res) => {
    try {
      const { id } = req.params;
      const { type } = req.query; // 'images' or 'pdfs'
      
      const carrier = await Carrier.findById(id);
      if (!carrier) {
        return res.status(404).json({ success: false, error: 'Not found' });
      }

      const files = FileHelper.getEntityFiles(carrier, type);
      res.json({ success: true, data: files });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  };

  removeFile = async (req, res) => {
    try {
      const { id } = req.params;
      const { fileUrl, fileType = 'images' } = req.body;

      const carrier = await Carrier.findById(id);
      if (!carrier) {
        return res.status(404).json({ success: false, error: 'Not found' });
      }

      const updated = await FileHelper.removeFile(carrier, fileUrl, fileType);
      res.json({ success: true, data: updated });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  };
}
```

### 3. Frontend Usage

```javascript
// Upload files
const formData = new FormData();
files.forEach(file => formData.append('files', file));

fetch(`/carriers/${id}/files`, {
  method: 'POST',
  body: formData
});

// Get files
fetch(`/carriers/${id}/files?type=images`);

// Remove file
fetch(`/carriers/${id}/files`, {
  method: 'DELETE',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ fileUrl, fileType: 'images' })
});
```

---

## S3 Folder Structure

```
2024/December/{entity}/{entityId}/{fileType}/{filename}
```

**Example:**
```
2024/December/carriers/507f1f77bcf86cd799439012/images/logo.jpg
2024/December/carriers/507f1f77bcf86cd799439012/pdfs/contract.pdf
```

---

## Supported Entities

- `users`
- `carriers`
- `customers`
- `loads`
- `vehicles` (submodel)
- `freight` (submodel)
- `paymentPayable` (submodel)
- `paymentReceivable` (submodel)

---

## File Types

- **Images**: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`, `.bmp`
- **PDFs**: `.pdf`

---

## Middleware Options

```javascript
uploadModelFiles('carriers', {
  allowImages: true,    // Default: true
  allowPDFs: true,      // Default: true
  multiple: true,       // Default: true
  fieldName: 'files'    // Default: 'files'
})
```

---

## File Helper Methods

```javascript
// Process uploaded files
FileHelper.processUploadedFiles(req, updateData);

// Remove single file
await FileHelper.removeFile(model, fileUrl, 'images');

// Remove multiple files
await FileHelper.removeFiles(model, [url1, url2], 'pdfs');

// Get entity files
const files = FileHelper.getEntityFiles(model, 'images');

// Parse S3 URL
const metadata = FileHelper.getFileMetadata(fileUrl);

// Filter files
const filtered = FileHelper.filterFiles(urls, 'carriers', 'images');
```
