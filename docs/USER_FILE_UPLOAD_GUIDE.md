# File Upload API Documentation

## Overview

The API supports file uploads for multiple entities:

### User
- **profileImage** - User's avatar/profile picture (any image format)
- **userFile** - User's document file (PDF only)

### Carrier
- **file** - Carrier document (PDF only) - contract, agreement, etc.

### Customer
- **file** - Customer document (PDF only) - contract, agreement, etc.

---

## API Endpoints

### 1. Create User with Files

```
POST /users
Content-Type: multipart/form-data
```

#### Form Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| firstName | string | Yes | User's first name |
| lastName | string | Yes | User's last name |
| email | string | Yes | User's email (unique) |
| password | string | Yes | User's password |
| role | string | Yes | User role (see allowed values below) |
| companyName | string | No | Company name |
| profileImage | file | No | Profile image (jpg, png, gif, webp) |
| userFile | file | No | PDF document |

#### Allowed Roles
- `admin`
- `manager`
- `accountingManager`
- `accountingIn`
- `accountingOut`
- `dispatcher`
- `partner`
- `BidAgent`

#### Response

```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "role": "admin",
    "firstName": "John",
    "lastName": "Doe",
    "companyName": "Acme Inc",
    "status": "active",
    "profileImage": "https://bucket.s3.region.amazonaws.com/December/users/profileImage/temp/uuid.jpg",
    "userFile": "https://bucket.s3.region.amazonaws.com/December/users/userFile/temp/uuid.pdf",
    "createdAt": "2024-12-09T10:30:00.000Z",
    "updatedAt": "2024-12-09T10:30:00.000Z"
  },
  "message": "User created successfully"
}
```

---

### 2. Update User with Files

```
PUT /users/:id
Content-Type: multipart/form-data
```

#### Form Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| firstName | string | No | User's first name |
| lastName | string | No | User's last name |
| email | string | No | User's email |
| password | string | No | New password |
| role | string | No | User role |
| companyName | string | No | Company name |
| profileImage | file | No | New profile image |
| userFile | file | No | New PDF document |

---

### 3. Update Profile (Authenticated User)

```
PUT /users/profile/:id
Content-Type: multipart/form-data
Authorization: Bearer <token>
```

Same fields as Update User.

---

### 4. Remove User File (PDF)

```
DELETE /users/:id/file
```

Removes only the `userFile` (PDF) from the user.

#### Response

```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "profileImage": "https://...",
    "userFile": null,
    ...
  },
  "message": "User file removed successfully"
}
```

---

## Frontend Implementation Examples

### JavaScript (Fetch API)

```javascript
// Create user with files
async function createUser(userData, profileImage, userFile) {
  const formData = new FormData();
  
  // Add text fields
  formData.append('firstName', userData.firstName);
  formData.append('lastName', userData.lastName);
  formData.append('email', userData.email);
  formData.append('password', userData.password);
  formData.append('role', userData.role);
  
  if (userData.companyName) {
    formData.append('companyName', userData.companyName);
  }
  
  // Add files (if provided)
  if (profileImage) {
    formData.append('profileImage', profileImage);
  }
  
  if (userFile) {
    formData.append('userFile', userFile);
  }
  
  const response = await fetch('/users', {
    method: 'POST',
    body: formData
    // Note: Don't set Content-Type header - browser will set it with boundary
  });
  
  return response.json();
}

// Update user with files
async function updateUser(userId, userData, profileImage, userFile) {
  const formData = new FormData();
  
  // Add only changed fields
  if (userData.firstName) formData.append('firstName', userData.firstName);
  if (userData.lastName) formData.append('lastName', userData.lastName);
  if (userData.email) formData.append('email', userData.email);
  if (userData.password) formData.append('password', userData.password);
  if (userData.role) formData.append('role', userData.role);
  if (userData.companyName) formData.append('companyName', userData.companyName);
  
  // Add files
  if (profileImage) formData.append('profileImage', profileImage);
  if (userFile) formData.append('userFile', userFile);
  
  const response = await fetch(`/users/${userId}`, {
    method: 'PUT',
    body: formData
  });
  
  return response.json();
}

// Remove user file
async function removeUserFile(userId) {
  const response = await fetch(`/users/${userId}/file`, {
    method: 'DELETE'
  });
  
  return response.json();
}
```

### React Example

```jsx
import { useState } from 'react';

function UserForm() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'dispatcher',
    companyName: ''
  });
  const [profileImage, setProfileImage] = useState(null);
  const [userFile, setUserFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleProfileImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setProfileImage(file);
    }
  };

  const handleUserFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate PDF
      if (file.type !== 'application/pdf') {
        alert('Please select a PDF file');
        return;
      }
      setUserFile(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const data = new FormData();
    
    // Add text fields
    Object.keys(formData).forEach(key => {
      if (formData[key]) {
        data.append(key, formData[key]);
      }
    });
    
    // Add files
    if (profileImage) {
      data.append('profileImage', profileImage);
    }
    if (userFile) {
      data.append('userFile', userFile);
    }

    try {
      const response = await fetch('/users', {
        method: 'POST',
        body: data
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert('User created successfully!');
        console.log('User:', result.data);
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>First Name *</label>
        <input
          type="text"
          name="firstName"
          value={formData.firstName}
          onChange={handleInputChange}
          required
        />
      </div>

      <div>
        <label>Last Name *</label>
        <input
          type="text"
          name="lastName"
          value={formData.lastName}
          onChange={handleInputChange}
          required
        />
      </div>

      <div>
        <label>Email *</label>
        <input
          type="email"
          name="email"
          value={formData.email}
          onChange={handleInputChange}
          required
        />
      </div>

      <div>
        <label>Password *</label>
        <input
          type="password"
          name="password"
          value={formData.password}
          onChange={handleInputChange}
          required
        />
      </div>

      <div>
        <label>Role *</label>
        <select name="role" value={formData.role} onChange={handleInputChange}>
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="accountingManager">Accounting Manager</option>
          <option value="accountingIn">Accounting In</option>
          <option value="accountingOut">Accounting Out</option>
          <option value="dispatcher">Dispatcher</option>
          <option value="partner">Partner</option>
          <option value="BidAgent">Bid Agent</option>
        </select>
      </div>

      <div>
        <label>Company Name</label>
        <input
          type="text"
          name="companyName"
          value={formData.companyName}
          onChange={handleInputChange}
        />
      </div>

      <div>
        <label>Profile Image</label>
        <input
          type="file"
          accept="image/*"
          onChange={handleProfileImageChange}
        />
        {profileImage && <span>Selected: {profileImage.name}</span>}
      </div>

      <div>
        <label>User Document (PDF)</label>
        <input
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleUserFileChange}
        />
        {userFile && <span>Selected: {userFile.name}</span>}
      </div>

      <button type="submit" disabled={loading}>
        {loading ? 'Creating...' : 'Create User'}
      </button>
    </form>
  );
}

export default UserForm;
```

### Axios Example

```javascript
import axios from 'axios';

// Create user
async function createUser(userData, profileImage, userFile) {
  const formData = new FormData();
  
  Object.keys(userData).forEach(key => {
    if (userData[key]) {
      formData.append(key, userData[key]);
    }
  });
  
  if (profileImage) formData.append('profileImage', profileImage);
  if (userFile) formData.append('userFile', userFile);

  const response = await axios.post('/users', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
  
  return response.data;
}

// Update user - only upload new file
async function updateUserFile(userId, userFile) {
  const formData = new FormData();
  formData.append('userFile', userFile);

  const response = await axios.put(`/users/${userId}`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
  
  return response.data;
}
```

---

## File Validation

### Profile Image
- Accepted formats: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`
- No size limit enforced by API (consider adding on frontend)

### User File (PDF)
- **Only PDF files are accepted**
- MIME type must be `application/pdf`
- Server returns error if non-PDF file is uploaded:

```json
{
  "error": "Invalid file type",
  "details": "userFile must be a PDF file"
}
```

---

## Error Responses

### Validation Error
```json
{
  "success": false,
  "error": "Validation failed",
  "details": {
    "email": "Invalid email format",
    "role": "Invalid role value"
  }
}
```

### File Upload Error
```json
{
  "error": "File upload error",
  "details": "Error message"
}
```

### Invalid File Type
```json
{
  "error": "Invalid file type",
  "details": "userFile must be a PDF file"
}
```

### S3 Upload Error
```json
{
  "error": "S3 upload failed",
  "details": "Error message"
}
```

---

## Tips for Frontend Implementation

1. **Don't set Content-Type header manually** - Let the browser set it automatically with the correct boundary for multipart/form-data

2. **Validate PDF on frontend** before sending:
   ```javascript
   if (file.type !== 'application/pdf') {
     alert('Please select a PDF file');
     return;
   }
   ```

3. **Show file preview** for images:
   ```javascript
   const previewUrl = URL.createObjectURL(file);
   // Use in <img src={previewUrl} />
   // Remember to revoke: URL.revokeObjectURL(previewUrl)
   ```

4. **Show upload progress** with Axios:
   ```javascript
   const response = await axios.post('/users', formData, {
     onUploadProgress: (progressEvent) => {
       const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
       setProgress(percent);
     }
   });
   ```

5. **File size limit** (recommended on frontend):
   ```javascript
   const MAX_SIZE = 5 * 1024 * 1024; // 5MB
   if (file.size > MAX_SIZE) {
     alert('File is too large. Maximum size is 5MB');
     return;
   }
   ```

---

## Carrier File Upload

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/carriers` | Create carrier with file |
| PUT | `/carriers/:id` | Update carrier with file |
| DELETE | `/carriers/:id/file` | Remove carrier file |

### Form Field

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | file | No | PDF document (contract, agreement) |

### Example: Create Carrier with File

```javascript
async function createCarrier(carrierData, pdfFile) {
  const formData = new FormData();
  
  // Add text fields
  formData.append('name', carrierData.name);
  formData.append('companyName', carrierData.companyName);
  formData.append('email', carrierData.email);
  formData.append('phoneNumber', carrierData.phoneNumber);
  formData.append('mcNumber', carrierData.mcNumber);
  formData.append('dotNumber', carrierData.dotNumber);
  
  // Add PDF file (if provided)
  if (pdfFile) {
    formData.append('file', pdfFile);
  }
  
  const response = await fetch('/carriers', {
    method: 'POST',
    body: formData
  });
  
  return response.json();
}
```

### Example: Update Carrier File

```javascript
async function updateCarrierFile(carrierId, pdfFile) {
  const formData = new FormData();
  formData.append('file', pdfFile);

  const response = await fetch(`/carriers/${carrierId}`, {
    method: 'PUT',
    body: formData
  });
  
  return response.json();
}
```

### Example: Remove Carrier File

```javascript
async function removeCarrierFile(carrierId) {
  const response = await fetch(`/carriers/${carrierId}/file`, {
    method: 'DELETE'
  });
  
  return response.json();
}
```

### HTML Input

```html
<input type="file" name="file" accept=".pdf,application/pdf" />
```

---

## Customer File Upload

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/customers` | Create customer with file |
| PUT | `/customers/:id` | Update customer with file |
| DELETE | `/customers/:id/file` | Remove customer file |

### Form Field

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | file | No | PDF document (contract, agreement) |

### Example: Create Customer with File

```javascript
async function createCustomer(customerData, pdfFile) {
  const formData = new FormData();
  
  // Add text fields
  formData.append('companyName', customerData.companyName);
  formData.append('phoneNumber', customerData.phoneNumber);
  formData.append('paymentMethod', customerData.paymentMethod);
  
  // Add address fields
  if (customerData.customerAddress) {
    formData.append('customerAddress[address]', customerData.customerAddress.address);
    formData.append('customerAddress[city]', customerData.customerAddress.city);
    formData.append('customerAddress[state]', customerData.customerAddress.state);
    formData.append('customerAddress[zipCode]', customerData.customerAddress.zipCode);
  }
  
  // Add PDF file (if provided)
  if (pdfFile) {
    formData.append('file', pdfFile);
  }
  
  const response = await fetch('/customers', {
    method: 'POST',
    body: formData
  });
  
  return response.json();
}
```

### Example: Update Customer File

```javascript
async function updateCustomerFile(customerId, pdfFile) {
  const formData = new FormData();
  formData.append('file', pdfFile);

  const response = await fetch(`/customers/${customerId}`, {
    method: 'PUT',
    body: formData
  });
  
  return response.json();
}
```

### Example: Remove Customer File

```javascript
async function removeCustomerFile(customerId) {
  const response = await fetch(`/customers/${customerId}/file`, {
    method: 'DELETE'
  });
  
  return response.json();
}
```

---

## React Component: Entity File Upload (Reusable)

```jsx
import { useState } from 'react';

function EntityFileUpload({ entityType, entityId, onSuccess }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (selectedFile.type !== 'application/pdf') {
        alert('Please select a PDF file');
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    
    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`/${entityType}/${entityId}`, {
        method: 'PUT',
        body: formData
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert('File uploaded successfully!');
        onSuccess?.(result.data);
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      alert('Failed to upload file');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/${entityType}/${entityId}/file`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert('File removed successfully!');
        setFile(null);
        onSuccess?.(result.data);
      }
    } catch (error) {
      alert('Failed to remove file');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        accept=".pdf,application/pdf"
        onChange={handleFileChange}
        disabled={loading}
      />
      {file && <span>{file.name}</span>}
      
      <button onClick={handleUpload} disabled={!file || loading}>
        {loading ? 'Uploading...' : 'Upload'}
      </button>
      
      <button onClick={handleRemove} disabled={loading}>
        Remove File
      </button>
    </div>
  );
}

// Usage:
// <EntityFileUpload entityType="carriers" entityId="123" onSuccess={handleSuccess} />
// <EntityFileUpload entityType="customers" entityId="456" onSuccess={handleSuccess} />
```

---

## Summary Table

| Entity | Field Name | Accepted Types | Endpoints |
|--------|------------|----------------|-----------|
| User | profileImage | image/* | POST/PUT `/users`, `/users/profile/:id` |
| User | userFile | PDF | POST/PUT `/users`, `/users/profile/:id`, DELETE `/users/:id/file` |
| Carrier | file | PDF | POST/PUT `/carriers`, DELETE `/carriers/:id/file` |
| Customer | file | PDF | POST/PUT `/customers`, DELETE `/customers/:id/file` |
