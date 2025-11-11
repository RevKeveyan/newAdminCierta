# Postman Testing Guide - Complete API Documentation

## 📋 Overview

This guide provides comprehensive Postman collections and examples for testing all API endpoints, including the new PDF generation system.

## 🔧 Setup Instructions

### 1. **Environment Variables**
Create a Postman environment with these variables:

```json
{
  "baseUrl": "http://localhost:5000",
  "token": "your_jwt_token_here",
  "loadId": "your_load_id_here",
  "userId": "your_user_id_here"
}
```

### 2. **Authentication**
Most endpoints require authentication. Include this in your request headers:
```
Authorization: Bearer {{token}}
```

## 🚀 PDF Generation API Testing

### 1. **Generate BOL (Bill of Lading)**

**Request:**
```http
GET {{baseUrl}}/loads/{{loadId}}/bol
Authorization: Bearer {{token}}
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "filename": "BOL_1HGBH41JXMN109186_1759214534689.pdf",
    "path": "C:\\Users\\rkeve\\newAdminCierta\\generated-pdfs\\BOL_1HGBH41JXMN109186_1759214534689.pdf",
    "url": "/generated-pdfs/BOL_1HGBH41JXMN109186_1759214534689.pdf"
  },
  "message": "BOL generated successfully"
}
```

### 2. **Generate Rate Confirmation**

**Request:**
```http
GET {{baseUrl}}/loads/{{loadId}}/rate-confirmation
Authorization: Bearer {{token}}
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "filename": "RateConfirmation_1HGBH41JXMN109186_1759214534885.pdf",
    "path": "C:\\Users\\rkeve\\newAdminCierta\\generated-pdfs\\RateConfirmation_1HGBH41JXMN109186_1759214534885.pdf",
    "url": "/generated-pdfs/RateConfirmation_1HGBH41JXMN109186_1759214534885.pdf"
  },
  "message": "Rate Confirmation generated successfully"
}
```

### 3. **Generate All Documents**

**Request:**
```http
GET {{baseUrl}}/loads/{{loadId}}/documents
Authorization: Bearer {{token}}
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "documents": {
      "bol": {
        "success": true,
        "filename": "BOL_1HGBH41JXMN109186_1759214534925.pdf",
        "url": "/generated-pdfs/BOL_1HGBH41JXMN109186_1759214534925.pdf"
      },
      "rateConfirmation": {
        "success": true,
        "filename": "RateConfirmation_1HGBH41JXMN109186_1759214534885.pdf",
        "url": "/generated-pdfs/RateConfirmation_1HGBH41JXMN109186_1759214534885.pdf"
      }
    }
  },
  "message": "All documents generated successfully"
}
```

### 4. **Download Generated PDF**

**Request:**
```http
GET {{baseUrl}}/loads/download/{{filename}}
Authorization: Bearer {{token}}
```

**Expected Response:**
- Binary PDF file download

## 📊 Load Management API Testing

### 1. **Create Load**

**Request:**
```http
POST {{baseUrl}}/loads
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "type": "Cars",
  "vin": "1HGBH41JXMN109186",
  "category": "Luxury",
  "customerCompanyName": "Auto Transport LLC",
  "customerEmails": ["customer@autotransport.com"],
  "carrier": {
    "name": "Fast Haul Transport",
    "mcNumber": "MC123456",
    "contact": "John Smith",
    "email": "john@fasthaul.com"
  },
  "pickUpLocation": {
    "name": "Los Angeles Auto Dealer",
    "address": "123 Main Street",
    "city": "Los Angeles",
    "state": "CA",
    "zip": 90210,
    "contactPhone": "(555) 123-4567"
  },
  "deliveryLocation": {
    "name": "Miami Auto Dealer",
    "address": "456 Ocean Drive",
    "city": "Miami",
    "state": "FL",
    "zip": 33101,
    "contactPhone": "(305) 555-7890"
  },
  "pickUpDate": "2024-02-15T00:00:00.000Z",
  "deliveryDate": "2024-02-20T00:00:00.000Z",
  "vehicleDetails": {
    "make": "BMW",
    "model": "X5",
    "year": 2023,
    "color": "Black",
    "mileage": 15000
  },
  "specialRequirements": "Handle with care - luxury vehicle",
  "insurance": true,
  "value": 75000
}
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "type": "Cars",
    "vin": "1HGBH41JXMN109186",
    "status": "Listed",
    "customerCompanyName": "Auto Transport LLC",
    "carrier": {
      "name": "Fast Haul Transport",
      "mcNumber": "MC123456",
      "contact": "John Smith",
      "email": "john@fasthaul.com"
    },
    "pickUpLocation": {
      "name": "Los Angeles Auto Dealer",
      "address": "123 Main Street",
      "city": "Los Angeles",
      "state": "CA",
      "zip": 90210,
      "contactPhone": "(555) 123-4567"
    },
    "deliveryLocation": {
      "name": "Miami Auto Dealer",
      "address": "456 Ocean Drive",
      "city": "Miami",
      "state": "FL",
      "zip": 33101,
      "contactPhone": "(305) 555-7890"
    },
    "pickUpDate": "2024-02-15T00:00:00.000Z",
    "deliveryDate": "2024-02-20T00:00:00.000Z",
    "vehicleDetails": {
      "make": "BMW",
      "model": "X5,
      "year": 2023,
      "color": "Black",
      "mileage": 15000
    },
    "specialRequirements": "Handle with care - luxury vehicle",
    "insurance": true,
    "value": 75000,
    "createdAt": "2024-02-01T00:00:00.000Z",
    "updatedAt": "2024-02-01T00:00:00.000Z"
  },
  "message": "Load created successfully"
}
```

### 2. **Get All Loads**

**Request:**
```http
GET {{baseUrl}}/loads?page=1&limit=10&sortBy=createdAt&sortOrder=desc
Authorization: Bearer {{token}}
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "507f1f77bcf86cd799439011",
      "type": "Cars",
      "vin": "1HGBH41JXMN109186",
      "status": "Listed",
      "customerCompanyName": "Auto Transport LLC",
      "carrier": {
        "name": "Fast Haul Transport"
      },
      "pickUpLocation": {
        "city": "Los Angeles",
        "state": "CA"
      },
      "deliveryLocation": {
        "city": "Miami",
        "state": "FL"
      },
      "createdAt": "2024-02-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 1,
    "totalPages": 1,
    "currentPage": 1,
    "limit": 10
  }
}
```

### 3. **Get Load by ID**

**Request:**
```http
GET {{baseUrl}}/loads/{{loadId}}
Authorization: Bearer {{token}}
```

### 4. **Update Load Status**

**Request:**
```http
PUT {{baseUrl}}/loads/{{loadId}}/status
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "status": "Dispatched"
}
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "status": "Dispatched",
    "updatedAt": "2024-02-01T12:00:00.000Z"
  },
  "message": "Load status updated successfully"
}
```

### 5. **Get Loads by Status**

**Request:**
```http
GET {{baseUrl}}/loads/status/Dispatched?page=1&limit=10
Authorization: Bearer {{token}}
```

### 6. **Get Load History**

**Request:**
```http
GET {{baseUrl}}/loads/{{loadId}}/history?page=1&limit=10
Authorization: Bearer {{token}}
```

## 👥 User Management API Testing

### 1. **Create User**

**Request:**
```http
POST {{baseUrl}}/users
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "password": "securePassword123",
  "role": "dispatcher"
}
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439012",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "role": "dispatcher",
    "status": "active",
    "createdAt": "2024-02-01T00:00:00.000Z"
  },
  "message": "User created successfully"
}
```

### 2. **Get All Users**

**Request:**
```http
GET {{baseUrl}}/users?page=1&limit=10
Authorization: Bearer {{token}}
```

### 3. **Get User by ID**

**Request:**
```http
GET {{baseUrl}}/users/{{userId}}
Authorization: Bearer {{token}}
```

### 4. **Update User**

**Request:**
```http
PUT {{baseUrl}}/users/{{userId}}
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "jane.smith@example.com"
}
```

### 5. **Get Users by Role**

**Request:**
```http
GET {{baseUrl}}/users/role/dispatcher?page=1&limit=10
Authorization: Bearer {{token}}
```

### 6. **Update User Status**

**Request:**
```http
PUT {{baseUrl}}/users/{{userId}}/status
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "status": "inactive"
}
```

### 7. **Get User Profile**

**Request:**
```http
GET {{baseUrl}}/users/profile
Authorization: Bearer {{token}}
```

### 8. **Update User Profile**

**Request:**
```http
PUT {{baseUrl}}/users/profile
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "firstName": "Updated Name",
  "lastName": "Updated Last Name"
}
```

## 🔐 Authentication API Testing

### 1. **User Login**

**Request:**
```http
POST {{baseUrl}}/auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "adminPassword123"
}
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "507f1f77bcf86cd799439012",
      "firstName": "Admin",
      "lastName": "User",
      "email": "admin@example.com",
      "role": "admin"
    }
  },
  "message": "Login successful"
}
```

### 2. **User Registration**

**Request:**
```http
POST {{baseUrl}}/auth/register
Content-Type: application/json

{
  "firstName": "New",
  "lastName": "User",
  "email": "newuser@example.com",
  "password": "newPassword123",
  "role": "manager"
}
```

### 3. **Refresh Token**

**Request:**
```http
POST {{baseUrl}}/auth/refresh
Authorization: Bearer {{token}}
```

### 4. **Logout**

**Request:**
```http
POST {{baseUrl}}/auth/logout
Authorization: Bearer {{token}}
```

### 5. **Forgot Password**

**Request:**
```http
POST {{baseUrl}}/auth/forgot-password
Content-Type: application/json

{
  "email": "user@example.com"
}
```

### 6. **Reset Password**

**Request:**
```http
POST {{baseUrl}}/auth/reset-password
Content-Type: application/json

{
  "token": "reset_token_here",
  "password": "newPassword123"
}
```

## 📈 Statistics API Testing

### 1. **Get Load Statistics**

**Request:**
```http
GET {{baseUrl}}/stats/loads?period=month&startDate=2024-01-01&endDate=2024-01-31
Authorization: Bearer {{token}}
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "totalLoads": 150,
    "loadsByStatus": {
      "Listed": 45,
      "Dispatched": 60,
      "Picked up": 30,
      "Delivered": 15
    },
    "loadsByType": {
      "Cars": 80,
      "Boats": 40,
      "Motorcycles": 20,
      "RVs": 10
    },
    "revenue": {
      "total": 1500000,
      "average": 10000
    },
    "period": "month",
    "startDate": "2024-01-01",
    "endDate": "2024-01-31"
  }
}
```

### 2. **Get User Statistics**

**Request:**
```http
GET {{baseUrl}}/stats/users?period=week
Authorization: Bearer {{token}}
```

### 3. **Get Carrier Statistics**

**Request:**
```http
GET {{baseUrl}}/stats/carriers?period=month
Authorization: Bearer {{token}}
```

### 4. **Get Performance Metrics**

**Request:**
```http
GET {{baseUrl}}/stats/performance?period=month
Authorization: Bearer {{token}}
```

## 🧪 Testing Scenarios

### **Scenario 1: Complete Load Workflow**
1. Create a new load
2. Update load status to "Dispatched"
3. Generate BOL PDF
4. Generate Rate Confirmation PDF
5. Download both PDFs
6. Check load history

### **Scenario 2: User Management Workflow**
1. Create a new user
2. Login with new user
3. Get user profile
4. Update user profile
5. Change user status
6. Get users by role

### **Scenario 3: PDF Generation Testing**
1. Create a load with complete data
2. Generate BOL PDF
3. Generate Rate Confirmation PDF
4. Generate all documents
5. Download each PDF
6. Verify PDF content

### **Scenario 4: Statistics Testing**
1. Create multiple loads with different statuses
2. Get load statistics
3. Get user statistics
4. Get carrier statistics
5. Test different time periods

## 🚨 Error Testing

### **Test Invalid Requests**
1. **Invalid Load ID:**
   ```http
   GET {{baseUrl}}/loads/invalid-id/bol
   ```

2. **Missing Authentication:**
   ```http
   GET {{baseUrl}}/loads/{{loadId}}/bol
   # No Authorization header
   ```

3. **Invalid User Data:**
   ```http
   POST {{baseUrl}}/users
   Content-Type: application/json
   
   {
     "email": "invalid-email",
     "password": "123"
   }
   ```

4. **Unauthorized Access:**
   ```http
   GET {{baseUrl}}/loads/{{loadId}}/bol
   Authorization: Bearer invalid-token
   ```

## 📋 Postman Collection Structure

```
📁 CIERTA API Testing
├── 🔐 Authentication
│   ├── Login
│   ├── Register
│   ├── Refresh Token
│   ├── Logout
│   ├── Forgot Password
│   └── Reset Password
├── 👥 User Management
│   ├── Create User
│   ├── Get All Users
│   ├── Get User by ID
│   ├── Update User
│   ├── Get Users by Role
│   ├── Update User Status
│   ├── Get User Profile
│   └── Update User Profile
├── 📦 Load Management
│   ├── Create Load
│   ├── Get All Loads
│   ├── Get Load by ID
│   ├── Update Load
│   ├── Update Load Status
│   ├── Get Loads by Status
│   └── Get Load History
├── 📄 PDF Generation
│   ├── Generate BOL
│   ├── Generate Rate Confirmation
│   ├── Generate All Documents
│   └── Download PDF
└── 📊 Statistics
    ├── Load Statistics
    ├── User Statistics
    ├── Carrier Statistics
    └── Performance Metrics
```

## 🔧 Environment Setup

### **Development Environment**
```json
{
  "baseUrl": "http://localhost:5000",
  "token": "",
  "loadId": "",
  "userId": "",
  "adminEmail": "admin@example.com",
  "adminPassword": "adminPassword123"
}
```

### **Production Environment**
```json
{
  "baseUrl": "https://your-api-domain.com",
  "token": "",
  "loadId": "",
  "userId": "",
  "adminEmail": "admin@yourdomain.com",
  "adminPassword": "yourProductionPassword"
}
```

## 📝 Testing Checklist

### **PDF Generation Testing**
- [ ] Generate BOL with valid load ID
- [ ] Generate Rate Confirmation with valid load ID
- [ ] Generate all documents at once
- [ ] Download generated PDFs
- [ ] Test with different load statuses
- [ ] Test error handling for invalid load ID
- [ ] Test authentication requirements

### **Load Management Testing**
- [ ] Create load with complete data
- [ ] Create load with minimal data
- [ ] Update load status
- [ ] Get loads with pagination
- [ ] Get loads by status
- [ ] Get load history
- [ ] Test validation errors

### **User Management Testing**
- [ ] Create user with all roles
- [ ] Update user information
- [ ] Change user status
- [ ] Get users by role
- [ ] Test profile management
- [ ] Test authentication flows

### **Statistics Testing**
- [ ] Get load statistics for different periods
- [ ] Get user statistics
- [ ] Get carrier statistics
- [ ] Test performance metrics
- [ ] Test date range filtering

This comprehensive guide should help you test all API endpoints thoroughly! 🎉

