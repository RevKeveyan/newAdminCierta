const mongoose = require("mongoose");
const { parseJsonField, filterNullValues } = require("./dataHelpers");

/**
 * Парсит и валидирует данные load из запроса
 * Поддерживает оба формата: req.body.load (для FormData) и req.body напрямую (для JSON)
 */
function parseLoadData(reqBody) {
  // Если есть поле 'load', используем его (для FormData с JSON строкой)
  // Если нет, используем весь reqBody (для прямого JSON)
  let loadData = reqBody.load !== undefined ? reqBody.load : reqBody;

  // Если loadData - это строка (JSON из form-data), парсим её
  if (typeof loadData === "string") {
    try {
      loadData = JSON.parse(loadData);
    } catch (e) {
      throw new Error(`Invalid JSON in load field: ${e.message}`);
    }
  }

  // Если loadData все еще undefined или null, возвращаем пустой объект
  // Это позволяет обновлять только отдельные поля без полного объекта load
  if (loadData === undefined || loadData === null) {
    return {};
  }

  return loadData;
}

/**
 * Валидирует и нормализует данные customer
 */
function validateCustomerData(customerData) {
  if (!customerData) return null;

  const parsed = parseJsonField(customerData);
  if (!parsed) return null;

  // Save representativePeoples before filtering (even if empty array)
  const representativePeoples = parsed.representativePeoples;

  const filtered = filterNullValues(parsed);
  
  // Restore representativePeoples if it was provided (even if empty array)
  if (representativePeoples !== undefined) {
    filtered.representativePeoples = Array.isArray(representativePeoples) 
      ? representativePeoples 
      : [];
  }

  // Нормализуем email (одно поле, не массив)
  const customerType = filtered.type || parsed.type || 'customer';
  if (filtered.email !== undefined && filtered.email !== null) {
    if (typeof filtered.email === 'string' && filtered.email.trim() !== '') {
      filtered.email = filtered.email.trim().toLowerCase();
    } else {
      filtered.email = undefined;
    }
  }
  
  // Для платформ не сохраняем email
  if (customerType === 'platform') {
    filtered.email = undefined;
  }
  
  // Удаляем старое поле emails если оно есть (миграция)
  if (filtered.emails !== undefined) {
    delete filtered.emails;
  }

  if (
    Object.keys(filtered).length === 0 ||
    !filtered.companyName?.trim()
  ) {
    return null;
  }

  return filtered;
}

/**
 * Валидирует и нормализует данные carrier
 */
function validateCarrierData(carrierData) {
  if (!carrierData) return null;

  const parsed = parseJsonField(carrierData);
  if (!parsed) return null;

  // Save people array before filtering (even if empty array)
  const people = parsed.people;

  const filtered = filterNullValues(parsed);
  
  // Restore people array if it was provided (even if empty array)
  if (people !== undefined) {
    filtered.people = Array.isArray(people) 
      ? people 
      : [];
  }

  if (
    Object.keys(filtered).length === 0 ||
    (!filtered.name?.trim() && !filtered.companyName?.trim())
  ) {
    // Если есть id, сохраняем для обновления
    // Также сохраняем если есть people массив (даже если пустой) - это валидные данные для обновления
    if (!filtered.id && (!filtered.people || !Array.isArray(filtered.people) || filtered.people.length === 0)) {
      return null;
    }
  }

  return filtered;
}

/**
 * Валидирует данные vehicle
 */
function validateVehicleData(vehicleData, typeData) {
  if (!vehicleData) return null;

  const parsed = parseJsonField(vehicleData);
  if (!parsed) return null;

  if (typeData.vehicle && !typeData.freight) {
    const filtered = filterNullValues(parsed);
    if (
      !filtered ||
      (filtered.shipment &&
        (!Array.isArray(filtered.shipment) ||
          filtered.shipment.length === 0)) ||
      Object.keys(filtered).length === 0
    ) {
      return null;
    }
    return filtered;
  }

  return parsed;
}

function normalizeFreightShipmentItem(item) {
  if (!item || typeof item !== "object") return item;
  const normalized = { ...item };
  if (normalized.onPallets === "yes" || normalized.onPallets === true) {
    normalized.onPallets = true;
  } else {
    normalized.onPallets = false;
  }
  if (normalized.dimensionsUnit !== "inches" && normalized.dimensionsUnit !== "feet") {
    normalized.dimensionsUnit = "feet";
  }
  if (normalized.shipmentUnits !== undefined && normalized.shipmentUnits !== null && normalized.shipmentUnits !== "") {
    const val = String(normalized.shipmentUnits).trim();
    if (val.toUpperCase() === "N/A") {
      normalized.shipmentUnits = "N/A";
    } else {
      const num = parseInt(val, 10);
      if (!Number.isNaN(num) && num >= 1 && num <= 200) {
        normalized.shipmentUnits = String(num);
      } else {
        normalized.shipmentUnits = undefined;
      }
    }
  } else {
    normalized.shipmentUnits = undefined;
  }
  return normalized;
}

/**
 * Валидирует данные freight
 */
function validateFreightData(freightData, typeData) {
  if (!freightData) return null;

  const parsed = parseJsonField(freightData);
  if (!parsed) return null;

  if (typeData.freight && !typeData.vehicle) {
    const filtered = filterNullValues(parsed);
    if (
      !filtered ||
      (filtered.shipment &&
        (!Array.isArray(filtered.shipment) ||
          filtered.shipment.length === 0)) ||
      Object.keys(filtered).length === 0
    ) {
      return null;
    }
    if (Array.isArray(filtered.shipment)) {
      filtered.shipment = filtered.shipment.map(normalizeFreightShipmentItem);
    }
    return filtered;
  }

  if (parsed.shipment && Array.isArray(parsed.shipment)) {
    parsed.shipment = parsed.shipment.map(normalizeFreightShipmentItem);
  }
  return parsed;
}

/**
 * Проверяет наличие дубликатов VIN в базе данных
 */
async function checkDuplicateVIN(LoadModel, vehicleData, excludeLoadId = null) {
  if (
    !vehicleData ||
    !vehicleData.shipment ||
    !Array.isArray(vehicleData.shipment)
  ) {
    return null;
  }

  const vins = vehicleData.shipment
    .map((s) => s.vin?.trim())
    .filter((vin) => vin && vin !== "");

  if (vins.length === 0) return null;

  const query = {
    "vehicle.shipment.vin": { $in: vins },
  };

  if (excludeLoadId) {
    query._id = { $ne: excludeLoadId };
  }

  const existingLoad = await LoadModel.findOne(query)
    .select("orderId vehicle.shipment.vin")
    .lean();

  if (existingLoad) {
    const duplicateVinInLoad = existingLoad.vehicle?.shipment?.find(
      (s) => s.vin && vins.includes(s.vin.trim())
    );
    const duplicateVin = duplicateVinInLoad?.vin || vins[0];

    return {
      error: "Duplicate VIN",
      message: `VIN "${duplicateVin}" already exists in another load (Order ID: ${existingLoad.orderId})`,
      duplicateVin,
    };
  }

  return null;
}

/**
 * Проверяет валидность MongoDB ObjectId
 */
function validateObjectId(id) {
  if (!id) {
    return {
      valid: false,
      error: "ID is required",
    };
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return {
      valid: false,
      error: "Invalid ID format",
    };
  }

  return { valid: true };
}

/**
 * Проверяет наличие пользователя для createdBy
 */
function validateCreatedBy(user, bodyCreatedBy) {
  const createdBy = user?.id || bodyCreatedBy;
  if (!createdBy) {
    return {
      valid: false,
      error: "Authentication required",
      message: "You must be authenticated to create a load.",
    };
  }
  return { valid: true, createdBy };
}

/**
 * Обрабатывает customer из loadData (может быть ObjectId или объект)
 */
async function processCustomer(loadData, oldCustomer, customerService) {
  let customerId = oldCustomer;
  const customerWasProvided = "customer" in loadData;

  if (!customerWasProvided) {
    return { customerId, customerWasProvided: false };
  }

  if (loadData.customer === null || loadData.customer === undefined) {
    customerId = null;
  } else if (mongoose.Types.ObjectId.isValid(loadData.customer)) {
    customerId = loadData.customer;
  } else if (typeof loadData.customer === "object") {
    const customerData = parseJsonField(loadData.customer);
    if (customerData) {
      if (
        customerData.id &&
        mongoose.Types.ObjectId.isValid(customerData.id)
      ) {
        customerId = customerData.id;
      } else {
        try {
          customerId = await customerService.findOrCreate(customerData);
        } catch (error) {
          throw new Error(`Failed to process customer: ${error.message}`);
        }
      }
    } else {
      customerId = null;
    }
  }

  return { customerId, customerWasProvided: true };
}

/**
 * Обрабатывает carrier из loadData (может быть ObjectId или объект)
 */
async function processCarrier(loadData, oldCarrier, carrierService) {
  let carrierId = oldCarrier;
  const carrierWasProvided = "carrier" in loadData;

  if (!carrierWasProvided) {
    return { carrierId, carrierWasProvided: false };
  }

  if (loadData.carrier === null || loadData.carrier === undefined) {
    carrierId = null;
  } else if (mongoose.Types.ObjectId.isValid(loadData.carrier)) {
    carrierId = loadData.carrier;
  } else if (typeof loadData.carrier === "object") {
    const carrierData = parseJsonField(loadData.carrier);
    if (carrierData) {
      // Если есть старый carrier и в carrierData нет id, добавляем id для обновления
      if (oldCarrier && mongoose.Types.ObjectId.isValid(oldCarrier) && !carrierData.id) {
        carrierData.id = oldCarrier;
        console.log('[processCarrier] Added oldCarrier.id to carrierData:', oldCarrier);
      }
      
      if (
        carrierData.id &&
        mongoose.Types.ObjectId.isValid(carrierData.id)
      ) {
        carrierId = carrierData.id;
        console.log('[processCarrier] Updating existing carrier with id:', carrierId, 'data keys:', Object.keys(carrierData));
        // Обновляем существующий carrier
        const Carrier = require('../models/Carrier');
        const existingCarrier = await Carrier.findById(carrierId);
        if (existingCarrier) {
          await carrierService.updateCarrier(existingCarrier, carrierData);
        } else {
          console.warn('[processCarrier] Carrier not found with id:', carrierId);
        }
      } else {
        console.log('[processCarrier] No valid id, trying findOrCreate, carrierData keys:', Object.keys(carrierData));
        // Если нет id, пытаемся найти или создать новый carrier
        try {
          carrierId = await carrierService.findOrCreate(carrierData);
        } catch (error) {
          throw new Error(`Failed to process carrier: ${error.message}`);
        }
      }
    } else {
      carrierId = null;
    }
  }

  return { carrierId, carrierWasProvided: true };
}

/**
 * Валидирует dates данные
 */
function validateDatesData(datesData) {
  if (!datesData || typeof datesData !== 'object') return null;

  const errors = [];

  // Validate pickup date
  if (datesData.pickupDateType === 'Estimate') {
    if (!datesData.pickupDateStart || !datesData.pickupDateEnd) {
      errors.push('Pickup date start and end are required when type is Estimate');
    }
    if (datesData.pickupDateStart && datesData.pickupDateEnd) {
      const start = new Date(datesData.pickupDateStart);
      const end = new Date(datesData.pickupDateEnd);
      if (start > end) {
        errors.push('Pickup date start must be before end date');
      }
    }
  } else if (datesData.pickupDateType === 'Exact') {
    // Exact date is optional, but if provided should be valid
    if (datesData.pickupDateStart || datesData.pickupDateEnd) {
      // If Exact, start/end should be cleared (handled on frontend, but validate here)
      console.warn('[validateDatesData] Exact type but start/end dates present');
    }
  }

  // Validate delivery date
  if (datesData.deliveryDateType === 'Estimate') {
    if (!datesData.deliveryDateStart || !datesData.deliveryDateEnd) {
      errors.push('Delivery date start and end are required when type is Estimate');
    }
    if (datesData.deliveryDateStart && datesData.deliveryDateEnd) {
      const start = new Date(datesData.deliveryDateStart);
      const end = new Date(datesData.deliveryDateEnd);
      if (start > end) {
        errors.push('Delivery date start must be before end date');
      }
    }
  } else if (datesData.deliveryDateType === 'Exact') {
    // Exact date is optional, but if provided should be valid
    if (datesData.deliveryDateStart || datesData.deliveryDateEnd) {
      // If Exact, start/end should be cleared (handled on frontend, but validate here)
      console.warn('[validateDatesData] Exact type but start/end dates present');
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}

/**
 * Валидирует fees данные
 */
function validateFeesData(feesData, freightType) {
  if (!feesData) return { valid: true };

  // Fees should only be present for freight loads
  if (!freightType && Array.isArray(feesData) && feesData.length > 0) {
    return {
      valid: false,
      error: 'Fees can only be added for freight loads'
    };
  }

  if (!Array.isArray(feesData)) {
    return {
      valid: false,
      error: 'Fees must be an array'
    };
  }

  const validFeeTypes = ['Detention', 'Layover', 'Lumper fee'];
  const errors = [];

  feesData.forEach((fee, index) => {
    if (!fee || typeof fee !== 'object') {
      errors.push(`Fee at index ${index} must be an object`);
      return;
    }

    if (!fee.type || typeof fee.type !== 'string') {
      errors.push(`Fee at index ${index} must have a type`);
      return;
    }

    if (!validFeeTypes.includes(fee.type)) {
      errors.push(`Fee at index ${index} has invalid type "${fee.type}". Must be one of: ${validFeeTypes.join(', ')}`);
    }

    // Validate that numeric fields are valid if provided
    if (fee.carrierRate !== undefined && fee.carrierRate !== null && fee.carrierRate !== '') {
      const num = parseFloat(fee.carrierRate);
      if (isNaN(num) || num < 0) {
        errors.push(`Fee at index ${index} has invalid carrierRate`);
      }
    }

    if (fee.customerRate !== undefined && fee.customerRate !== null && fee.customerRate !== '') {
      const num = parseFloat(fee.customerRate);
      if (isNaN(num) || num < 0) {
        errors.push(`Fee at index ${index} has invalid customerRate`);
      }
    }

    if (fee.total !== undefined && fee.total !== null && fee.total !== '') {
      const num = parseFloat(fee.total);
      if (isNaN(num) || num < 0) {
        errors.push(`Fee at index ${index} has invalid total`);
      }
    }
  });

  if (errors.length > 0) {
    return {
      valid: false,
      errors
    };
  }

  return { valid: true };
}

module.exports = {
  parseLoadData,
  validateCustomerData,
  validateCarrierData,
  validateVehicleData,
  validateFreightData,
  validateDatesData,
  validateFeesData,
  checkDuplicateVIN,
  validateObjectId,
  validateCreatedBy,
  processCustomer,
  processCarrier,
};

