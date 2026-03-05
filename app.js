// app.js
// ---------- Core ----------
const path = require("path");
const http = require("http");
const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const morgan = require("morgan");
const cors = require("cors");
const compression = require("compression");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const performanceMiddleware = require("./middlewares/performanceMiddleware");
const { createIndexes } = require("./config/databaseIndexes");

// ---------- Env ----------
dotenv.config();

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME;

// ---------- App ----------
const app = express();

// ---------- Middleware ----------
// Безопасность
app.use(helmet({
  contentSecurityPolicy: false, // Отключаем CSP для API
  crossOriginEmbedderPolicy: false
}));

// CORS - Secure configuration
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    
    // If credentials are required, origin must be in whitelist
    if (allowedOrigins.size > 0) {
      if (allowedOrigins.has(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    } else {
      // Fallback: allow all if no origins configured (development only)
      if (process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(new Error('CORS: No allowed origins configured'));
      }
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
}));

// Сжатие
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 2000, // лимит 2000 запросов на IP за 15 минут
  message: {
    error: 'Contact support!.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/', limiter);

// Более строгий лимит для auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // только 5 попыток входа за 15 минут
  message: {
    error: 'Too many authentication attempts, please try again later.'
  }
});
app.use('/auth/', authLimiter);

// Парсинг JSON с оптимизацией
// Increase body size limit for large file uploads (dozens of files)
app.use(express.json({
  limit: '50mb', // Increased for large file uploads
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '50mb' // Increased for large file uploads 
}));

// Логирование
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Мониторинг производительности
app.use(performanceMiddleware);

// ---------- Public Routes (No Authentication Required) ----------
const authRoutes = require("./routes/authRoutes");
app.use("/auth", authRoutes);

// Health-check (public for monitoring/uptime bots)
app.get("/health", (_req, res) => res.status(200).json({ ok: true }));

// ---------- Authentication Middleware (Default Deny) ----------
// All routes below this require authentication
const { verifyToken } = require('./middlewares/authMiddleware');
app.use(verifyToken);

// ---------- Protected Routes (Authentication Required) ----------
const loadRoutes = require("./routes/loadRoutes");
const userRoutes = require("./routes/userRoutes");
const performanceRoutes = require("./routes/performanceRoutes");
const customerRoutes = require("./routes/customerRoutes");
const carrierRoutes = require("./routes/carrierRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const documentsRoutes = require("./routes/documentsRoutes");
const filesRoutes = require("./routes/filesRoutes");

app.use("/loads", loadRoutes);
app.use("/users", userRoutes);
app.use("/api/users", userRoutes);
app.use("/performance", performanceRoutes);
app.use("/customers", customerRoutes);
app.use("/api/customers", customerRoutes);
app.use("/carriers", carrierRoutes);
app.use("/api/carriers", carrierRoutes);
app.use("/payments", paymentRoutes);
app.use("/documents", documentsRoutes);
app.use("/files", filesRoutes);
app.use("/api/files", filesRoutes);
app.use("/stats", require("./routes/statsRoutes"));
app.use("/api/stats", require("./routes/statsRoutes"));

// Note: PDF files are no longer served via static. Use protected endpoints instead.

// ---------- 404 ----------
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ---------- Error Handler ----------
app.use((err, req, res, next) => {
  console.error("Server Error:", {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });
  
  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Something broke!",
    ...(isDevelopment && { 
      details: err.stack,
      path: req.path,
      method: req.method
    })
  });
});

// ---------- DB Connect + Server Start ----------
// Check JWT_SECRET configuration
if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET is not set in environment variables!');
  console.error('⚠️  This will cause authentication failures.');
  console.error('💡 Set JWT_SECRET in your .env file.');
  process.exit(1);
}

let dbNameToUse = MONGO_DB_NAME;
if (MONGO_URI) {
  const dbNameMatch = MONGO_URI.match(/\/([^/?]+)(\?|$)/);
  if (dbNameMatch && dbNameMatch[1] && dbNameMatch[1] !== '') {
    dbNameToUse = dbNameMatch[1];
    console.log(`📦 Using database from URI: ${dbNameToUse}`);
  } else if (MONGO_DB_NAME) {
    
    dbNameToUse = MONGO_DB_NAME;
    console.log(`📦 Using database from MONGO_DB_NAME: ${dbNameToUse}`);
  }
}

console.log(`🔌 Connecting to MongoDB...`);
console.log(`   URI: ${MONGO_URI ? MONGO_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@') : 'not set'}`);
console.log(`   Database: ${dbNameToUse || 'default'}`);

mongoose
  .connect(MONGO_URI, { 
    dbName: dbNameToUse,
    maxPoolSize: 5, 
    serverSelectionTimeoutMS: 3000, 
    socketTimeoutMS: 20000, 
    connectTimeoutMS: 10000,
    bufferCommands: false 
  })
  .then(async () => {
    const dbName = mongoose.connection.db.databaseName;
    console.log(`✅ Connected to MongoDB`);
    console.log(`   Database name: ${dbName}`);
    console.log(`   Host: ${mongoose.connection.host}`);

    // Enable Redis Cache Service
    const cacheService = require('./services/cacheService');
    await cacheService.connect();

    // Создаем индексы для оптимизации
    await createIndexes();

    // Стартуем крон только после успешного коннекта к БД
    // (чтобы задания не падали из-за отсутствия подключения)
    require("./cron/paymentNotificationsCron");
    require("./cron/statsWorkerCron");
    require("./cron/statsTodayRefreshCron");
    console.log("[Cron] Started all scheduled jobs");

    const server = http.createServer(app);
    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });

    const shutdown = (signal) => () => {
      console.log(`\n${signal} received. Closing server...`);
      server.close(() => {
        mongoose.connection.close(false).then(() => {
          console.log("MongoDB connection closed. Bye!");
          process.exit(0);
        });
      });
    };
    process.on("SIGINT", shutdown("SIGINT"));
    process.on("SIGTERM", shutdown("SIGTERM"));
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  });

module.exports = app;
