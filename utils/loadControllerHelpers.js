const mongoose = require("mongoose");
const { updateS3KeysForEntity, extractKeyFromUrl } = require("../services/s3Service");
const { syncImageFields, syncFreightFields } = require("./dataHelpers");

/**
 * Обновляет S3 ключи для файлов, загруженных с временным ID
 */
async function updateTempFileKeys(saved, tempId, updatePromises) {
  const loadId = saved._id.toString();
  const fileMappings = [
    {
      path: ['vehicle', 'vehicleImages'],
      altPath: ['vehicle', 'images'],
      syncFn: (obj) => syncImageFields(obj)
    },
    {
      path: ['freight', 'freightImages'],
      altPath: ['freight', 'images'],
      syncFn: (obj) => syncFreightFields(obj)
    },
    {
      path: ['pickup', 'images']
    },
    {
      path: ['delivery', 'images']
    },
    {
      path: ['carrierPhotos']
    },
    {
      path: ['bolDocuments']
    },
    {
      path: ['rateConfirmationDocuments']
    },
    {
      path: ['documents']
    }
  ];

  for (const mapping of fileMappings) {
    let current = saved;
    let exists = true;

    // Проверяем существование основного пути
    for (let i = 0; i < mapping.path.length; i++) {
      if (!current || !current[mapping.path[i]]) {
        exists = false;
        break;
      }
      current = current[mapping.path[i]];
    }

    // Если основной путь не существует, проверяем альтернативный
    if (!exists && mapping.altPath) {
      current = saved;
      exists = true;
      for (let i = 0; i < mapping.altPath.length; i++) {
        if (!current || !current[mapping.altPath[i]]) {
          exists = false;
          break;
        }
        current = current[mapping.altPath[i]];
      }
    }

    if (!exists || !Array.isArray(current) || current.length === 0) {
      continue;
    }

    const updatedKeys = await updateS3KeysForEntity(
      current,
      tempId,
      loadId,
      "loads"
    );

    // Обновляем сохраненный документ
    if (mapping.path.length === 1) {
      // Простое поле (carrierPhotos, documents)
      saved[mapping.path[0]] = updatedKeys;
    } else {
      // Вложенное поле (vehicle.vehicleImages, pickup.images и т.д.)
      const [parent, child] = mapping.path;
      if (!saved[parent]) saved[parent] = {};
      saved[parent][child] = updatedKeys;
      
      // Синхронизируем для vehicle/freight
      if (mapping.syncFn) {
        mapping.syncFn(saved[parent]);
      }
    }

    if (!updatePromises.length) {
      updatePromises.push(saved.save());
    }
  }
}

/**
 * Проверяет и обновляет temp ключи в load документе
 * Находит любые ключи с temp- путями и обновляет их на реальный loadId
 */
async function fixTempKeysInLoad(saved) {
  const loadId = saved._id.toString();
  
  // Проверяем, есть ли temp пути в ключах
  const hasTempPath = (key) => {
    if (typeof key !== 'string') return false;
    return /\/temp-\d+-[^/]+\//.test(key);
  };
  
  // Извлекаем tempId из ключа
  const extractTempId = (key) => {
    const match = key.match(/\/(temp-\d+-[^/]+)\//);
    return match ? match[1] : null;
  };
  
  const fileMappings = [
    {
      path: ['vehicle', 'vehicleImages'],
      altPath: ['vehicle', 'images'],
      syncFn: (obj) => syncImageFields(obj)
    },
    {
      path: ['freight', 'freightImages'],
      altPath: ['freight', 'images'],
      syncFn: (obj) => syncFreightFields(obj)
    },
    {
      path: ['pickup', 'images']
    },
    {
      path: ['delivery', 'images']
    },
    {
      path: ['carrierPhotos']
    },
    {
      path: ['documents']
    }
  ];

  let needsUpdate = false;

  for (const mapping of fileMappings) {
    let current = saved;
    let exists = true;

    // Проверяем существование основного пути
    for (let i = 0; i < mapping.path.length; i++) {
      if (!current || !current[mapping.path[i]]) {
        exists = false;
        break;
      }
      current = current[mapping.path[i]];
    }

    // Если основной путь не существует, проверяем альтернативный
    if (!exists && mapping.altPath) {
      current = saved;
      exists = true;
      for (let i = 0; i < mapping.altPath.length; i++) {
        if (!current || !current[mapping.altPath[i]]) {
          exists = false;
          break;
        }
        current = current[mapping.altPath[i]];
      }
    }

    if (!exists || !Array.isArray(current) || current.length === 0) {
      continue;
    }

    // Проверяем, есть ли temp пути в массиве
    const hasTempKeys = current.some(key => hasTempPath(key));
    if (!hasTempKeys) {
      continue;
    }

    // Извлекаем tempId из первого ключа с temp путем
    const tempKey = current.find(key => hasTempPath(key));
    const tempId = extractTempId(tempKey);
    
    if (!tempId) {
      continue;
    }

    // Обновляем ключи
    const updatedKeys = await updateS3KeysForEntity(
      current,
      tempId,
      loadId,
      "loads"
    );

    // Обновляем сохраненный документ
    if (mapping.path.length === 1) {
      saved[mapping.path[0]] = updatedKeys;
    } else {
      const [parent, child] = mapping.path;
      if (!saved[parent]) saved[parent] = {};
      saved[parent][child] = updatedKeys;
      
      if (mapping.syncFn) {
        mapping.syncFn(saved[parent]);
      }
    }

    needsUpdate = true;
  }

  // Сохраняем изменения если были обновления
  if (needsUpdate) {
    await saved.save();
  }
}

/**
 * Извлекает S3 ключи из массива (обрабатывает как ключи, так и URL)
 */
function extractKeys(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((item) => {
      if (typeof item === "string") {
        // Если это уже ключ (без http/https/blob), возвращаем как есть
        if (
          !item.startsWith("http") &&
          !item.startsWith("blob") &&
          !item.startsWith("/api/files")
        ) {
          return item;
        }
        // Извлекаем ключ из URL
        const extracted = extractKeyFromUrl(item);
        if (!extracted) {
          console.warn(`[extractKeys] Failed to extract key from URL: ${item}`);
        }
        return extracted || item;
      }
      if (item && typeof item === "object") {
        // Handle objects with key/url/file fields
        if (item.key && typeof item.key === "string") {
          return item.key;
        }
        const url =
          (typeof item.url === "string" && item.url) ||
          (typeof item.file === "string" && item.file) ||
          (typeof item.path === "string" && item.path) ||
          null;
        if (url) {
          const extracted = extractKeyFromUrl(url);
          if (!extracted) {
            console.warn(`[extractKeys] Failed to extract key from URL object:`, item);
          }
          return extracted || url;
        }
      }
      return null;
    })
    .filter(Boolean);
}

/**
 * Находит удаленные файлы для указанного поля
 */
function findDeletedFiles(oldValue, newValue, extractKeysFn = extractKeys) {
  const oldKeys = extractKeysFn(oldValue || []);
  const newKeys = extractKeysFn(newValue || []);
  return oldKeys.filter((key) => !newKeys.includes(key));
}

/**
 * Merge file array field following the PATCH contract
 * @param {Object} params
 * @param {Array<String>} params.oldKeys - Existing keys from DB
 * @param {Array<String>|undefined} params.patchKeys - Keys from patch (undefined = field not sent)
 * @param {Array<String>} params.uploadedKeys - New keys from file uploads
 * @param {Boolean} params.fieldWasSent - Whether field was present in patch (hasOwnProperty)
 * @returns {Object} { finalKeys: Array<String>, deleteKeys: Array<String> }
 */
function mergeFileArrayField({ oldKeys = [], patchKeys, uploadedKeys = [], fieldWasSent }) {
  // CONTRACT RULE 1: Field omitted/undefined => NO TOUCH
  if (!fieldWasSent || patchKeys === undefined) {
    // Don't touch existing files, but merge uploaded files
    const finalKeys = [...new Set([...oldKeys, ...uploadedKeys])];
    return { finalKeys, deleteKeys: [] };
  }

  // CONTRACT RULE 2: Field present as [] => CLEAR
  if (Array.isArray(patchKeys) && patchKeys.length === 0) {
    // Delete all old keys, don't add uploaded (user explicitly cleared)
    return { finalKeys: [], deleteKeys: oldKeys };
  }

  // CONTRACT RULE 3: Field present as [keys...] => REPLACE
  if (Array.isArray(patchKeys) && patchKeys.length > 0) {
    // Keep intersection of old and patch (preserved keys)
    const keepKeys = oldKeys.filter((key) => patchKeys.includes(key));
    // Removed keys = old keys not in patch
    const removedKeys = oldKeys.filter((key) => !patchKeys.includes(key));
    // Final = kept + uploaded (dedupe)
    const finalKeys = [...new Set([...keepKeys, ...uploadedKeys])];
    return { finalKeys, deleteKeys: removedKeys };
  }

  // Fallback: treat as empty array (clear)
  return { finalKeys: [], deleteKeys: oldKeys };
}

/**
 * Process deleted files for all file array fields in load
 * CRITICAL: Only processes fields that were EXPLICITLY SENT in patch (hasOwnProperty)
 * This prevents accidental deletions when fields are omitted
 */
function processDeletedFiles(oldDoc, loadData) {
  const filesToDelete = [];
  
  // File field mappings: [fieldPath, oldDocPath, altOldDocPath]
  const fileFields = [
    {
      name: 'carrierPhotos',
      oldPath: ['carrierPhotos'],
      getOldValue: (doc) => doc.carrierPhotos || [],
    },
    {
      name: 'bolDocuments',
      oldPath: ['bolDocuments'],
      getOldValue: (doc) => doc.bolDocuments || [],
    },
    {
      name: 'rateConfirmationDocuments',
      oldPath: ['rateConfirmationDocuments'],
      getOldValue: (doc) => doc.rateConfirmationDocuments || [],
    },
    {
      name: 'documents',
      oldPath: ['documents'],
      getOldValue: (doc) => doc.documents || [],
    },
    {
      name: 'pickup.images',
      oldPath: ['pickup', 'images'],
      getOldValue: (doc) => doc.pickup?.images || [],
    },
    {
      name: 'delivery.images',
      oldPath: ['delivery', 'images'],
      getOldValue: (doc) => doc.delivery?.images || [],
    },
    {
      name: 'vehicle.vehicleImages',
      oldPath: ['vehicle', 'vehicleImages'],
      altOldPath: ['vehicle', 'images'],
      getOldValue: (doc) => doc.vehicle?.vehicleImages || doc.vehicle?.images || [],
    },
    {
      name: 'vehicle.images',
      oldPath: ['vehicle', 'images'],
      altOldPath: ['vehicle', 'vehicleImages'],
      getOldValue: (doc) => doc.vehicle?.images || doc.vehicle?.vehicleImages || [],
    },
    {
      name: 'freight.freightImages',
      oldPath: ['freight', 'freightImages'],
      altOldPath: ['freight', 'images'],
      getOldValue: (doc) => doc.freight?.freightImages || doc.freight?.images || [],
    },
    {
      name: 'freight.images',
      oldPath: ['freight', 'images'],
      altOldPath: ['freight', 'freightImages'],
      getOldValue: (doc) => doc.freight?.images || doc.freight?.freightImages || [],
    },
  ];

  for (const mapping of fileFields) {
    // CRITICAL: Check if field was sent in patch using hasOwnProperty
    let fieldWasSent = false;
    let patchValue = undefined;

    if (mapping.name.includes('.')) {
      // Nested field (e.g., 'pickup.images')
      const parts = mapping.name.split('.');
      let current = loadData;
      let exists = true;
      for (const part of parts) {
        if (current && typeof current === 'object' && Object.prototype.hasOwnProperty.call(current, part)) {
          current = current[part];
        } else {
          exists = false;
          break;
        }
      }
      if (exists) {
        fieldWasSent = true;
        patchValue = current;
      }
    } else {
      // Top-level field
      if (Object.prototype.hasOwnProperty.call(loadData, mapping.name)) {
        fieldWasSent = true;
        patchValue = loadData[mapping.name];
      }
    }

    // Skip if field was not sent (undefined = don't touch)
    if (!fieldWasSent) {
      continue;
    }

    // Get old value
    const oldValue = mapping.getOldValue(oldDoc);
    const oldKeys = extractKeys(oldValue);

    // Get new value (already normalized to keys by normalizeLoadFileArrays)
    const newKeys = Array.isArray(patchValue) ? extractKeys(patchValue) : [];

    // Calculate deleted keys
    const deleted = oldKeys.filter((key) => !newKeys.includes(key));
    
    if (deleted.length > 0) {
      console.log(`[processDeletedFiles] Field "${mapping.name}": Found ${deleted.length} files to delete:`, deleted);
      filesToDelete.push(...deleted);
    }
  }

  if (filesToDelete.length > 0) {
    console.log(`[processDeletedFiles] Total files to delete: ${filesToDelete.length}`);
  }

  return filesToDelete;
}

/**
 * Обрабатывает загруженные файлы для updateLoad
 * КОНТРАКТ: upload НИКОГДА не должен привести к удалению старых ключей
 * - Если patch[field] присутствует (массив keys) => merged = unique([...patch[field], ...newKeys])
 * - Иначе => merged = unique([...oldDoc[field], ...newKeys])
 */
function processUploadedFilesForUpdate(updateData, oldDoc, uploadedFiles) {
  if (!uploadedFiles) return;

  // Helper: получить уникальные ключи из массивов
  const getUniqueKeys = (...arrays) => {
    const all = arrays.flat().filter(Boolean);
    return [...new Set(all)];
  };

  // Vehicle images
  if (uploadedFiles.vehicleImages?.length > 0) {
    if (!updateData.vehicle) updateData.vehicle = oldDoc.vehicle || {};
    const newKeys = uploadedFiles.vehicleImages;
    // Если patch содержит vehicleImages - merge с patch, иначе merge с существующими из БД
    const patchKeys = updateData.vehicle.vehicleImages || [];
    const existingKeys = patchKeys.length > 0 
      ? patchKeys 
      : (oldDoc.vehicle?.vehicleImages || oldDoc.vehicle?.images || []);
    updateData.vehicle.vehicleImages = getUniqueKeys(existingKeys, newKeys);
    syncImageFields(updateData.vehicle);
  }

  // Freight images
  if (uploadedFiles.freightImages?.length > 0) {
    if (!updateData.freight) updateData.freight = oldDoc.freight || {};
    const newKeys = uploadedFiles.freightImages;
    // Если patch содержит freightImages - merge с patch, иначе merge с существующими из БД
    const patchKeys = updateData.freight.freightImages || [];
    const existingKeys = patchKeys.length > 0 
      ? patchKeys 
      : (oldDoc.freight?.freightImages || oldDoc.freight?.images || []);
    updateData.freight.freightImages = getUniqueKeys(existingKeys, newKeys);
    syncFreightFields(updateData.freight);
  }

  // Pickup images
  if (uploadedFiles.pickupImages?.length > 0) {
    if (!updateData.pickup) updateData.pickup = oldDoc.pickup || {};
    const newKeys = uploadedFiles.pickupImages;
    // Если patch содержит images - merge с patch, иначе merge с существующими из БД
    const patchKeys = updateData.pickup.images || [];
    const existingKeys = patchKeys.length > 0 
      ? patchKeys 
      : (oldDoc.pickup?.images || []);
    updateData.pickup.images = getUniqueKeys(existingKeys, newKeys);
  }

  // Delivery images
  if (uploadedFiles.deliveryImages?.length > 0) {
    if (!updateData.delivery) updateData.delivery = oldDoc.delivery || {};
    const newKeys = uploadedFiles.deliveryImages;
    // Если patch содержит images - merge с patch, иначе merge с существующими из БД
    const patchKeys = updateData.delivery.images || [];
    const existingKeys = patchKeys.length > 0 
      ? patchKeys 
      : (oldDoc.delivery?.images || []);
    updateData.delivery.images = getUniqueKeys(existingKeys, newKeys);
  }

  // Carrier photos
  if (uploadedFiles.carrierPhotos?.length > 0) {
    const newKeys = uploadedFiles.carrierPhotos;
    // Если patch содержит carrierPhotos - merge с patch, иначе merge с существующими из БД
    const patchKeys = updateData.carrierPhotos || [];
    const existingKeys = patchKeys.length > 0 
      ? patchKeys 
      : (oldDoc.carrierPhotos || []);
    updateData.carrierPhotos = getUniqueKeys(existingKeys, newKeys);
  }

  if (uploadedFiles.bolDocuments?.length > 0) {
    const newKeys = uploadedFiles.bolDocuments;
    const patchKeys = updateData.bolDocuments || [];
    const existingKeys = patchKeys.length > 0 
      ? patchKeys 
      : (oldDoc.bolDocuments || []);
    updateData.bolDocuments = getUniqueKeys(existingKeys, newKeys);
  }
  if (uploadedFiles.rateConfirmationDocuments?.length > 0) {
    const newKeys = uploadedFiles.rateConfirmationDocuments;
    const patchKeys = updateData.rateConfirmationDocuments || [];
    const existingKeys = patchKeys.length > 0 
      ? patchKeys 
      : (oldDoc.rateConfirmationDocuments || []);
    updateData.rateConfirmationDocuments = getUniqueKeys(existingKeys, newKeys);
  }
  if (uploadedFiles.documents?.length > 0) {
    const newKeys = uploadedFiles.documents;
    const patchKeys = updateData.documents || [];
    const existingKeys = patchKeys.length > 0 
      ? patchKeys 
      : (oldDoc.documents || []);
    updateData.documents = getUniqueKeys(existingKeys, newKeys);
  }
}

/**
 * Обновляет связи Customer/Carrier с Load
 */
async function updateCustomerCarrierLinks(
  Customer,
  Carrier,
  oldCustomerId,
  newCustomerId,
  oldCarrierId,
  newCarrierId,
  loadId
) {
  const updates = [];

  // Обновление Customer
  if (newCustomerId !== undefined && newCustomerId?.toString() !== oldCustomerId?.toString()) {
    if (oldCustomerId) {
      updates.push(
        Customer.findByIdAndUpdate(oldCustomerId, {
          $pull: { loads: loadId },
        })
      );
    }
    if (newCustomerId) {
      updates.push(
        Customer.findByIdAndUpdate(newCustomerId, {
          $addToSet: { loads: loadId },
        })
      );
    }
  }

  // Обновление Carrier
  if (newCarrierId !== undefined && newCarrierId?.toString() !== oldCarrierId?.toString()) {
    if (oldCarrierId) {
      updates.push(
        Carrier.findByIdAndUpdate(oldCarrierId, {
          $pull: { loads: loadId },
        })
      );
    }
    if (newCarrierId) {
      updates.push(
        Carrier.findByIdAndUpdate(newCarrierId, {
          $addToSet: { loads: loadId },
        })
      );
    }
  }

  if (updates.length > 0) {
    await Promise.all(updates);
  }
}

/**
 * Создает объект actor из req.user
 */
function createActor(user) {
  return {
    id: user?.id,
    role: user?.role || "unknown",
    email: user?.email || null,
  };
}

/**
 * Форматирует документ с использованием DTO
 */
function formatDocument(dto, doc) {
  return dto ? dto.format(doc) : doc;
}

/**
 * Проверяет и нормализует ObjectId поля в данных обновления
 */
function normalizeObjectIdFields(data, fields = ['customer', 'carrier']) {
  for (const field of fields) {
    if (
      data[field] &&
      typeof data[field] === "object" &&
      !mongoose.Types.ObjectId.isValid(data[field])
    ) {
      // Если это объект без валидного ObjectId, пытаемся извлечь id
      if (
        data[field].id &&
        mongoose.Types.ObjectId.isValid(data[field].id)
      ) {
        data[field] = data[field].id;
      } else {
        delete data[field]; // Удаляем если не можем преобразовать
      }
    }
  }
}

/**
 * Универсальная функция для получения loads с пагинацией
 */
async function getLoadsWithPagination(
  model,
  filter,
  populateFields,
  dto,
  page = 1,
  limit = 10,
  sort = { createdAt: -1 }
) {
  const [docs, total] = await Promise.all([
    model
      .find(filter)
      .populate(populateFields)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean(),
    model.countDocuments(filter),
  ]);

  const formattedDocs = dto
    ? docs.map((doc) => dto.format(doc))
    : docs;

  return {
    data: formattedDocs,
    pagination: {
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      limit: parseInt(limit),
    },
  };
}

module.exports = {
  updateTempFileKeys,
  fixTempKeysInLoad,
  extractKeys,
  findDeletedFiles,
  processDeletedFiles,
  processUploadedFilesForUpdate,
  mergeFileArrayField,
  updateCustomerCarrierLinks,
  createActor,
  formatDocument,
  normalizeObjectIdFields,
  getLoadsWithPagination,
};

