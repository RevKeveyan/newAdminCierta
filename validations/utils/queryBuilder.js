/**
 * queryBuilder
 * Converts query parameters into MongoDB filter, sort, and pagination options
 */
const buildQuery = (query) => {
  const filter = {};
  let sort = {};
  let page = parseInt(query.page) || 1;
  let limit = parseInt(query.limit) || 10;

  // ===== SEARCH =====
  if (query.search) {
    const searchRegex = new RegExp(query.search, 'i');
    filter.$or = [
      { customerCompanyName: searchRegex },
      { 'carrier.name': searchRegex },
      { 'carrier.mcNumber': searchRegex },
      { vin: searchRegex },
      { category: searchRegex }
    ];
  }

  // ===== DATE RANGES =====
  const dateFields = ['pickUpDate', 'deliveryDate', 'createdAt', 'assignedDate'];
  dateFields.forEach((field) => {
    if (query[`${field}From`] || query[`${field}To`]) {
      filter[field] = {};
      if (query[`${field}From`]) {
        filter[field].$gte = new Date(query[`${field}From`]);
      }
      if (query[`${field}To`]) {
        filter[field].$lte = new Date(query[`${field}To`]);
      }
    }
  });

  // ===== STATUS FILTERS =====
  if (query.status) {
    filter.status = { $in: query.status.split(',') };
  }
  if (query.carrierPaymentStatus) {
    filter['carrierPaymentStatus.status'] = { $in: query.carrierPaymentStatus.split(',') };
  }
  if (query.customerPaymentStatus) {
    filter['customerPaymentStatus.status'] = { $in: query.customerPaymentStatus.split(',') };
  }

  // ===== CARRIER TYPES =====
  if (query.carrierType) {
    filter['carrier.carrierType'] = { $in: query.carrierType.split(',') };
  }

  // ===== ORDER IDs & RANGE =====
  if (query.vin) {
    if (query.vin.includes('-')) {
      // range
      const [start, end] = query.vin.split('-');
      filter.vin = { $gte: start.trim(), $lte: end.trim() };
    } else {
      filter.vin = query.vin;
    }
  }

  // ===== MISCELLANEOUS =====
  ['tonuPaidToCarrier', 'detentionPaidToCarrier', 'layoverPaidToCarrier',
   'tonuReceivedFromCustomer', 'detentionReceivedFromCustomer', 'layoverReceivedFromCustomer']
   .forEach(field => {
      if (query[field] !== undefined) {
        filter[field] = query[field] === 'true';
      }
    });

  // ===== SORT =====
  if (query.sortBy) {
    sort[query.sortBy] = query.sortOrder === 'asc' ? 1 : -1;
  } else {
    sort = { createdAt: -1 }; // default
  }

  return { filter, sort, page, limit };
};

module.exports = { buildQuery };
