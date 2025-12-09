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
  return {
    id: customer._id || customer.id,
    companyName: customer.companyName,
    customerAddress: addressDTO(customer.customerAddress),
    emails: customer.emails || [],
    phoneNumber: customer.phoneNumber,
    // Платежная информация
    paymentMethod: customer.paymentMethod,
    paymentTerms: customer.paymentTerms,
    creditLimit: customer.creditLimit
  };
}

function carrierDTO(carrier) {
  if (!carrier) return null;
  return {
    id: carrier._id || carrier.id,
    name: carrier.name,
    phoneNumber: carrier.phoneNumber,
    email: carrier.email,
    companyName: carrier.companyName,
    mcNumber: carrier.mcNumber,
    dotNumber: carrier.dotNumber,
    address: addressDTO(carrier.address),
    emails: carrier.emails || [],
    photos: carrier.photos || [],
    equipmentType: carrier.equipmentType,
    size: carrier.size,
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
  return {
    shipment: (vehicle.shipment || []).map(ship => ({
      vin: ship.vin,
      make: ship.make,
      model: ship.model,
      year: ship.year,
      value: ship.value
    })),
    specialRequirements: vehicle.specialRequirements,
    vehicleImages: vehicle.vehicleImages || []
  };
}

function freightDTO(freight) {
  if (!freight) return null;
  return {
    shipment: (freight.shipment || []).map(ship => ({
      commodity: ship.commodity,
      dimensionsLength: ship.dimensionsLength,
      dimensionsWidth: ship.dimensionsWidth,
      dimensionsHeight: ship.dimensionsHeight,
      weight: ship.weight,
      poNumber: ship.poNumber,
      pickupNumber: ship.pickupNumber
    })),
    freightImages: freight.freightImages || []
  };
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
  return {
    id: payment._id || payment.id,
    status: payment.status,
    amount: payment.amount,
    totalAmount: payment.totalAmount,
    paidAmount: payment.paidAmount,
    invoiceNumber: payment.invoiceNumber,
    dueDate: payment.dueDate
  };
}

function paymentPayableDTO(payment) {
  if (!payment) return null;
  // Если это только ObjectId, возвращаем только id
  if (typeof payment === 'string' || payment._bsontype === 'ObjectID') {
    return { id: payment.toString() };
  }
  return {
    id: payment._id || payment.id,
    status: payment.status,
    amount: payment.amount,
    grossAmount: payment.grossAmount,
    netAmount: payment.netAmount,
    paidAmount: payment.paidAmount,
    scheduledDate: payment.scheduledDate
  };
}

function toLoadDTO(load = {}) {
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
    insurance: load.insurance || {},
    status: load.status,
    dates: load.dates || {},
    tracking: load.tracking,
    documents: Array.isArray(load.documents) ? load.documents : [],
    // Дополнительные поля
    bolPdfPath: load.bolPdfPath,
    rateConfirmationPdfPath: load.rateConfirmationPdfPath,
    // Ссылки на платежные записи
    paymentReceivable: paymentReceivableDTO(load.paymentReceivable),
    paymentPayable: paymentPayableDTO(load.paymentPayable),
    lastEmailSent: load.lastEmailSent,
    createdBy: load.createdBy,
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
    dates: load.dates || {},
    tracking: load.tracking,
    documentsCount: Array.isArray(load.documents) ? load.documents.length : 0,
    createdBy: load.createdBy,
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
