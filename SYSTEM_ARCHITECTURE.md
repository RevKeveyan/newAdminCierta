# 🏗️ System Architecture Diagram

## 📊 **High-Level Architecture**

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser/App)                    │
└─────────────────────┬───────────────────────────────────────────┘
                      │ HTTP Requests (GET, POST, PUT, DELETE)
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXPRESS SERVER (Port 5000)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────┐ │
│  │   Routes    │  │ Middleware  │  │ Controllers │  │ Services│ │
│  │             │  │             │  │             │  │         │ │
│  │ /loads      │  │ Auth        │  │ LoadCtrl    │  │ Cache   │ │
│  │ /users      │  │ Validation  │  │ UserCtrl    │  │ Stats   │ │
│  │ /stats      │  │ Rate Limit  │  │ StatsCtrl   │  │ S3      │ │
│  │ /auth       │  │ CORS        │  │ AuthCtrl    │  │ Mailer  │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────┘ │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                        DATA LAYER                               │
│  ┌─────────────────┐              ┌─────────────────────────┐   │
│  │   MONGODB       │              │        REDIS            │   │
│  │   (Primary DB)  │              │      (Cache)            │   │
│  │                 │              │                         │   │
│  │ • users         │              │ • API Response Cache    │   │
│  │ • loads         │              │ • Session Storage       │   │
│  │ • reviews       │              │ • Temporary Data        │   │
│  │ • stats         │              │ • Performance Boost     │   │
│  └─────────────────┘              └─────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## 🔄 **Request Flow Example**

### **1. User Login Request**
```
Client → POST /auth/login → Express → AuthController → MongoDB → JWT → Redis → Response
```

### **2. Get Loads with Caching**
```
Client → GET /loads → Express → LoadController → Redis (check cache) → MongoDB (if not cached) → Cache result → Response
```

### **3. File Upload**
```
Client → POST /loads/upload → Express → UploadMiddleware → S3Service → AWS S3 → Response
```

## 🗂️ **File Structure & Responsibilities**

```
newAdminCierta/
├── app.js                    # 🚀 Main server entry point
├── package.json              # 📦 Dependencies
├── .env                      # ⚙️ Environment configuration
│
├── routes/                   # 🛣️ API Routes
│   ├── authRoutes.js         # Authentication endpoints
│   ├── loadRoutes.js         # Load management endpoints
│   ├── userRoutes.js         # User management endpoints
│   └── ststsRoutes.js        # Statistics endpoints
│
├── controllers/              # 🎮 Business Logic
│   ├── AuthController.js     # Login, register, JWT
│   ├── LoadController.js     # Load CRUD operations
│   ├── UserController.js     # User management
│   └── StatsController.js   # Analytics and statistics
│
├── services/                 # 🔧 Data Services
│   ├── cacheService.js       # Redis caching
│   ├── statsService.js       # Statistics calculations
│   └── s3Service.js          # File storage
│
├── models/                   # 🗄️ Database Models
│   ├── User.js               # User schema
│   ├── Load.js               # Load schema
│   └── subModels/            # Related schemas
│
├── middlewares/              # 🛡️ Security & Validation
│   ├── authMiddleware.js     # JWT verification
│   ├── roleMiddleware.js     # Permission checks
│   └── uploadMiddleware.js   # File upload handling
│
└── config/                   # ⚙️ Configuration
    ├── database.js           # MongoDB connection
    └── databaseIndexes.js    # Database optimization
```

## 🔄 **Data Flow in Detail**

### **Step 1: Request Arrives**
```
HTTP Request → Express Server → Route Matching
```

### **Step 2: Middleware Processing**
```
Authentication → Validation → Rate Limiting → CORS
```

### **Step 3: Controller Logic**
```
Business Logic → Data Validation → Permission Checks
```

### **Step 4: Service Layer**
```
Cache Check → Database Query → Data Processing
```

### **Step 5: Response**
```
Data Formatting → Cache Update → HTTP Response
```

## 🎯 **Key Components Explained**

### **1. Express Server (`app.js`)**
- **Purpose**: Main application server
- **Port**: 5000
- **Features**: CORS, rate limiting, compression, security headers

### **2. Routes (`routes/`)**
- **Purpose**: Define API endpoints
- **Structure**: RESTful API design
- **Examples**: `/loads`, `/users`, `/auth`, `/stats`

### **3. Controllers (`controllers/`)**
- **Purpose**: Handle business logic
- **Responsibilities**: Request processing, data validation, response formatting

### **4. Services (`services/`)**
- **Purpose**: Data operations and external integrations
- **CacheService**: Redis operations
- **StatsService**: Analytics calculations
- **S3Service**: File storage

### **5. Models (`models/`)**
- **Purpose**: Database schemas and data validation
- **Technology**: Mongoose ODM
- **Features**: Validation, indexing, relationships

## 🔐 **Security Architecture**

### **Authentication Flow**
```
1. User Login → Credentials Check → JWT Generation → Session Storage
2. Protected Request → JWT Verification → Permission Check → Process Request
```

### **Authorization Levels**
```
Public Routes: /health, /auth/login
Protected Routes: /loads, /users (require JWT)
Admin Routes: /stats, /admin (require admin role)
```

## 📊 **Performance Optimization**

### **Caching Strategy**
```
Frequently Accessed Data → Redis Cache → Fast Response
Database Query → Cache Result → Next Request Uses Cache
```

### **Database Optimization**
```
Indexes → Fast Queries
Connection Pooling → Efficient Connections
Query Optimization → Reduced Response Time
```

## 🚀 **Scaling Architecture**

### **Current Setup (Development)**
```
Single Server → MongoDB Atlas → Redis Local
```

### **Production Setup (Recommended)**
```
Load Balancer → Multiple Servers → Database Cluster → Cache Cluster
```

## 🔧 **Configuration Management**

### **Environment Variables**
```env
# Server
PORT=5000
NODE_ENV=development

# Database
MONGO_URI=mongodb+srv://...
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=your_secret
JWT_EXPIRE=7d
```

## 🎯 **How Everything Works Together**

1. **Client** makes HTTP request to your server
2. **Express** receives request and routes it to appropriate handler
3. **Middleware** processes authentication, validation, rate limiting
4. **Controller** handles business logic and calls services
5. **Service** checks cache first, then database if needed
6. **Database** stores/retrieves data as needed
7. **Cache** stores frequently accessed data for performance
8. **Response** is sent back to client

This architecture provides:
- ✅ **Scalability**: Can handle more users
- ✅ **Performance**: Fast responses with caching
- ✅ **Security**: Multiple protection layers
- ✅ **Maintainability**: Clear separation of concerns
- ✅ **Reliability**: Error handling and fallbacks

















