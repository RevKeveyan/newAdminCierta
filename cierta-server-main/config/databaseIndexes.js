const mongoose = require('mongoose');

// Функция для создания индексов
const createIndexes = async () => {
  try {
    console.log('Creating database indexes...');
    
    // Индексы для Load модели
    const Load = mongoose.model('Load');
    
    // Удаляем старый индекс loadId_1, если он существует (legacy)
    try {
      const loadIndexes = await Load.collection.indexes();
      const loadIdIndex = loadIndexes.find(idx => idx.key && idx.key.loadId);
      if (loadIdIndex) {
        console.log(`⚠️  Found legacy loadId index: ${loadIdIndex.name}, dropping...`);
        await Load.collection.dropIndex(loadIdIndex.name);
        console.log(`✅ Dropped legacy loadId index: ${loadIdIndex.name}`);
      }
    } catch (error) {
      if (error.code !== 27) { // 27 = IndexNotFound
        console.warn('Warning while checking/dropping loadId index:', error.message);
      }
    }
    
    // Убеждаемся, что уникальный индекс на orderId существует
    // Mongoose создает его автоматически из схемы, но явно создаем для надежности
    try {
      await Load.collection.createIndex({ orderId: 1 }, { unique: true });
      console.log('✅ Unique index on orderId created/verified');
    } catch (error) {
      if (error.code === 85) { // IndexOptionsConflict - индекс уже существует
        console.log('✅ Unique index on orderId already exists');
      } else {
        console.warn('Warning while creating orderId unique index:', error.message);
      }
    }
    
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
      tracking: 'text'
    });
    
    // Индексы для User модели
    const User = mongoose.model('User');
    try {
      await User.collection.createIndex({ email: 1 }, { unique: true });
    } catch (error) {
      if (error.code !== 85 && error.code !== 86) { // IndexOptionsConflict или IndexKeySpecsConflict
        console.warn('Warning while creating User email index:', error.message);
      }
    }
    try {
      await User.collection.createIndex({ companyName: 1 }, { sparse: true });
    } catch (error) {
      if (error.code !== 85 && error.code !== 86) {
        console.warn('Warning while creating User companyName index:', error.message);
      }
    }
    await User.collection.createIndex({ role: 1, status: 1 });
    await User.collection.createIndex({ 
      firstName: 'text', 
      lastName: 'text', 
      email: 'text',
      companyName: 'text'
    });
    
    const Customer = mongoose.model('Customer');
    try {
      const customerIndexes = await Customer.collection.indexes();
      const companyNameIndex = customerIndexes.find(idx => idx.key && idx.key.companyName && idx.unique);
      if (!companyNameIndex) {
        // Если индекс не существует, создаем его
        await Customer.collection.createIndex({ companyName: 1 }, { unique: true, name: 'companyName_1' });
        console.log('✅ Customer companyName index created');
      } else {
        console.log('✅ Customer companyName index already exists');
      }
    } catch (error) {
      if (error.code === 85 || error.code === 86) {
        // Конфликт индексов - пытаемся удалить старый и создать новый
        try {
          const customerIndexes = await Customer.collection.indexes();
          const oldIndex = customerIndexes.find(idx => idx.key && idx.key.companyName);
          if (oldIndex && oldIndex.name !== 'companyName_1') {
            await Customer.collection.dropIndex(oldIndex.name);
            await Customer.collection.createIndex({ companyName: 1 }, { unique: true, name: 'companyName_1' });
            console.log(`✅ Recreated Customer companyName index`);
          }
        } catch (recreateError) {
          console.warn('Warning while recreating Customer companyName index:', recreateError.message);
        }
      } else {
        console.warn('Warning while checking Customer companyName index:', error.message);
      }
    }
    
    // Индексы для Carrier модели (Mongoose создает их автоматически из схемы)
    // Не создаем их здесь, чтобы избежать конфликтов - Mongoose создаст их из схемы
    // Просто проверяем, что они существуют
    // ВАЖНО: companyName НЕ уникальный для Carrier (может повторяться)
    const Carrier = mongoose.model('Carrier');
    const carrierUniqueIndexFields = ['mcNumber', 'dotNumber', 'email']; // companyName убран - не уникальный
    
    for (const field of carrierUniqueIndexFields) {
      try {
        const carrierIndexes = await Carrier.collection.indexes();
        const existingIndex = carrierIndexes.find(idx => idx.key && idx.key[field] && idx.unique && idx.sparse);
        if (!existingIndex) {
          // Если индекс не существует, создаем его
          await Carrier.collection.createIndex({ [field]: 1 }, { unique: true, sparse: true, name: `${field}_1` });
          console.log(`✅ Carrier ${field} unique index created`);
        } else {
          console.log(`✅ Carrier ${field} unique index already exists`);
        }
      } catch (error) {
        if (error.code === 85 || error.code === 86) {
          // Конфликт индексов - пытаемся удалить старый и создать новый
          try {
            const carrierIndexes = await Carrier.collection.indexes();
            const oldIndex = carrierIndexes.find(idx => idx.key && idx.key[field]);
            if (oldIndex && (oldIndex.name !== `${field}_1` || !oldIndex.unique || !oldIndex.sparse)) {
              await Carrier.collection.dropIndex(oldIndex.name);
              await Carrier.collection.createIndex({ [field]: 1 }, { unique: true, sparse: true, name: `${field}_1` });
              console.log(`✅ Recreated Carrier ${field} unique index`);
            }
          } catch (recreateError) {
            console.warn(`Warning while recreating Carrier ${field} index:`, recreateError.message);
          }
        } else {
          console.warn(`Warning while checking Carrier ${field} index:`, error.message);
        }
      }
    }
    
    // Проверяем, что companyName НЕ имеет уникального индекса для Carrier
    try {
      const carrierIndexes = await Carrier.collection.indexes();
      const companyNameUniqueIndex = carrierIndexes.find(idx => 
        idx.key && idx.key.companyName && idx.unique && !idx.sparse
      );
      if (companyNameUniqueIndex) {
        // Если найден уникальный индекс без sparse, удаляем его
        await Carrier.collection.dropIndex(companyNameUniqueIndex.name);
        console.log(`✅ Removed unique index from Carrier companyName (should not be unique)`);
        // Создаем sparse индекс без unique (если его нет)
        const companyNameSparseIndex = carrierIndexes.find(idx => 
          idx.key && idx.key.companyName && !idx.unique && idx.sparse
        );
        if (!companyNameSparseIndex) {
          await Carrier.collection.createIndex({ companyName: 1 }, { sparse: true, name: 'companyName_1' });
          console.log(`✅ Created sparse (non-unique) index for Carrier companyName`);
        }
      }
    } catch (error) {
      if (error.code !== 27) { // 27 = IndexNotFound
        console.warn('Warning while checking Carrier companyName index:', error.message);
      }
    }
    
    // Индексы для LoadHistory
    const LoadHistory = mongoose.model('LoadHistory');
    await LoadHistory.collection.createIndex({ load: 1, createdAt: -1 });
    await LoadHistory.collection.createIndex({ changedBy: 1, createdAt: -1 });
    
    console.log('Database indexes created successfully');
  } catch (error) {
    console.error('Error creating indexes:', error);
  }
};

module.exports = { createIndexes };
