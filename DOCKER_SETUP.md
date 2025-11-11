# Docker Setup with Redis

This guide will help you set up and run your Node.js application with Docker and Redis.

## Prerequisites

- Docker Desktop installed on your system
- Git (if cloning the repository)

## Quick Start

### 1. Environment Setup

Copy the environment example file and configure it:

```bash
cp env.example .env
```

Edit the `.env` file with your specific configuration:

```env
# Server Configuration
NODE_ENV=development
PORT=5000

# Database Configuration
MONGO_URI=mongodb://admin:password123@localhost:27017/cierta_db?authSource=admin
MONGO_DB_NAME=cierta_db

# Redis Configuration
REDIS_URL=redis://:redis123@localhost:6379

# JWT Configuration
JWT_SECRET=your_jwt_secret_here_change_this_in_production
JWT_EXPIRE=7d

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

### 2. Running with Docker Compose

Start all services (MongoDB, Redis, and your application):

```bash
docker-compose up -d
```

This will:
- Start MongoDB on port 27017
- Start Redis on port 6379
- Build and start your Node.js application on port 5000

### 3. Viewing Logs

To see the application logs:

```bash
docker-compose logs -f app
```

To see all service logs:

```bash
docker-compose logs -f
```

### 4. Stopping Services

Stop all services:

```bash
docker-compose down
```

Stop and remove volumes (⚠️ This will delete all data):

```bash
docker-compose down -v
```

## Individual Service Management

### Running Only Redis

If you want to run only Redis for development:

```bash
docker-compose up redis -d
```

### Running Only MongoDB

```bash
docker-compose up mongodb -d
```

### Running Only the Application

```bash
docker-compose up app -d
```

## Development Workflow

### Hot Reloading

For development with hot reloading, you can run the application locally while using Docker for databases:

1. Start only the databases:
   ```bash
   docker-compose up mongodb redis -d
   ```

2. Run your application locally:
   ```bash
   npm start
   ```

### Rebuilding the Application

When you make changes to your code, rebuild the Docker image:

```bash
docker-compose build app
docker-compose up app -d
```

Or rebuild and restart in one command:

```bash
docker-compose up --build app -d
```

## Redis Configuration

### Connection Details

- **Host**: localhost (when running locally) or `redis` (when running in Docker)
- **Port**: 6379
- **Password**: redis123
- **URL**: `redis://:redis123@localhost:6379`

### Redis Commands

Connect to Redis CLI:

```bash
# When using Docker
docker exec -it cierta_redis redis-cli -a redis123

# When running locally
redis-cli -a redis123
```

### Redis Data Persistence

Redis data is persisted in a Docker volume named `redis_data`. This means your cache data will survive container restarts.

## MongoDB Configuration

### Connection Details

- **Host**: localhost (when running locally) or `mongodb` (when running in Docker)
- **Port**: 27017
- **Username**: admin
- **Password**: password123
- **Database**: cierta_db

### MongoDB Commands

Connect to MongoDB:

```bash
# When using Docker
docker exec -it cierta_mongodb mongosh -u admin -p password123 --authenticationDatabase admin

# When running locally
mongosh -u admin -p password123 --authenticationDatabase admin
```

## Health Checks

### Application Health

Check if your application is running:

```bash
curl http://localhost:5000/health
```

### Redis Health

Check Redis connection:

```bash
docker exec cierta_redis redis-cli -a redis123 ping
```

### MongoDB Health

Check MongoDB connection:

```bash
docker exec cierta_mongodb mongosh -u admin -p password123 --authenticationDatabase admin --eval "db.adminCommand('ping')"
```

## Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   # Check what's using the port
   netstat -tulpn | grep :5000
   
   # Kill the process
   kill -9 <PID>
   ```

2. **Redis Connection Failed**
   - Ensure Redis container is running: `docker-compose ps`
   - Check Redis logs: `docker-compose logs redis`
   - Verify Redis password in your `.env` file

3. **MongoDB Connection Failed**
   - Ensure MongoDB container is running: `docker-compose ps`
   - Check MongoDB logs: `docker-compose logs mongodb`
   - Verify MongoDB connection string in your `.env` file

4. **Application Won't Start**
   - Check application logs: `docker-compose logs app`
   - Ensure all environment variables are set correctly
   - Verify all dependencies are installed

### Reset Everything

To completely reset your Docker environment:

```bash
# Stop and remove all containers, networks, and volumes
docker-compose down -v

# Remove the application image
docker rmi newadmincierta_app

# Start fresh
docker-compose up --build
```

## Production Considerations

For production deployment, consider:

1. **Security**: Change all default passwords
2. **Environment Variables**: Use proper secret management
3. **SSL/TLS**: Configure HTTPS
4. **Monitoring**: Add health checks and monitoring
5. **Backup**: Set up regular database backups
6. **Scaling**: Configure for horizontal scaling

## Useful Commands

```bash
# View running containers
docker-compose ps

# View resource usage
docker stats

# Execute commands in running container
docker exec -it cierta_app sh

# View container logs
docker-compose logs -f [service_name]

# Restart a specific service
docker-compose restart [service_name]

# Scale a service (if supported)
docker-compose up --scale app=3
```

