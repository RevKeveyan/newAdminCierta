const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Определяем имя базы данных: если указано в URI, используем его, иначе используем MONGO_DB_NAME
    const mongoUri = process.env.MONGO_URI;
    let dbNameToUse = process.env.MONGO_DB_NAME;
    
    if (mongoUri) {
      // Проверяем, есть ли имя базы данных в URI (формат: mongodb://.../databaseName)
      const dbNameMatch = mongoUri.match(/\/([^/?]+)(\?|$)/);
      if (dbNameMatch && dbNameMatch[1]) {
        // Если база данных указана в URI, используем её
        dbNameToUse = dbNameMatch[1];
      }
    }
    
    const conn = await mongoose.connect(mongoUri, {
      dbName: dbNameToUse,
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
