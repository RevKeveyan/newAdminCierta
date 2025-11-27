# 🔧 Fix MongoDB Atlas Connection

Your application is failing to connect to MongoDB Atlas because your IP address isn't whitelisted.

## 🎯 **Quick Fix Steps**

### **Step 1: Add Your IP to MongoDB Atlas**

1. **Go to MongoDB Atlas Dashboard**: https://cloud.mongodb.com/
2. **Sign in** to your account
3. **Select your project** (the one with your database)
4. **Click "Network Access"** in the left sidebar
5. **Click "Add IP Address"**
6. **Add your current IP**: `109.75.46.142`
7. **Click "Confirm"**

### **Step 2: Alternative - Allow All IPs (Less Secure)**

If you want to allow all IPs (for development only):

1. **Go to Network Access**
2. **Click "Add IP Address"**
3. **Click "Allow Access from Anywhere"**
4. **Add IP Address**: `0.0.0.0/0`
5. **Click "Confirm"**

⚠️ **Warning**: This is less secure and should only be used for development.

### **Step 3: Test Your Connection**

After adding your IP, test the connection:

```bash
# Start your application
npm start
```

You should see:
```
Connected to MongoDB
Redis Client Connected
Server is running on port 5000
```

## 🔍 **Check Your Environment Variables**

Make sure your `.env` file has the correct MongoDB URI:

```env
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority
MONGO_DB_NAME=cierta_db
```

## 🚀 **Alternative: Use Local MongoDB (No Atlas)**

If you prefer to use local MongoDB instead of Atlas:

### **Option A: Install MongoDB Locally**
1. Download MongoDB Community Server
2. Install and start MongoDB service
3. Update your `.env`:
   ```env
   MONGO_URI=mongodb://localhost:27017/cierta_db
   ```

### **Option B: Use Docker for MongoDB Only**
```bash
# Start only MongoDB in Docker
docker run -d --name mongodb -p 27017:27017 -e MONGO_INITDB_ROOT_USERNAME=admin -e MONGO_INITDB_ROOT_PASSWORD=password123 mongo:7.0

# Update your .env
MONGO_URI=mongodb://admin:password123@localhost:27017/cierta_db?authSource=admin
```

## 🧪 **Test Your Setup**

After fixing the connection, test your application:

```bash
# Start your app
npm start

# In another terminal, test the health endpoint
curl http://localhost:5000/health
```

## 🆘 **Still Having Issues?**

### **Check MongoDB Atlas Status**
1. Go to your Atlas dashboard
2. Check if your cluster is running
3. Verify your connection string is correct

### **Check Your Connection String**
Your MongoDB URI should look like:
```
mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority
```

### **Common Issues**
- **Wrong username/password**: Check your Atlas user credentials
- **Wrong database name**: Verify the database name in your connection string
- **Network timeout**: Your IP might not be whitelisted yet (wait a few minutes)

## 🎯 **Quick Commands**

```bash
# Test MongoDB connection
mongosh "your_connection_string"

# Test your app
npm start

# Check if port 5000 is free
netstat -ano | findstr :5000
```























