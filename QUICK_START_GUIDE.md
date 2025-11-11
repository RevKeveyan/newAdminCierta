# 🚀 Quick Start Guide - Docker + Redis + Node.js

This guide will help you run your Node.js application with Docker and Redis.

## 📋 Prerequisites

- **Docker Desktop** installed and running
- **Node.js** (for local development)
- **Git** (if cloning the repository)

## 🎯 Quick Commands Reference

### **Start Everything (Recommended)**
```bash
# 1. Make sure Docker Desktop is running
# 2. Run this command in your project folder
docker-compose up -d
```

### **Check Status**
```bash
# See all running services
docker-compose ps

# View logs
docker-compose logs -f app
```

### **Stop Everything**
```bash
docker-compose down
```

## 🔧 Step-by-Step Setup

### **Step 1: Open Terminal/Command Prompt**

**Windows:**
- Press `Win + R`, type `cmd` or `powershell`, press Enter
- Or press `Win + X` and select "Windows PowerShell"

**Navigate to your project:**
```bash
cd C:\Users\rkeve\newAdminCierta
```

### **Step 2: Start Docker Desktop**

1. **Open Docker Desktop** from Start menu
2. **Wait for it to start** (whale icon in system tray)
3. **Verify it's running:**
   ```bash
   docker --version
   ```

### **Step 3: Start Your Application**

**Option A: Full Docker Setup (Recommended)**
```bash
# Start all services (MongoDB + Redis + Your App)
docker-compose up -d

# Check if everything is running
docker-compose ps
```

**Option B: Hybrid Setup (Docker for databases, local app)**
```bash
# Start only databases
docker-compose up mongodb redis -d

# Start your app locally
npm start
```

## 🌐 Access Your Application

Once running, your application will be available at:

- **Main App**: `http://localhost:5000`
- **Health Check**: `http://localhost:5000/health`
- **API Endpoints**:
  - Loads: `http://localhost:5000/loads`
  - Users: `http://localhost:5000/users`
  - Stats: `http://localhost:5000/stats`
  - Auth: `http://localhost:5000/auth`

## 🔍 Troubleshooting Commands

### **Check What's Using Port 5000**
```bash
netstat -ano | findstr :5000
```

### **Kill Process Using Port 5000**
```bash
# Find the PID first
netstat -ano | findstr :5000

# Kill the process (replace XXXX with actual PID)
taskkill /PID XXXX /F
```

### **Check Docker Status**
```bash
# See running containers
docker ps

# See all containers (including stopped)
docker ps -a

# Check Docker Desktop is running
docker --version
```

### **View Logs**
```bash
# All services
docker-compose logs -f

# Just your app
docker-compose logs -f app

# Just Redis
docker-compose logs -f redis

# Just MongoDB
docker-compose logs -f mongodb
```

## 🛠️ Common Issues & Solutions

### **Issue 1: "Port 5000 already in use"**
```bash
# Find what's using the port
netstat -ano | findstr :5000

# Kill the process
taskkill /PID [PID_NUMBER] /F

# Then start your services
docker-compose up -d
```

### **Issue 2: "Docker Desktop not running"**
1. Open Docker Desktop from Start menu
2. Wait for it to fully start
3. Try again: `docker-compose up -d`

### **Issue 3: "Cannot connect to Redis"**
```bash
# Check if Redis is running
docker-compose ps

# Restart Redis
docker-compose restart redis

# Check Redis logs
docker-compose logs redis
```

### **Issue 4: "Cannot connect to MongoDB"**
```bash
# Check if MongoDB is running
docker-compose ps

# Restart MongoDB
docker-compose restart mongodb

# Check MongoDB logs
docker-compose logs mongodb
```

## 📊 Service Management

### **Start Specific Services**
```bash
# Start only Redis
docker-compose up redis -d

# Start only MongoDB
docker-compose up mongodb -d

# Start only your app
docker-compose up app -d
```

### **Restart Services**
```bash
# Restart all
docker-compose restart

# Restart specific service
docker-compose restart app
docker-compose restart redis
docker-compose restart mongodb
```

### **Stop Services**
```bash
# Stop all services
docker-compose down

# Stop and remove volumes (⚠️ Deletes all data)
docker-compose down -v
```

## 🔧 Development Workflow

### **For Development (Hot Reloading)**
```bash
# Start databases in Docker
docker-compose up mongodb redis -d

# Run your app locally (with hot reloading)
npm start
```

### **For Production (Full Docker)**
```bash
# Start everything in Docker
docker-compose up -d

# View logs
docker-compose logs -f app
```

## 🧪 Testing Your Setup

### **Test Application Health**
```bash
# Using curl (if available)
curl http://localhost:5000/health

# Using PowerShell
Invoke-WebRequest -Uri http://localhost:5000/health
```

### **Test Redis Connection**
```bash
# Connect to Redis CLI
docker exec -it cierta_redis redis-cli -a redis123 ping
# Should return: PONG
```

### **Test MongoDB Connection**
```bash
# Connect to MongoDB
docker exec -it cierta_mongodb mongosh -u admin -p password123 --authenticationDatabase admin --eval "db.adminCommand('ping')"
# Should return: { ok: 1 }
```

## 📝 Environment Variables

Your application uses these environment variables (set in `.env` file):

```env
# Server
NODE_ENV=development
PORT=5000

# Database
MONGO_URI=mongodb://admin:password123@localhost:27017/cierta_db?authSource=admin
MONGO_DB_NAME=cierta_db

# Redis
REDIS_URL=redis://:redis123@localhost:6379

# JWT
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRE=7d

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

## 🚀 Production Deployment

For production, consider:

1. **Change default passwords**
2. **Use environment-specific configs**
3. **Set up SSL/HTTPS**
4. **Configure monitoring**
5. **Set up backups**

## 📞 Need Help?

If you encounter issues:

1. **Check Docker Desktop is running**
2. **Verify port 5000 is free**
3. **Check service logs**: `docker-compose logs -f`
4. **Restart services**: `docker-compose restart`
5. **Full reset**: `docker-compose down -v && docker-compose up -d`

## 🎯 Quick Reference Card

| Command | Purpose |
|---------|---------|
| `docker-compose up -d` | Start all services |
| `docker-compose down` | Stop all services |
| `docker-compose ps` | Check service status |
| `docker-compose logs -f app` | View app logs |
| `netstat -ano \| findstr :5000` | Check port usage |
| `taskkill /PID XXXX /F` | Kill process by PID |
