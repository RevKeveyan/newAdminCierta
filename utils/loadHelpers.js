const { filterNullValues, normalizeEmails, syncImageFields, syncFreightFields } = require("./dataHelpers");
const { normalizeLoadDates } = require("./dateNormalization");

/**
 * Обрабатывает dates данные перед сохранением
 * Очищает ненужные поля в зависимости от типа даты
 * Нормализует строковые даты в Date поля
 */
function processDatesData(datesData) {
  if (!datesData || typeof datesData !== 'object') {
    return {};
  }

  const processed = { ...datesData };
  
  const normalizedDates = normalizeLoadDates(processed);
  
  Object.keys(normalizedDates).forEach(key => {
    if (key.endsWith('At') && normalizedDates[key] !== null && normalizedDates[key] !== undefined) {
      processed[key] = normalizedDates[key];
    }
  });

  // Обработка pickup date
  if (processed.pickupDateType === 'Estimate') {
    // Для Estimate сохраняем только start и end, удаляем pickupDate
    if (processed.pickupDate) {
      delete processed.pickupDate;
    }
    // Убеждаемся что start и end не пустые строки
    if (!processed.pickupDateStart || processed.pickupDateStart.trim() === '') {
      delete processed.pickupDateStart;
    }
    if (!processed.pickupDateEnd || processed.pickupDateEnd.trim() === '') {
      delete processed.pickupDateEnd;
    }
  } else if (processed.pickupDateType === 'Exact') {
    // Для Exact сохраняем только pickupDate, удаляем start и end
    if (processed.pickupDateStart) {
      delete processed.pickupDateStart;
    }
    if (processed.pickupDateEnd) {
      delete processed.pickupDateEnd;
    }
    // Убеждаемся что pickupDate не пустая строка
    if (!processed.pickupDate || processed.pickupDate.trim() === '') {
      delete processed.pickupDate;
    }
  }
  // Всегда сохраняем pickupDateType (даже если не указан, используем default)
  if (!processed.pickupDateType || processed.pickupDateType.trim() === '') {
    processed.pickupDateType = 'Exact'; // default
  }

  // Обработка delivery date
  if (processed.deliveryDateType === 'Estimate') {
    // Для Estimate сохраняем только start и end, удаляем deliveryDate
    if (processed.deliveryDate) {
      delete processed.deliveryDate;
    }
    // Убеждаемся что start и end не пустые строки
    if (!processed.deliveryDateStart || processed.deliveryDateStart.trim() === '') {
      delete processed.deliveryDateStart;
    }
    if (!processed.deliveryDateEnd || processed.deliveryDateEnd.trim() === '') {
      delete processed.deliveryDateEnd;
    }
  } else if (processed.deliveryDateType === 'Exact') {
    // Для Exact сохраняем только deliveryDate, удаляем start и end
    if (processed.deliveryDateStart) {
      delete processed.deliveryDateStart;
    }
    if (processed.deliveryDateEnd) {
      delete processed.deliveryDateEnd;
    }
    // Убеждаемся что deliveryDate не пустая строка
    if (!processed.deliveryDate || processed.deliveryDate.trim() === '') {
      delete processed.deliveryDate;
    }
  }
  // Всегда сохраняем deliveryDateType (даже если не указан, используем default)
  if (!processed.deliveryDateType || processed.deliveryDateType.trim() === '') {
    processed.deliveryDateType = 'Exact'; // default
  }

  // Обработка других полей dates (assignedDate, deadline, aging)
  if (processed.assignedDate && processed.assignedDate.trim() === '') {
    delete processed.assignedDate;
  }
  if (processed.deadline && processed.deadline.trim() === '') {
    delete processed.deadline;
  }
  if (processed.aging && processed.aging.trim() === '') {
    delete processed.aging;
  }

  return processed;
}

/**
 * Подготавливает данные для создания load документа
 */
function prepareLoadDocument({
  orderId,
  customerId,
  carrierId,
  customerEmails,
  carrierEmails,
  customerRate,
  carrierRate,
  typeData,
  pickupData,
  deliveryData,
  insuranceData,
  datesData,
  status,
  tracking,
  carrierPhotos,
  bolDocuments,
  rateConfirmationDocuments,
  documents,
  vehicleData,
  freightData,
  paymentMethod,
  paymentTerms,
  fees,
  tonu,
  loadCarrierPeople,
  loadCustomerRepresentativePeoples,
  createdBy,
}) {
  const filteredPickup = filterNullValues(pickupData);
  const filteredDelivery = filterNullValues(deliveryData);
  const filteredInsurance = filterNullValues(insuranceData);
  // Специальная обработка dates перед фильтрацией
  const processedDates = processDatesData(datesData);
  const filteredDates = filterNullValues(processedDates);

  // Создаем объект loadDocument, удаляя undefined/null значения
  const loadDocument = {
    orderId,
    ...(customerId && { customer: customerId }),
    ...(customerEmails.length > 0 && { customerEmails }),
    ...(customerRate &&
      customerRate.trim() !== "" && {
        customerRate: customerRate.trim(),
      }),
    ...(carrierRate &&
      carrierRate.trim() !== "" && {
        carrierRate: carrierRate.trim(),
      }),
    type: typeData,
    ...(Object.keys(filteredPickup).length > 0 && {
      pickup: filteredPickup,
    }),
    ...(Object.keys(filteredDelivery).length > 0 && {
      delivery: filteredDelivery,
    }),
    ...(carrierId && { carrier: carrierId }),
    ...(carrierEmails.length > 0 && { carrierEmails }),
    carrierPhotos:
      Array.isArray(carrierPhotos) &&
      carrierPhotos.filter((photo) => photo && photo.trim() !== "").length > 0
        ? carrierPhotos.filter((photo) => photo && photo.trim() !== "")
        : undefined,
    ...(Object.keys(filteredInsurance).length > 0 && {
      insurance: filteredInsurance,
    }),
    status: status || "Listed",
    // Всегда сохраняем dates, если есть хотя бы одно поле (включая типы)
    ...(filteredDates && Object.keys(filteredDates).length > 0 && { dates: filteredDates }),
    ...(tracking &&
      tracking.trim() !== "" && {
        tracking: tracking.trim(),
      }),
    ...(Array.isArray(bolDocuments) &&
      bolDocuments.filter((doc) => doc && doc.trim() !== "").length > 0 && {
        bolDocuments: bolDocuments.filter((doc) => doc && doc.trim() !== "")
      }),
    ...(Array.isArray(rateConfirmationDocuments) &&
      rateConfirmationDocuments.filter((doc) => doc && doc.trim() !== "").length > 0 && {
        rateConfirmationDocuments: rateConfirmationDocuments.filter((doc) => doc && doc.trim() !== "")
      }),
    ...(Array.isArray(documents) &&
      documents.filter((doc) => doc && doc.trim() !== "").length > 0 && {
        documents: documents.filter((doc) => doc && doc.trim() !== "")
      }),
    ...(paymentMethod && paymentMethod.trim() !== "" && { paymentMethod: paymentMethod.trim() }),
    ...(paymentTerms && paymentTerms.trim() !== "" && { paymentTerms: paymentTerms.trim() }),
    // Always include fees if it's an array (even if empty, to allow clearing)
    // Normalize fees to ensure all fields are present as strings
    ...(Array.isArray(fees) && { 
      fees: fees.length > 0 
        ? fees
            .filter(fee => fee && fee.type && fee.type.trim() !== '')
            .map(fee => ({
              type: fee.type || '',
              carrierRate: fee.carrierRate !== undefined && fee.carrierRate !== null ? String(fee.carrierRate) : '',
              customerRate: fee.customerRate !== undefined && fee.customerRate !== null ? String(fee.customerRate) : '',
              total: fee.total !== undefined && fee.total !== null ? String(fee.total) : ''
            }))
        : []
    }),
    ...(tonu && typeof tonu === 'object' && Object.keys(tonu).length > 0 && { tonu: tonu }),
    // Independent copies of people for this specific load
    // Always include these fields if they are arrays (even if empty, to allow clearing)
    ...(Array.isArray(loadCarrierPeople) && {
      loadCarrierPeople: loadCarrierPeople.length > 0
        ? loadCarrierPeople.filter(person => person && person.fullName && person.fullName.trim() !== '')
        : []
    }),
    ...(Array.isArray(loadCustomerRepresentativePeoples) && {
      loadCustomerRepresentativePeoples: loadCustomerRepresentativePeoples.length > 0
        ? loadCustomerRepresentativePeoples.filter(person => person && person.fullName && person.fullName.trim() !== '')
        : []
    }),
    createdBy: createdBy,
  };

  // Добавляем vehicle если есть данные
  if (vehicleData?.shipment?.length > 0) {
    if (vehicleData.images && !vehicleData.vehicleImages) {
      vehicleData.vehicleImages = vehicleData.images;
    }
    syncImageFields(vehicleData);
    loadDocument.vehicle = vehicleData;
  }

  // Добавляем freight если есть данные
  if (freightData?.shipment?.length > 0) {
    if (freightData.images && !freightData.freightImages) {
      freightData.freightImages = freightData.images;
    }
    syncFreightFields(freightData);
    loadDocument.freight = freightData;
  }

  return loadDocument;
}

/**
 * Обрабатывает загруженные файлы и добавляет их в loadDocument
 */
function processUploadedFiles(loadDocument, uploadedFiles, vehicleData, freightData) {
  if (!uploadedFiles) return { loadDocument, vehicleData, freightData };

  // Vehicle images
  if (uploadedFiles.vehicleImages?.length > 0) {
    if (!vehicleData) vehicleData = {};
    const existing = vehicleData.vehicleImages || [];
    vehicleData.vehicleImages = [
      ...existing,
      ...uploadedFiles.vehicleImages,
    ];
    syncImageFields(vehicleData);
    loadDocument.vehicle = vehicleData;
  }

  // Freight images
  if (uploadedFiles.freightImages?.length > 0) {
    if (!freightData) freightData = {};
    const existing = freightData.freightImages || [];
    freightData.freightImages = [
      ...existing,
      ...uploadedFiles.freightImages,
    ];
    syncFreightFields(freightData);
    loadDocument.freight = freightData;
  }

  // Pickup images
  if (uploadedFiles.pickupImages?.length > 0) {
    if (!loadDocument.pickup) loadDocument.pickup = {};
    loadDocument.pickup.images = [
      ...(loadDocument.pickup.images || []),
      ...uploadedFiles.pickupImages,
    ];
  }

  // Delivery images
  if (uploadedFiles.deliveryImages?.length > 0) {
    if (!loadDocument.delivery) loadDocument.delivery = {};
    loadDocument.delivery.images = [
      ...(loadDocument.delivery.images || []),
      ...uploadedFiles.deliveryImages,
    ];
  }

  // Carrier photos
  if (uploadedFiles.carrierPhotos?.length > 0) {
    loadDocument.carrierPhotos = [
      ...(loadDocument.carrierPhotos || []),
      ...uploadedFiles.carrierPhotos,
    ];
  }

  if (uploadedFiles.bolDocuments?.length > 0) {
    loadDocument.bolDocuments = [...uploadedFiles.bolDocuments];
  }
  if (uploadedFiles.rateConfirmationDocuments?.length > 0) {
    loadDocument.rateConfirmationDocuments = [...uploadedFiles.rateConfirmationDocuments];
  }
  if (uploadedFiles.documents?.length > 0) {
    loadDocument.documents = [
      ...(loadDocument.documents || []),
      ...uploadedFiles.documents,
    ];
  }

  return { loadDocument, vehicleData, freightData };
}

/**
 * Финальная очистка и синхронизация полей vehicle/freight
 */
function finalizeLoadDocument(loadDocument) {
  const fees = loadDocument.fees;
  const tonu = loadDocument.tonu;
  const pickupImages = loadDocument.pickup?.images;
  const deliveryImages = loadDocument.delivery?.images;
  const carrierPhotos = loadDocument.carrierPhotos;
  const bolDocuments = loadDocument.bolDocuments;
  const rateConfirmationDocuments = loadDocument.rateConfirmationDocuments;
  const documents = loadDocument.documents;

  if (loadDocument.vehicle?.vehicleImages && loadDocument.vehicle?.images) {
    syncImageFields(loadDocument.vehicle);
  } else if (loadDocument.vehicle?.images && !loadDocument.vehicle?.vehicleImages) {
    loadDocument.vehicle.vehicleImages = loadDocument.vehicle.images;
    syncImageFields(loadDocument.vehicle);
  }

  if (loadDocument.freight?.freightImages && loadDocument.freight?.images) {
    syncFreightFields(loadDocument.freight);
  } else if (loadDocument.freight?.images && !loadDocument.freight?.freightImages) {
    loadDocument.freight.freightImages = loadDocument.freight.images;
    syncFreightFields(loadDocument.freight);
  }

  const cleaned = filterNullValues(loadDocument);

  if (fees !== undefined) {
    if (Array.isArray(fees)) {
      if (fees.length > 0) {
        cleaned.fees = fees
          .filter(fee => fee && fee.type && fee.type.trim() !== '')
          .map(fee => {
            const normalizedFee = {
              type: fee.type || '',
              carrierRate: fee.carrierRate !== undefined && fee.carrierRate !== null ? String(fee.carrierRate) : '',
              customerRate: fee.customerRate !== undefined && fee.customerRate !== null ? String(fee.customerRate) : '',
              total: fee.total !== undefined && fee.total !== null ? String(fee.total) : ''
            };
            Object.keys(normalizedFee).forEach(key => {
              if (normalizedFee[key] === undefined || normalizedFee[key] === null) {
                delete normalizedFee[key];
              }
            });
            return normalizedFee;
          });
      } else {
        cleaned.fees = [];
      }
    }
  }

  if (tonu !== undefined && typeof tonu === 'object') {
    const cleanedTonu = {};
    if (tonu.enabled !== undefined && tonu.enabled !== null) {
      cleanedTonu.enabled = tonu.enabled;
    }
    if (tonu.carrierRate !== undefined && tonu.carrierRate !== null && tonu.carrierRate !== '') {
      cleanedTonu.carrierRate = String(tonu.carrierRate);
    }
    if (tonu.customerRate !== undefined && tonu.customerRate !== null && tonu.customerRate !== '') {
      cleanedTonu.customerRate = String(tonu.customerRate);
    }
    if (Object.keys(cleanedTonu).length > 0) {
      cleaned.tonu = cleanedTonu;
    }
  }

  if (Array.isArray(pickupImages) && pickupImages.length > 0) {
    if (!cleaned.pickup) cleaned.pickup = {};
    cleaned.pickup.images = pickupImages;
  }

  if (Array.isArray(deliveryImages) && deliveryImages.length > 0) {
    if (!cleaned.delivery) cleaned.delivery = {};
    cleaned.delivery.images = deliveryImages;
  }

  if (Array.isArray(carrierPhotos) && carrierPhotos.length > 0) {
    cleaned.carrierPhotos = carrierPhotos;
  }

  if (Array.isArray(bolDocuments)) {
    cleaned.bolDocuments = bolDocuments;
  }
  if (Array.isArray(rateConfirmationDocuments)) {
    cleaned.rateConfirmationDocuments = rateConfirmationDocuments;
  }
  if (Array.isArray(documents)) {
    cleaned.documents = documents;
  }

  return cleaned;
}

/**
 * Подготавливает данные для обновления load
 * @param {Object} loadData - Новые данные для обновления
 * @param {Object} existingDates - Существующие dates из документа (для мержа)
 */
function prepareUpdateData(loadData, customerId, carrierId, customerWasProvided, carrierWasProvided, existingDates = null) {
  const updateData = {};
  
  Object.keys(loadData).forEach((key) => {
    // Пропускаем customer и carrier - они будут добавлены отдельно как ID
    if (key !== "customer" && key !== "carrier") {
      // Специальная обработка dates - мержим с существующими значениями
      if (key === "dates" && loadData[key]) {
        // Мержим существующие dates с новыми (чтобы не потерять неизмененные поля)
        // Новые значения имеют приоритет, но сохраняем неизмененные поля
        let mergedDates;
        if (existingDates) {
          mergedDates = { ...existingDates };
          // Обновляем только те поля, которые были переданы в loadData[key]
          // Если передан тип даты, используем его (может измениться с Estimate на Exact или наоборот)
          Object.keys(loadData[key]).forEach(dateKey => {
            const newValue = loadData[key][dateKey];
            // Обновляем поле только если оно не пустое (для строк проверяем, что не пустая строка)
            if (newValue !== undefined && newValue !== null && newValue !== '') {
              mergedDates[dateKey] = newValue;
            }
          });
        } else {
          mergedDates = loadData[key];
        }
        
        // Обрабатываем dates с учетом типа (удаляем поля, которые не должны быть для данного типа)
        const processedDates = processDatesData(mergedDates);
        const filteredDates = filterNullValues(processedDates);
        if (filteredDates && Object.keys(filteredDates).length > 0) {
          updateData[key] = filteredDates;
        }
      } else {
        updateData[key] = loadData[key];
      }
    }
  });

  // Добавляем customer/carrier только как ID, если они были предоставлены
  if (customerWasProvided) {
    updateData.customer = customerId;
  }

  if (carrierWasProvided) {
    updateData.carrier = carrierId;
  }

  // Явно добавляем fees и tonu если они есть в loadData, удаляя undefined/null
  if (loadData.fees !== undefined) {
    if (Array.isArray(loadData.fees)) {
      if (loadData.fees.length > 0) {
        // Нормализуем fees: сохраняем все валидные fees
        const normalizedFees = loadData.fees
          .filter(fee => fee && fee.type && fee.type.trim() !== '')
          .map(fee => {
            const normalizedFee = {
              type: fee.type || '',
              carrierRate: fee.carrierRate !== undefined && fee.carrierRate !== null ? String(fee.carrierRate) : '',
              customerRate: fee.customerRate !== undefined && fee.customerRate !== null ? String(fee.customerRate) : '',
              total: fee.total !== undefined && fee.total !== null ? String(fee.total) : ''
            };
            // Удаляем поля с undefined/null, но сохраняем пустые строки
            Object.keys(normalizedFee).forEach(key => {
              if (normalizedFee[key] === undefined || normalizedFee[key] === null) {
                delete normalizedFee[key];
              }
            });
            return normalizedFee;
          });
        
        // Сохраняем fees только если есть хотя бы один валидный fee
        if (normalizedFees.length > 0) {
          updateData.fees = normalizedFees;
          console.log(`[loadHelpers] Added ${normalizedFees.length} fees to updateData:`, JSON.stringify(normalizedFees));
        } else {
          // Если все fees были отфильтрованы, устанавливаем пустой массив для очистки
          updateData.fees = [];
          console.log(`[loadHelpers] All fees were filtered out, setting empty array`);
        }
      } else {
        // Пустой массив - очищаем fees
        updateData.fees = [];
        console.log(`[loadHelpers] Empty fees array provided, clearing fees`);
      }
    } else {
      console.warn(`[loadHelpers] fees is not an array:`, typeof loadData.fees, loadData.fees);
    }
  } else {
    console.log(`[loadHelpers] fees is undefined in loadData`);
  }
  if (loadData.tonu !== undefined && typeof loadData.tonu === 'object') {
    const cleanedTonu = {};
    if (loadData.tonu.enabled !== undefined && loadData.tonu.enabled !== null) {
      cleanedTonu.enabled = loadData.tonu.enabled;
    }
    if (loadData.tonu.carrierRate !== undefined && loadData.tonu.carrierRate !== null && loadData.tonu.carrierRate !== '') {
      cleanedTonu.carrierRate = String(loadData.tonu.carrierRate);
    }
    if (loadData.tonu.customerRate !== undefined && loadData.tonu.customerRate !== null && loadData.tonu.customerRate !== '') {
      cleanedTonu.customerRate = String(loadData.tonu.customerRate);
    }
    if (Object.keys(cleanedTonu).length > 0) {
      updateData.tonu = cleanedTonu;
    } else if (loadData.tonu.enabled === false) {
      // Сохраняем enabled: false даже если других полей нет
      updateData.tonu = { enabled: false };
    }
  }

  return updateData;
}

/**
 * Нормализует emails для customer и carrier
 */
function normalizeEmailsForLoad(loadData) {
  return {
    customerEmails: normalizeEmails(loadData.customerEmails),
    carrierEmails: normalizeEmails(loadData.carrierEmails),
  };
}

module.exports = {
  prepareLoadDocument,
  processUploadedFiles,
  finalizeLoadDocument,
  prepareUpdateData,
  normalizeEmailsForLoad,
};

