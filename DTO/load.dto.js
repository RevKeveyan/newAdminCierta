
function toLoadListDTO(load = {}) {
  return {
    id: load._id,
    type: load.type,
    vin: load.vin,
    status: load.status,
    category: load.category,
    assignedDate: load.assignedDate,
    pickUpDate: load.pickUpDate,
    deliveryDate: load.deliveryDate,
    pickUpLocation: addressDTO(load.pickUpLocation),
    deliveryLocation: addressDTO(load.deliveryLocation),
    carrier: carrierDTO(load.carrier),
    customerCompanyName: load.customerCompanyName,
    imagesCount: Array.isArray(load.images) ? load.images.length : 0,
    aging: load.aging,
    createdBy: load.createdBy,
    createdAt: load.createdAt,
    updatedAt: load.updatedAt,
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
      id: load._id,
      type: load.type,
      vin: load.vin,
      status: load.status,
      carrier: load.carrier?.name,
      customer: load.customerCompanyName,
      value: load.value,
      createdAt: load.createdAt
    };
  }
}



function toLoadDTO(load = {}) {
  return {
    id: load._id,
    type: load.type,
    vin: load.vin,
    category: load.category,
    customerCompanyName: load.customerCompanyName,

    carrier: {
      ...carrierDTO(load.carrier),
      carrierImageFile: load.carrier?.carrierImageFile || [],
    },

    customerEmails: Array.isArray(load.customerEmails) ? load.customerEmails : [],
    assignedDate: load.assignedDate,

    pickUpLocation: addressDTO(load.pickUpLocation),
    deliveryLocation: addressDTO(load.deliveryLocation),

    pickUpDate: load.pickUpDate,
    deliveryDate: load.deliveryDate,
    status: load.status,

    carrierPaymentStatus: paymentStatusDTO(load.carrierPaymentStatus),
    customerPaymentStatus: paymentStatusDTO(load.customerPaymentStatus),

    images: Array.isArray(load.images) ? load.images : [],
    aging: load.aging,
    tracking: load.tracking,

    vehicleDetails: vehicleDetailsDTO(load.vehicleDetails),
    specialRequirements: load.specialRequirements,
    insurance: load.insurance,
    value: load.value,
    lastEmailSent: load.lastEmailSent,

    fees: {
      tonuPaidToCarrier: !!load.tonuPaidToCarrier,
      detentionPaidToCarrier: !!load.detentionPaidToCarrier,
      layoverPaidToCarrier: !!load.layoverPaidToCarrier,
      tonuReceivedFromCustomer: !!load.tonuReceivedFromCustomer,
      detentionReceivedFromCustomer: !!load.detentionReceivedFromCustomer,
      layoverReceivedFromCustomer: !!load.layoverReceivedFromCustomer,
    },

    createdBy: load.createdBy,
    createdAt: load.createdAt,
    updatedAt: load.updatedAt,
  };
}

// Helper DTO functions
function addressDTO(address) {
  if (!address) return null;
  return {
    name: address.name,
    address: address.address,
    city: address.city,
    state: address.state,
    zip: address.zip,
    contactPhone: address.contactPhone,
    loc: address.loc
  };
}

function carrierDTO(carrier) {
  if (!carrier) return null;
  return {
    name: carrier.name,
    mcNumber: carrier.mcNumber,
    contact: carrier.contact,
    email: carrier.email,
    carrierType: carrier.carrierType
  };
}

function vehicleDetailsDTO(vehicleDetails) {
  if (!vehicleDetails) return null;
  return {
    make: vehicleDetails.make,
    model: vehicleDetails.model,
    year: vehicleDetails.year,
    color: vehicleDetails.color,
    mileage: vehicleDetails.mileage
  };
}

function paymentStatusDTO(paymentStatus) {
  if (!paymentStatus) return null;
  return {
    status: paymentStatus.status,
    date: paymentStatus.date
  };
}

module.exports = { toLoadDTO, toLoadListDTO, LoadDTO };
