# Postman Setup Guide - CIERTA API Testing

## 🚀 Quick Setup

### 1. **Import Collection**
1. Open Postman
2. Click "Import" button
3. Select `CIERTA_API_Collection.postman_collection.json`
4. Click "Import"

### 2. **Import Environment**
1. Click "Import" button
2. Select `CIERTA_API_Environment.postman_environment.json`
3. Click "Import"
4. Select "CIERTA API Environment" from environment dropdown

### 3. **Configure Environment Variables**
Update these variables in your environment:

```json
{
  "baseUrl": "http://localhost:5000",        // Your API URL
  "token": "",                               // Will be set after login
  "loadId": "",                              // Will be set after creating load
  "userId": "",                              // Will be set after creating user
  "filename": "",                            // Will be set after PDF generation
  "adminEmail": "admin@example.com",         // Your admin email
  "adminPassword": "adminPassword123"         // Your admin password
}
```

## 🧪 Testing Workflow

### **Step 1: Authentication**
1. **Login** - Use the Login request to get your token
2. **Copy Token** - Copy the token from response
3. **Set Token** - Paste token into environment variable `token`

### **Step 2: Create Test Data**
1. **Create User** - Create a test user
2. **Copy User ID** - Copy user ID from response
3. **Set User ID** - Paste into environment variable `userId`

### **Step 3: Create Load**
1. **Create Load** - Create a test load with complete data
2. **Copy Load ID** - Copy load ID from response
3. **Set Load ID** - Paste into environment variable `loadId`

### **Step 4: Test PDF Generation**
1. **Generate BOL** - Test BOL generation
2. **Copy Filename** - Copy filename from response
3. **Set Filename** - Paste into environment variable `filename`
4. **Download PDF** - Test PDF download

### **Step 5: Test All Endpoints**
1. **User Management** - Test all user endpoints
2. **Load Management** - Test all load endpoints
3. **Statistics** - Test all statistics endpoints

## 📋 Testing Checklist

### **Authentication Testing**
- [ ] Login with valid credentials
- [ ] Login with invalid credentials
- [ ] Register new user
- [ ] Refresh token
- [ ] Logout

### **User Management Testing**
- [ ] Create user with all roles (admin, dispatcher, manager)
- [ ] Get all users with pagination
- [ ] Get user by ID
- [ ] Update user information
- [ ] Get users by role
- [ ] Update user status
- [ ] Get user profile
- [ ] Update user profile

### **Load Management Testing**
- [ ] Create load with complete data
- [ ] Create load with minimal data
- [ ] Get all loads with pagination
- [ ] Get load by ID
- [ ] Update load information
- [ ] Update load status
- [ ] Get loads by status
- [ ] Get load history

### **PDF Generation Testing**
- [ ] Generate BOL PDF
- [ ] Generate Rate Confirmation PDF
- [ ] Generate all documents
- [ ] Download generated PDFs
- [ ] Test with different load statuses
- [ ] Test error handling

### **Statistics Testing**
- [ ] Get load statistics (different periods)
- [ ] Get user statistics
- [ ] Get carrier statistics
- [ ] Get performance metrics
- [ ] Test date range filtering

## 🔧 Environment Configuration

### **Development Environment**
```json
{
  "baseUrl": "http://localhost:5000",
  "token": "",
  "loadId": "",
  "userId": "",
  "filename": "",
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
  "filename": "",
  "adminEmail": "admin@yourdomain.com",
  "adminPassword": "yourProductionPassword"
}
```

## 🚨 Common Issues & Solutions

### **Issue 1: Authentication Failed**
**Problem:** Getting 401 Unauthorized errors
**Solution:** 
1. Make sure you're logged in
2. Check that token is set in environment
3. Verify token hasn't expired

### **Issue 2: PDF Generation Failed**
**Problem:** PDF generation returns error
**Solution:**
1. Make sure you have a valid load ID
2. Check that load has complete data
3. Verify server is running

### **Issue 3: Environment Variables Not Working**
**Problem:** Variables not being substituted
**Solution:**
1. Make sure environment is selected
2. Check variable names match exactly
3. Restart Postman if needed

### **Issue 4: CORS Errors**
**Problem:** CORS policy errors
**Solution:**
1. Make sure server CORS is configured
2. Check allowed origins in server config
3. Use correct base URL

## 📊 Test Data Examples

### **Complete Load Data**
```json
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

### **User Data**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "password": "securePassword123",
  "role": "dispatcher"
}
```

## 🎯 Testing Scenarios

### **Scenario 1: Complete Workflow**
1. Login → Get token
2. Create user → Get user ID
3. Create load → Get load ID
4. Generate BOL → Get filename
5. Download PDF
6. Update load status
7. Generate Rate Confirmation
8. Download PDF

### **Scenario 2: Error Handling**
1. Test with invalid credentials
2. Test with invalid load ID
3. Test with missing authentication
4. Test with invalid data

### **Scenario 3: Performance Testing**
1. Create multiple loads
2. Generate multiple PDFs
3. Test pagination
4. Test statistics with large datasets

## 📝 Notes

- **Always test with valid data first**
- **Check response status codes**
- **Verify response structure**
- **Test error scenarios**
- **Document any issues found**

This setup guide should help you test all API endpoints thoroughly! 🎉
















