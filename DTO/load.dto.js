// Helper DTO functions
function addressDTO(address) {
  if (!address) return null;
  return {
    address: address.address,
    city: address.city,
    state: address.state,
    zipCode: address.zipCode || address.zip?.toString(),
    // Обратная совместимость
    name: address.name,
    zip: address.zip,
    loc: address.loc,
    contactPhone: address.contactPhone
  };
}

function customerDTO(customer) {
  if (!customer) return null;
  
  // Format allowedUsers - if populated, extract id, firstName, lastName, email
  let allowedUsers = [];
  if (customer.allowedUsers && Array.isArray(customer.allowedUsers)) {
    allowedUsers = customer.allowedUsers.map(user => {
      if (user && typeof user === 'object') {
        // If populated (has firstName or email), return object with user data
        if (user.firstName || user.email) {
          return {
            id: user._id || user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email
          };
        }
        // If just ID, return as string
        return user._id || user.id || user;
      }
      return user;
    });
  }
  
  // Format representativePeoples - embedded subdocuments, no populate needed
  let representativePeoples = [];
  if (customer.representativePeoples && Array.isArray(customer.representativePeoples)) {
    representativePeoples = customer.representativePeoples.map(person => {
      if (person && typeof person === 'object') {
        return {
          id: person._id || person.id,
          fullName: person.fullName,
          email: person.email,
          phoneNumber: person.phoneNumber
        };
      }
      return person;
    });
  }
  
  return {
    id: customer._id || customer.id,
    companyName: customer.companyName,
    type: customer.type || 'customer',
    customerAddress: addressDTO(customer.customerAddress),
    email: customer.email || null,
    phoneNumber: customer.phoneNumber,
    // Платежная информация
    paymentMethod: customer.paymentMethod,
    paymentTerms: customer.paymentTerms,
    creditLimit: customer.creditLimit,
    allowedUsers: allowedUsers,
    representativePeoples: representativePeoples
  };
}

function carrierDTO(carrier) {
  if (!carrier) return null;
  return {
    id: carrier._id || carrier.id,
    name: carrier.name,
    // type field removed - use people array instead
    people: Array.isArray(carrier.people) ? carrier.people : [],
    phoneNumber: carrier.phoneNumber,
    email: carrier.email,
    companyName: carrier.companyName,
    dba: carrier.dba,
    mcNumber: carrier.mcNumber,
    dotNumber: carrier.dotNumber,
    address: addressDTO(carrier.address),
    photos: carrier.photos || [],
    equipment: Array.isArray(carrier.equipment) ? carrier.equipment : [],
    equipmentType: Array.isArray(carrier.equipmentType) ? carrier.equipmentType : (carrier.equipmentType ? [carrier.equipmentType] : []),
    size: Array.isArray(carrier.size) ? carrier.size : (carrier.size ? [carrier.size] : []),
    capabilities: Array.isArray(carrier.capabilities) ? carrier.capabilities : [],
    certifications: Array.isArray(carrier.certifications) ? carrier.certifications : [],
    // Банковские реквизиты
    routing: carrier.routing,
    bankAccount: carrier.bankAccount,
    accountNumber: carrier.accountNumber
  };
}

function vehicleDTO(vehicle) {
  if (!vehicle) return null;
  // Extract images from either field, but only return vehicleImages
  const vehicleImages = vehicle.vehicleImages || vehicle.images || [];
  
  // Create clean object - explicitly exclude 'images' field
  const result = {
    shipment: (vehicle.shipment || []).map(ship => ({
      vin: ship.vin,
      make: ship.make,
      model: ship.model,
      year: ship.year,
      value: ship.value
    })),
    specialRequirements: vehicle.specialRequirements,
    vehicleImages: vehicleImages
  };
  
  // Ensure 'images' field is never included
  return result;
}

function freightDTO(freight) {
  if (!freight) return null;
  // Extract images from either field, but only return freightImages
  const freightImages = freight.freightImages || freight.images || [];
  
  // Create clean object - explicitly exclude 'images' field
  const result = {
    shipment: (freight.shipment || []).map(ship => ({
      commodity: ship.commodity,
      dimensionsLength: ship.dimensionsLength,
      dimensionsWidth: ship.dimensionsWidth,
      dimensionsHeight: ship.dimensionsHeight,
      dimensionsUnit: ship.dimensionsUnit,
      onPallets: ship.onPallets,
      weight: ship.weight,
      shipmentUnits: ship.shipmentUnits,
      poNumber: ship.poNumber,
      pickupNumber: ship.pickupNumber,
      deliveryReference: ship.deliveryReference
    })),
    freightImages: freightImages
  };
  
  // Ensure 'images' field is never included
  return result;
}

function locationDTO(location) {
  if (!location) return null;
  return {
    locationName: location.locationName,
    address: addressDTO(location.address),
    contactPhone: location.contactPhone,
    notes: location.notes,
    date: location.date,
    images: location.images || []
  };
}

function paymentReceivableDTO(payment) {
  if (!payment) return null;
  // Если это только ObjectId, возвращаем только id
  if (typeof payment === 'string' || payment._bsontype === 'ObjectID') {
    return { id: payment.toString() };
  }
  
  // Используем полный DTO если доступен
  const PaymentReceivableDTO = require('./paymentReceivable.dto');
  if (PaymentReceivableDTO && PaymentReceivableDTO.format) {
    return PaymentReceivableDTO.format(payment);
  }
  
  // Fallback: базовая версия с основными полями
  return {
    id: payment._id || payment.id,
    loadId: payment.loadId || null,
    orderId: payment.orderId || null,
    customer: payment.customer || null,
    status: payment.status || 'pending',
    paymentMethod: payment.paymentMethod || null,
    paymentLink: payment.paymentLink || null,
    notes: payment.notes || null,
    customerRate: payment.customerRate || null,
    totalAmount: payment.totalAmount || null,
    fees: Array.isArray(payment.fees) ? payment.fees : [],
    tonu: payment.tonu || { enabled: false, customerRate: 0 },
    deadlineDays: payment.deadlineDays || null,
    invoiceAt: payment.invoiceAt || null,
    dueAt: payment.dueAt || null,
    statusSince: payment.statusSince || null,
    holdStartedAt: payment.holdStartedAt || null,
    receivedAt: payment.receivedAt || null,
    nextNotifyAt: payment.nextNotifyAt || null,
    notified: payment.notified || {
      overdueAt: null,
      overdueRepeatAt: null,
      payTodayAt: null
    },
    // Legacy fields for backward compatibility
    statusChangedAt: payment.statusChangedAt || payment.statusSince || null,
    payedDate: payment.payedDate || payment.receivedAt || null,
    daysOnHold: payment.holdStartedAt ? Math.floor((new Date() - new Date(payment.holdStartedAt)) / (1000 * 60 * 60 * 24)) : null,
    images: Array.isArray(payment.images) ? payment.images : [],
    pdfs: Array.isArray(payment.pdfs) ? payment.pdfs : [],
    createdAt: payment.createdAt || null,
    updatedAt: payment.updatedAt || null
  };
}

function paymentPayableDTO(payment) {
  if (!payment) return null;
  // Если это только ObjectId, возвращаем только id
  if (typeof payment === 'string' || payment._bsontype === 'ObjectID') {
    return { id: payment.toString() };
  }
  
  // Используем полный DTO если доступен
  const PaymentPayableDTO = require('./paymentPayable.dto');
  if (PaymentPayableDTO && PaymentPayableDTO.format) {
    return PaymentPayableDTO.format(payment);
  }
  
  // Fallback: базовая версия с основными полями
  return {
    id: payment._id || payment.id,
    loadId: payment.loadId || null,
    orderId: payment.orderId || null,
    carrier: payment.carrier || null,
    status: payment.status || 'pending',
    paymentMethod: payment.paymentMethod || null,
    bank: payment.bank || null,
    routing: payment.routing || null,
    accountNumber: payment.accountNumber || null,
    notes: payment.notes || null,
    carrierRate: payment.carrierRate || null,
    totalAmount: payment.totalAmount || null,
    fees: Array.isArray(payment.fees) ? payment.fees : [],
    tonu: payment.tonu || { enabled: false, carrierRate: 0 },
    deadlineDays: payment.deadlineDays || null,
    invoiceAt: payment.invoiceAt || null,
    dueAt: payment.dueAt || null,
    statusSince: payment.statusSince || null,
    holdStartedAt: payment.holdStartedAt || null,
    paidAt: payment.paidAt || null,
    nextNotifyAt: payment.nextNotifyAt || null,
    notified: payment.notified || {
      dueSoonAt: null,
      dueTodayAt: null,
      payTodayAt: null,
      overdueAt: null
    },
    // Legacy fields for backward compatibility
    statusChangedAt: payment.statusChangedAt || payment.statusSince || null,
    payedDate: payment.payedDate || payment.paidAt || null,
    daysOnHold: payment.holdStartedAt ? Math.floor((new Date() - new Date(payment.holdStartedAt)) / (1000 * 60 * 60 * 24)) : null,
    images: Array.isArray(payment.images) ? payment.images : [],
    pdfs: Array.isArray(payment.pdfs) ? payment.pdfs : [],
    createdAt: payment.createdAt || null,
    updatedAt: payment.updatedAt || null
  };
}

function userDTO(user) {
  if (!user) return null;
  // Если это только ObjectId, возвращаем только id
  if (typeof user === 'string' || user._bsontype === 'ObjectID') {
    return { id: user.toString() };
  }
  return {
    id: user._id || user.id,
    name: user.firstName && user.lastName 
      ? `${user.firstName} ${user.lastName}`.trim()
      : user.name || null,
    firstName: user.firstName,
    lastName: user.lastName,
    companyName: user.companyName,
    email: user.email
  };
}

function toLoadDTO(load = {}) {
  // Format loadCarrierPeople
  let loadCarrierPeople = [];
  if (load.loadCarrierPeople && Array.isArray(load.loadCarrierPeople)) {
    loadCarrierPeople = load.loadCarrierPeople.map(person => {
      if (person && typeof person === 'object') {
        return {
          id: person._id || person.id,
          type: person.type,
          fullName: person.fullName,
          email: person.email,
          phoneNumber: person.phoneNumber
        };
      }
      return person;
    });
  }

  // Format loadCustomerRepresentativePeoples
  let loadCustomerRepresentativePeoples = [];
  if (load.loadCustomerRepresentativePeoples && Array.isArray(load.loadCustomerRepresentativePeoples)) {
    loadCustomerRepresentativePeoples = load.loadCustomerRepresentativePeoples.map(person => {
      if (person && typeof person === 'object') {
        return {
          id: person._id || person.id,
          fullName: person.fullName,
          email: person.email,
          phoneNumber: person.phoneNumber
        };
      }
      return person;
    });
  }

  return {
    id: load._id || load.id,
    orderId: load.orderId,
    customer: customerDTO(load.customer),
    customerEmails: Array.isArray(load.customerEmails) ? load.customerEmails : [],
    customerRate: load.customerRate,
    carrierRate: load.carrierRate,
    type: load.type || { freight: false, vehicle: false },
    vehicle: vehicleDTO(load.vehicle),
    freight: freightDTO(load.freight),
    pickup: locationDTO(load.pickup),
    delivery: locationDTO(load.delivery),
    carrier: carrierDTO(load.carrier),
    carrierEmails: Array.isArray(load.carrierEmails) ? load.carrierEmails : [],
    carrierPhotos: Array.isArray(load.carrierPhotos) ? load.carrierPhotos : [],
    // Independent copies of people for this specific load
    loadCarrierPeople: loadCarrierPeople,
    loadCustomerRepresentativePeoples: loadCustomerRepresentativePeoples,
    insurance: load.insurance || {},
    status: load.status,
    dates: {
      assignedDate: load.dates?.assignedDate || '',
      deadline: load.dates?.deadline || '',
      pickupDate: load.dates?.pickupDate || '',
      pickupDateType: load.dates?.pickupDateType || 'Exact',
      pickupDateStart: load.dates?.pickupDateStart || '',
      pickupDateEnd: load.dates?.pickupDateEnd || '',
      deliveryDate: load.dates?.deliveryDate || '',
      deliveryDateType: load.dates?.deliveryDateType || 'Exact',
      deliveryDateStart: load.dates?.deliveryDateStart || '',
      deliveryDateEnd: load.dates?.deliveryDateEnd || '',
      aging: load.dates?.aging || ''
    },
    tracking: load.tracking,
    bolDocuments: Array.isArray(load.bolDocuments) ? load.bolDocuments : [],
    rateConfirmationDocuments: Array.isArray(load.rateConfirmationDocuments) ? load.rateConfirmationDocuments : [],
    documents: Array.isArray(load.documents) ? load.documents : [],
    fees: Array.isArray(load.fees) ? load.fees : [],
    tonu: load.tonu || { enabled: false, carrierRate: '', customerRate: '' },
    // Payment Information
    paymentMethod: load.paymentMethod || null,
    paymentTerms: load.paymentTerms || null,
    // Дополнительные поля
    bolPdfPath: load.bolPdfPath,
    rateConfirmationPdfPath: load.rateConfirmationPdfPath,
    // Ссылки на платежные записи
    paymentReceivable: paymentReceivableDTO(load.paymentReceivable),
    paymentPayable: paymentPayableDTO(load.paymentPayable),
    lastEmailSent: load.lastEmailSent,
    createdBy: userDTO(load.createdBy),
    updatedBy: userDTO(load.updatedBy),
    createdAt: load.createdAt,
    updatedAt: load.updatedAt
  };
}

function toLoadListDTO(load = {}) {
  return {
    id: load._id || load.id,
    orderId: load.orderId,
    status: load.status,
    customer: customerDTO(load.customer),
    carrier: carrierDTO(load.carrier),
    pickup: locationDTO(load.pickup),
    delivery: locationDTO(load.delivery),
    dates: {
      assignedDate: load.dates?.assignedDate || '',
      deadline: load.dates?.deadline || '',
      pickupDate: load.dates?.pickupDate || '',
      pickupDateType: load.dates?.pickupDateType || 'Exact',
      pickupDateStart: load.dates?.pickupDateStart || '',
      pickupDateEnd: load.dates?.pickupDateEnd || '',
      deliveryDate: load.dates?.deliveryDate || '',
      deliveryDateType: load.dates?.deliveryDateType || 'Exact',
      deliveryDateStart: load.dates?.deliveryDateStart || '',
      deliveryDateEnd: load.dates?.deliveryDateEnd || '',
      aging: load.dates?.aging || ''
    },
    tracking: load.tracking,
    documentsCount: Array.isArray(load.documents) ? load.documents.length : 0,
    createdBy: userDTO(load.createdBy),
    updatedBy: userDTO(load.updatedBy),
    createdAt: load.createdAt,
    updatedAt: load.updatedAt
  };
}

// Класс DTO для совместимости с UniversalBaseController
class LoadDTO {
  static format(load) {
    return toLoadDTO(load);
  }

  static formatList(loads) {
    return loads.map(load => toLoadListDTO(load));
  }

  static formatSummary(load) {
    return {
      id: load._id || load.id,
      orderId: load.orderId,
      status: load.status,
      customer: load.customer?.companyName,
      carrier: load.carrier?.name,
      type: load.type,
      createdAt: load.createdAt
    };
  }
}

module.exports = { toLoadDTO, toLoadListDTO, LoadDTO };
