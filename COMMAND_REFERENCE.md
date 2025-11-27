# 📋 Command Reference - Docker + Redis Setup

## 🚀 Essential Commands

### **Start Your Application**
```bash
# Full Docker setup (recommended)
docker-compose up -d

# Check status
docker-compose ps
```

### **Stop Your Application**
```bash
# Stop all services
docker-compose down

# Stop and remove data
docker-compose down -v
```

## 🔍 Monitoring Commands

### **Check Service Status**
```bash
# See running containers
docker-compose ps

# See all containers
docker ps -a

# Check Docker version
docker --version
```

### **View Logs**
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f app
docker-compose logs -f redis
docker-compose logs -f mongodb
```

## 🛠️ Troubleshooting Commands

### **Port Management**
```bash
# Check what's using port 5000
netstat -ano | findstr :5000

# Kill process using port 5000
taskkill /PID [PID_NUMBER] /F

# Check all ports
netstat -ano
```

### **Docker Management**
```bash
# Restart all services
docker-compose restart

# Restart specific service
docker-compose restart app
docker-compose restart redis
docker-compose restart mongodb

# Rebuild and restart
docker-compose up --build -d
```

## 🧪 Testing Commands

### **Test Application**
```bash
# Health check
curl http://localhost:5000/health

# PowerShell alternative
Invoke-WebRequest -Uri http://localhost:5000/health
```

### **Test Redis**
```bash
# Connect to Redis CLI
docker exec -it cierta_redis redis-cli -a redis123 ping

# Should return: PONG
```

### **Test MongoDB**
```bash
# Connect to MongoDB
docker exec -it cierta_mongodb mongosh -u admin -p password123 --authenticationDatabase admin --eval "db.adminCommand('ping')"

# Should return: { ok: 1 }
```

## 🔧 Service-Specific Commands

### **Redis Commands**
```bash
# Connect to Redis CLI
docker exec -it cierta_redis redis-cli -a redis123

# Inside Redis CLI:
# - SET key value
# - GET key
# - KEYS *
# - FLUSHALL
# - EXIT
```

### **MongoDB Commands**
```bash
# Connect to MongoDB
docker exec -it cierta_mongodb mongosh -u admin -p password123 --authenticationDatabase admin

# Inside MongoDB:
# - show dbs
# - use cierta_db
# - show collections
# - exit
```

### **Application Commands**
```bash
# View app logs
docker-compose logs -f app

# Restart app
docker-compose restart app

# Execute commands in app container
docker exec -it cierta_app sh
```

## 🚀 Development Commands

### **Local Development**
```bash
# Start only databases
docker-compose up mongodb redis -d

# Run app locally
npm start

# Install dependencies
npm install
```

### **Docker Development**
```bash
# Rebuild app container
docker-compose build app

# Start with rebuild
docker-compose up --build -d
```

## 🧹 Cleanup Commands

### **Reset Everything**
```bash
# Stop and remove all containers
docker-compose down -v

# Remove app image
docker rmi newadmincierta-app

# Clean up unused Docker resources
docker system prune -a
```

### **Remove Specific Services**
```bash
# Stop specific service
docker-compose stop redis

# Remove specific service
docker-compose rm redis
```

## 📊 Resource Monitoring

### **Check Resource Usage**
```bash
# Docker stats
docker stats

# System resources
# Windows: Task Manager
# Or: Get-Process | Sort-Object CPU -Descending
```

### **Check Disk Usage**
```bash
# Docker disk usage
docker system df

# Clean up unused data
docker system prune
```

## 🔐 Security Commands

### **Change Default Passwords**
```bash
# Edit docker-compose.yml to change:
# - MongoDB password: password123
# - Redis password: redis123
# - JWT secret in .env file
```

### **Check Container Security**
```bash
# List container processes
docker exec cierta_app ps aux

# Check container logs for errors
docker-compose logs app | grep -i error
```

## 🌐 Network Commands

### **Check Network Connectivity**
```bash
# Test localhost connectivity
ping localhost

# Test specific port
telnet localhost 5000

# Check open ports
netstat -tulpn | findstr :5000
```

### **Docker Network Commands**
```bash
# List Docker networks
docker network ls

# Inspect network
docker network inspect newadmincierta_cierta_network
```

## 📝 Log Management

### **View Recent Logs**
```bash
# Last 100 lines
docker-compose logs --tail=100 app

# Follow logs in real-time
docker-compose logs -f --tail=50 app
```

### **Save Logs to File**
```bash
# Save logs to file
docker-compose logs app > app_logs.txt

# Save all logs
docker-compose logs > all_logs.txt
```

## 🎯 Quick Troubleshooting Checklist

1. **Docker Desktop running?** → `docker --version`
2. **Port 5000 free?** → `netstat -ano | findstr :5000`
3. **Services running?** → `docker-compose ps`
4. **App responding?** → `curl http://localhost:5000/health`
5. **Redis working?** → `docker exec cierta_redis redis-cli -a redis123 ping`
6. **MongoDB working?** → `docker exec cierta_mongodb mongosh -u admin -p password123 --authenticationDatabase admin --eval "db.adminCommand('ping')"`

## 🚨 Emergency Commands

### **Complete Reset**
```bash
# Stop everything
docker-compose down -v

# Remove all images
docker rmi $(docker images -q)

# Clean everything
docker system prune -a --volumes

# Start fresh
docker-compose up -d
```

### **Force Stop Everything**
```bash
# Force stop all containers
docker stop $(docker ps -aq)

# Force remove all containers
docker rm $(docker ps -aq)

# Restart Docker Desktop
# Then: docker-compose up -d
```




















