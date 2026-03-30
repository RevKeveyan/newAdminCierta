const UniversalBaseController = require("./UniversalBaseController");
const Load = require("../models/Load");
const User = require("../models/User");
const Customer = require("../models/Customer");
const Carrier = require("../models/Carrier");
const LoadHistory = require("../models/subModels/LoadHistory");
const PaymentReceivable = require("../models/subModels/PaymentReceivable");
const PaymentPayable = require("../models/subModels/PaymentPayable");
const LoadDTO = require("../DTO/load.dto");
const notificationService = require("../services/notificationService");
const notificationClient = require("../services/notificationClient");
const loadService = require("../services/loadService");
const customerService = require("../services/customerService");
const carrierService = require("../services/carrierService");
const { sendLoadDetailsEmail, sendLoadFilesEmail } = require("../mailer/mailer");
const {
  parseJsonField,
  filterNullValues,
  syncImageFields,
  syncFreightFields,
} = require("../utils/dataHelpers");
const {
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
} = require("../utils/loadValidation");
const {
  prepareLoadDocument,
  processUploadedFiles,
  finalizeLoadDocument,
  prepareUpdateData,
  normalizeEmailsForLoad,
} = require("../utils/loadHelpers");
const {
  updateS3KeysForEntity,
  deleteFromS3Multiple,
  extractKeyFromUrl,
  getSignedUrlForObject,
  getObjectFromS3,
  uploadToS3,
} = require("../services/s3Service");
const fs = require("fs").promises;
const crypto = require("crypto");
const pdfService = require("../services/pdfService");
const {
  updateTempFileKeys,
  fixTempKeysInLoad,
  processDeletedFiles,
  processUploadedFilesForUpdate,
  updateCustomerCarrierLinks,
  createActor,
  formatDocument,
  normalizeObjectIdFields,
  getLoadsWithPagination,
} = require("../utils/loadControllerHelpers");
const { markDirtyForLoad, markDirtyDays, markDirtyForLoadChange } = require("../utils/markDirty");
const { registerLoadStatsDelta } = require("../utils/statsDelta");
const mongoose = require("mongoose");

function normalizeLocationAddress(location) {
  if (!location || typeof location !== 'object') {
    return location;
  }

  const normalized = { ...location };
  const addressObj = (location.address && typeof location.address === 'object' && !Array.isArray(location.address))
    ? { ...location.address }
    : {};

  if (typeof location.address === 'string' && location.address.trim() !== '') {
    addressObj.address = location.address;
  }
  if (location.city && !addressObj.city) {
    addressObj.city = location.city;
  }
  if (location.state && !addressObj.state) {
    addressObj.state = location.state;
  }
  if ((location.zipCode || location.zip) && !addressObj.zipCode) {
    addressObj.zipCode = location.zipCode || location.zip;
  }

  if (Object.keys(addressObj).length > 0) {
    normalized.address = addressObj;
  }

  delete normalized.city;
  delete normalized.state;
  delete normalized.zipCode;
  delete normalized.zip;

  return normalized;
}

function getStep5ResetData(oldDoc) {
  const pickup = oldDoc?.pickup
    ? (oldDoc.pickup.toObject ? oldDoc.pickup.toObject() : oldDoc.pickup)
    : null;
  const delivery = oldDoc?.delivery
    ? (oldDoc.delivery.toObject ? oldDoc.delivery.toObject() : oldDoc.delivery)
    : null;

  return {
    carrier: null,
    carrierEmails: [],
    carrierPhotos: [],
    carrierRate: null,
    tracking: null,
    fees: [],
    tonu: { enabled: false },
    paymentMethod: null,
    paymentTerms: null,
    insurance: null,
    bolDocuments: [],
    rateConfirmationDocuments: [],
    documents: [],
    dates: {
      assignedDate: '',
      deadline: '',
      pickupDate: '',
      pickupDateStart: '',
      pickupDateEnd: '',
      pickupDateType: 'Exact',
      deliveryDate: '',
      deliveryDateStart: '',
      deliveryDateEnd: '',
      deliveryDateType: 'Exact',
      aging: ''
    },
    ...(pickup ? { pickup: { ...pickup, images: [] } } : {}),
    ...(delivery ? { delivery: { ...delivery, images: [] } } : {})
  };
}

const ADMIN_ROLES = new Set(['admin', 'manager']);
const ACCOUNTING_ROLES = new Set(['accountingManager', 'accountingIn', 'accountingOut']);
const STEP5_ALLOWED_PATHS = [
  'carrier',
  'carrierEmails',
  'carrierRate',
  'carrierPhotos',
  'insurance',
  'status',
  'dates',
  'paymentMethod',
  'paymentTerms',
  'bolDocuments',
  'rateConfirmationDocuments',
  'documents',
  'fees',
  'tonu',
  'tracking',
  'pickup.images',
  'delivery.images'
];
const STEP1_4_ALLOWED_PATHS = [
  'orderId',
  'customer',
  'customerEmails',
  'customerRate',
  'loadCustomerRepresentativePeoples',
  'type',
  'vehicle',
  'freight',
  'pickup',
  'delivery',
  'dates.assignedDate',
  'dates.deadline'
];
const PAYMENT_VIEW_ROLES = new Set(['admin', 'accountingManager', 'accountingIn', 'accountingOut']);

function getIdString(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value._id) return value._id.toString();
  if (value.id) return value.id.toString();
  if (value.toString) return value.toString();
  return null;
}

function getPathValue(source, path) {
  if (!source || !path) return undefined;
  const parts = path.split('.');
  let current = source;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function setPathValue(target, path, value) {
  const parts = path.split('.');
  let current = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part] || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

function pickByPaths(source, paths) {
  if (!source || typeof source !== 'object') return source;
  const result = {};
  paths.forEach((path) => {
    const value = getPathValue(source, path);
    if (value !== undefined) {
      setPathValue(result, path, value);
    }
  });
  return result;
}

function filterLoadDataByRole(role, loadData) {
  if (!loadData || typeof loadData !== 'object') return loadData;
  if (role === 'dispatcher') {
    return pickByPaths(loadData, STEP5_ALLOWED_PATHS);
  }
  if (role === 'Pre-dispatcher') {
    const filtered = pickByPaths(loadData, STEP1_4_ALLOWED_PATHS);
    if (filtered.pickup && Object.prototype.hasOwnProperty.call(filtered.pickup, 'images')) {
      delete filtered.pickup.images;
    }
    if (filtered.delivery && Object.prototype.hasOwnProperty.call(filtered.delivery, 'images')) {
      delete filtered.delivery.images;
    }
    return filtered;
  }
  return loadData;
}

async function resolveAccessContext(req) {
  const userId = req.user?.id;
  if (!userId) {
    return { error: { status: 401, error: 'Authentication required' } };
  }
  const user = await User.findById(userId).select('role allowedCustomers').lean();
  if (!user) {
    return { error: { status: 401, error: 'User not found' } };
  }
  const allowedCustomerIds = Array.isArray(user.allowedCustomers)
    ? user.allowedCustomers.map((id) => id.toString())
    : [];
  return { user, role: user.role, allowedCustomerIds };
}

async function getPlatformCustomerIds() {
  const customers = await Customer.find({ type: 'platform' }).select('_id').lean();
  return customers.map((item) => item._id.toString());
}

function mergeFilters(accessFilter, baseFilter) {
  const hasAccess = accessFilter && Object.keys(accessFilter).length > 0;
  const hasBase = baseFilter && Object.keys(baseFilter).length > 0;
  if (hasAccess && hasBase) {
    return { $and: [accessFilter, baseFilter] };
  }
  if (hasAccess) return accessFilter;
  return baseFilter || {};
}

async function getAccessFilter(context) {
  const { role, user, allowedCustomerIds } = context;
  if (ADMIN_ROLES.has(role)) {
    return { filter: {} };
  }
  if (ACCOUNTING_ROLES.has(role)) {
    return { error: { status: 403, error: 'Access denied' } };
  }
  if (role === 'partner') {
    return { partnerOnly: true };
  }
  if (role === 'freightBroker') {
    return { filter: { createdBy: user._id } };
  }
  if (role === 'dispatcher' || role === 'Pre-dispatcher' || role === 'bidAgent') {
    return { filter: { customer: { $in: allowedCustomerIds } } };
  }
  if (role === 'salesAgent') {
    const platformCustomerIds = await getPlatformCustomerIds();
    return { filter: { customer: { $in: platformCustomerIds } }, platformCustomerIds };
  }
  return { error: { status: 403, error: 'Access denied' } };
}

async function isPlatformLoad(load) {
  const customer = load?.customer;
  if (customer && typeof customer === 'object' && customer.type) {
    return customer.type === 'platform';
  }
  const customerId = getIdString(customer);
  if (!customerId) return false;
  const customerDoc = await Customer.findById(customerId).select('type').lean();
  return customerDoc?.type === 'platform';
}

async function hasLoadReadAccess(context, load) {
  const { role, user, allowedCustomerIds } = context;
  if (ADMIN_ROLES.has(role)) return true;
  if (ACCOUNTING_ROLES.has(role) || role === 'partner') return false;
  if (role === 'freightBroker') {
    return getIdString(load.createdBy) === user._id.toString();
  }
  if (role === 'dispatcher' || role === 'Pre-dispatcher' || role === 'bidAgent') {
    const customerId = getIdString(load.customer);
    return customerId ? allowedCustomerIds.includes(customerId) : false;
  }
  if (role === 'salesAgent') {
    return await isPlatformLoad(load);
  }
  return false;
}

function canCreateLoad(role) {
  return ADMIN_ROLES.has(role) || role === 'freightBroker' || role === 'salesAgent' || role === 'Pre-dispatcher';
}

function canUpdateLoad(role) {
  return ADMIN_ROLES.has(role) || role === 'freightBroker' || role === 'salesAgent' || role === 'dispatcher' || role === 'Pre-dispatcher';
}

function canUpdateStatus(role) {
  return ADMIN_ROLES.has(role) || role === 'freightBroker' || role === 'salesAgent' || role === 'dispatcher';
}

function formatPartnerLoad(load) {
  const formatted = LoadDTO.LoadDTO?.format ? LoadDTO.LoadDTO.format(load) : load;
  return {
    id: formatted.id,
    orderId: formatted.orderId,
    status: formatted.status,
    type: formatted.type,
    vehicle: formatted.vehicle,
    freight: formatted.freight,
    pickup: formatted.pickup,
    delivery: formatted.delivery,
    dates: formatted.dates
  };
}

function stripPaymentFields(load) {
  if (!load || typeof load !== 'object') return load;
  const { paymentReceivable, paymentPayable, ...rest } = load;
  return rest;
}

function maybeStripPaymentFields(role, load) {
  if (PAYMENT_VIEW_ROLES.has(role)) {
    return load;
  }
  return stripPaymentFields(load);
}

/**
 * Helper to convert array of S3 keys to signed URLs
 * Filters out invalid keys (files that don't exist in S3)
 */
async function convertArrayToSignedUrls(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return arr;
  const results = await Promise.all(
    arr.map(async (key) => {
      // If already a signed URL, return as-is
      if (typeof key === 'string' && key && (key.startsWith('http://') || key.startsWith('https://'))) {
        return key;
      }
      // If it's an S3 key, try to get signed URL
      if (typeof key === 'string' && key && !key.startsWith('http')) {
        try {
          const signedUrl = await getSignedUrlForObject(key, 3600);
          // Only return signed URL if it was successfully generated
          // If file doesn't exist, getSignedUrlForObject returns null
          return signedUrl;
        } catch (error) {
          console.warn(`Failed to generate signed URL for key: ${key}`, error.message);
          return null; // Filter out invalid keys
        }
      }
      return key;
    })
  );
  // Filter out null values (files that don't exist)
  return results.filter(url => url !== null && url !== undefined);
}

/**
 * Универсальная функция для конвертации массивов полей в signed URLs
 * Модифицирует объект напрямую
 * @param {Object} obj - объект для обработки
 * @param {Array<string>} fields - массив имен полей для конвертации
 */
async function convertFieldsToSignedUrls(obj, fields) {
  if (!obj || !Array.isArray(fields) || fields.length === 0) return;
  
  // Конвертируем все указанные поля
  await Promise.all(
    fields.map(async (field) => {
      if (obj[field] && Array.isArray(obj[field])) {
        obj[field] = await convertArrayToSignedUrls(obj[field]);
      }
    })
  );
}

/**
 * Helper to add signed URLs to load object
 * Converts all S3 keys in load data to signed URLs
 */
async function addSignedUrlsToLoad(load) {
  if (!load) return load;
  
  const result = { ...load };
  
  await convertFieldsToSignedUrls(result, [
    'images',
    'pdfs',
    'bolDocuments',
    'rateConfirmationDocuments',
    'documents',
    'carrierPhotos'
  ]);

  // Convert single file paths
  if (result.bolPdfPath && typeof result.bolPdfPath === 'string' && !result.bolPdfPath.startsWith('http')) {
    const signedUrl = await getSignedUrlForObject(result.bolPdfPath, 3600);
    if (signedUrl) result.bolPdfPath = signedUrl;
  }
  if (result.rateConfirmationPdfPath && typeof result.rateConfirmationPdfPath === 'string' && !result.rateConfirmationPdfPath.startsWith('http')) {
    const signedUrl = await getSignedUrlForObject(result.rateConfirmationPdfPath, 3600);
    if (signedUrl) result.rateConfirmationPdfPath = signedUrl;
  }
  
  // Convert pickup images
  if (result.pickup) {
    result.pickup = { ...result.pickup };
    await convertFieldsToSignedUrls(result.pickup, ['images']);
  }
  
  // Convert delivery images
  if (result.delivery) {
    result.delivery = { ...result.delivery };
    await convertFieldsToSignedUrls(result.delivery, ['images']);
  }
  
  // Convert vehicle images and pdfs
  if (result.vehicle) {
    result.vehicle = { ...result.vehicle };
    await convertFieldsToSignedUrls(result.vehicle, ['vehicleImages', 'pdfs']);
  }
  
  // Convert freight images and pdfs
  if (result.freight) {
    result.freight = { ...result.freight };
    await convertFieldsToSignedUrls(result.freight, ['freightImages', 'pdfs']);
  }
  
  return result;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class LoadController extends UniversalBaseController {
  constructor() {
    super(Load, {
      historyModel: LoadHistory,
      dto: LoadDTO.LoadDTO,
      populateFields: [
        "createdBy",
        "updatedBy",
        "carrier",
        "customer",
        "paymentReceivable",
        "paymentPayable",
      ],
      searchFields: [
        "orderId",
        "status",
        "tracking",
        "customerRate",
        "carrierRate",
        "customerEmails",
        "carrierEmails",
        "paymentMethod",
        "paymentTerms",
        "pickup.locationName",
        "pickup.contactPhone",
        "pickup.notes",
        "pickup.date",
        "pickup.address.address",
        "pickup.address.city",
        "pickup.address.state",
        "pickup.address.zipCode",
        "pickup.address.name",
        "delivery.locationName",
        "delivery.contactPhone",
        "delivery.notes",
        "delivery.date",
        "delivery.address.address",
        "delivery.address.city",
        "delivery.address.state",
        "delivery.address.zipCode",
        "delivery.address.name",
        "insurance.type",
        "insurance.customAmount",
        "dates.assignedDate",
        "dates.deadline",
        "dates.pickupDate",
        "dates.pickupDateStart",
        "dates.pickupDateEnd",
        "dates.deliveryDate",
        "dates.deliveryDateStart",
        "dates.deliveryDateEnd",
        "dates.aging",
        "vehicle.specialRequirements",
        "vehicle.shipment.vin",
        "vehicle.shipment.make",
        "vehicle.shipment.model",
        "vehicle.shipment.year",
        "vehicle.shipment.value",
        "freight.shipment.commodity",
        "freight.shipment.dimensionsLength",
        "freight.shipment.dimensionsWidth",
        "freight.shipment.dimensionsHeight",
        "freight.shipment.dimensionsUnit",
        "freight.shipment.onPallets",
        "freight.shipment.weight",
        "freight.shipment.shipmentUnits",
        "freight.shipment.poNumber",
        "freight.shipment.pickupNumber",
        "freight.shipment.deliveryReference",
        "fees.type",
        "fees.carrierRate",
        "fees.customerRate",
        "fees.total",
        "tonu.carrierRate",
        "tonu.customerRate",
        "loadCarrierPeople.fullName",
        "loadCarrierPeople.email",
        "loadCarrierPeople.phoneNumber",
        "loadCustomerRepresentativePeoples.fullName",
        "loadCustomerRepresentativePeoples.email",
        "loadCustomerRepresentativePeoples.phoneNumber",
      ],
      allowedFilters: [
        "orderId",
        "status",
        "tracking",
        "dates.pickupDate",
        "dates.deliveryDate",
        "dates.assignedDate",
        "dates.deadline",
        "createdAt",
        "customer",
        "carrier",
        "createdBy",
        "type",
        "paymentMethod",
        "paymentTerms",
        "tonu.enabled",
      ],
      validationRules: {
        create: {
          orderId: { required: false, type: "string" },
          "customer.companyName": { required: false, type: "string" },
          "carrier.name": { required: false, type: "string" },
          status: { 
            type: "string", 
            enum: ["Listed", "Dispatched", "Picked Up", "Delivered", "On Hold", "Cancelled"],
            required: false 
          },
        },
        update: {
          orderId: { type: "string" },
          status: { 
            type: "string",
            enum: ["Listed", "Dispatched", "Picked Up", "Delivered", "On Hold", "Cancelled"]
          },
          tracking: { type: "string" },
        },
      },
    });
  }

  buildFilter(filters, search) {
    const filter = super.buildFilter(filters, search);
    if (filter.type !== undefined) {
      const typeVal = filter.type;
      delete filter.type;
      if (typeVal === 'freight') {
        filter['type.freight'] = true;
      } else if (typeVal === 'vehicle') {
        filter['type.vehicle'] = true;
      }
    }
    if (filter['tonu.enabled'] !== undefined) {
      const v = filter['tonu.enabled'];
      if (v === true || v === 'true' || v === '1') filter['tonu.enabled'] = true;
      else if (v === false || v === 'false' || v === '0') filter['tonu.enabled'] = false;
      else delete filter['tonu.enabled'];
    }
    return filter;
  }

  getAll = async (req, res) => {
    try {
      const accessContext = await resolveAccessContext(req);
      if (accessContext.error) {
        return res.status(accessContext.error.status).json({
          success: false,
          error: accessContext.error.error
        });
      }
      const accessFilterResult = await getAccessFilter(accessContext);
      if (accessFilterResult.error) {
        return res.status(accessFilterResult.error.status).json({
          success: false,
          error: accessFilterResult.error.error
        });
      }

      const {
        page = 1,
        limit: requestedLimit = 20,
        sortBy = "createdAt",
        sortOrder = "desc",
        search,
        ...filters
      } = req.query;

      const limit = Math.min(parseInt(requestedLimit), 100);

      if (accessFilterResult.partnerOnly) {
        const orderId = typeof search === 'string' ? search.trim() : '';
        if (!orderId) {
          return res.status(403).json({
            success: false,
            error: "Access denied"
          });
        }
        const result = await getLoadsWithPagination(
          this.model,
          { orderId },
          this.populateFields,
          null,
          page,
          limit,
          { createdAt: -1 }
        );
        const data = result.data.map((load) => formatPartnerLoad(load));
        return res.status(200).json({
          success: true,
          data,
          pagination: result.pagination
        });
      }

      const filterParams = { ...filters };
      delete filterParams.page;
      delete filterParams.limit;
      delete filterParams.sortBy;
      delete filterParams.sortOrder;
      delete filterParams.search;

      const baseFilter = this.buildFilter(filterParams, search);
      const filter = mergeFilters(accessFilterResult.filter, baseFilter);
      const sort = this.buildSort(sortBy, sortOrder);

      // Execute find and countDocuments in parallel for better performance
      const [docs, total] = await Promise.all([
        this.model
          .find(filter)
          .populate(this.populateFields)
          .sort(sort)
          .skip((page - 1) * limit)
          .limit(parseInt(limit))
          .lean(),
        this.model.countDocuments(filter),
      ]);

      let formattedDocs = this.dto
        ? docs.map((doc) => this.dto.format(doc))
        : docs;
      
      // Add signed URLs to all loads
      formattedDocs = await Promise.all(
        formattedDocs.map((load) => addSignedUrlsToLoad(load))
      );
      formattedDocs = formattedDocs.map((load) => maybeStripPaymentFields(accessContext.role, load));
      formattedDocs = formattedDocs.map((load) => maybeStripPaymentFields(accessContext.role, load));

      res.status(200).json({
        success: true,
        data: formattedDocs,
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          limit: parseInt(limit),
        },
      });
    } catch (error) {
      this.handleError(res, error, "Failed to fetch loads");
    }
  };

  search = async (req, res) => {
    try {
      const accessContext = await resolveAccessContext(req);
      if (accessContext.error) {
        return res.status(accessContext.error.status).json({
          success: false,
          error: accessContext.error.error
        });
      }
      const accessFilterResult = await getAccessFilter(accessContext);
      if (accessFilterResult.error) {
        return res.status(accessFilterResult.error.status).json({
          success: false,
          error: accessFilterResult.error.error
        });
      }

      const {
        q: searchTerm,
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        ...filters
      } = req.query;

      if (accessFilterResult.partnerOnly) {
        const orderId = typeof searchTerm === 'string' ? searchTerm.trim() : '';
        if (!orderId) {
          return res.status(403).json({
            success: false,
            error: "Access denied"
          });
        }
        const result = await getLoadsWithPagination(
          this.model,
          { orderId },
          this.populateFields,
          null,
          page,
          limit,
          { createdAt: -1 }
        );
        const data = result.data.map((load) => formatPartnerLoad(load));
        return res.status(200).json({
          success: true,
          data,
          pagination: result.pagination
        });
      }

      let baseFilter = this.buildSearchFilter(filters, searchTerm);
      const trimmedSearch = typeof searchTerm === 'string' ? searchTerm.trim() : '';
      if (trimmedSearch) {
        const searchRegex = { $regex: trimmedSearch, $options: 'i' };
        const [customerIds, carrierIds, userIds] = await Promise.all([
          Customer.find({ companyName: searchRegex }).distinct('_id').lean(),
          Carrier.find({
            $or: [
              { companyName: searchRegex },
              { mcNumber: searchRegex },
              { email: searchRegex },
              { phoneNumber: searchRegex },
              { 'people.email': searchRegex },
              { 'people.phoneNumber': searchRegex },
              { 'people.fullName': searchRegex },
            ]
          }).distinct('_id').lean(),
          User.find({
            $or: [
              { firstName: searchRegex },
              { lastName: searchRegex },
              { email: searchRegex },
              { companyName: searchRegex }
            ]
          }).distinct('_id').lean(),
        ]);
        const refConditions = [];
        if (customerIds.length > 0) refConditions.push({ customer: { $in: customerIds } });
        if (carrierIds.length > 0) refConditions.push({ carrier: { $in: carrierIds } });
        if (userIds.length > 0) refConditions.push({ createdBy: { $in: userIds } });
        if (refConditions.length > 0) {
          const directOr = baseFilter.$or || [];
          baseFilter = { ...baseFilter, $or: [...directOr, ...refConditions] };
        }
      }
      const filter = mergeFilters(accessFilterResult.filter, baseFilter);
      const sort = this.buildSort(sortBy, sortOrder);

      const docs = await this.model
        .find(filter)
        .populate(this.populateFields)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean();

      const total = await this.model.countDocuments(filter);

      let formattedDocs = this.dto ? docs.map((doc) => this.dto.format(doc)) : docs;
      formattedDocs = await Promise.all(
        formattedDocs.map((load) => addSignedUrlsToLoad(load))
      );

      res.status(200).json({
        success: true,
        data: formattedDocs,
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to search loads');
    }
  };

  getById = async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: "Invalid ID format",
        });
      }

      const accessContext = await resolveAccessContext(req);
      if (accessContext.error) {
        return res.status(accessContext.error.status).json({
          success: false,
          error: accessContext.error.error
        });
      }
      if (accessContext.role === 'partner') {
        return res.status(403).json({
          success: false,
          error: "Access denied"
        });
      }

      const doc = await this.model.findById(id).populate(this.populateFields).lean();

      if (!doc) {
        return res.status(404).json({
          success: false,
          error: "Load not found",
        });
      }

      const canRead = await hasLoadReadAccess(accessContext, doc);
      if (!canRead) {
        return res.status(403).json({
          success: false,
          error: "Access denied"
        });
      }

      let formattedDoc = this.dto ? this.dto.format(doc) : doc;
      formattedDoc = await addSignedUrlsToLoad(formattedDoc);
      formattedDoc = maybeStripPaymentFields(accessContext.role, formattedDoc);

      res.status(200).json({
        success: true,
        data: formattedDoc,
      });
    } catch (error) {
      this.handleError(res, error, "Failed to fetch load");
    }
  };

  generateOrderId = async () => {
    const baseTimestamp = Math.floor(Date.now() / 1000);
    const random = Math.floor(Math.random() * 9000) + 1000;
    let orderId = `${baseTimestamp}${random}`;

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      const existing = await this.model
        .findOne({ orderId })
        .select("_id")
        .lean();
      if (!existing) {
        return orderId;
      }
      orderId = `${baseTimestamp}${Math.floor(Math.random() * 9000) + 1000}`;
      attempts++;
    }

    return `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  };

  async createPaymentsOnDelivered(load, userId, session = null, options = {}) {
    const skipPayable = options?.skipPayable === true;
    const loadId = load._id?.toString() || load.id?.toString() || 'unknown';
    const orderId = load.orderId || loadId;
    
    // ============================================
    // ЭТАП 1: ВАЛИДАЦИЯ И ПОДГОТОВКА ДАННЫХ (ВНЕ ТРАНЗАКЦИИ)
    // ============================================
    try {
      // ВАЛИДАЦИЯ: Проверяем обязательные поля
      const validationErrors = [];
      
      if (!load.customer) {
        validationErrors.push("Customer is required to create payments");
      }
      
      const customerRate = parseFloat(load.customerRate) || 0;
      if (!load.customerRate || customerRate <= 0) {
        validationErrors.push("Customer rate is required and must be greater than 0");
      }
      
      if (!skipPayable) {
      if (!load.carrier) {
        validationErrors.push("Carrier is required to create payments");
      }
      
      const carrierRate = parseFloat(load.carrierRate) || 0;
      if (!load.carrierRate || carrierRate <= 0) {
        validationErrors.push("Carrier rate is required and must be greater than 0");
        }
      }
      
      if (validationErrors.length > 0) {
        throw new Error(`Cannot create payments: ${validationErrors.join('; ')}`);
      }

      // ПОДГОТОВКА ДАННЫХ: Загружаем справочные данные ДО транзакции
      
      // Загружаем Customer для получения paymentTerms
      let customerData = null;
      if (load.customer) {
        try {
          const Customer = require('../models/Customer');
          customerData = await Customer.findById(load.customer).lean();
        } catch (error) {
          console.warn(`[LoadController] Warning: Could not load Customer data (non-critical):`, error.message);
        }
      }
      
      // Загружаем Carrier ДО транзакции (read-only операция)
      let carrierData = null;
      if (!skipPayable && load.carrier) {
        try {
          carrierData = await Carrier.findById(load.carrier).lean();
        } catch (error) {
          console.warn(`[LoadController] Warning: Could not load Carrier data (non-critical):`, error.message);
          // Continue without carrier data - bank details will be null
        }
      }

      const paymentMethod = load.paymentMethod || customerData?.paymentMethod || null;

      // Парсим paymentTerms для получения deadlineDays
      // Receivable.deadlineDays = Customer.paymentTerms (fallback на 30)
      // Payable.deadlineDays = Load.paymentTerms (fallback на 30)
      function parseDeadlineDays(paymentTerms) {
        if (!paymentTerms) return 30;
        if (typeof paymentTerms === 'number') return paymentTerms;
        if (typeof paymentTerms === 'string') {
          const trimmed = paymentTerms.trim();
          const match = trimmed.match(/\d+/);
          if (match) {
            return parseInt(match[0], 10);
          }
        }
        return 30;
      }

      const receivableDeadlineDays = parseDeadlineDays(customerData?.paymentTerms);
      const payableDeadlineDays = parseDeadlineDays(load.paymentTerms);

      // Рассчитываем суммы для PaymentReceivable
      const baseCustomerRate = parseFloat(load.customerRate) || 0;
      
      // Обрабатываем fees для customer (доплаты от customer)
      const customerFees = Array.isArray(load.fees) 
        ? load.fees.map(fee => ({
            type: fee.type,
            customerRate: parseFloat(fee.customerRate) || 0,
            total: parseFloat(fee.total) || 0
          }))
        : [];
      const feesCustomerTotal = customerFees.reduce((sum, fee) => sum + fee.customerRate, 0);
      
      // Обрабатываем TONU для customer
      const tonuCustomerRate = (load.tonu?.enabled && load.tonu?.customerRate) 
        ? parseFloat(load.tonu.customerRate) || 0 
        : 0;
      
      const totalCustomerAmount = baseCustomerRate + feesCustomerTotal + tonuCustomerRate;

      let baseCarrierRate = 0;
      let carrierFees = [];
      let feesCarrierTotal = 0;
      let tonuCarrierRate = 0;
      let totalCarrierAmount = 0;
      if (!skipPayable) {
      // Рассчитываем суммы для PaymentPayable
        baseCarrierRate = parseFloat(load.carrierRate) || 0;
      
      // Обрабатываем fees для carrier (доплаты от customer, которые мы платим carrier)
        carrierFees = Array.isArray(load.fees) 
        ? load.fees.map(fee => ({
            type: fee.type,
            carrierRate: parseFloat(fee.carrierRate) || 0,
            total: parseFloat(fee.total) || 0
          }))
        : [];
        feesCarrierTotal = carrierFees.reduce((sum, fee) => sum + fee.carrierRate, 0);
      
      // Обрабатываем TONU для carrier (доплата от customer, которую мы платим carrier)
        tonuCarrierRate = (load.tonu?.enabled && load.tonu?.carrierRate) 
        ? parseFloat(load.tonu.carrierRate) || 0 
        : 0;
      
        totalCarrierAmount = baseCarrierRate + feesCarrierTotal + tonuCarrierRate;
      }

      // Подготавливаем данные для PaymentReceivable
      const receivableData = {
        loadId: load._id || load.id, // Устанавливаем loadId для связи с Load
        orderId: load.orderId, // Order ID из Load
        customer: load.customer,
        customerRate: baseCustomerRate, // Базовая ставка
        totalAmount: totalCustomerAmount, // Полная сумма (customerRate + fees + tonu)
        fees: customerFees, // Детали fees от customer
        tonu: {
          enabled: load.tonu?.enabled || false,
          customerRate: tonuCustomerRate
        },
        deadlineDays: receivableDeadlineDays,
        status: "pending",
        paymentMethod: paymentMethod || null,
        createdBy: userId || null,
      };

      let payableData = null;
      if (!skipPayable) {
      // Подготавливаем данные для PaymentPayable
        payableData = {
          loadId: load._id || load.id, // Устанавливаем loadId для связи с Load
          orderId: load.orderId, // Order ID из Load
          carrier: load.carrier,
          carrierRate: baseCarrierRate, // Базовая ставка
          totalAmount: totalCarrierAmount, // Полная сумма (carrierRate + fees + tonu)
          fees: carrierFees, // Детали fees от customer (которые мы платим carrier)
          tonu: {
            enabled: load.tonu?.enabled || false,
            carrierRate: tonuCarrierRate
          },
          deadlineDays: payableDeadlineDays,
          paymentMethod: paymentMethod || null,
          createdBy: userId || null,
        };
      }

      // Копируем банковские реквизиты из Carrier (если загружен)
      if (!skipPayable && carrierData) {
        payableData.bank = carrierData.bankAccount || null;
        payableData.routing = carrierData.routing || null;
        payableData.accountNumber = carrierData.accountNumber || null;
      }

      // ============================================
      // ЭТАП 2: ОПЕРАЦИИ В ТРАНЗАКЦИИ (только запись)
      // ============================================
      
      let receivable = null;
      let payable = null;
      let createdReceivable = false;
      let createdPayable = false;

      // Проверяем, есть ли уже PaymentReceivable в Load
      if (load.paymentReceivable) {
        try {
          const query = PaymentReceivable.findById(load.paymentReceivable);
          if (session) query.session(session);
          receivable = await query;
        } catch (error) {
          if (error.code === 251 || error.codeName === 'NoSuchTransaction') {
            throw error;
          }
          console.warn(`[LoadController] Could not load existing PaymentReceivable, will create new:`, error.message);
          receivable = null;
        }
      }
      
      // Создаем новый PaymentReceivable, если не найден существующий
      if (!receivable) {
        try {
          receivable = new PaymentReceivable(receivableData);
          if (session) receivable.$session(session);
          await receivable.save();
          createdReceivable = true;
        } catch (error) {
          console.error(`[LoadController] Failed to create PaymentReceivable:`, error.message);
          throw new Error(`Failed to create PaymentReceivable: ${error.message}`);
        }
      }

      if (!skipPayable) {
      // Проверяем, есть ли уже PaymentPayable в Load
      if (load.paymentPayable) {
        try {
          const query = PaymentPayable.findById(load.paymentPayable);
          if (session) query.session(session);
          payable = await query;
        } catch (error) {
          if (error.code === 251 || error.codeName === 'NoSuchTransaction') {
            throw error;
          }
          console.warn(`[LoadController] Could not load existing PaymentPayable, will create new:`, error.message);
          payable = null;
        }
      }
      
      // Создаем новый PaymentPayable, если не найден существующий
      if (!payable) {
        try {
          payable = new PaymentPayable(payableData);
          if (session) payable.$session(session);
          await payable.save();
          createdPayable = true;
        } catch (error) {
          console.error(`[LoadController] Failed to create PaymentPayable:`, error.message);
          throw new Error(`Failed to create PaymentPayable: ${error.message}`);
          }
        }
      }

      // КРИТИЧЕСКАЯ ПРОВЕРКА: Оба платежа должны быть созданы успешно
      if (!receivable) {
        throw new Error('Failed to create PaymentReceivable. PaymentReceivable is required for Delivered status.');
      }
      
      if (!skipPayable && !payable) {
        throw new Error('Failed to create PaymentPayable. PaymentPayable is required for Delivered status.');
      }

      const updateData = {
        paymentReceivable: receivable._id
      };
      if (payable) {
        updateData.paymentPayable = payable._id;
      }

      const updateOptions = session ? { session, new: true, runValidators: true } : { new: true, runValidators: true };
      await Load.findByIdAndUpdate(load._id, updateData, updateOptions);
      
      // Отправляем уведомления о создании платежей
      // Загружаем полные данные для уведомлений (populate customer и carrier)
      try {
        const receivableQuery = PaymentReceivable.findById(receivable._id)
          .populate('customer');
        const payableQuery = payable
          ? PaymentPayable.findById(payable._id).populate('carrier')
          : null;

        if (session) {
          receivableQuery.session(session);
          if (payableQuery) {
          payableQuery.session(session);
          }
        }

        const receivablePopulated = (await receivableQuery.lean()) || (receivable?.toObject ? receivable.toObject() : receivable);
        const payablePopulated = payableQuery
          ? (await payableQuery.lean()) || (payable?.toObject ? payable.toObject() : payable)
          : null;

        if (!receivablePopulated || (!skipPayable && !payablePopulated)) {
          console.warn(
            `[LoadController] ⚠️ Payment populate returned null (receivable: ${!!receivablePopulated}, payable: ${!!payablePopulated})`
          );
        }

        // Получаем actor из userId (если передан)
        let actor = null;
        if (userId) {
          try {
            const User = require('../models/User');
            const user = await User.findById(userId).lean();
            if (user) {
              actor = {
                id: user._id.toString(),
                role: user.role || 'user',
                email: user.email || null
              };
            }
          } catch (err) {
            console.warn('[LoadController] Could not load user for notification actor:', err.message);
          }
        }

        // Отправляем уведомление о создании PaymentReceivable
        if (receivablePopulated) {
          const customerId = receivablePopulated.customer?._id?.toString() || 
                            receivablePopulated.customer?.toString() || 
                            receivablePopulated.customer;
          
          const receivableEventResult = await notificationClient.sendCreatedEvent(
            'payment',
            {
              ...receivablePopulated,
              type: 'receivable',
              orderId: receivablePopulated.orderId || load.orderId,
              customer: customerId
            },
            actor || { id: null, role: 'system', email: null },
            {
              includeEntityData: true,
              targets: {
                customerId: customerId,
                admin: true
              }
            }
          );

          if (!receivableEventResult?.success) {
            try {
              const User = require('../models/User');
              const adminUsers = await User.find({ role: 'admin' }).select('_id').lean();
              const recipients = adminUsers.map(u => u._id?.toString()).filter(Boolean);
              if (recipients.length > 0) {
                await notificationService.sendNotification({
                  type: 'payment.created',
                  title: `Payment Receivable Created: ${receivablePopulated.orderId || load.orderId}`,
                  message: `Payment Receivable for order ${receivablePopulated.orderId || load.orderId} was created`,
                  recipients,
                  data: {
                    paymentId: receivablePopulated._id?.toString() || receivablePopulated.id,
                    paymentType: 'receivable',
                    orderId: receivablePopulated.orderId || load.orderId,
                    loadId: load._id?.toString() || load.id,
                    customerId: customerId,
                    customer: receivablePopulated.customer,
                    amount: receivablePopulated.totalAmount || receivablePopulated.customerRate,
                    customerRate: receivablePopulated.customerRate,
                    load: {
                      id: load._id?.toString() || load.id,
                      orderId: load.orderId,
                      status: load.status
                    }
                  },
                  priority: 'high'
                });
              }
            } catch (fallbackError) {
              console.warn('[LoadController] ❌ Fallback payment receivable notification failed:', fallbackError.message);
            }
          }
        }

        // Отправляем уведомление о создании PaymentPayable
        if (payablePopulated) {
          const carrierId = payablePopulated.carrier?._id?.toString() || 
                          payablePopulated.carrier?.toString() || 
                          payablePopulated.carrier;
          
          const payableEventResult = await notificationClient.sendCreatedEvent(
            'payment',
            {
              ...payablePopulated,
              type: 'payable',
              orderId: payablePopulated.orderId || load.orderId,
              carrier: carrierId
            },
            actor || { id: null, role: 'system', email: null },
            {
              includeEntityData: true,
              targets: {
                carrierId: carrierId,
                admin: true
              }
            }
          );

          if (!payableEventResult?.success) {
            try {
              const User = require('../models/User');
              const adminUsers = await User.find({ role: 'admin' }).select('_id').lean();
              const recipients = adminUsers.map(u => u._id?.toString()).filter(Boolean);
              if (recipients.length > 0) {
                await notificationService.sendNotification({
                  type: 'payment.created',
                  title: `Payment Payable Created: ${payablePopulated.orderId || load.orderId}`,
                  message: `Payment Payable for order ${payablePopulated.orderId || load.orderId} was created`,
                  recipients,
                  data: {
                    paymentId: payablePopulated._id?.toString() || payablePopulated.id,
                    paymentType: 'payable',
                    orderId: payablePopulated.orderId || load.orderId,
                    loadId: load._id?.toString() || load.id,
                    carrierId: carrierId,
                    carrier: payablePopulated.carrier,
                    amount: payablePopulated.totalAmount || payablePopulated.carrierRate,
                    carrierRate: payablePopulated.carrierRate,
                    load: {
                      id: load._id?.toString() || load.id,
                      orderId: load.orderId,
                      status: load.status
                    }
                  },
                  priority: 'high'
                });
              }
            } catch (fallbackError) {
              console.warn('[LoadController] ❌ Fallback payment payable notification failed:', fallbackError.message);
            }
          }
        }
      } catch (notificationError) {
        // Не прерываем выполнение, если уведомления не отправились
        console.error(`[LoadController] ⚠️ Failed to send payment creation notifications:`, notificationError.message);
      }
      
      // Return payment IDs so they can be used by the caller if needed
      return {
        receivableId: receivable._id,
        payableId: payable._id || null,
        receivable,
        payable
      };
    } catch (error) {
      console.error(
        `[LoadController] ❌ Error creating payments for load ${orderId}:`,
        error.message,
        `Code: ${error.code}, CodeName: ${error.codeName}`,
        error.stack
      );
      // Пробрасываем ошибку дальше, чтобы транзакция откатилась
      throw error;
    }
  }

  async createReceivableOnPickedUpForPlatform(load, userId, session = null) {
    const loadId = load._id?.toString() || load.id?.toString() || 'unknown';
    const orderId = load.orderId || loadId;

    if (load.paymentReceivable) {
      return { skipped: true, reason: 'existing_receivable' };
    }

    const existingReceivable = await PaymentReceivable.findOne({ loadId: load._id }).lean();
    if (existingReceivable) {
      return { skipped: true, reason: 'existing_receivable_db' };
    }

    const customerId = load.customer?._id || load.customer;
    if (!customerId) {
      console.warn(`[LoadController] Missing customer for load ${orderId}, cannot create receivable.`);
      return { skipped: true, reason: 'missing_customer' };
    }

    const customerRate = parseFloat(load.customerRate) || 0;
    if (!load.customerRate || customerRate <= 0) {
      console.warn(`[LoadController] Missing/invalid customerRate for load ${orderId}, creating receivable with 0 rate.`);
    }

    let customerData = null;
    try {
      customerData = await Customer.findById(customerId).lean();
    } catch (error) {
      console.warn(`[LoadController] Could not load Customer data (non-critical):`, error.message);
    }

    function parseDeadlineDays(paymentTerms) {
      if (!paymentTerms) return 30;
      if (typeof paymentTerms === 'number') return paymentTerms;
      if (typeof paymentTerms === 'string') {
        const trimmed = paymentTerms.trim();
        const match = trimmed.match(/\d+/);
        if (match) {
          return parseInt(match[0], 10);
        }
      }
      return 30;
    }

    const deadlineDays = parseDeadlineDays(customerData?.paymentTerms);

    const paymentMethod = load.paymentMethod || customerData?.paymentMethod || null;

    const baseCustomerRate = customerRate;
    const customerFees = Array.isArray(load.fees)
      ? load.fees.map(fee => ({
          type: fee.type,
          customerRate: parseFloat(fee.customerRate) || 0,
          total: parseFloat(fee.total) || 0
        }))
      : [];
    const feesCustomerTotal = customerFees.reduce((sum, fee) => sum + fee.customerRate, 0);
    const tonuCustomerRate = (load.tonu?.enabled && load.tonu?.customerRate)
      ? parseFloat(load.tonu.customerRate) || 0
      : 0;
    const totalCustomerAmount = baseCustomerRate + feesCustomerTotal + tonuCustomerRate;

    const receivableData = {
      loadId: load._id || load.id,
      orderId: load.orderId,
      customer: customerId,
      customerRate: baseCustomerRate,
      totalAmount: totalCustomerAmount,
      fees: customerFees,
      tonu: {
        enabled: load.tonu?.enabled || false,
        customerRate: tonuCustomerRate
      },
      deadlineDays,
      status: "pending",
      paymentMethod: paymentMethod || null,
      createdBy: userId || null
    };

    let receivable;
    try {
      receivable = new PaymentReceivable(receivableData);
      if (session) receivable.$session(session);
      await receivable.save();
    } catch (error) {
      console.error(`[LoadController] Failed to create PaymentReceivable:`, error.message);
      return { skipped: true, reason: 'create_failed', error: error.message };
    }

    const updateOptions = session ? { session, new: true, runValidators: true } : { new: true, runValidators: true };
    await Load.findByIdAndUpdate(load._id, { paymentReceivable: receivable._id }, updateOptions);

    // Send notification about receivable creation
    try {
      let actor = null;
      if (userId) {
        try {
          const User = require('../models/User');
          const user = await User.findById(userId).lean();
          if (user) {
            actor = {
              id: user._id.toString(),
              role: user.role || 'user',
              email: user.email || null
            };
          }
        } catch (err) {
          console.warn('[LoadController] Could not load user for notification actor:', err.message);
        }
      }

      const receivablePopulated = await PaymentReceivable.findById(receivable._id)
        .populate('customer')
        .lean();
      const customerId = receivablePopulated?.customer?._id?.toString() ||
        receivablePopulated?.customer?.toString() ||
        receivablePopulated?.customer;

      await notificationClient.sendCreatedEvent(
        'payment',
        {
          ...(receivablePopulated || receivable.toObject()),
          type: 'receivable',
          orderId: receivablePopulated?.orderId || load.orderId,
          customer: customerId
        },
        actor || { id: null, role: 'system', email: null },
        {
          includeEntityData: true,
          targets: {
            customerId: customerId,
            admin: true
          }
        }
      );
    } catch (error) {
      console.error(`[LoadController] Failed to send receivable notification:`, error.message);
    }

    return { success: true, receivableId: receivable._id };
  }

  async shouldSkipPayableForPlatformDelivered(load) {
    try {
      let customerType = load.customer?.type;
      if (!customerType && load.customer) {
        const customerDoc = await Customer.findById(load.customer).select('type').lean();
        customerType = customerDoc?.type;
      }

      if (customerType !== 'platform') {
        return false;
      }

      let receivableStatus = load.paymentReceivable?.status;
      let receivableId = load.paymentReceivable?._id || load.paymentReceivable;
      if (!receivableStatus && receivableId) {
        const receivableDoc = await PaymentReceivable.findById(receivableId).select('status').lean();
        receivableStatus = receivableDoc?.status;
      }

      return receivableStatus === 'partially received';
    } catch (error) {
      console.warn('[LoadController] Failed to evaluate payable skip condition:', error.message);
      return false;
    }
  }

  /**
   * Создает PaymentReceivable и PaymentPayable для отмененного Load с TONU
   * Использует TONU суммы вместо обычных customerRate и carrierRate
   */
  async createPaymentsOnCancelled(load, userId, session = null, options = {}) {
    const skipPayable = options?.skipPayable === true;
    const loadId = load._id?.toString() || load.id?.toString() || 'unknown';
    const orderId = load.orderId || loadId;
    
    // ============================================
    // ЭТАП 1: ВАЛИДАЦИЯ И ПОДГОТОВКА ДАННЫХ (ВНЕ ТРАНЗАКЦИИ)
    // ============================================
    try {
      // ВАЛИДАЦИЯ: Проверяем обязательные поля для TONU
      const validationErrors = [];
      
      if (!load.customer) {
        validationErrors.push("Customer is required to create TONU payments");
      }
      
      if (!load.tonu || !load.tonu.enabled) {
        validationErrors.push("TONU must be enabled to create payments for cancelled load");
      }
      
      const tonuCustomerRate = parseFloat(load.tonu?.customerRate) || 0;
      if (!load.tonu?.customerRate || tonuCustomerRate <= 0) {
        validationErrors.push("TONU customer rate is required and must be greater than 0");
      }
      
      if (!skipPayable) {
        if (!load.carrier) {
          validationErrors.push("Carrier is required to create TONU payments");
        }
        
        const tonuCarrierRate = parseFloat(load.tonu?.carrierRate) || 0;
        if (!load.tonu?.carrierRate || tonuCarrierRate <= 0) {
          validationErrors.push("TONU carrier rate is required and must be greater than 0");
        }
      }
      
      if (validationErrors.length > 0) {
        throw new Error(`Cannot create TONU payments: ${validationErrors.join('; ')}`);
      }

      // ПОДГОТОВКА ДАННЫХ: Загружаем справочные данные ДО транзакции
      
      // Загружаем Customer для получения paymentTerms
      let customerData = null;
      if (load.customer) {
        try {
          const Customer = require('../models/Customer');
          customerData = await Customer.findById(load.customer).lean();
        } catch (error) {
          console.warn(`[LoadController] Warning: Could not load Customer data (non-critical):`, error.message);
        }
      }
      
      // Загружаем Carrier ДО транзакции (read-only операция)
      let carrierData = null;
      if (!skipPayable && load.carrier) {
        try {
          carrierData = await Carrier.findById(load.carrier).lean();
        } catch (error) {
          console.warn(`[LoadController] Warning: Could not load Carrier data (non-critical):`, error.message);
        }
      }

      function parseDeadlineDays(paymentTerms) {
        if (!paymentTerms) return 30;
        if (typeof paymentTerms === 'number') return paymentTerms;
        if (typeof paymentTerms === 'string') {
          const trimmed = paymentTerms.trim();
          const match = trimmed.match(/\d+/);
          if (match) {
            return parseInt(match[0], 10);
          }
        }
        return 30;
      }

      const receivableDeadlineDays = parseDeadlineDays(customerData?.paymentTerms);
      const payableDeadlineDays = parseDeadlineDays(load.paymentTerms);

      const paymentMethod = load.paymentMethod || customerData?.paymentMethod || null;

      const tonuCustomerRateValue = parseFloat(load.tonu.customerRate) || 0;
      const tonuCarrierRateValue = skipPayable ? 0 : (parseFloat(load.tonu.carrierRate) || 0);

      // Подготавливаем данные для PaymentReceivable (только TONU сумма)
      const receivableData = {
        loadId: load._id || load.id,
        orderId: load.orderId,
        customer: load.customer,
        customerRate: tonuCustomerRateValue, // Используем TONU customer rate
        totalAmount: tonuCustomerRateValue, // Total amount = только TONU customer rate
        fees: [], // Нет fees для TONU
        tonu: {
          enabled: true,
          customerRate: tonuCustomerRateValue
        },
        deadlineDays: receivableDeadlineDays,
        status: "pending",
        paymentMethod: paymentMethod || null,
      };

      let payableData = null;
      if (!skipPayable) {
        // Подготавливаем данные для PaymentPayable (только TONU сумма)
        payableData = {
          loadId: load._id || load.id,
          orderId: load.orderId,
          carrier: load.carrier,
          carrierRate: tonuCarrierRateValue, // Используем TONU carrier rate
          totalAmount: tonuCarrierRateValue, // Total amount = только TONU carrier rate
          fees: [], // Нет fees для TONU
          tonu: {
            enabled: true,
            carrierRate: tonuCarrierRateValue
          },
          deadlineDays: payableDeadlineDays,
          paymentMethod: paymentMethod || null,
        };
      }

      // Копируем банковские реквизиты из Carrier (если загружен)
      if (!skipPayable && carrierData) {
        payableData.bank = carrierData.bankAccount || null;
        payableData.routing = carrierData.routing || null;
        payableData.accountNumber = carrierData.accountNumber || null;
      }

      // ============================================
      // ЭТАП 2: ОПЕРАЦИИ В ТРАНЗАКЦИИ (только запись)
      // ============================================
      
      let receivable = null;
      let payable = null;
      let createdReceivable = false;
      let createdPayable = false;

      // Проверяем, есть ли уже PaymentReceivable в Load
      if (load.paymentReceivable) {
        try {
          const query = PaymentReceivable.findById(load.paymentReceivable);
          if (session) query.session(session);
          receivable = await query;
        } catch (error) {
          if (error.code === 251 || error.codeName === 'NoSuchTransaction') {
            throw error;
          }
          console.warn(`[LoadController] Could not load existing PaymentReceivable, will create new:`, error.message);
          receivable = null;
        }
      }
      
      // Создаем новый PaymentReceivable, если не найден существующий
      if (!receivable) {
        try {
          receivable = new PaymentReceivable(receivableData);
          if (session) receivable.$session(session);
          await receivable.save();
          createdReceivable = true;
        } catch (error) {
          console.error(`[LoadController] Failed to create PaymentReceivable for TONU:`, error.message);
          throw new Error(`Failed to create PaymentReceivable for TONU: ${error.message}`);
        }
      }

      if (!skipPayable) {
        // Проверяем, есть ли уже PaymentPayable в Load
        if (load.paymentPayable) {
          try {
            const query = PaymentPayable.findById(load.paymentPayable);
            if (session) query.session(session);
            payable = await query;
          } catch (error) {
            if (error.code === 251 || error.codeName === 'NoSuchTransaction') {
              throw error;
            }
            console.warn(`[LoadController] Could not load existing PaymentPayable, will create new:`, error.message);
            payable = null;
          }
        }
        
        // Создаем новый PaymentPayable, если не найден существующий
        if (!payable) {
          try {
            payable = new PaymentPayable(payableData);
            if (session) payable.$session(session);
            await payable.save();
            createdPayable = true;
          } catch (error) {
            console.error(`[LoadController] Failed to create PaymentPayable for TONU:`, error.message);
            throw new Error(`Failed to create PaymentPayable for TONU: ${error.message}`);
          }
        }
      }

      // КРИТИЧЕСКАЯ ПРОВЕРКА: Оба платежа должны быть созданы успешно
      if (!receivable) {
        throw new Error('Failed to create PaymentReceivable for TONU. PaymentReceivable is required for Cancelled status with TONU.');
      }
      
      if (!skipPayable && !payable) {
        throw new Error('Failed to create PaymentPayable for TONU. PaymentPayable is required for Cancelled status with TONU.');
      }

      const updateData = {
        paymentReceivable: receivable._id
      };
      if (payable) {
        updateData.paymentPayable = payable._id;
      }

      const updateOptions = session ? { session, new: true, runValidators: true } : { new: true, runValidators: true };
      await Load.findByIdAndUpdate(load._id, updateData, updateOptions);
      
      // ============================================
      // ЭТАП 3: УВЕДОМЛЕНИЯ (вне транзакции, не блокируем ответ)
      // ============================================
      
      // Создаем actor для уведомлений
      const actor = userId 
        ? await (async () => {
            try {
              const User = require('../models/User');
              const user = await User.findById(userId).select('_id role email').lean();
              return user ? { id: user._id?.toString(), role: user.role || 'unknown', email: user.email || null } : { id: null, role: 'system', email: null };
            } catch (error) {
              return { id: userId?.toString() || null, role: 'unknown', email: null };
            }
          })()
        : { id: null, role: 'system', email: null };

      setImmediate(async () => {
        try {
          const notificationClient = require('../services/notificationClient');
          const notificationService = require('../services/notificationService');
          
          // Загружаем populated данные для уведомлений
          const receivableQuery = PaymentReceivable.findById(receivable._id)
            .populate('customer', 'companyName email')
            .populate('loadId', 'orderId status');
          const receivablePopulated = await receivableQuery;
          
          const payableQuery = skipPayable || !payable 
            ? null
            : PaymentPayable.findById(payable._id)
                .populate('carrier', 'companyName email')
                .populate('loadId', 'orderId status');
          const payablePopulated = payableQuery ? await payableQuery : null;

          // Отправляем уведомление о создании PaymentReceivable для TONU
          if (receivablePopulated) {
            const customerId = receivablePopulated.customer?._id?.toString() || 
                              receivablePopulated.customer?.toString() || 
                              receivablePopulated.customer;
            
            const receivableEventResult = await notificationClient.sendCreatedEvent(
              'payment',
              {
                ...receivablePopulated,
                type: 'receivable',
                orderId: receivablePopulated.orderId || load.orderId,
                customer: customerId
              },
              actor,
              {
                includeEntityData: true,
                targets: {
                  customerId: customerId,
                  admin: true
                }
              }
            );

            if (!receivableEventResult?.success) {
              try {
                const User = require('../models/User');
                const adminUsers = await User.find({ role: 'admin' }).select('_id').lean();
                const recipients = adminUsers.map(u => u._id?.toString()).filter(Boolean);
                if (recipients.length > 0) {
                  await notificationService.sendNotification({
                    type: 'payment.created',
                    title: `TONU Payment Receivable Created: ${receivablePopulated.orderId || load.orderId}`,
                    message: `TONU Payment Receivable for cancelled order ${receivablePopulated.orderId || load.orderId} was created. Amount: $${receivablePopulated.totalAmount || tonuCustomerRateValue}`,
                    recipients,
                    data: {
                      paymentId: receivablePopulated._id?.toString() || receivablePopulated.id,
                      paymentType: 'receivable',
                      orderId: receivablePopulated.orderId || load.orderId,
                      loadId: load._id?.toString() || load.id,
                      customerId: customerId,
                      customer: receivablePopulated.customer,
                      amount: receivablePopulated.totalAmount || tonuCustomerRateValue,
                      customerRate: receivablePopulated.customerRate,
                      load: {
                        id: load._id?.toString() || load.id,
                        orderId: load.orderId,
                        status: load.status
                      }
                    },
                    priority: 'high'
                  });
                }
              } catch (fallbackError) {
                console.warn('[LoadController] ❌ Fallback TONU payment receivable notification failed:', fallbackError.message);
              }
            }
          }

          // Отправляем уведомление о создании PaymentPayable для TONU
          if (payablePopulated) {
            const carrierId = payablePopulated.carrier?._id?.toString() || 
                            payablePopulated.carrier?.toString() || 
                            payablePopulated.carrier;
            
            const payableEventResult = await notificationClient.sendCreatedEvent(
              'payment',
              {
                ...payablePopulated,
                type: 'payable',
                orderId: payablePopulated.orderId || load.orderId,
                carrier: carrierId
              },
              actor,
              {
                includeEntityData: true,
                targets: {
                  carrierId: carrierId,
                  admin: true
                }
              }
            );

            if (!payableEventResult?.success) {
              try {
                const User = require('../models/User');
                const adminUsers = await User.find({ role: 'admin' }).select('_id').lean();
                const recipients = adminUsers.map(u => u._id?.toString()).filter(Boolean);
                if (recipients.length > 0) {
                  await notificationService.sendNotification({
                    type: 'payment.created',
                    title: `TONU Payment Payable Created: ${payablePopulated.orderId || load.orderId}`,
                    message: `TONU Payment Payable for cancelled order ${payablePopulated.orderId || load.orderId} was created. Amount: $${payablePopulated.totalAmount || tonuCarrierRateValue}`,
                    recipients,
                    data: {
                      paymentId: payablePopulated._id?.toString() || payablePopulated.id,
                      paymentType: 'payable',
                      orderId: payablePopulated.orderId || load.orderId,
                      loadId: load._id?.toString() || load.id,
                      carrierId: carrierId,
                      carrier: payablePopulated.carrier,
                      amount: payablePopulated.totalAmount || tonuCarrierRateValue,
                      carrierRate: payablePopulated.carrierRate,
                      load: {
                        id: load._id?.toString() || load.id,
                        orderId: load.orderId,
                        status: load.status
                      }
                    },
                    priority: 'high'
                  });
                }
              } catch (fallbackError) {
                console.warn('[LoadController] ❌ Fallback TONU payment payable notification failed:', fallbackError.message);
              }
            }
          }
        } catch (notificationError) {
          // Не прерываем выполнение, если уведомления не отправились
          console.error(`[LoadController] ⚠️ Failed to send TONU payment creation notifications:`, notificationError.message);
        }
      });

      return {
        receivable,
        payable,
        createdReceivable,
        createdPayable
      };
    } catch (error) {
      console.error(`[LoadController] Error in createPaymentsOnCancelled:`, error.message);
      throw error;
    }
  }

  /**
   * Синхронизирует PaymentReceivable и PaymentPayable с данными из Load
   * Вызывается при обновлении Load, если платежи уже созданы
   * @param {Object} load - Обновленный Load документ
   * @param {Object} session - Сессия транзакции (опционально)
   */
  async syncPaymentsWithLoad(load, session = null) {
    const loadId = load._id?.toString() || load.id?.toString() || 'unknown';
    const orderId = load.orderId || loadId;
    
    if (!load.paymentReceivable && !load.paymentPayable) {
      return;
    }

    try {
      // Рассчитываем суммы для PaymentReceivable
      const baseCustomerRate = parseFloat(load.customerRate) || 0;
      const customerFees = Array.isArray(load.fees) 
        ? load.fees.map(fee => ({
            type: fee.type,
            customerRate: parseFloat(fee.customerRate) || 0,
            total: parseFloat(fee.total) || 0
          }))
        : [];
      const feesCustomerTotal = customerFees.reduce((sum, fee) => sum + fee.customerRate, 0);
      const tonuCustomerRate = (load.tonu?.enabled && load.tonu?.customerRate) 
        ? parseFloat(load.tonu.customerRate) || 0 
        : 0;
      const totalCustomerAmount = baseCustomerRate + feesCustomerTotal + tonuCustomerRate;

      // Рассчитываем суммы для PaymentPayable
      const baseCarrierRate = parseFloat(load.carrierRate) || 0;
      const carrierFees = Array.isArray(load.fees) 
        ? load.fees.map(fee => ({
            type: fee.type,
            carrierRate: parseFloat(fee.carrierRate) || 0,
            total: parseFloat(fee.total) || 0
          }))
        : [];
      const feesCarrierTotal = carrierFees.reduce((sum, fee) => sum + fee.carrierRate, 0);
      const tonuCarrierRate = (load.tonu?.enabled && load.tonu?.carrierRate) 
        ? parseFloat(load.tonu.carrierRate) || 0 
        : 0;
      const totalCarrierAmount = baseCarrierRate + feesCarrierTotal + tonuCarrierRate;

      // Обновляем PaymentReceivable если он существует
      if (load.paymentReceivable) {
        try {
          const updateData = {
            orderId: load.orderId,
            customerRate: baseCustomerRate,
            totalAmount: totalCustomerAmount,
            fees: customerFees,
            tonu: {
              enabled: load.tonu?.enabled || false,
              customerRate: tonuCustomerRate
            }
          };

          const updateOptions = session ? { session, new: true, runValidators: true } : { new: true, runValidators: true };
          await PaymentReceivable.findByIdAndUpdate(
            load.paymentReceivable,
            updateData,
            updateOptions
          );
        } catch (error) {
          console.error(`[LoadController] Failed to sync PaymentReceivable for load ${orderId}:`, error.message);
          // Не прерываем выполнение, так как это не критично
        }
      }

      // Обновляем PaymentPayable если он существует
      if (load.paymentPayable) {
        try {
          const updateData = {
            orderId: load.orderId,
            carrierRate: baseCarrierRate,
            totalAmount: totalCarrierAmount,
            fees: carrierFees,
            tonu: {
              enabled: load.tonu?.enabled || false,
              carrierRate: tonuCarrierRate
            }
          };

          const updateOptions = session ? { session, new: true, runValidators: true } : { new: true, runValidators: true };
          await PaymentPayable.findByIdAndUpdate(
            load.paymentPayable,
            updateData,
            updateOptions
          );
        } catch (error) {
          console.error(`[LoadController] Failed to sync PaymentPayable for load ${orderId}:`, error.message);
          // Не прерываем выполнение, так как это не критично
        }
      }
    } catch (error) {
      console.error(`[LoadController] Error syncing payments for load ${orderId}:`, error.message);
      // Не прерываем выполнение, так как это не критично
    }
  }

  // Специфичные методы для Load
  getByStatus = async (req, res) => {
    try {
      const accessContext = await resolveAccessContext(req);
      if (accessContext.error) {
        return res.status(accessContext.error.status).json({
          success: false,
          error: accessContext.error.error
        });
      }
      const accessFilterResult = await getAccessFilter(accessContext);
      if (accessFilterResult.error) {
        return res.status(accessFilterResult.error.status).json({
          success: false,
          error: accessFilterResult.error.error
        });
      }
      if (accessFilterResult.partnerOnly) {
        return res.status(403).json({
          success: false,
          error: "Access denied"
        });
      }

      const status = req.params.status || req.query.status;
      const { page = 1, limit = 10 } = req.query;

      const filter = mergeFilters(accessFilterResult.filter, { status });
      const result = await getLoadsWithPagination(
        this.model,
        filter,
        this.populateFields,
        this.dto,
        page,
        limit,
        { createdAt: -1 }
      );

      const data = result.data.map((load) => maybeStripPaymentFields(accessContext.role, load));
      res.status(200).json({
        success: true,
        data,
        pagination: result.pagination
      });
    } catch (error) {
      this.handleError(res, error, "Failed to fetch loads by status");
    }
  };

  getByCarrier = async (req, res) => {
    try {
      const accessContext = await resolveAccessContext(req);
      if (accessContext.error) {
        return res.status(accessContext.error.status).json({
          success: false,
          error: accessContext.error.error
        });
      }
      const accessFilterResult = await getAccessFilter(accessContext);
      if (accessFilterResult.error) {
        return res.status(accessFilterResult.error.status).json({
          success: false,
          error: accessFilterResult.error.error
        });
      }
      if (accessFilterResult.partnerOnly) {
        return res.status(403).json({
          success: false,
          error: "Access denied"
        });
      }

      const carrierId = req.params.carrierId || req.params.driverId;
      const { page = 1, limit = 10 } = req.query;

      const idValidation = validateObjectId(carrierId);
      if (!idValidation.valid) {
        return res.status(400).json({
          success: false,
          error: "Invalid carrier ID format",
        });
      }

      const filter = mergeFilters(accessFilterResult.filter, { carrier: carrierId });
      const result = await getLoadsWithPagination(
        this.model,
        filter,
        this.populateFields,
        this.dto,
        page,
        limit,
        { createdAt: -1 }
      );

      const data = result.data.map((load) => maybeStripPaymentFields(accessContext.role, load));
      res.status(200).json({
        success: true,
        data,
        pagination: result.pagination
      });
    } catch (error) {
      this.handleError(res, error, "Failed to fetch loads by carrier");
    }
  };

  getByCustomer = async (req, res) => {
    try {
      const accessContext = await resolveAccessContext(req);
      if (accessContext.error) {
        return res.status(accessContext.error.status).json({
          success: false,
          error: accessContext.error.error
        });
      }
      const accessFilterResult = await getAccessFilter(accessContext);
      if (accessFilterResult.error) {
        return res.status(accessFilterResult.error.status).json({
          success: false,
          error: accessFilterResult.error.error
        });
      }
      if (accessFilterResult.partnerOnly) {
        return res.status(403).json({
          success: false,
          error: "Access denied"
        });
      }

      const { customerId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const idValidation = validateObjectId(customerId);
      if (!idValidation.valid) {
        return res.status(400).json({
          success: false,
          error: "Invalid customer ID format",
        });
      }

      if (accessContext.role === 'dispatcher' || accessContext.role === 'Pre-dispatcher' || accessContext.role === 'bidAgent') {
        if (!accessContext.allowedCustomerIds.includes(customerId)) {
          return res.status(403).json({
            success: false,
            error: "Access denied"
          });
        }
      }
      if (accessContext.role === 'salesAgent') {
        const customerDoc = await Customer.findById(customerId).select('type').lean();
        if (!customerDoc || customerDoc.type !== 'platform') {
          return res.status(403).json({
            success: false,
            error: "Access denied"
          });
        }
      }

      const filter = mergeFilters(accessFilterResult.filter, { customer: customerId });
      const result = await getLoadsWithPagination(
        this.model,
        filter,
        this.populateFields,
        this.dto,
        page,
        limit,
        { createdAt: -1 }
      );

      const data = result.data.map((load) => maybeStripPaymentFields(accessContext.role, load));
      res.status(200).json({
        success: true,
        data,
        pagination: result.pagination
      });
    } catch (error) {
      this.handleError(res, error, "Failed to fetch loads by customer");
    }
  };

  create = async (req, res) => {
    try {
      // Парсим данные из запроса
      let loadData;
      try {
        loadData = parseLoadData(req.body);
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: "Invalid JSON in load field",
          details: error.message,
        });
      }

      const accessContext = await resolveAccessContext(req);
      if (accessContext.error) {
        return res.status(accessContext.error.status).json({
          success: false,
          error: accessContext.error.error
        });
      }
      if (!canCreateLoad(accessContext.role)) {
        return res.status(403).json({
          success: false,
          error: "Access denied"
        });
      }
      loadData = filterLoadDataByRole(accessContext.role, loadData);

      // Валидируем и нормализуем данные
      const customerData = validateCustomerData(loadData.customer);
      const carrierData = validateCarrierData(loadData.carrier);
      const typeData = loadData.type
        ? parseJsonField(loadData.type)
        : { freight: false, vehicle: false };

      let vehicleData = validateVehicleData(loadData.vehicle, typeData);
      let freightData = validateFreightData(loadData.freight, typeData);
      const pickupData = loadData.pickup ? normalizeLocationAddress(parseJsonField(loadData.pickup)) : {};
      const deliveryData = loadData.delivery
        ? normalizeLocationAddress(parseJsonField(loadData.delivery))
        : {};
      const insuranceData = loadData.insurance
        ? parseJsonField(loadData.insurance)
        : {};
      const datesData = loadData.dates ? parseJsonField(loadData.dates) : {};
      const feesData = loadData.fees ? parseJsonField(loadData.fees) : [];
      const tonuData = loadData.tonu ? parseJsonField(loadData.tonu) : null;

      if (accessContext.role === 'Pre-dispatcher') {
        const customerId = getIdString(customerData?.id || loadData.customer);
        if (!customerId || !accessContext.allowedCustomerIds.includes(customerId)) {
          return res.status(403).json({
            success: false,
            error: "Access denied"
          });
        }
      }

      if (accessContext.role === 'salesAgent') {
        const customerId = getIdString(customerData?.id || loadData.customer);
        const providedType = customerData?.type || loadData?.customer?.type;
        if (providedType && providedType !== 'platform') {
          return res.status(403).json({
            success: false,
            error: "Access denied"
          });
        }
        if (!providedType && customerId) {
          const customerDoc = await Customer.findById(customerId).select('type').lean();
          if (!customerDoc || customerDoc.type !== 'platform') {
            return res.status(403).json({
              success: false,
              error: "Access denied"
            });
          }
        }
        if (!providedType && !customerId) {
          return res.status(403).json({
            success: false,
            error: "Access denied"
          });
        }
      }

      // Validate dates
      if (datesData && Object.keys(datesData).length > 0) {
        const datesValidation = validateDatesData(datesData);
        if (datesValidation && !datesValidation.valid) {
          return res.status(400).json({
            success: false,
            error: 'Invalid dates data',
            details: datesValidation.errors || datesValidation.error
          });
        }
      }

      // Validate fees
      const freightType = typeData?.freight;
      if (feesData && Array.isArray(feesData) && feesData.length > 0) {
        const feesValidation = validateFeesData(feesData, freightType);
        if (feesValidation && !feesValidation.valid) {
          return res.status(400).json({
            success: false,
            error: 'Invalid fees data',
            details: feesValidation.errors || feesValidation.error
          });
        }
      }

      // Проверяем дубликаты VIN
      const vinCheck = await checkDuplicateVIN(this.model, vehicleData);
      if (vinCheck) {
        return res.status(400).json({
          success: false,
          error: vinCheck.error,
          message: vinCheck.message,
        });
      }

      const orderId =
        loadData.orderId?.trim() || (await this.generateOrderId());

      // Проверяем уникальность orderId перед созданием
      if (orderId) {
        const existingLoad = await this.model.findOne({ orderId }).select('_id orderId').lean();
        if (existingLoad) {
          return res.status(400).json({
            success: false,
            error: 'Duplicate order ID',
            message: `Load with Order ID "${orderId}" already exists`
          });
        }
      }

      // Создаем или находим customer и carrier
      const [customerId, carrierId] = await Promise.all([
        customerData
          ? customerService.findOrCreate(customerData)
          : Promise.resolve(null),
        carrierData
          ? carrierService.findOrCreate(carrierData)
          : Promise.resolve(null),
      ]);

      // Нормализуем emails
      const { customerEmails, carrierEmails } = normalizeEmailsForLoad(loadData);

      // Синхронизируем email (берем первый из массива если есть)
      await Promise.all([
        customerEmails.length > 0 && customerId
          ? customerService.syncEmail(customerId, customerEmails[0])
          : Promise.resolve(),
      ]);

      // Проверяем createdBy
      const createdByCheck = validateCreatedBy(req.user, req.body.createdBy);
      if (!createdByCheck.valid) {
        return res.status(401).json({
          success: false,
          error: createdByCheck.error,
          message: createdByCheck.message,
        });
      }

      if (loadData.tempEntityId && typeof loadData.tempEntityId === 'string' && loadData.tempEntityId.startsWith('temp-')) {
        req.tempEntityId = loadData.tempEntityId;
      }
      let loadDocument = prepareLoadDocument({
        orderId,
        customerId,
        carrierId,
        customerEmails,
        carrierEmails,
        customerRate: loadData.customerRate,
        carrierRate: loadData.carrierRate,
        typeData,
        pickupData,
        deliveryData,
        insuranceData,
        datesData,
        status: loadData.status,
        tracking: loadData.tracking,
        carrierPhotos: loadData.carrierPhotos,
        bolDocuments: loadData.bolDocuments,
        rateConfirmationDocuments: loadData.rateConfirmationDocuments,
        documents: loadData.documents,
        vehicleData,
        freightData,
        paymentMethod: loadData.paymentMethod,
        paymentTerms: loadData.paymentTerms,
        fees: feesData,
        tonu: tonuData,
        loadCarrierPeople: loadData.loadCarrierPeople,
        loadCustomerRepresentativePeoples: loadData.loadCustomerRepresentativePeoples,
        createdBy: createdByCheck.createdBy,
      });

      // Обрабатываем загруженные файлы
      const fileProcessResult = processUploadedFiles(
        loadDocument,
        req.uploadedFiles,
        vehicleData,
        freightData
      );
      loadDocument = fileProcessResult.loadDocument;
      vehicleData = fileProcessResult.vehicleData;
      freightData = fileProcessResult.freightData;

      // Финальная очистка и синхронизация
      const cleanedLoadDocument = finalizeLoadDocument(loadDocument);

      // Создание записи
      const newDoc = new this.model(cleanedLoadDocument);
      const saved = await newDoc.save();

      // If files were uploaded with temp ID, move them to real load ID
      if (
        req.isNewLoad &&
        req.tempEntityId &&
        req.tempEntityId.startsWith("temp-") &&
        req.uploadedFiles
      ) {
        const tempId = req.tempEntityId;
        const updatePromises = [];
        
        await updateTempFileKeys(saved, tempId, updatePromises);
        
        if (updatePromises.length > 0) {
          await Promise.all(updatePromises);
        }
      }

      await Promise.all([
        customerId
          ? Customer.findByIdAndUpdate(customerId, {
              $addToSet: { loads: saved._id },
            })
          : Promise.resolve(),
        carrierId
          ? Carrier.findByIdAndUpdate(carrierId, {
              $addToSet: { loads: saved._id },
            })
          : Promise.resolve(),
      ]);

      const [_, populatedLoad] = await Promise.all([
        this.historyModel && saved.createdBy
          ? this.createHistoryRecord(saved._id, "created", saved.createdBy, [])
          : Promise.resolve(),
        this.model
          .findById(saved._id)
          .populate("customer")
          .populate("carrier")
          .populate("createdBy"),
      ]);

      let formattedDoc = formatDocument(this.dto, populatedLoad);
      formattedDoc = maybeStripPaymentFields(accessContext.role, formattedDoc);

      const createdByUserId = populatedLoad.createdBy?._id?.toString() || populatedLoad.createdBy?.toString() || createdByCheck.createdBy;
      notificationService
        .sendLoadCreated(populatedLoad, createdByUserId)
        .catch((error) => {
          console.error("[LoadController] Failed to send notification:", error);
          console.error("[LoadController] Error stack:", error.stack);
        });

      sendLoadDetailsEmail(populatedLoad, { isStatusUpdate: false })
        .catch((error) => {
          console.error("[LoadController] Failed to send load details email:", error);
          console.error("[LoadController] Error stack:", error.stack);
        });

      markDirtyForLoadChange(null, populatedLoad, ['loads'])
        .catch((error) => {
          console.error("[LoadController] Failed to mark dirty for load:", error);
        });

      registerLoadStatsDelta(null, populatedLoad)
        .catch((error) => {
          console.error("[LoadController] Failed to register stats delta for load create:", error);
        });

      res.status(201).json({
        success: true,
        data: formattedDoc,
        message: "Load created successfully",
      });
    } catch (error) {
      this.handleError(res, error, "Failed to create load");
    }
  };

  _generatePdfAndUpload = async (req, res, type) => {
    try {
      let loadData;
      try {
        loadData = parseLoadData(req.body);
      } catch (e) {
        return res.status(400).json({
          success: false,
          error: "Invalid JSON in load field",
          details: e.message,
        });
      }
      const loadId = req.params.id || null;
      const entityId = loadId || `temp-${crypto.randomUUID()}`;
      const subType = type === "bol" ? "bol" : "rateConfirmation";
      let existingLoad = null;
      if (type === "bol" || type === "rateConfirmation") {
        if (loadId) {
          const load = await this.model.findById(loadId).populate("createdBy", "email phoneNumber").lean();
          existingLoad = load;
          if (load) {
            if (load.createdBy && typeof load.createdBy === "object") {
              loadData.createdBy = load.createdBy;
            }
            if (type === "rateConfirmation" && load.createdAt != null) {
              loadData.createdAt = load.createdAt;
            }
            if (Array.isArray(load.loadCarrierPeople) && load.loadCarrierPeople.length > 0) {
              loadData.loadCarrierPeople = load.loadCarrierPeople;
            }
          }
        }
        if (!loadData.createdBy?.email && req.user?.email) {
          loadData.createdBy = {
            ...(loadData.createdBy && typeof loadData.createdBy === "object" ? loadData.createdBy : {}),
            email: req.user.email,
            phoneNumber: req.user.phoneNumber ?? loadData.createdBy?.phoneNumber ?? ""
          };
        }
      }
      const generateFn = type === "bol"
        ? (data, id) => pdfService.generateBOL(data, id)
        : (data) => pdfService.generateRateConfirmation(data);
      const result = await generateFn(loadData, loadId);
      if (!result || !result.path) {
        return res.status(500).json({
          success: false,
          error: "PDF generation failed",
        });
      }
      const buffer = await fs.readFile(result.path);
      const key = await uploadToS3(
        buffer,
        result.filename,
        "loads",
        entityId,
        "pdfs",
        subType
      );
      if (loadId) {
        const updateField = type === "bol" ? "bolDocuments" : "rateConfirmationDocuments";
        const legacyPathField = type === "bol" ? "bolPdfPath" : "rateConfirmationPdfPath";
        const oldKeys = existingLoad && Array.isArray(existingLoad[updateField]) ? existingLoad[updateField] : [];
        const legacyKey = existingLoad && typeof existingLoad[legacyPathField] === "string" ? existingLoad[legacyPathField] : null;
        const keysToDelete = [...oldKeys, legacyKey].filter(Boolean);
        if (keysToDelete.length > 0) {
          deleteFromS3Multiple(keysToDelete).catch((err) => {
            console.error("[LoadController] Error deleting previous PDF(s) from S3:", err);
          });
        }
        await this.model.findByIdAndUpdate(loadId, {
          $set: { [updateField]: [key], [legacyPathField]: key },
        });
      }
      const signedUrl = await getSignedUrlForObject(key, 3600);
      const payload = {
        success: true,
        key,
        signedUrl: signedUrl || undefined,
      };
      if (!loadId) {
        payload.tempEntityId = entityId;
      }
      res.status(200).json(payload);
    } catch (error) {
      console.error(`[LoadController] generate${type === "bol" ? "BOL" : "RateConfirmation"} error:`, error);
      res.status(500).json({
        success: false,
        error: error.message || "PDF generation or upload failed",
      });
    }
  };

  generateBOL = (req, res) => this._generatePdfAndUpload(req, res, "bol");
  generateRateConfirmation = (req, res) => this._generatePdfAndUpload(req, res, "rateConfirmation");

  sendFiles = async (req, res) => {
    try {
      const loadId = req.params.id || null;
      const { recipients, attachmentKeys, loadData } = req.body;
      if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({ success: false, error: "recipients array is required" });
      }
      if (!attachmentKeys || typeof attachmentKeys !== "object") {
        return res.status(400).json({ success: false, error: "attachmentKeys is required" });
      }
      const bolKeys = Array.isArray(attachmentKeys.bol) ? attachmentKeys.bol : [];
      const rateConfKeys = Array.isArray(attachmentKeys.rateConfirmation) ? attachmentKeys.rateConfirmation : [];

      let orderId = null;
      if (loadId) {
        const load = await this.model.findById(loadId).lean();
        if (!load) {
          return res.status(404).json({ success: false, error: "Load not found" });
        }
        orderId = load.orderId || loadId;
      } else if (loadData && loadData.orderId) {
        orderId = loadData.orderId;
      }

      const getKey = (k) => {
        if (!k || typeof k !== "string") return null;
        const key = k.replace(/^\/api\/files\//, "").replace(/^\/files\//, "").trim();
        return key || null;
      };

      const results = [];
      for (const r of recipients) {
        const email = (r.email || "").trim();
        if (!email) continue;
        const includeBOL = !!r.includeBOL;
        const includeRateConfirmation = !!r.includeRateConfirmation;
        if (!includeBOL && !includeRateConfirmation) continue;

        const keysToAttach = [];
        if (includeBOL) keysToAttach.push(...bolKeys.map(getKey).filter(Boolean));
        if (includeRateConfirmation) keysToAttach.push(...rateConfKeys.map(getKey).filter(Boolean));

        if (keysToAttach.length === 0) continue;

        const attachments = [];
        for (const key of keysToAttach) {
          const normalizedKey = extractKeyFromUrl(key) || key;
          const obj = await getObjectFromS3(normalizedKey);
          if (obj && obj.Body) {
            const name = (obj.Metadata && obj.Metadata["original-filename"]) || key.split("/").pop() || "document.pdf";
            attachments.push({ filename: name, content: obj.Body });
          }
        }

        if (attachments.length === 0) {
          results.push({ email, success: false, error: "No attachments could be read" });
          continue;
        }

        let sendFilesMode = "bolOnly";
        if (includeBOL && includeRateConfirmation) sendFilesMode = "both";
        else if (includeRateConfirmation) sendFilesMode = "rcOnly";

        try {
          await sendLoadFilesEmail(email, orderId, attachments, sendFilesMode);
          results.push({ email, success: true });
        } catch (err) {
          console.error("[LoadController] sendLoadFilesEmail error for", email, err);
          results.push({ email, success: false, error: err.message });
        }
      }

      const failed = results.filter((x) => !x.success);
      if (failed.length === results.length) {
        return res.status(500).json({
          success: false,
          error: "Failed to send all emails",
          results,
        });
      }
      return res.status(200).json({ success: true, results });
    } catch (error) {
      console.error("[LoadController] sendFiles error:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to send files",
      });
    }
  };

  getRateConfirmationFieldMap = async (req, res) => {
    try {
      const result = await pdfService.generateRateConfirmationFieldMap();
      if (req.query.mapping === '1' || req.query.mapping === 'true') {
        const variables = result.mapping.map((m) => m.variable);
        return res.json({
          success: true,
          message: `PDF saved to ${result.path}. Use without ?mapping=1 to download.`,
          filename: result.filename,
          path: result.path,
          totalFields: result.totalFields,
          mapping: result.mapping,
          variables
        });
      }
      return res.download(result.path, result.filename, (err) => {
        if (err) res.status(500).json({ success: false, error: err.message });
      });
    } catch (error) {
      console.error('[LoadController] getRateConfirmationFieldMap error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to generate Rate Confirmation field map' });
    }
  };

  // Переопределяем базовый update для обработки customer/carrier объектов
  update = async (req, res) => {
    try {
      const { id } = req.params;

      // Валидация ID
      const idValidation = validateObjectId(id);
      if (!idValidation.valid) {
        return res.status(400).json({
          success: false,
          error: idValidation.error,
        });
      }

      // Получение старой записи
      const oldDoc = await this.model.findById(id);
      if (!oldDoc) {
        return res.status(404).json({
          success: false,
          error: "Load not found",
        });
      }

      const accessContext = await resolveAccessContext(req);
      if (accessContext.error) {
        return res.status(accessContext.error.status).json({
          success: false,
          error: accessContext.error.error
        });
      }
      if (!canUpdateStatus(accessContext.role)) {
        return res.status(403).json({
          success: false,
          error: "Access denied"
        });
      }
      const canRead = await hasLoadReadAccess(accessContext, oldDoc);
      if (!canRead) {
        return res.status(403).json({
          success: false,
          error: "Access denied"
        });
      }

      if (oldDoc.status === "Cancelled") {
        return res.status(400).json({
          success: false,
          error: "Load is cancelled",
          message: "Cancelled loads cannot be modified."
        });
      }

      const loadData = req.body.load || req.body;
      if (Object.prototype.hasOwnProperty.call(loadData, 'pickup')) {
        loadData.pickup = normalizeLocationAddress(parseJsonField(loadData.pickup));
      }
      if (Object.prototype.hasOwnProperty.call(loadData, 'delivery')) {
        loadData.delivery = normalizeLocationAddress(parseJsonField(loadData.delivery));
      }

      // Парсим fees и tonu если они приходят как JSON строки
      const { parseJsonField } = require('../utils/dataHelpers');
      if (loadData.fees !== undefined) {
        loadData.fees = parseJsonField(loadData.fees);
      }
      if (loadData.tonu !== undefined) {
        loadData.tonu = parseJsonField(loadData.tonu);
      }

      // Обработка customer и carrier
      let customerResult, carrierResult;
      try {
        [customerResult, carrierResult] = await Promise.all([
          processCustomer(loadData, oldDoc.customer, customerService),
          processCarrier(loadData, oldDoc.carrier, carrierService),
        ]);
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }

      const { customerId, customerWasProvided } = customerResult;
      const { carrierId, carrierWasProvided } = carrierResult;

      // Подготовка данных для обновления
      // Передаем существующие dates для мержа, чтобы не потерять неизмененные поля
      const existingDates = oldDoc.dates ? (oldDoc.dates.toObject ? oldDoc.dates.toObject() : oldDoc.dates) : null;
      const updateData = prepareUpdateData(
        loadData,
        customerId,
        carrierId,
        customerWasProvided,
        carrierWasProvided,
        existingDates
      );

      // Фильтруем только измененные поля
      const filteredData = this.filterChangedFields(oldDoc, updateData);

      // IMPORTANT: Ensure fees and tonu are included if they were in updateData
      // filterChangedFields might skip them if comparison fails for arrays/objects
      if (updateData.fees !== undefined) {
        filteredData.fees = updateData.fees;
      }
      if (updateData.tonu !== undefined) {
        filteredData.tonu = updateData.tonu;
      }

      if (filteredData.status === "Listed" && oldDoc.status !== "Listed") {
        Object.assign(filteredData, getStep5ResetData(oldDoc));
      }

      // Добавляем updatedBy если есть пользователь
      if (req.user?.id) {
        filteredData.updatedBy = req.user.id;
      }

      // ВАЛИДАЦИЯ: Проверяем требования для статуса "Delivered"
      const newStatus = filteredData.status !== undefined ? filteredData.status : oldDoc.status;
      const skipPayableForDelivered = newStatus === "Delivered" && oldDoc.status !== "Delivered"
        ? await this.shouldSkipPayableForPlatformDelivered(oldDoc)
        : false;
      if (newStatus === "Delivered" && oldDoc.status !== "Delivered") {
        const validationErrors = [];
        
        // Проверяем customer и customerRate (используем новые значения или старые)
        const finalCustomerId = filteredData.customer !== undefined ? filteredData.customer : oldDoc.customer;
        const finalCustomerRate = filteredData.customerRate !== undefined ? filteredData.customerRate : oldDoc.customerRate;
        
        if (!finalCustomerId) {
          validationErrors.push({
            field: "customer",
            message: "Customer is required to set status to Delivered"
          });
        }
        
        const customerRate = parseFloat(finalCustomerRate) || 0;
        if (!finalCustomerRate || customerRate <= 0) {
          validationErrors.push({
            field: "customerRate",
            message: "Customer rate is required and must be greater than 0 to set status to Delivered"
          });
        }
        
        // Проверяем carrier и carrierRate (используем новые значения или старые)
        const finalCarrierId = filteredData.carrier !== undefined ? filteredData.carrier : oldDoc.carrier;
        const finalCarrierRate = filteredData.carrierRate !== undefined ? filteredData.carrierRate : oldDoc.carrierRate;
        
        if (!skipPayableForDelivered) {
        if (!finalCarrierId) {
          validationErrors.push({
            field: "carrier",
            message: "Carrier is required to set status to Delivered"
          });
        }
        
        const carrierRate = parseFloat(finalCarrierRate) || 0;
        if (!finalCarrierRate || carrierRate <= 0) {
          validationErrors.push({
            field: "carrierRate",
            message: "Carrier rate is required and must be greater than 0 to set status to Delivered"
          });
          }
        }
        
        if (validationErrors.length > 0) {
          return res.status(400).json({
            success: false,
            error: "Validation failed",
            message: "Cannot set status to Delivered. Missing required fields.",
            details: validationErrors
          });
        }
      }

      // Если нет изменений, возвращаем существующую запись
      if (Object.keys(filteredData).length === 0) {
        let formattedDoc = formatDocument(this.dto, oldDoc);
        formattedDoc = maybeStripPaymentFields(req.user?.role, formattedDoc);
        return res.status(200).json({
          success: true,
          data: formattedDoc,
          message: "No changes detected",
        });
      }

      // Подготовка данных (только для измененных полей)
      const data = this.prepareUpdateData(req, filteredData);

      if (filteredData.fees !== undefined) {
        data.fees = filteredData.fees;
      }
      if (filteredData.tonu !== undefined) {
        data.tonu = filteredData.tonu;
      }

      // Защитная проверка: убеждаемся, что customer и carrier - это ObjectId, а не объекты
      normalizeObjectIdFields(data);

      // Use loadService for update with audit (centralized history logging)
      const actor = createActor(req.user);

      // Use loadService.updateLoad for centralized history logging
      const updatedLean = await loadService.updateLoad(
        id,
        data,
        actor,
        {} // Auto-detect action
      );

      // Populate for response
      const updated = await this.model
        .findById(id)
        .populate("customer")
        .populate("carrier")
        .populate("createdBy")
        .populate("updatedBy");

      // Обновляем связи в Customer и Carrier
      await updateCustomerCarrierLinks(
        Customer,
        Carrier,
        oldDoc.customer,
        customerId,
        oldDoc.carrier,
        carrierId,
        id
      );

      // Синхронизируем платежи с Load, если они уже созданы и Load в статусе Delivered
      if (updated && (updated.status === "Delivered" || updatedLean?.status === "Delivered")) {
        // Загружаем Load с paymentReceivable и paymentPayable для синхронизации
        const loadForSync = await this.model
          .findById(id)
          .populate("paymentReceivable")
          .populate("paymentPayable")
          .lean();
        
        if (loadForSync && (loadForSync.paymentReceivable || loadForSync.paymentPayable)) {
          // Проверяем, были ли изменены поля, влияющие на платежи
          const paymentRelatedFields = ['customerRate', 'carrierRate', 'fees', 'tonu', 'orderId'];
          const hasPaymentChanges = Object.keys(filteredData).some(key => paymentRelatedFields.includes(key));
          
          if (hasPaymentChanges) {
            await this.syncPaymentsWithLoad(loadForSync);
          }
        }
      }

      // Only send load_updated notification (not status changes or assignments)

      if (this.historyModel) {
        const oldStatus = oldDoc.status;
        const newStatus = updated.status;
        const statusChanged = oldStatus !== newStatus;
        
        const changes = this.getChanges(oldDoc, updateData);
        const nonStatusChanges = changes.filter((c) => c.field !== "status");
        
        if (statusChanged) {
          console.log(`[LoadController] Status changed from ${oldStatus} to ${newStatus} for load ${id}`);
          console.log(`[LoadController] Customer emails: ${updated?.customerEmails?.length || 0}, Carrier emails: ${updated?.carrierEmails?.length || 0}`);
          console.log(`[LoadController] Customer emails array:`, updated?.customerEmails);
          console.log(`[LoadController] Carrier emails array:`, updated?.carrierEmails);
          
          notificationService
            .sendLoadStatusUpdate(
              updated,
              oldStatus,
              newStatus,
              req.user?.id
            )
            .catch((error) => {
              console.error(
                "[LoadController] Failed to send status update notification:",
                error
              );
              console.error("[LoadController] Error stack:", error.stack);
            });

          const loadForEmail = updated.toObject ? updated.toObject() : updated;
          if (!loadForEmail.customerEmails || loadForEmail.customerEmails.length === 0) {
            loadForEmail.customerEmails = oldDoc.customerEmails || [];
          }
          if (!loadForEmail.carrierEmails || loadForEmail.carrierEmails.length === 0) {
            loadForEmail.carrierEmails = oldDoc.carrierEmails || [];
          }
          
          sendLoadDetailsEmail(loadForEmail, { 
            isStatusUpdate: true, 
            oldStatus: oldStatus, 
            newStatus: newStatus 
          })
            .then(() => {
              console.log(`[LoadController] Status update email sent successfully for load ${id}`);
            })
            .catch((error) => {
              console.error("[LoadController] Failed to send load status update email:", error);
              console.error("[LoadController] Error stack:", error.stack);
            });

          if (newStatus === "Picked Up" && updated?.customer?.type === "platform") {
            this.createReceivableOnPickedUpForPlatform(updated, req.user?.id)
              .catch((error) => {
                console.error("[LoadController] Failed to create receivable on picked up:", error);
              });
          }
        }
        if (nonStatusChanges.length > 0) {
          const changesObj = {};
          nonStatusChanges.forEach((c) => {
            changesObj[c.field] = { from: c.oldValue, to: c.newValue };
          });
          notificationService
            .sendLoadUpdated(updated, changesObj, req.user?.id)
            .catch((error) => {
              console.error(
                "[LoadController] Failed to send update notification:",
                error
              );
              console.error("[LoadController] Error stack:", error.stack);
            });
        }
      }

      // Создаем платежные записи при переходе в статус "Delivered"
      // ВАЛИДАЦИЯ уже выполнена выше, здесь просто создаем платежи
      if (updateData.status === "Delivered" && oldDoc.status !== "Delivered") {
        try {
          await this.createPaymentsOnDelivered(updated, req.user?.id, null, {
            skipPayable: skipPayableForDelivered
          });
        } catch (error) {
          console.error(
            "[LoadController] Failed to create payment records:",
            error
          );
          // Возвращаем ошибку пользователю, так как платежи обязательны для Delivered
          return res.status(400).json({
            success: false,
            error: "Failed to create payment records",
            message: error.message || "Cannot create payments for delivered load",
            details: error.message
          });
        }
      } else if (updated && updated.status === "Delivered") {
        // Если Load уже в статусе Delivered, синхронизируем платежи при изменении fees/tonu/rates
        const paymentRelatedFields = ['customerRate', 'carrierRate', 'fees', 'tonu', 'orderId'];
        const hasPaymentChanges = Object.keys(updateData).some(key => paymentRelatedFields.includes(key));
        
        if (hasPaymentChanges) {
          // Загружаем Load с paymentReceivable и paymentPayable для синхронизации
          const loadForSync = await this.model
            .findById(updated._id || id)
            .populate("paymentReceivable")
            .populate("paymentPayable")
            .lean();
          
          if (loadForSync && (loadForSync.paymentReceivable || loadForSync.paymentPayable)) {
            await this.syncPaymentsWithLoad(loadForSync);
          }
        }
      }

      try {
        await markDirtyForLoadChange(oldDoc, updated, ['loads']);
      } catch (error) {
        console.error("[LoadController] Failed to mark dirty for load update:", error);
      }

      registerLoadStatsDelta(oldDoc, updated)
        .catch((error) => {
          console.error("[LoadController] Failed to register stats delta for load update:", error);
        });

      // Применение DTO
      let formattedDoc = formatDocument(this.dto, updated);
      formattedDoc = maybeStripPaymentFields(req.user?.role, formattedDoc);

      res.status(200).json({
        success: true,
        data: formattedDoc,
        message: "Load updated successfully",
      });
    } catch (error) {
      this.handleError(res, error, "Failed to update load");
    }
  };

  // Полное обновление load с поддержкой новой структуры
  updateLoad = async (req, res) => {
    try {
      const { id } = req.params;

      // Валидация ID
      const idValidation = validateObjectId(id);
      if (!idValidation.valid) {
        return res.status(400).json({
          success: false,
          error: idValidation.error,
        });
      }

      // Получение старой записи для истории
      const oldDoc = await this.model.findById(id);
      if (!oldDoc) {
        return res.status(404).json({
          success: false,
          error: "Load not found",
        });
      }

      const accessContext = await resolveAccessContext(req);
      if (accessContext.error) {
        return res.status(accessContext.error.status).json({
          success: false,
          error: accessContext.error.error
        });
      }
      if (!canUpdateLoad(accessContext.role)) {
        return res.status(403).json({
          success: false,
          error: "Access denied"
        });
      }
      const canRead = await hasLoadReadAccess(accessContext, oldDoc);
      if (!canRead) {
        return res.status(403).json({
          success: false,
          error: "Access denied"
        });
      }

      // Парсим данные из запроса
      let loadData;
      try {
        loadData = parseLoadData(req.body);
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: "Invalid JSON in load field",
          details: error.message,
        });
      }

      loadData = filterLoadDataByRole(accessContext.role, loadData);

      // Валидируем данные
      const customerData = validateCustomerData(loadData.customer);
      const carrierData = validateCarrierData(loadData.carrier);
      const typeData = loadData.type
        ? parseJsonField(loadData.type)
        : oldDoc.type;

      const vehicleWasProvided =
        loadData && typeof loadData === "object" && "vehicle" in loadData;
      let vehicleData = vehicleWasProvided
        ? validateVehicleData(loadData.vehicle, typeData || oldDoc.type)
        : undefined;

      const freightWasProvided =
        loadData && typeof loadData === "object" && "freight" in loadData;
      let freightData = freightWasProvided
        ? validateFreightData(loadData.freight, typeData || oldDoc.type)
        : undefined;

      const pickupData = loadData.pickup
        ? normalizeLocationAddress(parseJsonField(loadData.pickup))
        : null;
      const deliveryData = loadData.delivery
        ? normalizeLocationAddress(parseJsonField(loadData.delivery))
        : null;
      const insuranceData = loadData.insurance
        ? parseJsonField(loadData.insurance)
        : null;
      const datesData = loadData.dates ? parseJsonField(loadData.dates) : null;
      // Парсим fees и tonu если они приходят как JSON строки
      const feesData = loadData.fees !== undefined ? parseJsonField(loadData.fees) : undefined;
      const tonuData = loadData.tonu !== undefined ? parseJsonField(loadData.tonu) : undefined;

      if (accessContext.role === 'Pre-dispatcher') {
        const customerId = getIdString(customerData?.id || loadData.customer);
        if (customerId && !accessContext.allowedCustomerIds.includes(customerId)) {
          return res.status(403).json({
            success: false,
            error: "Access denied"
          });
        }
        if (!customerId && Object.prototype.hasOwnProperty.call(loadData, 'customer')) {
          return res.status(403).json({
            success: false,
            error: "Access denied"
          });
        }
      }

      if (accessContext.role === 'salesAgent') {
        const customerId = getIdString(customerData?.id || loadData.customer);
        const providedType = customerData?.type || loadData?.customer?.type;
        if (providedType && providedType !== 'platform') {
          return res.status(403).json({
            success: false,
            error: "Access denied"
          });
        }
        if (!providedType && customerId) {
          const customerDoc = await Customer.findById(customerId).select('type').lean();
          if (!customerDoc || customerDoc.type !== 'platform') {
            return res.status(403).json({
              success: false,
              error: "Access denied"
            });
          }
        }
        if (!providedType && !customerId && Object.prototype.hasOwnProperty.call(loadData, 'customer')) {
          return res.status(403).json({
            success: false,
            error: "Access denied"
          });
        }
      }

      // Нормализуем fees перед использованием
      let normalizedFees = undefined;
      if (feesData !== undefined) {
        if (Array.isArray(feesData) && feesData.length > 0) {
          normalizedFees = feesData
            .filter(fee => fee && fee.type && fee.type.trim() !== '')
            .map(fee => ({
              type: fee.type || '',
              carrierRate: fee.carrierRate !== undefined && fee.carrierRate !== null ? String(fee.carrierRate) : '',
              customerRate: fee.customerRate !== undefined && fee.customerRate !== null ? String(fee.customerRate) : '',
              total: fee.total !== undefined && fee.total !== null ? String(fee.total) : ''
            }));
        } else if (Array.isArray(feesData) && feesData.length === 0) {
          normalizedFees = [];
        }
      }

      // Добавляем нормализованные fees и tonu в loadData для prepareUpdateData
      if (normalizedFees !== undefined) {
        loadData.fees = normalizedFees;
      }
      if (tonuData !== undefined) {
        loadData.tonu = tonuData;
      }

      // Validate dates
      if (datesData && Object.keys(datesData).length > 0) {
        const datesValidation = validateDatesData(datesData);
        if (datesValidation && !datesValidation.valid) {
          return res.status(400).json({
            success: false,
            error: 'Invalid dates data',
            details: datesValidation.errors || datesValidation.error
          });
        }
      }

      // Validate fees
      const freightType = typeData?.freight || oldDoc?.type?.freight;
      if (normalizedFees && Array.isArray(normalizedFees) && normalizedFees.length > 0) {
        const feesValidation = validateFeesData(normalizedFees, freightType);
        if (feesValidation && !feesValidation.valid) {
          return res.status(400).json({
            success: false,
            error: 'Invalid fees data',
            details: feesValidation.errors || feesValidation.error
          });
        }
      }

      // Проверяем дубликаты VIN
      if (vehicleWasProvided && vehicleData?.shipment?.length > 0) {
        const vinCheck = await checkDuplicateVIN(this.model, vehicleData, id);
        if (vinCheck) {
          return res.status(400).json({
            success: false,
            error: vinCheck.error,
            message: vinCheck.message,
          });
        }
      }

      // Обрабатываем customer и carrier
      let customerId = oldDoc.customer;
      if (customerData) {
        customerId = await customerService.findOrCreate(customerData);
      }

      let carrierId = oldDoc.carrier;
      if (carrierData) {
        // Если есть старый carrier и в carrierData нет id, добавляем id для обновления
        if (carrierId && !carrierData.id) {
          carrierData.id = carrierId;
        }
        carrierId = await carrierService.findOrCreate(carrierData);
      }

      // Нормализуем emails
      const { customerEmails, carrierEmails } = normalizeEmailsForLoad(loadData);

      await Promise.all([
        customerEmails.length > 0 && customerId
          ? customerService.syncEmail(customerId, customerEmails[0])
          : Promise.resolve(),
      ]);

      // Проверяем уникальность orderId перед обновлением (если изменяется)
      if (loadData.orderId && loadData.orderId.trim() !== '') {
        const newOrderId = loadData.orderId.trim();
        if (newOrderId !== oldDoc.orderId) {
          const existingLoad = await this.model.findOne({ 
            orderId: newOrderId,
            _id: { $ne: id }
          }).select('_id orderId').lean();
          if (existingLoad) {
            return res.status(400).json({
              success: false,
              error: 'Duplicate order ID',
              message: `Load with Order ID "${newOrderId}" already exists`
            });
          }
        }
      }

      const resetCarrierOnListed =
        loadData.status === "Listed" && oldDoc.status !== "Listed";

      // Подготовка данных для обновления
      const updateData = {
        // orderId - обновляем если передан (даже если пустой)
        ...(loadData.orderId !== undefined && { orderId: loadData.orderId }),
        // customer/carrier - обновляем если передан ID
        ...(customerId && { customer: customerId }),
        ...(carrierId && { carrier: carrierId }),
        // customerEmails/carrierEmails - обновляем если передан (даже пустой массив для очистки)
        ...(customerEmails !== undefined && { customerEmails }),
        ...(carrierEmails !== undefined && { carrierEmails }),
        // fees и tonu - обновляем если передан (даже пустой массив для очистки)
        ...(normalizedFees !== undefined && { fees: normalizedFees }),
        ...(tonuData !== undefined && { tonu: tonuData }),
        // customerRate/carrierRate - обновляем если передан (даже если пустая строка или 0)
        ...(loadData.customerRate !== undefined && { 
          customerRate: loadData.customerRate === '' ? null : String(loadData.customerRate).trim() 
        }),
        ...(loadData.carrierRate !== undefined && { 
          carrierRate: loadData.carrierRate === '' ? null : String(loadData.carrierRate).trim() 
        }),
        // type - обновляем если передан
        ...(typeData && { type: typeData }),
        // pickup - deep merge с существующими данными
        ...(pickupData && {
          pickup: (() => {
            const mergedPickup = {
              ...(oldDoc.pickup && typeof oldDoc.pickup === 'object' ? oldDoc.pickup.toObject ? oldDoc.pickup.toObject() : oldDoc.pickup : {}),
              ...pickupData,
              // Deep merge для address
              ...(pickupData.address && {
                address: {
                  ...(oldDoc.pickup?.address && typeof oldDoc.pickup.address === 'object' 
                    ? (oldDoc.pickup.address.toObject ? oldDoc.pickup.address.toObject() : oldDoc.pickup.address)
                    : {}),
                  ...pickupData.address
                }
              })
            };
            // Массив images: если присутствует в patch - использовать ([] для очистки, непустой массив для замены)
            // Если НЕ присутствует (undefined) - НЕ добавлять в updateData (не трогать существующие)
            if (loadData.pickup?.images !== undefined) {
              mergedPickup.images = loadData.pickup.images;
            }
            return mergedPickup;
          })()
        }),
        // delivery - deep merge с существующими данными
        ...(deliveryData && {
          delivery: (() => {
            const mergedDelivery = {
              ...(oldDoc.delivery && typeof oldDoc.delivery === 'object' ? oldDoc.delivery.toObject ? oldDoc.delivery.toObject() : oldDoc.delivery : {}),
              ...deliveryData,
              // Deep merge для address
              ...(deliveryData.address && {
                address: {
                  ...(oldDoc.delivery?.address && typeof oldDoc.delivery.address === 'object'
                    ? (oldDoc.delivery.address.toObject ? oldDoc.delivery.address.toObject() : oldDoc.delivery.address)
                    : {}),
                  ...deliveryData.address
                }
              })
            };
            // Массив images: если присутствует в patch - использовать ([] для очистки, непустой массив для замены)
            // Если НЕ присутствует (undefined) - НЕ добавлять в updateData (не трогать существующие)
            if (loadData.delivery?.images !== undefined) {
              mergedDelivery.images = loadData.delivery.images;
            }
            return mergedDelivery;
          })()
        }),
        // carrierPhotos - обновляем если передан (даже пустой массив для очистки)
        ...(loadData.carrierPhotos !== undefined && {
          carrierPhotos: loadData.carrierPhotos,
        }),
        // insurance - deep merge с существующими данными (1 уровень)
        ...(insuranceData && {
          insurance: {
            ...(oldDoc.insurance && typeof oldDoc.insurance === 'object' ? oldDoc.insurance.toObject ? oldDoc.insurance.toObject() : oldDoc.insurance : {}),
            ...insuranceData
          }
        }),
        // status - обновляем если передан
        ...(loadData.status !== undefined && { status: loadData.status }),
        // dates - deep merge с существующими данными (1 уровень)
        ...(datesData && {
          dates: {
            ...(oldDoc.dates && typeof oldDoc.dates === 'object' ? oldDoc.dates.toObject ? oldDoc.dates.toObject() : oldDoc.dates : {}),
            ...datesData
          }
        }),
        // tracking - обновляем если передан (даже если пустая строка для очистки)
        ...(loadData.tracking !== undefined && { 
          tracking: loadData.tracking === '' ? null : loadData.tracking 
        }),
        // notes - обновляем если передан (даже если пустая строка для очистки)
        ...(loadData.notes !== undefined && { 
          notes: loadData.notes === '' ? null : loadData.notes 
        }),
        ...(loadData.bolDocuments !== undefined && { bolDocuments: loadData.bolDocuments }),
        ...(loadData.rateConfirmationDocuments !== undefined && { rateConfirmationDocuments: loadData.rateConfirmationDocuments }),
        ...(loadData.documents !== undefined && { documents: loadData.documents }),
        // Payment fields - allow empty strings to clear the field
        ...(loadData.paymentMethod !== undefined && { 
          paymentMethod: loadData.paymentMethod === '' ? null : loadData.paymentMethod 
        }),
        ...(loadData.paymentTerms !== undefined && { 
          paymentTerms: loadData.paymentTerms === '' ? null : loadData.paymentTerms 
        }),
        // Independent copies of people for this specific load
        // loadCarrierPeople - обновляем если передан (даже пустой массив для очистки)
        ...(loadData.loadCarrierPeople !== undefined && {
          loadCarrierPeople: Array.isArray(loadData.loadCarrierPeople)
            ? loadData.loadCarrierPeople.filter(person => person && person.fullName && person.fullName.trim() !== '')
            : []
        }),
        // loadCustomerRepresentativePeoples - обновляем если передан (даже пустой массив для очистки)
        ...(loadData.loadCustomerRepresentativePeoples !== undefined && {
          loadCustomerRepresentativePeoples: Array.isArray(loadData.loadCustomerRepresentativePeoples)
            ? loadData.loadCustomerRepresentativePeoples.filter(person => person && person.fullName && person.fullName.trim() !== '')
            : []
        }),
      };

      if (resetCarrierOnListed) {
        carrierId = null;
        loadData.carrier = null;
        loadData.carrierEmails = [];
        loadData.carrierPhotos = [];
        loadData.bolDocuments = [];
        loadData.rateConfirmationDocuments = [];
        loadData.documents = [];
        loadData.paymentMethod = '';
        loadData.paymentTerms = '';
        loadData.tracking = '';
        loadData.insurance = null;
        loadData.dates = {
          assignedDate: '',
          deadline: '',
          pickupDate: '',
          pickupDateStart: '',
          pickupDateEnd: '',
          pickupDateType: 'Exact',
          deliveryDate: '',
          deliveryDateStart: '',
          deliveryDateEnd: '',
          deliveryDateType: 'Exact',
          aging: ''
        };
        loadData.fees = [];
        loadData.tonu = { enabled: false };
        loadData.pickup = { ...(loadData.pickup || {}), images: [] };
        loadData.delivery = { ...(loadData.delivery || {}), images: [] };

        // Preserve loadCarrierPeople and loadCustomerRepresentativePeoples before reset
        // These are independent of carrier and should not be reset
        const preservedLoadCarrierPeople = updateData.loadCarrierPeople;
        const preservedLoadCustomerRepresentativePeoples = updateData.loadCustomerRepresentativePeoples;

        Object.assign(updateData, getStep5ResetData(oldDoc));

        // Restore preserved people data after reset
        if (preservedLoadCarrierPeople !== undefined) {
          updateData.loadCarrierPeople = preservedLoadCarrierPeople;
        }
        if (preservedLoadCustomerRepresentativePeoples !== undefined) {
          updateData.loadCustomerRepresentativePeoples = preservedLoadCustomerRepresentativePeoples;
        }
      }

      // Добавляем vehicle только если он был передан в запросе
      // Если vehicleData === null (явно передан null), удаляем vehicle из документа
      // Если vehicleData === undefined (не передан), не трогаем vehicle
      if (vehicleWasProvided) {
        if (vehicleData === null) {
          updateData.vehicle = null;
        } else {
          // Проверяем, присутствует ли vehicleImages в исходном loadData (до валидации)
          const vehicleImagesInPatch = loadData.vehicle?.vehicleImages !== undefined 
            ? loadData.vehicle.vehicleImages 
            : (loadData.vehicle?.images !== undefined ? loadData.vehicle.images : undefined);
          
          // Обрабатываем vehicle если:
          // 1. Есть shipment (обычный случай)
          // 2. ИЛИ есть vehicleImages в patch (даже если shipment не передан - это обновление только изображений)
          if (vehicleData?.shipment?.length > 0 || vehicleImagesInPatch !== undefined) {
            // Deep merge с существующими данными vehicle
            const existingVehicle = oldDoc.vehicle && typeof oldDoc.vehicle === 'object'
              ? (oldDoc.vehicle.toObject ? oldDoc.vehicle.toObject() : oldDoc.vehicle)
              : {};
            
            // Ensure vehicleImages exists (not images) - API sends vehicleImages
            // If only images exists, convert to vehicleImages
            if (vehicleData && vehicleData.images && !vehicleData.vehicleImages) {
              vehicleData.vehicleImages = vehicleData.images;
            }
            
            // Merge vehicle data (используем vehicleData если есть, иначе только существующие)
            const mergedVehicle = vehicleData && vehicleData.shipment?.length > 0
              ? {
                  ...existingVehicle,
                  ...vehicleData
                }
              : {
                  ...existingVehicle
                };
            
            // Массив vehicleImages: если присутствует в patch - использовать ([] для очистки, непустой массив для замены)
            // Если НЕ присутствует (undefined) - НЕ добавлять в updateData (не трогать существующие)
            if (vehicleImagesInPatch !== undefined) {
              mergedVehicle.vehicleImages = vehicleImagesInPatch;
            } else if (mergedVehicle.vehicleImages !== undefined) {
              // Не трогать vehicleImages - удалить из mergedVehicle если он там есть
              delete mergedVehicle.vehicleImages;
            }
            
            // Sync for database (both fields needed in DB for backward compatibility)
            // syncImageFields will create images from vehicleImages if needed
            syncImageFields(mergedVehicle);
            updateData.vehicle = mergedVehicle;
          }
        }
      }

      if (freightWasProvided) {
        if (freightData === null) {
          updateData.freight = null;
        } else {
          // Проверяем, присутствует ли freightImages в исходном loadData (до валидации)
          const freightImagesInPatch = loadData.freight?.freightImages !== undefined 
            ? loadData.freight.freightImages 
            : (loadData.freight?.images !== undefined ? loadData.freight.images : undefined);
          
          // Обрабатываем freight если:
          // 1. Есть shipment (обычный случай)
          // 2. ИЛИ есть freightImages в patch (даже если shipment не передан - это обновление только изображений)
          if (freightData?.shipment?.length > 0 || freightImagesInPatch !== undefined) {
            // Deep merge с существующими данными freight
            const existingFreight = oldDoc.freight && typeof oldDoc.freight === 'object'
              ? (oldDoc.freight.toObject ? oldDoc.freight.toObject() : oldDoc.freight)
              : {};
            
            // Ensure freightImages exists (not images) - API sends freightImages
            // If only images exists, convert to freightImages
            if (freightData && freightData.images && !freightData.freightImages) {
              freightData.freightImages = freightData.images;
            }
            
            // Merge freight data (используем freightData если есть, иначе только существующие)
            const mergedFreight = freightData && freightData.shipment?.length > 0
              ? {
                  ...existingFreight,
                  ...freightData
                }
              : {
                  ...existingFreight
                };
            
            // Массив freightImages: если присутствует в patch - использовать ([] для очистки, непустой массив для замены)
            // Если НЕ присутствует (undefined) - НЕ добавлять в updateData (не трогать существующие)
            if (freightImagesInPatch !== undefined) {
              mergedFreight.freightImages = freightImagesInPatch;
            } else if (mergedFreight.freightImages !== undefined) {
              // Не трогать freightImages - удалить из mergedFreight если он там есть
              delete mergedFreight.freightImages;
            }
            
            // Sync for database (both fields needed in DB for backward compatibility)
            // syncFreightFields will create images from freightImages if needed
            syncFreightFields(mergedFreight);
            updateData.freight = mergedFreight;
          }
        }
      }

      // Обработка массивов изображений/документов согласно контракту:
      // 1) Если поле НЕ отправлено в PATCH (undefined) => не трогать (удалить из updateData)
      // 2) Если поле отправлено как [] => очистить (оставить [])
      // 3) Если поле отправлено как непустой массив keys => заменить (оставить keys)
      const imageArrayFields = {
        'pickup.images': () => loadData.pickup?.images,
        'delivery.images': () => loadData.delivery?.images,
        'carrierPhotos': () => loadData.carrierPhotos,
        'vehicle.vehicleImages': () => loadData.vehicle?.vehicleImages || loadData.vehicle?.images,
        'freight.freightImages': () => loadData.freight?.freightImages || loadData.freight?.images,
        'bolDocuments': () => loadData.bolDocuments,
        'rateConfirmationDocuments': () => loadData.rateConfirmationDocuments,
        'documents': () => loadData.documents
      };

      Object.keys(imageArrayFields).forEach(fieldPath => {
        const getValue = imageArrayFields[fieldPath];
        const patchValue = getValue();
        
        const parts = fieldPath.split('.');
        let target = updateData;
        
        // Navigate to field location
        for (let i = 0; i < parts.length - 1; i++) {
          if (!target[parts[i]]) {
            // Field not in updateData, skip
            return;
          }
          target = target[parts[i]];
        }
        
        const field = parts[parts.length - 1];
        
        // Если поле присутствует в updateData
        if (field in target) {
          // Если patchValue === undefined => удалить из updateData (не трогать существующие)
          if (patchValue === undefined) {
            delete target[field];
            // Clean up empty parent objects
            if (parts.length > 1) {
              let parent = updateData;
              for (let i = 0; i < parts.length - 2; i++) {
                parent = parent[parts[i]];
              }
              if (parent && Object.keys(parent[parts[parts.length - 2]]).length === 0) {
                delete parent[parts[parts.length - 2]];
              }
            }
          }
          // Если patchValue === [] => оставить [] (явная очистка)
          // Если patchValue === array(keys) => оставить keys (замена)
          // Эти случаи уже обработаны в updateData выше
        }
      });

      // Find and delete removed files
      const filesToDelete = processDeletedFiles(oldDoc, loadData);

      if (filesToDelete.length > 0) {
        deleteFromS3Multiple(filesToDelete)
          .then((results) => {
            const failCount = results.length - results.filter(r => r === undefined || (r && r.success !== false)).length;
            if (failCount > 0) {
              console.error(`[LoadController] Failed deletions:`, results.filter(r => r && r.success === false));
            }
          })
          .catch((error) => {
            console.error("[LoadController] Error deleting files from S3:", error);
          });
      }

      // Distribute uploaded files by type
      processUploadedFilesForUpdate(updateData, oldDoc, req.uploadedFiles);

      if (req.uploadedFiles?.bolDocuments?.length > 0 && Array.isArray(oldDoc.bolDocuments) && oldDoc.bolDocuments.length > 0) {
        deleteFromS3Multiple(oldDoc.bolDocuments).catch((err) => {
          console.error("[LoadController] Error deleting previous BOL from S3:", err);
        });
      }
      if (req.uploadedFiles?.rateConfirmationDocuments?.length > 0 && Array.isArray(oldDoc.rateConfirmationDocuments) && oldDoc.rateConfirmationDocuments.length > 0) {
        deleteFromS3Multiple(oldDoc.rateConfirmationDocuments).catch((err) => {
          console.error("[LoadController] Error deleting previous Rate Confirmation from S3:", err);
        });
      }

      // Final cleanup: ensure vehicle/freight have correct structure
      // Both fields will be synced for DB, but vehicleImages/freightImages are primary
      if (updateData.vehicle?.vehicleImages) {
        syncImageFields(updateData.vehicle);
      }
      if (updateData.freight?.freightImages) {
        syncFreightFields(updateData.freight);
      }

      // Сохраняем важные поля перед filterNullValues (они могут быть пустыми строками для очистки)
      const importantFields = {
        paymentMethod: updateData.paymentMethod,
        paymentTerms: updateData.paymentTerms,
        customerRate: updateData.customerRate,
        carrierRate: updateData.carrierRate,
        tracking: updateData.tracking,
        notes: updateData.notes,
        orderId: updateData.orderId
      };
      
      // Save fees, tonu, and people arrays before filtering
      const fees = updateData.fees;
      const tonu = updateData.tonu;
      const loadCarrierPeople = updateData.loadCarrierPeople;
      const loadCustomerRepresentativePeoples = updateData.loadCustomerRepresentativePeoples;
      
      const cleanedUpdateData = filterNullValues(updateData);
      
      // Восстанавливаем важные поля если они были переданы (даже если пустые)
      Object.keys(importantFields).forEach(key => {
        if (importantFields[key] !== undefined) {
          // Convert empty strings to null for database
          cleanedUpdateData[key] = importantFields[key] === '' ? null : importantFields[key];
        }
      });
      
      // Restore fees, tonu, and people arrays if they were provided
      // IMPORTANT: These must be preserved even if filterNullValues removes them
      if (fees !== undefined) {
        if (Array.isArray(fees)) {
          if (fees.length > 0) {
            // Filter fees that have type, and normalize all fields (remove undefined/null)
            cleanedUpdateData.fees = fees
              .filter(fee => fee && fee.type && fee.type.trim() !== '')
              .map(fee => {
                // Ensure all fields are present, even if empty, but remove undefined/null
                const normalizedFee = {
                  type: fee.type || '',
                  carrierRate: fee.carrierRate !== undefined && fee.carrierRate !== null ? String(fee.carrierRate) : '',
                  customerRate: fee.customerRate !== undefined && fee.customerRate !== null ? String(fee.customerRate) : '',
                  total: fee.total !== undefined && fee.total !== null ? String(fee.total) : ''
                };
                // Удаляем поля с undefined/null
                Object.keys(normalizedFee).forEach(key => {
                  if (normalizedFee[key] === undefined || normalizedFee[key] === null) {
                    delete normalizedFee[key];
                  }
                });
                return normalizedFee;
              });
          } else {
            // Allow empty array to clear fees
            cleanedUpdateData.fees = [];
          }
        }
      }

      if (tonu !== undefined && typeof tonu === 'object') {
        // Удаляем undefined/null из tonu
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
          cleanedUpdateData.tonu = cleanedTonu;
        } else if (tonu.enabled === false) {
          // Сохраняем enabled: false даже если других полей нет
          cleanedUpdateData.tonu = { enabled: false };
        }
      }

      if (resetCarrierOnListed) {
        // Preserve loadCarrierPeople and loadCustomerRepresentativePeoples before reset
        // These are independent of carrier and should not be reset
        const preservedLoadCarrierPeople2 = cleanedUpdateData.loadCarrierPeople;
        const preservedLoadCustomerRepresentativePeoples2 = cleanedUpdateData.loadCustomerRepresentativePeoples;

        Object.assign(cleanedUpdateData, getStep5ResetData(oldDoc));
        cleanedUpdateData.carrier = null;
        cleanedUpdateData.carrierEmails = [];
        cleanedUpdateData.carrierPhotos = [];
        cleanedUpdateData.bolDocuments = [];
        cleanedUpdateData.rateConfirmationDocuments = [];
        cleanedUpdateData.documents = [];
        cleanedUpdateData.fees = [];
        cleanedUpdateData.tonu = { enabled: false };
        cleanedUpdateData.paymentMethod = null;
        cleanedUpdateData.paymentTerms = null;
        cleanedUpdateData.tracking = null;
        cleanedUpdateData.insurance = null;

        // Restore preserved people data after reset
        if (preservedLoadCarrierPeople2 !== undefined) {
          cleanedUpdateData.loadCarrierPeople = preservedLoadCarrierPeople2;
        }
        if (preservedLoadCustomerRepresentativePeoples2 !== undefined) {
          cleanedUpdateData.loadCustomerRepresentativePeoples = preservedLoadCustomerRepresentativePeoples2;
        }
        cleanedUpdateData.carrierRate = null;
      }
      
      // Фильтруем только измененные поля (сравниваем с существующим документом)
      const filteredData = this.filterChangedFields(oldDoc, cleanedUpdateData);
      
      // IMPORTANT: Ensure fees, tonu, and people arrays are included if they were in cleanedUpdateData
      // filterChangedFields might skip them if comparison fails for arrays/objects
      if (cleanedUpdateData.loadCarrierPeople !== undefined) {
        filteredData.loadCarrierPeople = Array.isArray(cleanedUpdateData.loadCarrierPeople)
          ? cleanedUpdateData.loadCarrierPeople.filter(person => person && person.fullName && person.fullName.trim() !== '')
          : [];
        console.log(`[LoadController.updateLoad] Added loadCarrierPeople to filteredData: ${filteredData.loadCarrierPeople.length} people`);
      }
      if (cleanedUpdateData.loadCustomerRepresentativePeoples !== undefined) {
        filteredData.loadCustomerRepresentativePeoples = Array.isArray(cleanedUpdateData.loadCustomerRepresentativePeoples)
          ? cleanedUpdateData.loadCustomerRepresentativePeoples.filter(person => person && person.fullName && person.fullName.trim() !== '')
          : [];
        console.log(`[LoadController.updateLoad] Added loadCustomerRepresentativePeoples to filteredData: ${filteredData.loadCustomerRepresentativePeoples.length} people`);
      }
      if (cleanedUpdateData.fees !== undefined) {
        // Удаляем undefined/null из fees перед сохранением
        if (Array.isArray(cleanedUpdateData.fees)) {
          filteredData.fees = cleanedUpdateData.fees.map(fee => {
            const cleanedFee = {};
            if (fee.type !== undefined && fee.type !== null) cleanedFee.type = fee.type;
            if (fee.carrierRate !== undefined && fee.carrierRate !== null) cleanedFee.carrierRate = fee.carrierRate;
            if (fee.customerRate !== undefined && fee.customerRate !== null) cleanedFee.customerRate = fee.customerRate;
            if (fee.total !== undefined && fee.total !== null) cleanedFee.total = fee.total;
            return cleanedFee;
          }).filter(fee => Object.keys(fee).length > 0);
        } else {
          filteredData.fees = cleanedUpdateData.fees;
        }
      }
      if (cleanedUpdateData.tonu !== undefined) {
        // Удаляем undefined/null из tonu перед сохранением
        if (typeof cleanedUpdateData.tonu === 'object') {
          const cleanedTonu = {};
          if (cleanedUpdateData.tonu.enabled !== undefined && cleanedUpdateData.tonu.enabled !== null) {
            cleanedTonu.enabled = cleanedUpdateData.tonu.enabled;
          }
          if (cleanedUpdateData.tonu.carrierRate !== undefined && cleanedUpdateData.tonu.carrierRate !== null) {
            cleanedTonu.carrierRate = cleanedUpdateData.tonu.carrierRate;
          }
          if (cleanedUpdateData.tonu.customerRate !== undefined && cleanedUpdateData.tonu.customerRate !== null) {
            cleanedTonu.customerRate = cleanedUpdateData.tonu.customerRate;
          }
          if (Object.keys(cleanedTonu).length > 0) {
            filteredData.tonu = cleanedTonu;
          }
        } else {
          filteredData.tonu = cleanedUpdateData.tonu;
        }
      }
      if (cleanedUpdateData.bolDocuments !== undefined) {
        filteredData.bolDocuments = Array.isArray(cleanedUpdateData.bolDocuments) ? cleanedUpdateData.bolDocuments : [];
      }
      if (cleanedUpdateData.rateConfirmationDocuments !== undefined) {
        filteredData.rateConfirmationDocuments = Array.isArray(cleanedUpdateData.rateConfirmationDocuments) ? cleanedUpdateData.rateConfirmationDocuments : [];
      }
      if (cleanedUpdateData.documents !== undefined) {
        filteredData.documents = Array.isArray(cleanedUpdateData.documents) ? cleanedUpdateData.documents : [];
      }

      const preservedLoadCarrierPeople3 = filteredData.loadCarrierPeople;
      const preservedLoadCustomerRepresentativePeoples3 = filteredData.loadCustomerRepresentativePeoples;
      const preservedBolDocuments = filteredData.bolDocuments;
      const preservedRateConfirmationDocuments = filteredData.rateConfirmationDocuments;
      const preservedDocuments = filteredData.documents;

      const { removeUndefinedNullValues } = require('../utils/dataHelpers');
      const finalData = removeUndefinedNullValues(filteredData);

      Object.keys(finalData).forEach(key => {
        if (finalData[key] === undefined || finalData[key] === null) {
          delete filteredData[key];
        } else {
          filteredData[key] = finalData[key];
        }
      });

      if (preservedLoadCarrierPeople3 !== undefined) {
        filteredData.loadCarrierPeople = preservedLoadCarrierPeople3;
      }
      if (preservedLoadCustomerRepresentativePeoples3 !== undefined) {
        filteredData.loadCustomerRepresentativePeoples = preservedLoadCustomerRepresentativePeoples3;
      }
      if (preservedBolDocuments !== undefined) {
        filteredData.bolDocuments = preservedBolDocuments;
      }
      if (preservedRateConfirmationDocuments !== undefined) {
        filteredData.rateConfirmationDocuments = preservedRateConfirmationDocuments;
      }
      if (preservedDocuments !== undefined) {
        filteredData.documents = preservedDocuments;
      }

      const nextStatus = filteredData.status !== undefined ? filteredData.status : oldDoc.status;
      if (nextStatus === "Picked Up" || nextStatus === "Delivered") {
        const existingDates = oldDoc.dates && typeof oldDoc.dates === 'object'
          ? (oldDoc.dates.toObject ? oldDoc.dates.toObject() : oldDoc.dates)
          : {};
        const effectiveDates = { ...existingDates, ...(filteredData.dates || {}) };
        if (nextStatus === "Picked Up" && !effectiveDates.pickupAt) {
          effectiveDates.pickupAt = new Date();
        }
        if (nextStatus === "Delivered" && !effectiveDates.deliveryAt) {
          effectiveDates.deliveryAt = new Date();
        }
        filteredData.dates = effectiveDates;
      }

      // Добавляем updatedBy если есть пользователь
      if (req.user?.id) {
        filteredData.updatedBy = req.user.id;
      }

      // Если нет изменений, возвращаем существующую запись
      if (Object.keys(filteredData).length === 0) {
        let formattedDoc = formatDocument(this.dto, oldDoc);
        formattedDoc = maybeStripPaymentFields(req.user?.role, formattedDoc);
        return res.status(200).json({
          success: true,
          data: formattedDoc,
          message: "No changes detected",
        });
      }

      // ВАЛИДАЦИЯ: Проверяем требования для статуса "Delivered"
      const newStatus = filteredData.status !== undefined ? filteredData.status : oldDoc.status;
      if (newStatus === "Delivered" && oldDoc.status !== "Delivered") {
        const validationErrors = [];
        
        // Проверяем customer и customerRate (используем новые значения или старые)
        const finalCustomerId = filteredData.customer !== undefined ? filteredData.customer : oldDoc.customer;
        const finalCustomerRate = filteredData.customerRate !== undefined ? filteredData.customerRate : oldDoc.customerRate;
        
        if (!finalCustomerId) {
          validationErrors.push({
            field: "customer",
            message: "Customer is required to set status to Delivered"
          });
        }
        
        const customerRate = parseFloat(finalCustomerRate) || 0;
        if (!finalCustomerRate || customerRate <= 0) {
          validationErrors.push({
            field: "customerRate",
            message: "Customer rate is required and must be greater than 0 to set status to Delivered"
          });
        }
        
        // Проверяем carrier и carrierRate (используем новые значения или старые)
        const finalCarrierId = filteredData.carrier !== undefined ? filteredData.carrier : oldDoc.carrier;
        const finalCarrierRate = filteredData.carrierRate !== undefined ? filteredData.carrierRate : oldDoc.carrierRate;
        
        if (!finalCarrierId) {
          validationErrors.push({
            field: "carrier",
            message: "Carrier is required to set status to Delivered"
          });
        }
        
        const carrierRate = parseFloat(finalCarrierRate) || 0;
        if (!finalCarrierRate || carrierRate <= 0) {
          validationErrors.push({
            field: "carrierRate",
            message: "Carrier rate is required and must be greater than 0 to set status to Delivered"
          });
        }
        
        if (validationErrors.length > 0) {
          return res.status(400).json({
            success: false,
            error: "Validation failed",
            message: "Cannot set status to Delivered. Missing required fields.",
            details: validationErrors
          });
        }
      }

      // Use loadService for update with audit (centralized history logging)
      const actor = createActor(req.user);

      // Check if update triggers additional operations
      const willCreatePayments =
        filteredData.status === "Delivered" && oldDoc.status !== "Delivered";
      
      // Check if update triggers TONU payments creation (Cancelled status with TONU enabled)
      // TONU может быть в filteredData (новое значение) или в oldDoc (уже было установлено)
      const tonuEnabled = filteredData.tonu?.enabled !== undefined 
        ? filteredData.tonu.enabled 
        : (oldDoc.tonu?.enabled === true);
      const willCreateTONUPayments =
        filteredData.status === "Cancelled" && oldDoc.status !== "Cancelled" &&
        tonuEnabled === true;

      // Use loadService.updateLoad for centralized history logging
      // Service now returns populated data, so no need for additional findById
      try {
        const updated = await loadService.updateLoad(id, filteredData, actor, {
          useTransaction: willCreatePayments || willCreateTONUPayments, // Use transaction if creating payments
          additionalOperations: willCreatePayments
            ? async (session, updatedLoad) => {
                // Create payments in the same transaction
                // Если createPaymentsOnDelivered выбрасывает ошибку, транзакция откатится
                await this.createPaymentsOnDelivered(
                  updatedLoad,
                  req.user?.id,
                  session
                );
              }
            : willCreateTONUPayments
            ? async (session, updatedLoad) => {
                // Create TONU payments in the same transaction
                // Если createPaymentsOnCancelled выбрасывает ошибку, транзакция откатится
                await this.createPaymentsOnCancelled(
                  updatedLoad,
                  req.user?.id,
                  session
                );
              }
            : null,
        });

        // Исправляем temp ключи если они есть (перемещаем файлы из temp папки в финальную)
        const savedLoadDoc = await this.model.findById(id);
        if (savedLoadDoc) {
          await fixTempKeysInLoad(savedLoadDoc);
        }

 
        // Обновляем связи Customer/Carrier
        await updateCustomerCarrierLinks(
          Customer,
          Carrier,
          oldDoc.customer,
          filteredData.customer,
          oldDoc.carrier,
          filteredData.carrier,
          id
        );

        // Синхронизируем платежи с Load, если они уже созданы и Load в статусе Delivered
        if (updated && updated.status === "Delivered") {
          // Загружаем Load с paymentReceivable и paymentPayable для синхронизации
          const loadForSync = await this.model
            .findById(id)
            .populate("paymentReceivable")
            .populate("paymentPayable")
            .lean();
          
          if (loadForSync && (loadForSync.paymentReceivable || loadForSync.paymentPayable)) {
            // Проверяем, были ли изменены поля, влияющие на платежи
            const paymentRelatedFields = ['customerRate', 'carrierRate', 'fees', 'tonu', 'orderId'];
            const hasPaymentChanges = Object.keys(filteredData).some(key => paymentRelatedFields.includes(key));
            
          if (hasPaymentChanges) {
            await this.syncPaymentsWithLoad(loadForSync);
          }
          }
        }

        if (filteredData.status && filteredData.status !== oldDoc.status) {
          notificationService
            .sendLoadStatusUpdate(updated, oldDoc.status, filteredData.status, req.user?.id)
            .catch((error) => {
              console.error(
                "[LoadController] Failed to send status update notification:",
                error
              );
              console.error("[LoadController] Error stack:", error.stack);
            });

          if (filteredData.status === "Picked Up" && updated?.customer?.type === "platform") {
            this.createReceivableOnPickedUpForPlatform(updated, req.user?.id)
              .catch((error) => {
                console.error("[LoadController] Failed to create receivable on picked up:", error);
              });
          }
        }

        try {
          await markDirtyForLoadChange(oldDoc, updated, ['loads']);
        } catch (error) {
          console.error("[LoadController] Failed to mark dirty for load status update:", error);
        }

        registerLoadStatsDelta(oldDoc, updated)
          .catch((error) => {
            console.error("[LoadController] Failed to register stats delta for status update:", error);
          });

        let formattedDoc = formatDocument(this.dto, updated);
        formattedDoc = maybeStripPaymentFields(req.user?.role, formattedDoc);

        res.status(200).json({
          success: true,
          data: formattedDoc,
          message: "Load status updated successfully",
        });
      } catch (error) {
        // Если ошибка при создании платежей, возвращаем понятное сообщение
        if (willCreatePayments && error.message) {
          return res.status(400).json({
            success: false,
            error: "Failed to create payment records",
            message: error.message || "Cannot set status to Delivered. Payment creation failed.",
            details: error.message
          });
        }
        // Для других ошибок используем стандартную обработку
        this.handleError(res, error, "Failed to update load status");
      }
    } catch (error) {
      this.handleError(res, error, "Failed to update load status");
    }
  }

  updateStatus = async (req, res) => {
    try {
      const { id } = req.params;
      
      // Поддерживаем оба формата: { status } или { load: { status, fees } }
      let status, feesData;
      if (req.body.load) {
        // Формат: { load: { status, fees } }
        status = req.body.load.status;
        feesData = req.body.load.fees;
      } else {
        // Формат: { status, fees }
        status = req.body.status;
        feesData = req.body.fees;
      }

      if (!status) {
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          details: [{ field: "status", message: "Status is required." }]
        });
      }

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: "Invalid ID format",
        });
      }

      // Security: Ensure req.user exists (from verifyToken middleware)
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          success: false,
          error: "Authentication required",
        });
      }

      const oldDoc = await this.model.findById(id);
      if (!oldDoc) {
        return res.status(404).json({
          success: false,
          error: "Load not found",
        });
      }

      if (oldDoc.status === "Cancelled") {
        return res.status(400).json({
          success: false,
          error: "Load is cancelled",
          message: "Cancelled loads cannot be modified."
        });
      }

      const skipPayableForDelivered = status === "Delivered"
        ? await this.shouldSkipPayableForPlatformDelivered(oldDoc)
        : false;

      // ВАЛИДАЦИЯ: Проверяем требования для статуса "Delivered"
      if (status === "Delivered") {
        const validationErrors = [];
        
        // Проверяем наличие customer и customerRate
        if (!oldDoc.customer) {
          validationErrors.push({
            field: "customer",
            message: "Customer is required to set status to Delivered"
          });
        }

        const customerRate = parseFloat(oldDoc.customerRate) || 0;
        if (!oldDoc.customerRate || customerRate <= 0) {
          validationErrors.push({
            field: "customerRate",
            message: "Customer rate is required and must be greater than 0 to set status to Delivered"
          });
        }
        
        // Проверяем наличие carrier и carrierRate
        if (!skipPayableForDelivered) {
        if (!oldDoc.carrier) {
          validationErrors.push({
            field: "carrier",
            message: "Carrier is required to set status to Delivered"
          });
        }
        
        const carrierRate = parseFloat(oldDoc.carrierRate) || 0;
        if (!oldDoc.carrierRate || carrierRate <= 0) {
          validationErrors.push({
            field: "carrierRate",
            message: "Carrier rate is required and must be greater than 0 to set status to Delivered"
          });
          }
        }
        
        if (validationErrors.length > 0) {
          return res.status(400).json({
            success: false,
            error: "Validation failed",
            message: "Cannot set status to Delivered. Missing required fields.",
            details: validationErrors
          });
        }
      }

      // Парсим и валидируем fees если они переданы
      let parsedFees = undefined;
      if (feesData !== undefined) {
        // Парсим fees (может быть строкой JSON или массивом)
        parsedFees = parseJsonField(feesData);
        
        // Валидируем fees если они переданы
        if (parsedFees !== null && parsedFees !== undefined) {
          const freightType = oldDoc?.type?.freight;
          if (Array.isArray(parsedFees) && parsedFees.length > 0) {
            const feesValidation = validateFeesData(parsedFees, freightType);
            if (feesValidation && !feesValidation.valid) {
              return res.status(400).json({
                success: false,
                error: 'Invalid fees data',
                details: feesValidation.errors || [{ field: "fees", message: feesValidation.error }]
              });
            }
          } else if (!Array.isArray(parsedFees)) {
            return res.status(400).json({
              success: false,
              error: 'Invalid fees data',
              details: [{ field: "fees", message: "Fees must be an array" }]
            });
          }
        }
      }

      const actor = createActor(req.user);

      // Подготавливаем данные для обновления
      const updateData = { status };
      if (status === "Listed" && oldDoc.status !== "Listed") {
        const resetData = getStep5ResetData(oldDoc);
        Object.assign(updateData, resetData);

        const filesToDelete = processDeletedFiles(oldDoc, resetData);
        if (filesToDelete.length > 0) {
          deleteFromS3Multiple(filesToDelete).catch((error) => {
            console.error(
              "[LoadController] Error deleting files from S3:",
              error
            );
          });
        }
      }
      if (parsedFees !== undefined) {
        // Нормализуем fees перед сохранением
        if (Array.isArray(parsedFees) && parsedFees.length > 0) {
          updateData.fees = parsedFees
            .filter(fee => fee && fee.type && fee.type.trim() !== '')
            .map(fee => ({
              type: fee.type || '',
              carrierRate: fee.carrierRate !== undefined && fee.carrierRate !== null ? String(fee.carrierRate) : '',
              customerRate: fee.customerRate !== undefined && fee.customerRate !== null ? String(fee.customerRate) : '',
              total: fee.total !== undefined && fee.total !== null ? String(fee.total) : ''
            }));
        } else {
          updateData.fees = [];
        }
      }

      const incomingDates = (req.body.load && req.body.load.dates) || req.body.dates || {};
      const existingDates = oldDoc.dates
        ? (typeof oldDoc.dates.toObject === 'function' ? oldDoc.dates.toObject() : oldDoc.dates)
        : {};
      const mergedDates = { ...existingDates, ...incomingDates };
      if (status === "Picked Up" && !mergedDates.pickupAt) {
        mergedDates.pickupAt = new Date();
      }
      if (status === "Delivered" && !mergedDates.deliveryAt) {
        mergedDates.deliveryAt = new Date();
      }
      updateData.dates = mergedDates;

      const willCreatePayments =
        status === "Delivered" && oldDoc.status !== "Delivered";

      await loadService.updateLoad(id, updateData, actor, {
        action: "status_update",
        useTransaction: willCreatePayments,
        additionalOperations: willCreatePayments
          ? async (session, updatedLoad) => {
              // Create payments in the same transaction
              // Если createPaymentsOnDelivered выбрасывает ошибку, транзакция откатится
              await this.createPaymentsOnDelivered(
                updatedLoad,
                req.user?.id,
                session,
                { skipPayable: skipPayableForDelivered }
              );
            }
          : null,
      });

      const updated = await this.model
        .findById(id)
        .populate("customer")
        .populate("carrier")
        .populate("createdBy")
        .populate("updatedBy");

      // Only send load_updated notification (not status changes)

      let formattedDoc = formatDocument(this.dto, updated);
      formattedDoc = maybeStripPaymentFields(req.user?.role, formattedDoc);

      if (oldDoc.status !== status) {
        console.log(`[LoadController] Status changed from ${oldDoc.status} to ${status} for load ${id}`);
        console.log(`[LoadController] Customer emails: ${updated?.customerEmails?.length || 0}, Carrier emails: ${updated?.carrierEmails?.length || 0}`);
        console.log(`[LoadController] Customer emails array:`, updated?.customerEmails);
        console.log(`[LoadController] Carrier emails array:`, updated?.carrierEmails);
        console.log(`[LoadController] Updated document keys:`, Object.keys(updated?.toObject ? updated.toObject() : updated || {}));
        
        notificationService
          .sendLoadStatusUpdate(updated, oldDoc.status, status, req.user?.id)
          .catch((error) => {
            console.error(
              "[LoadController] Failed to send status update notification:",
              error
            );
            console.error("[LoadController] Error stack:", error.stack);
          });

        const loadForEmail = updated.toObject ? updated.toObject() : updated;
        if (!loadForEmail.customerEmails || loadForEmail.customerEmails.length === 0) {
          loadForEmail.customerEmails = oldDoc.customerEmails || [];
        }
        if (!loadForEmail.carrierEmails || loadForEmail.carrierEmails.length === 0) {
          loadForEmail.carrierEmails = oldDoc.carrierEmails || [];
        }
        
        sendLoadDetailsEmail(loadForEmail, { 
          isStatusUpdate: true, 
          oldStatus: oldDoc.status, 
          newStatus: status 
        })
          .then(() => {
            console.log(`[LoadController] Status update email sent successfully for load ${id}`);
          })
          .catch((error) => {
            console.error("[LoadController] Failed to send load status update email:", error);
            console.error("[LoadController] Error stack:", error.stack);
          });

        if (status === "Picked Up" && updated?.customer?.type === "platform") {
          this.createReceivableOnPickedUpForPlatform(updated, req.user?.id)
            .catch((error) => {
              console.error("[LoadController] Failed to create receivable on picked up:", error);
            });
        }
      }

      res.status(200).json({
        success: true,
        data: formattedDoc,
        message: "Load status updated successfully",
      });
    } catch (error) {
      this.handleError(res, error, "Failed to update load status");
    }
  };

  duplicateLoad = async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: "Invalid ID format",
        });
      }

      if (!req.user || !req.user.id) {
        return res.status(401).json({
          success: false,
          error: "Authentication required",
        });
      }

      const accessContext = await resolveAccessContext(req);
      if (accessContext.error) {
        return res.status(accessContext.error.status).json({
          success: false,
          error: accessContext.error.error
        });
      }
      if (!canCreateLoad(accessContext.role) || accessContext.role === 'Pre-dispatcher') {
        return res.status(403).json({
          success: false,
          error: "Access denied"
        });
      }

      const original = await this.model.findById(id).lean();
      if (!original) {
        return res.status(404).json({
          success: false,
          error: "Load not found",
        });
      }

      const canRead = await hasLoadReadAccess(accessContext, original);
      if (!canRead) {
        return res.status(403).json({
          success: false,
          error: "Access denied"
        });
      }

      const originalOrderId = String(original.orderId || "Load");
      let baseOrderId = originalOrderId;
      const suffixMatch = originalOrderId.match(/^(.*)-(\d+)$/);
      if (suffixMatch) {
        const candidateBase = suffixMatch[1];
        const baseExists = await this.model.exists({ orderId: candidateBase });
        if (baseExists) {
          baseOrderId = candidateBase;
        }
      }

      const regex = new RegExp(`^${escapeRegex(baseOrderId)}-(\\d+)$`);
      const existing = await this.model
        .find({ orderId: { $regex: regex } })
        .select("orderId")
        .lean();

      let maxSuffix = 0;
      existing.forEach((doc) => {
        const match = doc.orderId.match(regex);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!Number.isNaN(num)) {
            maxSuffix = Math.max(maxSuffix, num);
          }
        }
      });

      const newOrderId = `${baseOrderId}-${maxSuffix + 1}`;

      const duplicated = {
        ...original,
        orderId: newOrderId,
        status: "Listed",
        carrier: null,
        carrierEmails: [],
        carrierPhotos: [],
        paymentMethod: null,
        paymentTerms: null,
        dates: {},
        insurance: {},
        paymentReceivable: null,
        paymentPayable: null,
        createdBy: req.user.id,
        updatedBy: req.user.id,
      };

      delete duplicated._id;
      delete duplicated.__v;
      delete duplicated.createdAt;
      delete duplicated.updatedAt;
      delete duplicated.loadId;

      const created = await this.model.create(duplicated);
      const populated = await this.model
        .findById(created._id)
        .populate("customer")
        .populate("carrier")
        .populate("createdBy")
        .populate("updatedBy");

      try {
        await markDirtyForLoadChange(null, populated, ['loads']);
      } catch (error) {
        console.error("[LoadController] Failed to mark dirty for duplicated load:", error);
      }

      registerLoadStatsDelta(null, populated)
        .catch((error) => {
          console.error("[LoadController] Failed to register stats delta for duplicated load:", error);
        });

      let formattedDoc = formatDocument(this.dto, populated);
      formattedDoc = maybeStripPaymentFields(req.user?.role, formattedDoc);

      return res.status(201).json({
        success: true,
        data: formattedDoc,
        message: "Load duplicated successfully",
      });
    } catch (error) {
      this.handleError(res, error, "Failed to duplicate load");
    }
  };

  delete = async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: "Invalid ID format"
        });
      }

      const accessContext = await resolveAccessContext(req);
      if (accessContext.error) {
        return res.status(accessContext.error.status).json({
          success: false,
          error: accessContext.error.error
        });
      }
      if (!ADMIN_ROLES.has(accessContext.role)) {
        return res.status(403).json({
          success: false,
          error: "Access denied"
        });
      }

      const load = await this.model.findById(id).select("_id customer createdBy");
      if (!load) {
        return res.status(404).json({
          success: false,
          error: "Load not found"
        });
      }

      const canRead = await hasLoadReadAccess(accessContext, load);
      if (!canRead) {
        return res.status(403).json({
          success: false,
          error: "Access denied"
        });
      }

      const loadForDelete = await this.model.findById(id)
        .select('createdAt updatedAt dates customer carrier createdBy status')
        .lean();

      const actor = createActor(req.user);
      await loadService.deleteLoad(id, actor);

      if (loadForDelete) {
        markDirtyForLoadChange(loadForDelete, null, ['loads'])
          .catch((error) => {
            console.error("[LoadController] Failed to mark dirty for load delete:", error);
          });
      }

      res.status(200).json({
        success: true,
        message: "Load deleted successfully"
      });
    } catch (error) {
      this.handleError(res, error, "Failed to delete load");
    }
  };

  getAllLoadHistory = async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 10, 50);
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const skip = (page - 1) * limit;
      const action = req.query.action || '';
      const userId = req.query.userId || '';
      const loadId = req.query.loadId || '';
      const orderId = (req.query.orderId || '').trim();
      const dateFrom = req.query.dateFrom || '';
      const dateTo = req.query.dateTo || '';

      const query = {};
      if (action) query.action = action;
      if (userId && mongoose.Types.ObjectId.isValid(userId)) {
        query['actor.actorId'] = new mongoose.Types.ObjectId(userId);
      }
      if (loadId && mongoose.Types.ObjectId.isValid(loadId)) {
        query.load = new mongoose.Types.ObjectId(loadId);
      }
      if (orderId) {
        const loads = await this.model.find({ orderId: new RegExp(orderId, 'i') }).select('_id').lean();
        const loadIds = loads.map((l) => l._id);
        if (loadIds.length === 0) {
          const total = 0;
          return res.status(200).json({
            success: true,
            data: [],
            pagination: { total, totalPages: 0, currentPage: page, limit, skip },
          });
        }
        query.load = loadIds.length === 1 ? loadIds[0] : { $in: loadIds };
      }
      if (dateFrom || dateTo) {
        query.createdAt = query.createdAt || {};
        if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
        if (dateTo) query.createdAt.$lte = new Date(dateTo);
      }

      const items = await LoadHistory.find(query)
        .populate('actor.actorId', 'firstName lastName email companyName')
        .populate('load', 'orderId billOfLadingNumber')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await LoadHistory.countDocuments(query);

      res.status(200).json({
        success: true,
        data: items,
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: page,
          limit,
          skip,
        },
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to fetch load history list');
    }
  };

  getLoadHistory = async (req, res) => {
    try {
      const { id } = req.params;
      const limit = Math.min(parseInt(req.query.limit) || 50, 100);
      const skip = parseInt(req.query.skip) || 0;
      const page = parseInt(req.query.page) || 1;
      const action = req.query.action || '';
      const userId = req.query.userId || '';
      const dateFrom = req.query.dateFrom || '';
      const dateTo = req.query.dateTo || '';

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: "Invalid ID format",
        });
      }

      const load = await this.model.findById(id).select("_id customer createdBy");
      if (!load) {
        return res.status(404).json({
          success: false,
          error: "Load not found",
        });
      }

      const accessContext = await resolveAccessContext(req);
      if (accessContext.error) {
        return res.status(accessContext.error.status).json({
          success: false,
          error: accessContext.error.error
        });
      }
      if (accessContext.role === 'partner') {
        return res.status(403).json({
          success: false,
          error: "Access denied"
        });
      }
      const canRead = await hasLoadReadAccess(accessContext, load);
      if (!canRead) {
        return res.status(403).json({
          success: false,
          error: "Access denied"
        });
      }

      const historyQuery = { load: id };
      if (action) historyQuery.action = action;
      if (userId && mongoose.Types.ObjectId.isValid(userId)) {
        historyQuery['actor.actorId'] = new mongoose.Types.ObjectId(userId);
      }
      if (dateFrom || dateTo) {
        historyQuery.createdAt = {};
        if (dateFrom) historyQuery.createdAt.$gte = new Date(dateFrom);
        if (dateTo) historyQuery.createdAt.$lte = new Date(dateTo);
      }

      const [items, total] = await Promise.all([
        LoadHistory.find(historyQuery)
          .populate("actor.actorId", "firstName lastName email companyName")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        LoadHistory.countDocuments(historyQuery),
      ]);

      res.status(200).json({
        success: true,
        data: items,
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: page,
          limit,
          skip,
        },
      });
    } catch (error) {
      this.handleError(res, error, "Failed to fetch load history");
    }
  };
}

module.exports = new LoadController();
