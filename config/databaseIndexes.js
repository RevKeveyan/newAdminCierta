const mongoose = require('mongoose');

// Функция для создания индексов
const createIndexes = async () => {
  try {
    console.log('Creating database indexes...');
    
    // Индексы для Load модели
    const Load = mongoose.model('Load');
    
    // Составные индексы для частых запросов
    await Load.collection.createIndex({ status: 1, createdAt: -1 });
    await Load.collection.createIndex({ createdBy: 1, createdAt: -1 });
    await Load.collection.createIndex({ 'type.freight': 1, status: 1 });
    await Load.collection.createIndex({ 'type.vehicle': 1, status: 1 });
    
    // Индекс для поиска по VIN (не уникальный, так как VIN может быть null и повторяться)
    // VIN находится в vehicle.shipment[].vin, поэтому используем sparse индекс
    await Load.collection.createIndex({ 'vehicle.shipment.vin': 1 }, { sparse: true });
    
    // Текстовый индекс для поиска
    // В MongoDB может быть только один текстовый индекс на коллекцию
    // Сначала удаляем старый текстовый индекс, если он существует
    try {
      const indexes = await Load.collection.indexes();
      const textIndex = indexes.find(idx => idx.key && idx.key._fts);
      if (textIndex) {
        await Load.collection.dropIndex(textIndex.name);
        console.log(`Dropped old text index: ${textIndex.name}`);
      }
    } catch (error) {
      // Игнорируем ошибки, если индекс не существует
      if (error.code !== 27) { // 27 = IndexNotFound
        console.warn('Warning while dropping old text index:', error.message);
      }
    }
    
    // Создаем новый текстовый индекс с нужными полями
    await Load.collection.createIndex({
      orderId: 'text',
      tracking: 'text',
      billOfLadingNumber: 'text'
    });
    
    // Индексы для User модели
    const User = mongoose.model('User');
    await User.collection.createIndex({ email: 1 }, { unique: true });
    await User.collection.createIndex({ role: 1, status: 1 });
    await User.collection.createIndex({ 
      firstName: 'text', 
      lastName: 'text', 
      email: 'text',
      companyName: 'text'
    });
    
    // Индексы для LoadHistory
    const LoadHistory = mongoose.model('LoadHistory');
    await LoadHistory.collection.createIndex({ loadId: 1, createdAt: -1 });
    await LoadHistory.collection.createIndex({ changedBy: 1, createdAt: -1 });
    
    // Индексы для кэшированной статистики
    const CachedDayStats = mongoose.model('CachedDayStats');
    await CachedDayStats.collection.createIndex({ date: 1 }, { unique: true });
    
    const CachedMonthStats = mongoose.model('CachedMonthStats');
    await CachedMonthStats.collection.createIndex({ year: 1, month: 1 }, { unique: true });
    
    const CachedUserDayStats = mongoose.model('CachedUserDayStats');
    await CachedUserDayStats.collection.createIndex({ userId: 1, date: 1 }, { unique: true });
    
    const CachedUserMonthStats = mongoose.model('CachedUserMonthStats');
    await CachedUserMonthStats.collection.createIndex({ userId: 1, year: 1, month: 1 }, { unique: true });
    
    console.log('Database indexes created successfully');
  } catch (error) {
    console.error('Error creating indexes:', error);
  }
};

module.exports = { createIndexes };
