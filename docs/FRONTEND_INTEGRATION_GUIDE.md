# Frontend Integration Guide

Complete API integration documentation for **User**, **Carrier**, and **Customer** controllers.

## Table of Contents
1. [Common Information](#common-information)
2. [User API](#user-api)
3. [Carrier API](#carrier-api)
4. [Customer API](#customer-api)
5. [Error Handling](#error-handling)
6. [React Examples](#react-examples)

---

## Common Information

### Base URLs
- Users: `/users`
- Carriers: `/carriers`
- Customers: `/customers`

### Authentication
Most endpoints support JWT token authentication (currently commented out for testing):
```
Authorization: Bearer <your_jwt_token>
```

### Response Format
All successful responses follow this structure:
```json
{
  "success": true,
  "data": { /* response data */ },
  "message": "Success message",
  "pagination": { /* if applicable */ }
}
```

### Error Format
```json
{
  "success": false,
  "error": "Error type",
  "message": "Detailed error message",
  "details": { /* validation errors */ }
}
```

### Pagination
Most list endpoints support pagination:
- `page` (number, default: 1)
- `limit` (number, default: 10)
- `sortBy` (string, default: "createdAt")
- `sortOrder` (string: "asc" | "desc", default: "desc")

---

## User API

### User Model
```typescript
interface User {
  id: string;
  firstName: string;           // Required
  lastName: string;            // Required
  email: string;              // Required, unique, lowercase
  password: string;            // Required (hashed in DB, never returned)
  companyName?: string;
  profileImage?: string;       // File path/URL
  role: UserRole;             // Required
  status: UserStatus;         // Default: "active"
  createdAt: Date;
  updatedAt: Date;
}

type UserRole = 
  | "admin"
  | "manager"
  | "accountingManager"
  | "accountingIn"
  | "accountingOut"
  | "dispatcher"
  | "partner"
  | "BidAgent";

type UserStatus = "active" | "suspended";
```

### Endpoints

#### 1. Get All Users
**GET** `/users`

**Query Parameters:**
- `page`, `limit`, `sortBy`, `sortOrder`
- `search` (string) - Search in firstName, lastName, email, companyName

**Example:**
```javascript
fetch('/users?page=1&limit=20&search=john')
```

#### 2. Search Users
**GET** `/users/search`

**Query Parameters:**
- `q` (string) - General search term
- `firstName`, `lastName`, `email`, `companyName`, `role`, `status`
- `page`, `limit`, `sortBy`, `sortOrder`

**Example:**
```javascript
fetch('/users/search?role=dispatcher&status=active')
```

#### 3. Get Users by Role
**GET** `/users/role/:role`

**Example:**
```javascript
fetch('/users/role/dispatcher?page=1&limit=10')
```

#### 4. Get User by ID
**GET** `/users/:id`

#### 5. Get Current User Profile
**GET** `/users/profile` ⚠️ **Requires Authentication**

#### 6. Create User
**POST** `/users`

**Request Body (JSON or FormData):**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "password": "securePassword123",
  "role": "dispatcher",
  "companyName": "Acme Corp",
  "status": "active"
}
```

**Validation:**
- `firstName` (required, string)
- `lastName` (required, string)
- `email` (required, valid email, unique)
- `password` (required, string)
- `role` (required, one of: admin, manager, accountingManager, accountingIn, accountingOut, dispatcher, partner, BidAgent)

**File Upload:**
- Field: `profileImage` (single file)
- Use FormData for file uploads

**Example (FormData):**
```javascript
const formData = new FormData();
formData.append('firstName', 'John');
formData.append('lastName', 'Doe');
formData.append('email', 'john@example.com');
formData.append('password', 'password123');
formData.append('role', 'dispatcher');
formData.append('profileImage', fileInput.files[0]);

fetch('/users', {
  method: 'POST',
  body: formData
});
```

#### 7. Update User
**PUT** `/users/:id`

**Request Body:** Same as create (all fields optional)

**Example:**
```javascript
fetch('/users/64f2b8e4c91b7a0012d4a9ff', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    firstName: "Jane",
    lastName: "Smith"
  })
});
```

#### 8. Update User Status
**PUT** `/users/:id/status`

**Request Body:**
```json
{
  "status": "suspended"
}
```

#### 9. Update Current User Profile
**PUT** `/users/profile/:id` ⚠️ **Requires Authentication**

#### 10. Delete User
**DELETE** `/users/:id`

---

## Carrier API

### Carrier Model
```typescript
interface Carrier {
  id: string;
  name: string;                    // Required
  phoneNumber?: string;
  email?: string;                  // Unique (if provided)
  companyName?: string;
  mcNumber?: string;               // Unique (if provided)
  dotNumber?: string;              // Unique (if provided)
  address?: Address;
  emails?: string[];               // Array of additional emails
  photos?: string[];               // Array of photo URLs
  equipmentType?: string;
  size?: string;
  capabilities?: string[];         // Array of capabilities
  certifications?: string[];       // Array of certifications
  loads?: string[];                // Array of Load IDs
  createdAt: Date;
  updatedAt: Date;
}

interface Address {
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  name?: string;
  zip?: number;
  loc?: string;
  contactPhone?: string;
}
```

### Important Notes
- **Email, MC Number, and DOT Number must be unique** (if provided)
- Company name can be the same for different carriers
- Empty/null values are automatically filtered out

### Endpoints

#### 1. Get All Carriers
**GET** `/carriers`

**Query Parameters:**
- `page`, `limit`, `sortBy`, `sortOrder`
- `search` (string) - Search in name, companyName, mcNumber, dotNumber, equipmentType, size

**Example:**
```javascript
fetch('/carriers?page=1&limit=20&sortBy=createdAt&sortOrder=desc')
```

#### 2. Search Carriers
**GET** `/carriers/search`

**Query Parameters:**
- `companyName` (string) - Partial match, case-insensitive
- `mcNumber` (string) - Partial match, case-insensitive
- `dotNumber` (string) - Partial match, case-insensitive
- `q` (string) - General search (if no specific filters)
- `page`, `limit`, `sortBy`, `sortOrder`

**Example:**
```javascript
// Search by MC Number
fetch('/carriers/search?mcNumber=84984&page=1&limit=10')

// Search by email
fetch('/carriers/search?q=kbkg@mail.ru')

// Multiple filters
fetch('/carriers/search?dotNumber=6541654&mcNumber=84984&email=kbkg@mail.ru')
```

#### 3. Get Carrier by ID
**GET** `/carriers/:id`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "64f2b8e4c91b7a0012d4a9ff",
    "name": "Michael Johnson",
    "phoneNumber": "+1 (405) 555-0674",
    "email": "michael.johnson@fastlaneexpress.com",
    "companyName": "Fast Lane Express Trucking",
    "mcNumber": "MC789654",
    "dotNumber": "DOT4567890",
    "address": {
      "address": "2200 Truckers Way",
      "city": "Oklahoma City",
      "state": "OK",
      "zipCode": "73102"
    },
    "emails": ["dispatch@fastlaneexpress.com"],
    "photos": ["/uploads/carriers/photo1.jpg"],
    "equipmentType": "Semi Truck",
    "size": "53'",
    "capabilities": ["Lift Gate", "Team Drivers"],
    "certifications": ["HAZMAT", "SmartWay Certified"],
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

#### 4. Get Carrier Loads
**GET** `/carriers/:id/loads`

**Query Parameters:**
- `page`, `limit`

**Response:**
```json
{
  "success": true,
  "data": {
    "carrier": { /* carrier object */ },
    "loads": [ /* array of load objects */ ]
  },
  "pagination": {
    "total": 10,
    "totalPages": 1,
    "currentPage": 1,
    "limit": 10
  }
}
```

#### 5. Create Carrier
**POST** `/carriers`

**Request Body (JSON):**
```json
{
  "name": "Michael Johnson",
  "phoneNumber": "+1 (405) 555-0674",
  "email": "michael.johnson@fastlaneexpress.com",
  "companyName": "Fast Lane Express Trucking",
  "mcNumber": "MC789654",
  "dotNumber": "DOT4567890",
  "address": {
    "address": "2200 Truckers Way",
    "city": "Oklahoma City",
    "state": "OK",
    "zipCode": "73102"
  },
  "emails": [
    "dispatch@fastlaneexpress.com",
    "safety@fastlaneexpress.com"
  ],
  "photos": [
    "https://example.com/photo1.jpg"
  ],
  "equipmentType": "Semi Truck",
  "size": "53'",
  "capabilities": ["Lift Gate", "Team Drivers"],
  "certifications": ["HAZMAT", "SmartWay Certified"]
}
```

**Validation:**
- `name` (required, string)
- `email` (optional, but if provided must be unique)
- `mcNumber` (optional, but if provided must be unique)
- `dotNumber` (optional, but if provided must be unique)
- All other fields are optional

**Error Response (Duplicate):**
```json
{
  "success": false,
  "error": "Duplicate carrier",
  "message": "Carrier with email \"michael.johnson@fastlaneexpress.com\" already exists (Carrier: Michael Johnson)"
}
```

**Example:**
```javascript
fetch('/carriers', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: "Michael Johnson",
    email: "michael@example.com",
    mcNumber: "MC789654",
    dotNumber: "DOT4567890",
    companyName: "Fast Lane Express",
    address: {
      address: "2200 Truckers Way",
      city: "Oklahoma City",
      state: "OK",
      zipCode: "73102"
    },
    equipmentType: "Semi Truck",
    size: "53'",
    capabilities: ["Lift Gate", "Team Drivers"],
    certifications: ["HAZMAT"]
  })
});
```

#### 6. Update Carrier
**PUT** `/carriers/:id`

**Request Body:** Same as create (all fields optional)

**Important:** 
- Email, MC Number, and DOT Number are validated for uniqueness on update
- Only send fields you want to update

**Example:**
```javascript
fetch('/carriers/64f2b8e4c91b7a0012d4a9ff', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    phoneNumber: "+1 (405) 555-9999",
    equipmentType: "Flatbed Truck"
  })
});
```

#### 7. Delete Carrier
**DELETE** `/carriers/:id`

---

## Customer API

### Customer Model
```typescript
interface Customer {
  id: string;
  companyName: string;            // Required
  customerAddress: Address;       // Required
  emails?: string[];              // Array of email addresses
  phoneNumber?: string;
  loads?: string[];               // Array of Load IDs
  createdAt: Date;
  updatedAt: Date;
}

interface Address {
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  name?: string;
  zip?: number;
  loc?: string;
  contactPhone?: string;
}
```

### Endpoints

#### 1. Get All Customers
**GET** `/customers`

**Query Parameters:**
- `page`, `limit`, `sortBy`, `sortOrder`
- `search` (string) - Search in companyName, customerAddress.city, customerAddress.state

**Example:**
```javascript
fetch('/customers?page=1&limit=20')
```

#### 2. Search Customers
**GET** `/customers/search`

**Query Parameters:**
- `q` (string) - General search term
- `companyName`, `city`, `state` - Specific filters
- `page`, `limit`, `sortBy`, `sortOrder`

**Example:**
```javascript
fetch('/customers/search?companyName=Global&city=Springfield')
```

#### 3. Get Customer by ID
**GET** `/customers/:id`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "64f2b8e4c91b7a0012d4a9ff",
    "companyName": "Global Freight Solutions LLC",
    "customerAddress": {
      "address": "742 Evergreen Terrace",
      "city": "Springfield",
      "state": "IL",
      "zipCode": "62701"
    },
    "emails": [
      "logistics@globalfreight.com",
      "accounting@globalfreight.com"
    ],
    "phoneNumber": "+1 (217) 555-0123",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

#### 4. Get Customer Loads
**GET** `/customers/:id/loads`

**Query Parameters:**
- `page`, `limit`

**Response:**
```json
{
  "success": true,
  "data": {
    "customer": { /* customer object */ },
    "loads": [ /* array of load objects */ ]
  },
  "pagination": {
    "total": 15,
    "totalPages": 2,
    "currentPage": 1,
    "limit": 10
  }
}
```

#### 5. Create Customer
**POST** `/customers`

**Request Body (JSON):**
```json
{
  "companyName": "Global Freight Solutions LLC",
  "customerAddress": {
    "address": "742 Evergreen Terrace",
    "city": "Springfield",
    "state": "IL",
    "zipCode": "62701"
  },
  "emails": [
    "logistics@globalfreight.com",
    "accounting@globalfreight.com"
  ],
  "phoneNumber": "+1 (217) 555-0123"
}
```

**Validation:**
- `companyName` (required, string)
- `customerAddress` (required, object)
  - All address fields are optional, but address object is required

**Example:**
```javascript
fetch('/customers', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    companyName: "Global Freight Solutions LLC",
    customerAddress: {
      address: "742 Evergreen Terrace",
      city: "Springfield",
      state: "IL",
      zipCode: "62701"
    },
    emails: [
      "logistics@globalfreight.com",
      "accounting@globalfreight.com"
    ],
    phoneNumber: "+1 (217) 555-0123"
  })
});
```

#### 6. Update Customer
**PUT** `/customers/:id`

**Request Body:** Same as create (all fields optional)

**Example:**
```javascript
fetch('/customers/64f2b8e4c91b7a0012d4a9ff', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    companyName: "Updated Company Name",
    customerAddress: {
      city: "New City",
      state: "NY"
    }
  })
});
```

#### 7. Delete Customer
**DELETE** `/customers/:id`

---

## Error Handling

### Common Error Codes
- `400` - Bad Request (validation errors, duplicate entries)
- `401` - Unauthorized (missing or invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource doesn't exist)
- `409` - Conflict (duplicate unique field)
- `500` - Internal Server Error

### Error Response Examples

**Validation Error:**
```json
{
  "success": false,
  "error": "Validation failed",
  "details": {
    "firstName": "First name is required",
    "email": "Email must be a valid email address"
  }
}
```

**Duplicate Entry (Carrier):**
```json
{
  "success": false,
  "error": "Duplicate carrier",
  "message": "Carrier with email \"test@example.com\" already exists (Carrier: John Doe)"
}
```

**Not Found:**
```json
{
  "success": false,
  "error": "Carrier not found"
}
```

---

## React Examples

### React Hook Form - Create Carrier

```typescript
import { useForm } from 'react-hook-form';

interface CarrierFormData {
  name: string;
  email?: string;
  mcNumber?: string;
  dotNumber?: string;
  companyName?: string;
  phoneNumber?: string;
  address: {
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
  emails?: string[];
  equipmentType?: string;
  size?: string;
  capabilities?: string[];
  certifications?: string[];
}

const CreateCarrierForm = () => {
  const { register, handleSubmit, formState: { errors } } = useForm<CarrierFormData>();

  const onSubmit = async (data: CarrierFormData) => {
    try {
      const response = await fetch('/carriers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(data)
      });

      const result = await response.json();
      
      if (result.success) {
        console.log('Carrier created:', result.data);
        // Handle success (redirect, show message, etc.)
      } else {
        console.error('Error:', result.error, result.message);
        // Handle error (show error message)
      }
    } catch (error) {
      console.error('Network error:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input 
        {...register('name', { required: 'Name is required' })} 
        placeholder="Name *"
      />
      {errors.name && <span>{errors.name.message}</span>}

      <input 
        {...register('email', { 
          pattern: {
            value: /^\S+@\S+$/i,
            message: 'Invalid email format'
          }
        })} 
        type="email"
        placeholder="Email"
      />

      <input 
        {...register('mcNumber')} 
        placeholder="MC Number"
      />

      <input 
        {...register('dotNumber')} 
        placeholder="DOT Number"
      />

      <input 
        {...register('companyName')} 
        placeholder="Company Name"
      />

      <input 
        {...register('phoneNumber')} 
        placeholder="Phone Number"
      />

      <input 
        {...register('address.address')} 
        placeholder="Address"
      />

      <input 
        {...register('address.city')} 
        placeholder="City"
      />

      <input 
        {...register('address.state')} 
        placeholder="State"
      />

      <input 
        {...register('address.zipCode')} 
        placeholder="Zip Code"
      />

      <input 
        {...register('equipmentType')} 
        placeholder="Equipment Type"
      />

      <input 
        {...register('size')} 
        placeholder="Size"
      />

      <button type="submit">Create Carrier</button>
    </form>
  );
};
```

### React Hook Form - Create Customer

```typescript
interface CustomerFormData {
  companyName: string;
  customerAddress: {
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
  emails?: string[];
  phoneNumber?: string;
}

const CreateCustomerForm = () => {
  const { register, handleSubmit, formState: { errors } } = useForm<CustomerFormData>();

  const onSubmit = async (data: CustomerFormData) => {
    try {
      const response = await fetch('/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(data)
      });

      const result = await response.json();
      
      if (result.success) {
        console.log('Customer created:', result.data);
      } else {
        console.error('Error:', result.error);
      }
    } catch (error) {
      console.error('Network error:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input 
        {...register('companyName', { required: 'Company name is required' })} 
        placeholder="Company Name *"
      />
      {errors.companyName && <span>{errors.companyName.message}</span>}

      <input 
        {...register('customerAddress.address')} 
        placeholder="Address"
      />

      <input 
        {...register('customerAddress.city')} 
        placeholder="City"
      />

      <input 
        {...register('customerAddress.state')} 
        placeholder="State"
      />

      <input 
        {...register('customerAddress.zipCode')} 
        placeholder="Zip Code"
      />

      <input 
        {...register('phoneNumber')} 
        placeholder="Phone Number"
      />

      <button type="submit">Create Customer</button>
    </form>
  );
};
```

### Search Carriers with Filters

```typescript
const SearchCarriers = () => {
  const [filters, setFilters] = useState({
    companyName: '',
    mcNumber: '',
    dotNumber: '',
    email: ''
  });
  const [carriers, setCarriers] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      
      if (filters.companyName) queryParams.append('companyName', filters.companyName);
      if (filters.mcNumber) queryParams.append('mcNumber', filters.mcNumber);
      if (filters.dotNumber) queryParams.append('dotNumber', filters.dotNumber);
      if (filters.email) queryParams.append('q', filters.email);
      
      queryParams.append('page', '1');
      queryParams.append('limit', '10');

      const response = await fetch(`/carriers/search?${queryParams.toString()}`);
      const result = await response.json();

      if (result.success) {
        setCarriers(result.data);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <input
        placeholder="Company Name"
        value={filters.companyName}
        onChange={(e) => setFilters({ ...filters, companyName: e.target.value })}
      />
      <input
        placeholder="MC Number"
        value={filters.mcNumber}
        onChange={(e) => setFilters({ ...filters, mcNumber: e.target.value })}
      />
      <input
        placeholder="DOT Number"
        value={filters.dotNumber}
        onChange={(e) => setFilters({ ...filters, dotNumber: e.target.value })}
      />
      <input
        placeholder="Email"
        value={filters.email}
        onChange={(e) => setFilters({ ...filters, email: e.target.value })}
      />
      <button onClick={handleSearch} disabled={loading}>
        Search
      </button>

      {carriers.map(carrier => (
        <div key={carrier.id}>
          <h3>{carrier.name}</h3>
          <p>{carrier.companyName}</p>
          <p>MC: {carrier.mcNumber}</p>
          <p>DOT: {carrier.dotNumber}</p>
        </div>
      ))}
    </div>
  );
};
```

---

## Summary Table

### User Endpoints
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/users` | Optional | Get all users |
| GET | `/users/search` | Optional | Search users |
| GET | `/users/role/:role` | Optional | Get users by role |
| GET | `/users/:id` | Optional | Get user by ID |
| GET | `/users/profile` | **Yes** | Get current user |
| POST | `/users` | Optional | Create user |
| PUT | `/users/:id` | Optional | Update user |
| PUT | `/users/:id/status` | Optional | Update status |
| PUT | `/users/profile/:id` | **Yes** | Update own profile |
| DELETE | `/users/:id` | Optional | Delete user |

### Carrier Endpoints
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/carriers` | Optional | Get all carriers |
| GET | `/carriers/search` | Optional | Search carriers |
| GET | `/carriers/:id` | Optional | Get carrier by ID |
| GET | `/carriers/:id/loads` | Optional | Get carrier loads |
| POST | `/carriers` | Optional | Create carrier |
| PUT | `/carriers/:id` | Optional | Update carrier |
| DELETE | `/carriers/:id` | Optional | Delete carrier |

### Customer Endpoints
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/customers` | Optional | Get all customers |
| GET | `/customers/search` | Optional | Search customers |
| GET | `/customers/:id` | Optional | Get customer by ID |
| GET | `/customers/:id/loads` | Optional | Get customer loads |
| POST | `/customers` | Optional | Create customer |
| PUT | `/customers/:id` | Optional | Update customer |
| DELETE | `/customers/:id` | Optional | Delete customer |

---

## Important Notes

1. **Unique Fields:**
   - **User:** email must be unique
   - **Carrier:** email, mcNumber, dotNumber must be unique (if provided)
   - **Customer:** No unique constraints

2. **Data Filtering:**
   - Empty/null values are automatically filtered out
   - Only send fields you want to update

3. **File Uploads:**
   - Use FormData for file uploads (User profileImage)
   - Don't set Content-Type header when using FormData

4. **Password Handling:**
   - Passwords are automatically hashed
   - Never returned in responses
   - Only required on user creation

5. **Search Functionality:**
   - Carrier search supports specific filters (companyName, mcNumber, dotNumber)
   - Use `q` parameter for general search
   - All searches are case-insensitive and support partial matching
