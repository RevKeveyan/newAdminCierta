# File Upload System Documentation

## Overview

The file upload system supports **images** and **PDFs** for all models and submodels, with an organized S3 folder structure for easy file management and retrieval.

---

## S3 Folder Structure

Files are organized in S3 using the following structure:

```
Year/Month/Entity/EntityID/FileType/filename
```

### Examples:

```
2024/December/users/507f1f77bcf86cd799439011/images/profile.jpg
2024/December/users/507f1f77bcf86cd799439011/pdf/document.pdf
2024/December/carriers/507f1f77bcf86cd799439012/images/logo.png
2024/December/carriers/507f1f77bcf86cd799439012/pdf/contract.pdf
2024/December/loads/507f1f77bcf86cd799439013/images/pickup-photo.jpg
2024/December/loads/507f1f77bcf86cd799439013/pdf/bill-of-lading.pdf
```

### Benefits:

- **Easy to find**: Files are organized by entity and type
- **Time-based**: Year/Month structure helps with archival
- **Scalable**: Each entity has its own folder
- **Queryable**: Can easily list all files for an entity or type

---

## Model Structure

All models now support standardized file fields:

```typescript
interface ModelWithFiles {
  images: string[];  // Array of image URLs
  pdfs: string[];    // Array of PDF URLs
}
```

### Models with File Support:

#### Main Models:
- **User** - `images[]`, `pdfs[]`
- **Carrier** - `images[]`, `pdfs[]`
- **Customer** - `images[]`, `pdfs[]`
- **Load** - `images[]`, `pdfs[]`

#### Submodels:
- **Vehicle** - `images[]`, `pdfs[]`
- **Freight** - `images[]`, `pdfs[]`
- **PaymentPayable** - `images[]`, `pdfs[]`
- **PaymentReceivable** - `images[]`, `pdfs[]`

---

## Upload Middleware

### 1. Universal Upload (`uploadModelFiles`)

Uploads both images and PDFs in a single request:

```javascript
const { uploadModelFiles } = require('../middlewares/uploadMiddleware');

// In routes
router.post(
  '/carriers/:id/files',
  uploadModelFiles('carriers'),
  CarrierController.uploadFiles
);
```

**Form Field:** `files` (can be multiple files)

**Options:**
```javascript
uploadModelFiles('carriers', {
  allowImages: true,    // Allow images (default: true)
  allowPDFs: true,      // Allow PDFs (default: true)
  multiple: true,       // Allow multiple files (default: true)
  fieldName: 'files'    // Form field name (default: 'files')
})
```

### 2. Separate Fields Upload (`uploadSeparateFiles`)

Upload images and PDFs using separate form fields:

```javascript
const { uploadSeparateFiles } = require('../middlewares/uploadMiddleware');

router.post(
  '/carriers/:id/files',
  uploadSeparateFiles('carriers'),
  CarrierController.uploadFiles
);
```

**Form Fields:**
- `images` - Array of image files
- `pdfs` - Array of PDF files

---

## Controller Implementation

### Basic Upload Handler

```javascript
const FileHelper = require('../utils/fileHelper');

class CarrierController {
  uploadFiles = async (req, res) => {
    try {
      const { id } = req.params;
      
      const carrier = await Carrier.findById(id);
      if (!carrier) {
        return res.status(404).json({
          success: false,
          error: 'Carrier not found'
        });
      }

      const updateData = {};
      FileHelper.processUploadedFiles(req, updateData);

      const updated = await Carrier.findByIdAndUpdate(
        id,
        updateData,
        { new: true }
      );

      res.status(200).json({
        success: true,
        data: updated,
        message: 'Files uploaded successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to upload files',
        details: error.message
      });
    }
  };

  removeFile = async (req, res) => {
    try {
      const { id } = req.params;
      const { fileUrl, fileType = 'images' } = req.body;

      const carrier = await Carrier.findById(id);
      if (!carrier) {
        return res.status(404).json({
          success: false,
          error: 'Carrier not found'
        });
      }

      const updated = await FileHelper.removeFile(carrier, fileUrl, fileType);

      res.status(200).json({
        success: true,
        data: updated,
        message: 'File removed successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to remove file',
        details: error.message
      });
    }
  };

  getFiles = async (req, res) => {
    try {
      const { id } = req.params;
      const { type } = req.query; // 'images', 'pdfs', or null for both

      const carrier = await Carrier.findById(id);
      if (!carrier) {
        return res.status(404).json({
          success: false,
          error: 'Carrier not found'
        });
      }

      const files = FileHelper.getEntityFiles(carrier, type);

      res.status(200).json({
        success: true,
        data: files
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get files',
        details: error.message
      });
    }
  };
}
```

---

## Frontend Implementation

### React: Upload Files Component

```jsx
import { useState } from 'react';

function FileUpload({ entity, entityId, onSuccess }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles(selectedFiles);
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setLoading(true);
    const formData = new FormData();
    
    files.forEach(file => {
      formData.append('files', file);
    });

    try {
      const response = await fetch(`/${entity}/${entityId}/files`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      
      if (result.success) {
        alert('Files uploaded successfully!');
        onSuccess?.(result.data);
        setFiles([]);
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      alert('Failed to upload files');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        multiple
        accept="image/*,.pdf"
        onChange={handleFileChange}
        disabled={loading}
      />
      
      {files.length > 0 && (
        <div>
          <p>Selected files: {files.length}</p>
          <ul>
            {files.map((file, index) => (
              <li key={index}>{file.name}</li>
            ))}
          </ul>
        </div>
      )}

      <button onClick={handleUpload} disabled={loading || files.length === 0}>
        {loading ? 'Uploading...' : 'Upload Files'}
      </button>
    </div>
  );
}
```

### React: Separate Images and PDFs

```jsx
function SeparateFileUpload({ entity, entityId, onSuccess }) {
  const [images, setImages] = useState([]);
  const [pdfs, setPdfs] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleImagesChange = (e) => {
    setImages(Array.from(e.target.files));
  };

  const handlePdfsChange = (e) => {
    setPdfs(Array.from(e.target.files));
  };

  const handleUpload = async () => {
    if (images.length === 0 && pdfs.length === 0) return;

    setLoading(true);
    const formData = new FormData();
    
    images.forEach(file => {
      formData.append('images', file);
    });
    
    pdfs.forEach(file => {
      formData.append('pdfs', file);
    });

    try {
      const response = await fetch(`/${entity}/${entityId}/files`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      
      if (result.success) {
        alert('Files uploaded successfully!');
        onSuccess?.(result.data);
        setImages([]);
        setPdfs([]);
      }
    } catch (error) {
      alert('Failed to upload files');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div>
        <label>Images</label>
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={handleImagesChange}
          disabled={loading}
        />
      </div>

      <div>
        <label>PDFs</label>
        <input
          type="file"
          multiple
          accept=".pdf,application/pdf"
          onChange={handlePdfsChange}
          disabled={loading}
        />
      </div>

      <button onClick={handleUpload} disabled={loading}>
        Upload
      </button>
    </div>
  );
}
```

### JavaScript: Remove File

```javascript
async function removeFile(entity, entityId, fileUrl, fileType = 'images') {
  const response = await fetch(`/${entity}/${entityId}/files`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fileUrl,
      fileType
    })
  });

  return response.json();
}
```

---

## API Endpoints Example

### Upload Files

```
POST /carriers/:id/files
Content-Type: multipart/form-data

Form Data:
- files: [file1.jpg, file2.pdf, file3.png]
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439012",
    "images": [
      "https://bucket.s3.region.amazonaws.com/2024/December/carriers/507f1f77bcf86cd799439012/images/uuid1.jpg",
      "https://bucket.s3.region.amazonaws.com/2024/December/carriers/507f1f77bcf86cd799439012/images/uuid3.png"
    ],
    "pdfs": [
      "https://bucket.s3.region.amazonaws.com/2024/December/carriers/507f1f77bcf86cd799439012/pdfs/uuid2.pdf"
    ]
  },
  "message": "Files uploaded successfully"
}
```

### Get Files

```
GET /carriers/:id/files?type=images
GET /carriers/:id/files?type=pdfs
GET /carriers/:id/files
```

**Response:**
```json
{
  "success": true,
  "data": {
    "images": ["url1", "url2"],
    "pdfs": ["url3"]
  }
}
```

### Remove File

```
DELETE /carriers/:id/files
Content-Type: application/json

{
  "fileUrl": "https://bucket.s3.region.amazonaws.com/...",
  "fileType": "images"
}
```

---

## File Helper Utility

The `FileHelper` utility provides convenient methods:

### `processUploadedFiles(req, updateData, options)`

Process uploaded files and prepare update data:

```javascript
const updateData = {};
FileHelper.processUploadedFiles(req, updateData, {
  append: true,   // Append to existing (default)
  replace: false  // Replace existing (default: false)
});
```

### `removeFile(model, fileUrl, fileType)`

Remove a single file:

```javascript
const updated = await FileHelper.removeFile(carrier, fileUrl, 'images');
```

### `removeFiles(model, fileUrls, fileType)`

Remove multiple files:

```javascript
const updated = await FileHelper.removeFiles(
  carrier, 
  [url1, url2, url3], 
  'pdfs'
);
```

### `getFileMetadata(fileUrl)`

Parse S3 URL to get metadata:

```javascript
const metadata = FileHelper.getFileMetadata(fileUrl);
// Returns: { year, month, entity, entityId, fileType, filename, fullKey }
```

### `filterFiles(fileUrls, entity, fileType)`

Filter files by entity and/or type:

```javascript
const carrierImages = FileHelper.filterFiles(
  allFiles, 
  'carriers', 
  'images'
);
```

### `getEntityFiles(model, fileType)`

Get all files for an entity:

```javascript
const files = FileHelper.getEntityFiles(carrier, 'images');
// Returns: { images: [...], pdfs: [...] }
```

---

## File Type Validation

### Supported Image Types:
- `.jpg`, `.jpeg` - JPEG
- `.png` - PNG
- `.gif` - GIF
- `.webp` - WebP
- `.svg` - SVG
- `.bmp` - BMP

### Supported PDF Types:
- `.pdf` - PDF

### Validation:
- Images are validated by MIME type: `image/*`
- PDFs are validated by MIME type: `application/pdf`
- Invalid file types return 400 error

---

## S3 URL Parsing

You can parse S3 URLs to extract metadata:

```javascript
const { parseS3Url } = require('../services/s3Service');

const url = "https://bucket.s3.region.amazonaws.com/2024/December/carriers/507f1f77bcf86cd799439012/images/uuid.jpg";
const metadata = parseS3Url(url);

// Returns:
{
  year: "2024",
  month: "December",
  entity: "carriers",
  entityId: "507f1f77bcf86cd799439012",
  fileType: "images",
  filename: "uuid.jpg",
  fullKey: "2024/December/carriers/507f1f77bcf86cd799439012/images/uuid.jpg"
}
```

---

## Best Practices

1. **Always validate file types** on frontend before upload
2. **Use separate endpoints** for different file operations (upload, remove, list)
3. **Handle errors gracefully** - S3 operations can fail
4. **Clean up old files** when removing entities
5. **Use file metadata** for organizing and querying files
6. **Implement file size limits** (recommended: 5-10MB per file)

---

## Migration Notes

### Legacy Fields

Some models have legacy file fields that are still supported:

- **User**: `profileImage`, `userFile`
- **Carrier/Customer**: `file`
- **Load**: `documents`, `bolPdfPath`, `rateConfirmationPdfPath`
- **Vehicle**: `vehicleImages`
- **Freight**: `freightImages`

These fields are maintained for backward compatibility. New uploads should use the standardized `images[]` and `pdfs[]` arrays.

---

## Error Handling

All upload operations return standardized error responses:

```json
{
  "error": "Error type",
  "details": "Detailed error message"
}
```

Common errors:
- `400` - Invalid file type, missing files, validation error
- `404` - Entity not found
- `500` - S3 upload failed, server error
