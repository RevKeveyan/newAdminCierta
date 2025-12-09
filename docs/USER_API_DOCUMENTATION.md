# User API Documentation

Complete guide for frontend developers to interact with the User API endpoints.

## Base URL
```
/users
```

## Authentication
Most endpoints require authentication via JWT token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

**Note:** Some endpoints have authentication commented out for testing. Check the route file for current authentication requirements.

---

## User Model Structure

```typescript
interface User {
  id: string;                    // MongoDB ObjectId
  firstName: string;             // Required
  lastName: string;              // Required
  email: string;                 // Required, unique, lowercase
  password: string;              // Required (hashed in DB)
  companyName?: string;          // Optional
  profileImage?: string;         // Optional (file path/URL)
  role: UserRole;                // Required, see roles below
  status: UserStatus;            // Default: "active"
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

---

## API Endpoints

### 1. Get All Users

**GET** `/users`

Get a paginated list of all users.

**Query Parameters:**
- `page` (number, default: 1) - Page number
- `limit` (number, default: 10) - Items per page
- `sortBy` (string, default: "createdAt") - Field to sort by
- `sortOrder` (string, default: "desc") - Sort order: "asc" or "desc"
- `search` (string, optional) - Search term for firstName, lastName, email, companyName

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "64f2b8e4c91b7a0012d4a9ff",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john.doe@example.com",
      "companyName": "Acme Corp",
      "role": "admin",
      "status": "active",
      "profileImage": "/uploads/users/avatar.jpg",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "total": 100,
    "totalPages": 10,
    "currentPage": 1,
    "limit": 10
  }
}
```

**Example Request:**
```javascript
// Fetch users with pagination
fetch('/users?page=1&limit=20&sortBy=createdAt&sortOrder=desc', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_jwt_token'
  }
})
```

---

### 2. Search Users

**GET** `/users/search`

Advanced search for users with multiple filters.

**Query Parameters:**
- `q` (string, optional) - General search term
- `firstName` (string, optional) - Filter by first name
- `lastName` (string, optional) - Filter by last name
- `email` (string, optional) - Filter by email
- `companyName` (string, optional) - Filter by company name
- `role` (string, optional) - Filter by role
- `status` (string, optional) - Filter by status
- `page` (number, default: 1)
- `limit` (number, default: 10)
- `sortBy` (string, default: "createdAt")
- `sortOrder` (string, default: "desc")

**Response:**
Same structure as "Get All Users"

**Example Request:**
```javascript
// Search for users by email
fetch('/users/search?email=john@example.com&page=1&limit=10', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_jwt_token'
  }
})
```

---

### 3. Get Users by Role

**GET** `/users/role/:role`

Get all users with a specific role.

**URL Parameters:**
- `role` (string, required) - One of: admin, manager, accountingManager, accountingIn, accountingOut, dispatcher, partner, BidAgent

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 10)

**Response:**
Same structure as "Get All Users"

**Example Request:**
```javascript
// Get all dispatchers
fetch('/users/role/dispatcher?page=1&limit=20', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_jwt_token'
  }
})
```

---

### 4. Get User by ID

**GET** `/users/:id`

Get a single user by ID.

**URL Parameters:**
- `id` (string, required) - User MongoDB ObjectId

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "64f2b8e4c91b7a0012d4a9ff",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "companyName": "Acme Corp",
    "role": "admin",
    "status": "active",
    "profileImage": "/uploads/users/avatar.jpg",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Example Request:**
```javascript
fetch('/users/64f2b8e4c91b7a0012d4a9ff', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_jwt_token'
  }
})
```

---

### 5. Get Current User Profile

**GET** `/users/profile`

Get the authenticated user's profile. **Requires authentication.**

**Response:**
Same structure as "Get User by ID"

**Example Request:**
```javascript
fetch('/users/profile', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your_jwt_token'
  }
})
```

---

### 6. Create User

**POST** `/users`

Create a new user. Supports file upload for profile image.

**Request Body (JSON):**
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

**Validation Rules:**
- `firstName` (required, string)
- `lastName` (required, string)
- `email` (required, valid email format, unique)
- `password` (required, string)
- `role` (required, must be one of: admin, manager, accountingManager, accountingIn, accountingOut, dispatcher, partner, BidAgent)
- `companyName` (optional, string)
- `status` (optional, default: "active")

**File Upload:**
- Field name: `profileImage` (single file)
- Supported formats: Check upload middleware configuration
- File is saved to `uploads/users/` directory

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "64f2b8e4c91b7a0012d4a9ff",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "companyName": "Acme Corp",
    "role": "dispatcher",
    "status": "active",
    "profileImage": "/uploads/users/avatar.jpg",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  },
  "message": "User created successfully"
}
```

**Example Request (JSON only):**
```javascript
fetch('/users', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your_jwt_token'
  },
  body: JSON.stringify({
    firstName: "John",
    lastName: "Doe",
    email: "john.doe@example.com",
    password: "securePassword123",
    role: "dispatcher",
    companyName: "Acme Corp"
  })
})
```

**Example Request (with file upload - FormData):**
```javascript
const formData = new FormData();
formData.append('firstName', 'John');
formData.append('lastName', 'Doe');
formData.append('email', 'john.doe@example.com');
formData.append('password', 'securePassword123');
formData.append('role', 'dispatcher');
formData.append('companyName', 'Acme Corp');
formData.append('profileImage', fileInput.files[0]); // File input

fetch('/users', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your_jwt_token'
    // Don't set Content-Type header - browser will set it with boundary
  },
  body: formData
})
```

**React Hook Form Example:**
```javascript
const { register, handleSubmit, formState: { errors } } = useForm();

const onSubmit = async (data) => {
  const formData = new FormData();
  
  // Add all form fields
  Object.keys(data).forEach(key => {
    if (key !== 'profileImage' && data[key]) {
      formData.append(key, data[key]);
    }
  });
  
  // Add file if selected
  if (data.profileImage && data.profileImage[0]) {
    formData.append('profileImage', data.profileImage[0]);
  }
  
  try {
    const response = await fetch('/users', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });
    
    const result = await response.json();
    if (result.success) {
      console.log('User created:', result.data);
    }
  } catch (error) {
    console.error('Error creating user:', error);
  }
};

// In JSX:
<form onSubmit={handleSubmit(onSubmit)}>
  <input {...register('firstName', { required: true })} />
  <input {...register('lastName', { required: true })} />
  <input {...register('email', { required: true, pattern: /^\S+@\S+$/i })} />
  <input {...register('password', { required: true })} type="password" />
  <select {...register('role', { required: true })}>
    <option value="admin">Admin</option>
    <option value="manager">Manager</option>
    <option value="accountingManager">Accounting Manager</option>
    <option value="accountingIn">Accounting In</option>
    <option value="accountingOut">Accounting Out</option>
    <option value="dispatcher">Dispatcher</option>
    <option value="partner">Partner</option>
    <option value="BidAgent">Bid Agent</option>
  </select>
  <input {...register('profileImage')} type="file" accept="image/*" />
  <button type="submit">Create User</button>
</form>
```

---

### 7. Update User

**PUT** `/users/:id`

Update an existing user. Supports file upload for profile image.

**URL Parameters:**
- `id` (string, required) - User MongoDB ObjectId

**Request Body (JSON or FormData):**
```json
{
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "jane.smith@example.com",
  "password": "newPassword123",  // Optional - only if changing password
  "role": "manager",
  "companyName": "New Company",
  "status": "active"
}
```

**Validation Rules:**
- All fields are optional (only send fields you want to update)
- `email` must be valid email format if provided
- `role` must be one of the valid roles if provided
- `password` will be hashed automatically if provided

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "64f2b8e4c91b7a0012d4a9ff",
    "firstName": "Jane",
    "lastName": "Smith",
    "email": "jane.smith@example.com",
    "role": "manager",
    "status": "active",
    "profileImage": "/uploads/users/new-avatar.jpg",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-16T14:20:00.000Z"
  },
  "message": "User updated successfully"
}
```

**Example Request (JSON):**
```javascript
fetch('/users/64f2b8e4c91b7a0012d4a9ff', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your_jwt_token'
  },
  body: JSON.stringify({
    firstName: "Jane",
    lastName: "Smith",
    email: "jane.smith@example.com"
  })
})
```

**Example Request (with file upload):**
```javascript
const formData = new FormData();
formData.append('firstName', 'Jane');
formData.append('lastName', 'Smith');
formData.append('profileImage', fileInput.files[0]);

fetch('/users/64f2b8e4c91b7a0012d4a9ff', {
  method: 'PUT',
  headers: {
    'Authorization': 'Bearer your_jwt_token'
  },
  body: formData
})
```

---

### 8. Update User Status

**PUT** `/users/:id/status`

Update only the user's status (active/suspended).

**URL Parameters:**
- `id` (string, required) - User MongoDB ObjectId

**Request Body:**
```json
{
  "status": "suspended"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "64f2b8e4c91b7a0012d4a9ff",
    "status": "suspended",
    // ... other user fields
  },
  "message": "User status updated successfully"
}
```

**Example Request:**
```javascript
fetch('/users/64f2b8e4c91b7a0012d4a9ff/status', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your_jwt_token'
  },
  body: JSON.stringify({
    status: "suspended"
  })
})
```

---

### 9. Update Current User Profile

**PUT** `/users/profile/:id`

Update the authenticated user's own profile. **Requires authentication.**

**URL Parameters:**
- `id` (string, required) - User MongoDB ObjectId (must match authenticated user)

**Request Body:**
Same as "Update User" endpoint

**Response:**
Same as "Update User" endpoint

**Example Request:**
```javascript
const formData = new FormData();
formData.append('firstName', 'Updated Name');
formData.append('profileImage', fileInput.files[0]);

fetch('/users/profile/64f2b8e4c91b7a0012d4a9ff', {
  method: 'PUT',
  headers: {
    'Authorization': 'Bearer your_jwt_token'
  },
  body: formData
})
```

---

### 10. Delete User

**DELETE** `/users/:id`

Delete a user by ID.

**URL Parameters:**
- `id` (string, required) - User MongoDB ObjectId

**Response:**
```json
{
  "success": true,
  "message": "User deleted successfully"
}
```

**Example Request:**
```javascript
fetch('/users/64f2b8e4c91b7a0012d4a9ff', {
  method: 'DELETE',
  headers: {
    'Authorization': 'Bearer your_jwt_token'
  }
})
```

---

## Error Responses

All endpoints return errors in the following format:

```json
{
  "success": false,
  "error": "Error type",
  "message": "Detailed error message",
  "details": {
    // Validation errors or additional details
  }
}
```

### Common Error Codes:
- `400` - Bad Request (validation errors, invalid data)
- `401` - Unauthorized (missing or invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (user doesn't exist)
- `409` - Conflict (duplicate email)
- `500` - Internal Server Error

### Example Error Response:
```json
{
  "success": false,
  "error": "Validation failed",
  "details": {
    "email": "Email is required",
    "role": "Role must be one of: admin, manager, accountingManager, accountingIn, accountingOut, dispatcher, partner, BidAgent"
  }
}
```

---

## Important Notes

1. **Password Handling:**
   - Passwords are automatically hashed using bcrypt (8 rounds)
   - Never send passwords in GET requests
   - Passwords are never returned in responses

2. **File Uploads:**
   - Use `FormData` for file uploads
   - Don't set `Content-Type` header when using FormData (browser sets it automatically)
   - Profile images are saved to `uploads/users/` directory

3. **Email Uniqueness:**
   - Email addresses must be unique across all users
   - Emails are automatically converted to lowercase

4. **Authentication:**
   - Most endpoints require JWT token in Authorization header
   - Token is obtained from login endpoint (see Auth documentation)

5. **Pagination:**
   - Default page size is 10
   - Use `page` and `limit` query parameters for pagination
   - Response includes pagination metadata

6. **Data Filtering:**
   - Only changed fields are updated (no need to send all fields)
   - Empty/null values are filtered out automatically

---

## Frontend Integration Examples

### React Hook Form with TypeScript

```typescript
import { useForm } from 'react-hook-form';

interface UserFormData {
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  role: string;
  companyName?: string;
  profileImage?: FileList;
}

const CreateUserForm = () => {
  const { register, handleSubmit, formState: { errors } } = useForm<UserFormData>();

  const onSubmit = async (data: UserFormData) => {
    const formData = new FormData();
    
    Object.keys(data).forEach(key => {
      if (key !== 'profileImage' && data[key as keyof UserFormData]) {
        formData.append(key, String(data[key as keyof UserFormData]));
      }
    });
    
    if (data.profileImage && data.profileImage[0]) {
      formData.append('profileImage', data.profileImage[0]);
    }
    
    try {
      const response = await fetch('/users', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });
      
      const result = await response.json();
      if (result.success) {
        console.log('User created:', result.data);
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
        {...register('firstName', { required: 'First name is required' })} 
        placeholder="First Name"
      />
      {errors.firstName && <span>{errors.firstName.message}</span>}
      
      <input 
        {...register('lastName', { required: 'Last name is required' })} 
        placeholder="Last Name"
      />
      
      <input 
        {...register('email', { 
          required: 'Email is required',
          pattern: {
            value: /^\S+@\S+$/i,
            message: 'Invalid email format'
          }
        })} 
        type="email"
        placeholder="Email"
      />
      
      <input 
        {...register('password', { required: 'Password is required' })} 
        type="password"
        placeholder="Password"
      />
      
  <select {...register('role', { required: 'Role is required' })}>
    <option value="">Select Role</option>
    <option value="admin">Admin</option>
    <option value="manager">Manager</option>
    <option value="accountingManager">Accounting Manager</option>
    <option value="accountingIn">Accounting In</option>
    <option value="accountingOut">Accounting Out</option>
    <option value="dispatcher">Dispatcher</option>
    <option value="partner">Partner</option>
    <option value="BidAgent">Bid Agent</option>
  </select>
      
      <input 
        {...register('companyName')} 
        placeholder="Company Name (optional)"
      />
      
      <input 
        {...register('profileImage')} 
        type="file"
        accept="image/*"
      />
      
      <button type="submit">Create User</button>
    </form>
  );
};
```

---

## Testing with Postman

1. **Create User (with file):**
   - Method: POST
   - URL: `http://localhost:PORT/users`
   - Body: form-data
   - Fields:
     - `firstName`: John
     - `lastName`: Doe
     - `email`: john@example.com
     - `password`: password123
     - `role`: dispatcher
     - `profileImage`: (File) select image file

2. **Get All Users:**
   - Method: GET
   - URL: `http://localhost:PORT/users?page=1&limit=10`
   - Headers: `Authorization: Bearer <token>`

3. **Update User:**
   - Method: PUT
   - URL: `http://localhost:PORT/users/:id`
   - Body: JSON or form-data
   - Headers: `Authorization: Bearer <token>`

---

## Summary Table

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | `/users` | Optional | Get all users (paginated) |
| GET | `/users/search` | Optional | Search users |
| GET | `/users/role/:role` | Optional | Get users by role |
| GET | `/users/:id` | Optional | Get user by ID |
| GET | `/users/profile` | **Yes** | Get current user profile |
| POST | `/users` | Optional | Create new user |
| PUT | `/users/:id` | Optional | Update user |
| PUT | `/users/:id/status` | Optional | Update user status |
| PUT | `/users/profile/:id` | **Yes** | Update own profile |
| DELETE | `/users/:id` | Optional | Delete user |

