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

// ---------- App ----------
const app = express();

// ---------- Middleware ----------
// Безопасность
app.use(helmet({
  contentSecurityPolicy: false, // Отключаем CSP для API
  crossOriginEmbedderPolicy: false
}));

// CORS
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));

// Сжатие
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // лимит 100 запросов на IP за 15 минут
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Более строгий лимит для auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // только 5 попыток входа за 15 минут
  message: {
    error: 'Too many authentication attempts, please try again later.'
  }
});
app.use('/auth/', authLimiter);

// Парсинг JSON с оптимизацией
app.use(express.json({ 
  limit: "10mb",
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: "10mb" 
}));

// Логирование
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Мониторинг производительности
app.use(performanceMiddleware);

// ---------- Static Files ----------
// Serve generated PDFs
app.use('/generated-pdfs', express.static(path.join(__dirname, 'generated-pdfs')));

// ---------- Routes ----------
const loadRoutes    = require("./routes/loadRoutes");
const statsRoutes   = require("./routes/ststsRoutes");
const userRoutes    = require("./routes/userRoutes");
const authRoutes    = require("./routes/authRoutes");
const performanceRoutes = require("./routes/performanceRoutes");
const customerRoutes = require("./routes/customerRoutes");
const carrierRoutes = require("./routes/carrierRoutes");

// Префиксуем API (рекомендовано, чтобы не конфликтовать со статикой)
app.use("/loads", loadRoutes);
app.use("/stats", statsRoutes);
app.use("/users", userRoutes);
app.use("/auth", authRoutes);
app.use("/performance", performanceRoutes);
app.use("/customers", customerRoutes);
app.use("/carriers", carrierRoutes);
// Health-check (удобно для мониторинга/uptime-ботов)
app.get("/health", (_req, res) => res.status(200).json({ ok: true }));

// ---------- 404 ----------
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ---------- Error Handler ----------
app.use((err, _req, res, _next) => {
  console.error("Server Error:", err.stack || err);
  res.status(500).json({ error: "Something broke!" });
});

// ---------- DB Connect + Server Start ----------
mongoose
  .connect(MONGO_URI, { 
    maxPoolSize: 5, // Уменьшаем пул соединений для быстрого старта
    serverSelectionTimeoutMS: 3000, // Уменьшаем таймаут выбора сервера
    socketTimeoutMS: 20000, // Уменьшаем таймаут сокета
    connectTimeoutMS: 10000, // Добавляем таймаут подключения
    bufferCommands: false // Отключаем буферизацию команд
  })
  .then(async () => {
    console.log("Connected to MongoDB");

    // Enable Redis Cache Service
    const cacheService = require('./services/cacheService');
    await cacheService.connect();

    // Создаем индексы для оптимизации
    await createIndexes();

    // Стартуем крон только после успешного коннекта к БД
    // (чтобы задания не падали из-за отсутствия подключения)
    require("./cron/statsCron");

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
