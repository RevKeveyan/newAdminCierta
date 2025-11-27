# 🔧 Redis Local Setup Guide

Since Docker Desktop is having issues, let's set up Redis locally for development.

## 🚀 **Option 1: Download Redis for Windows (Easiest)**

### **Step 1: Download Redis**
1. **Go to**: https://github.com/microsoftarchive/redis/releases
2. **Download**: `Redis-x64-3.0.504.msi` (or latest version)
3. **Install** the downloaded file

### **Step 2: Start Redis**
1. **Open Command Prompt as Administrator**
2. **Navigate to Redis installation** (usually `C:\Program Files\Redis`)
3. **Run**: `redis-server.exe`

### **Step 3: Test Redis**
```bash
# In another terminal
redis-cli ping
# Should return: PONG
```

## 🚀 **Option 2: Use WSL2 (Windows Subsystem for Linux)**

### **Step 1: Install WSL2**
```powershell
# Run in PowerShell as Administrator
wsl --install
```

### **Step 2: Install Redis in WSL2**
```bash
# Open WSL2 terminal
sudo apt update
sudo apt install redis-server
```

### **Step 3: Start Redis**
```bash
# Start Redis
redis-server

# Test Redis
redis-cli ping
```

## 🚀 **Option 3: Use Chocolatey Package Manager**

### **Step 1: Install Chocolatey**
```powershell
# Run in PowerShell as Administrator
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
```

### **Step 2: Install Redis**
```powershell
choco install redis-64
```

### **Step 3: Start Redis**
```powershell
redis-server
```

## 🔧 **Configure Your Application**

### **Update Your .env File**
```env
# For local Redis (no password)
REDIS_URL=redis://localhost:6379

# For Redis with password (if you set one)
REDIS_URL=redis://:your_password@localhost:6379
```

### **Test Your Application**
```bash
npm start
```

You should see:
```
Connected to MongoDB
Redis Client Connected
Redis Client Ready
Server is running on port 5000
```

## 🧪 **Testing Commands**

### **Test Redis Connection**
```bash
# Connect to Redis CLI
redis-cli

# Inside Redis CLI:
# - ping (should return PONG)
# - set test "hello"
# - get test
# - exit
```

### **Test Your Application**
```bash
# Start your app
npm start

# Test health endpoint
curl http://localhost:5000/health
```

## 🆘 **Troubleshooting**

### **Redis Won't Start**
- **Check if port 6379 is free**: `netstat -ano | findstr :6379`
- **Run as Administrator**
- **Check Windows Firewall**

### **Connection Refused**
- **Verify Redis is running**: `redis-cli ping`
- **Check Redis URL in .env file**
- **Restart Redis service**

### **Permission Denied**
- **Run Command Prompt as Administrator**
- **Check Redis installation path**

## 🎯 **Quick Start (Recommended)**

1. **Download Redis for Windows** from GitHub releases
2. **Install and start Redis**
3. **Update your .env file**:
   ```env
   REDIS_URL=redis://localhost:6379
   ```
4. **Start your app**: `npm start`

## 📋 **Environment Variables**

Your `.env` file should look like:
```env
# Server
NODE_ENV=development
PORT=5000

# MongoDB (Atlas)
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority
MONGO_DB_NAME=cierta_db

# Redis (Local)
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRE=7d

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```























