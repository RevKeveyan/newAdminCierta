const mongoose = require('mongoose');

function parseJsonField(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (e) {
      return value;
    }
  }
  return value;
}

/**
 * Рекурсивно удаляет все undefined и null значения из объекта
 * Также удаляет пустые строки и массивы
 * Используется перед сохранением в базу данных
 */
function filterNullValues(obj, seen = new WeakSet()) {
  // Если значение null или undefined, возвращаем undefined (поле не будет сохранено)
  if (obj === null || obj === undefined) {
    return undefined;
  }

  // Для примитивных типов возвращаем как есть, если не null/undefined
  if (typeof obj !== 'object') {
    // Также фильтруем пустые строки и строки 'undefined'/'null'
    if (typeof obj === 'string' && (obj === '' || obj === 'undefined' || obj === 'null')) {
      return undefined;
    }
    return obj;
  }

  // Обработка ObjectId
  if (obj._bsontype === 'ObjectID' || (mongoose.Types.ObjectId && obj instanceof mongoose.Types.ObjectId)) {
    return obj;
  }

  // Prevent circular references
  if (seen.has(obj)) {
    return undefined;
  }
  seen.add(obj);

  // Обработка массивов
  if (Array.isArray(obj)) {
    const filtered = obj
      .map(item => {
        // Пропускаем null и undefined
        if (item === null || item === undefined) {
          return undefined;
        }
        
        // Обработка ObjectId в массиве
        if (item && typeof item === 'object' && (item._bsontype === 'ObjectID' || (mongoose.Types.ObjectId && item instanceof mongoose.Types.ObjectId))) {
          return item;
        }

        // Обработка объектов в массиве
        if (typeof item === 'object' && !Array.isArray(item)) {
          const filteredItem = filterNullValues(item, seen);
          // Возвращаем только если объект не пустой
          return (filteredItem && typeof filteredItem === 'object' && Object.keys(filteredItem).length > 0) ? filteredItem : undefined;
        } 
        // Обработка вложенных массивов
        else if (Array.isArray(item)) {
          const filteredArr = filterNullValues(item, seen);
          return (Array.isArray(filteredArr) && filteredArr.length > 0) ? filteredArr : undefined;
        } 
        // Обработка примитивных типов
        else if (item !== '' && item !== 'undefined' && item !== 'null') {
          return item;
        }
        return undefined;
      })
      .filter(item => item !== undefined); // Удаляем undefined элементы
    
    return filtered.length > 0 ? filtered : undefined;
  }

  // Обработка объектов
  const filtered = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const val = obj[key];
      
      // Пропускаем null и undefined
      if (val === null || val === undefined) {
        continue;
      }

      // Обработка ObjectId
      if (val && typeof val === 'object' && (val._bsontype === 'ObjectID' || (mongoose.Types.ObjectId && val instanceof mongoose.Types.ObjectId))) {
        filtered[key] = val;
      } 
      // Обработка вложенных объектов
      else if (typeof val === 'object' && !Array.isArray(val)) {
        const filteredVal = filterNullValues(val, seen);
        // Добавляем только если объект не пустой
        if (filteredVal && typeof filteredVal === 'object' && Object.keys(filteredVal).length > 0) {
          filtered[key] = filteredVal;
        }
      } 
      // Обработка массивов
      else if (Array.isArray(val)) {
        const filteredArr = filterNullValues(val, seen);
        if (Array.isArray(filteredArr) && filteredArr.length > 0) {
          filtered[key] = filteredArr;
        }
      } 
      // Обработка примитивных типов
      else if (val !== '' && val !== 'undefined' && val !== 'null') {
        // Пропускаем пустые строки и строки 'undefined'/'null'
        filtered[key] = val;
      }
    }
  }
  
  return Object.keys(filtered).length > 0 ? filtered : undefined;
}

/**
 * Удаляет undefined и null значения из объекта перед сохранением в Mongoose
 * Используется для очистки данных перед созданием/обновлением документов
 */
function removeUndefinedNullValues(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj
      .map(item => removeUndefinedNullValues(item))
      .filter(item => item !== undefined && item !== null);
  }

  const cleaned = {};
  for (const key in obj) {
    // Безопасная проверка hasOwnProperty для всех типов объектов
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      
      // Пропускаем undefined и null
      if (value === undefined || value === null) {
        continue;
      }

      // Рекурсивно очищаем вложенные объекты и массивы
      if (typeof value === 'object' && !(value instanceof mongoose.Types.ObjectId)) {
        const cleanedValue = removeUndefinedNullValues(value);
        // Добавляем только если значение не пустое
        if (cleanedValue !== undefined && cleanedValue !== null) {
          if (Array.isArray(cleanedValue) && cleanedValue.length > 0) {
            cleaned[key] = cleanedValue;
          } else if (typeof cleanedValue === 'object' && Object.keys(cleanedValue).length > 0) {
            cleaned[key] = cleanedValue;
          } else if (typeof cleanedValue !== 'object') {
            cleaned[key] = cleanedValue;
          }
        }
      } else {
        // Для примитивных типов и ObjectId добавляем как есть
        cleaned[key] = value;
      }
    }
  }

  return cleaned;
}

function normalizeEmails(emails) {
  if (typeof emails === 'string') {
    return emails.split(',').map(email => email.trim()).filter(email => email && email !== 'undefined' && email !== 'null');
  }
  if (!Array.isArray(emails)) {
    if (!emails || emails === 'undefined' || emails === 'null') {
      return [];
    }
    return [emails];
  }
  // Фильтруем undefined, null, пустые строки и строки 'undefined'/'null'
  return emails.filter(email => 
    email !== undefined && 
    email !== null && 
    email !== '' && 
    email !== 'undefined' && 
    email !== 'null' &&
    typeof email === 'string' &&
    email.trim() !== ''
  ).map(email => email.trim().toLowerCase());
}

function syncImageFields(data) {
  if (!data) return data;
  // Sync both fields - prioritize vehicleImages if both exist, otherwise sync whichever exists
  if (data.vehicleImages && data.images) {
    // Both exist - ensure they match (prioritize vehicleImages)
    data.images = data.vehicleImages;
  } else if (data.images && !data.vehicleImages) {
    // Only images exists - sync to vehicleImages
    data.vehicleImages = data.images;
  } else if (data.vehicleImages && !data.images) {
    // Only vehicleImages exists - sync to images
    data.images = data.vehicleImages;
  }
  return data;
}

function syncFreightFields(data) {
  if (!data) return data;
  // Sync both fields - prioritize freightImages if both exist, otherwise sync whichever exists
  if (data.freightImages && data.images) {
    // Both exist - ensure they match (prioritize freightImages)
    data.images = data.freightImages;
  } else if (data.images && !data.freightImages) {
    // Only images exists - sync to freightImages
    data.freightImages = data.images;
  } else if (data.freightImages && !data.images) {
    // Only freightImages exists - sync to images
    data.images = data.freightImages;
  }
  return data;
}

module.exports = {
  parseJsonField,
  filterNullValues,
  removeUndefinedNullValues,
  normalizeEmails,
  syncImageFields,
  syncFreightFields
};
