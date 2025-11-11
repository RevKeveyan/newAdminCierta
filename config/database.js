const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      dbName: process.env.MONGO_DB_NAME,
      maxPoolSize: 5, // Уменьшаем пул соединений
      serverSelectionTimeoutMS: 3000, // Уменьшаем таймаут выбора сервера
      socketTimeoutMS: 20000, // Уменьшаем таймаут сокета
      connectTimeoutMS: 10000, // Добавляем таймаут подключения
      bufferCommands: false // Отключаем буферизацию команд
    });

    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1); // Остановить процесс при ошибке
  }
};

module.exports = connectDB;
