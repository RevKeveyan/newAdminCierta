const UniversalBaseController = require("./UniversalBaseController");
const Carrier = require("../models/Carrier");
const User = require("../models/User");
const Customer = require("../models/Customer");
const Load = require("../models/Load");
const mongoose = require("mongoose");
const notificationClient = require("../services/notificationClient");
const notificationService = require("../services/notificationService");
const {
  getSignedUrlForObject,
  deleteFromS3Multiple,
} = require("../services/s3Service");
const { normalizeCarrierEquipment } = require("../utils/carrierEquipment");

const ADMIN_ROLES = new Set(["admin", "manager"]);
const NO_ACCESS_ROLES = new Set(["partner"]);

async function getUserContext(req) {
  const userId = req.user?.id;
  if (!userId) {
    return { error: { status: 401, error: "Authentication required" } };
  }
  const user = await User.findById(userId)
    .select("role allowedCustomers")
    .lean();
  if (!user) {
    return { error: { status: 401, error: "User not found" } };
  }
  const allowedCustomerIds = Array.isArray(user.allowedCustomers)
    ? user.allowedCustomers.map((id) => id.toString())
    : [];
  return { user, role: user.role, allowedCustomerIds };
}

function stripPaymentFields(carrier) {
  if (!carrier || typeof carrier !== "object") return carrier;
  const { routing, bankAccount, accountNumber, ...rest } = carrier;
  return rest;
}

function shouldStripPaymentFields(role) {
  return !ADMIN_ROLES.has(role);
}

async function getAllowedCarrierIds(context) {
  const { role, user, allowedCustomerIds } = context;
  if (ADMIN_ROLES.has(role)) {
    return null;
  }
  if (NO_ACCESS_ROLES.has(role)) {
    return [];
  }
  let customerIds = allowedCustomerIds;
  if (role === "salesAgent") {
    const platformCustomers = await Customer.find({
      _id: { $in: allowedCustomerIds },
      type: "platform",
    })
      .select("_id")
      .lean();
    customerIds = platformCustomers.map((item) => item._id.toString());
  }

  const baseFilter = { carrier: { $ne: null } };
  let filter = baseFilter;
  if (role === "freightBroker") {
    const conditions = [];
    if (user?._id) {
      conditions.push({ createdBy: user._id });
    }
    if (customerIds.length > 0) {
      conditions.push({ customer: { $in: customerIds } });
    }
    filter =
      conditions.length > 0
        ? { $and: [baseFilter, { $or: conditions }] }
        : baseFilter;
  } else {
    filter =
      customerIds.length > 0
        ? { $and: [baseFilter, { customer: { $in: customerIds } }] }
        : { $and: [baseFilter, { customer: { $in: [] } }] };
  }

  const carrierIds = await Load.distinct("carrier", filter);
  return carrierIds.map((id) => id.toString());
}

class CarrierController extends UniversalBaseController {
  constructor() {
    super(Carrier, {
      searchFields: [
        "name",
        "companyName",
        "dba",
        "mcNumber",
        "dotNumber",
        "equipmentType",
        "size",
      ],
      validationRules: {
        create: {
          name: { required: true, type: "string" },
          type: { required: false, type: "string" },
          equipmentType: { required: true, type: "array", minLength: 1 },
          size: { type: "array" },
          capabilities: { type: "array" },
          certifications: { type: "array" },
        },
        update: {
          name: { type: "string" },
          type: { type: "string" },
          phoneNumber: { type: "string" },
          email: { type: "email" },
          companyName: { type: "string" },
          dba: { type: "string" },
          mcNumber: { type: "string" },
          dotNumber: { type: "string" },
          "address.address": { type: "string" },
          "address.city": { type: "string" },
          "address.state": { type: "string" },
          "address.zipCode": { type: "string" },
          photos: { type: "array" },
          equipmentType: { type: "array", minLength: 1 },
          size: { type: "array" },
          capabilities: { type: "array" },
          certifications: { type: "array" },
        },
      },
    });
  }

  /**
   * Переопределяем prepareCreateData для удаления поля emails
   */
  prepareCreateData(req) {
    const data = super.prepareCreateData(req);
    // Удаляем старое поле emails если оно есть (больше не используется)
    if (data.emails !== undefined) {
      delete data.emails;
    }
    return data;
  }

  /**
   * Переопределяем prepareUpdateData для удаления поля emails
   */
  prepareUpdateData(req, filteredData = null) {
    const data = super.prepareUpdateData(req, filteredData);
    // Удаляем старое поле emails если оно есть (больше не используется)
    if (data.emails !== undefined) {
      delete data.emails;
    }
    return data;
  }

  /**
   * Helper function to convert S3 keys to signed URLs in carrier object
   * @param {Object} carrier - Carrier object (can be plain object or mongoose document)
   * @returns {Promise<Object>} - Carrier object with signed URLs
   */
  async addSignedUrlsToCarrier(carrier) {
    if (!carrier) return carrier;

    // Convert to plain object, ensuring all fields including 'type' are included
    const carrierObj = carrier.toObject
      ? carrier.toObject({ getters: false, virtuals: false })
      : carrier;
    const result = { ...carrierObj };

    // People array is included automatically from schema

    // Helper to convert array of keys to signed URLs
    const convertArrayToSignedUrls = async (arr) => {
      if (!Array.isArray(arr) || arr.length === 0) return arr;
      return Promise.all(
        arr.map(async (key) => {
          if (typeof key === "string" && !key.startsWith("http")) {
            const signedUrl = await getSignedUrlForObject(key, 3600);
            return signedUrl || key;
          }
          return key;
        }),
      );
    };

    // Convert photos array
    if (result.photos) {
      result.photos = await convertArrayToSignedUrls(result.photos);
    }

    // Convert images array
    if (result.images) {
      result.images = await convertArrayToSignedUrls(result.images);
    }

    // Convert pdfs array
    if (result.pdfs) {
      result.pdfs = await convertArrayToSignedUrls(result.pdfs);
    }

    // Convert legacy file field
    if (
      result.file &&
      typeof result.file === "string" &&
      !result.file.startsWith("http")
    ) {
      const signedUrl = await getSignedUrlForObject(result.file, 3600);
      if (signedUrl) {
        result.file = signedUrl;
      }
    }

    return result;
  }

  /**
   * Override getAll to add signed URLs
   */
  getAll = async (req, res) => {
    try {
      const accessContext = await getUserContext(req);
      if (accessContext.error) {
        return res.status(accessContext.error.status).json({
          success: false,
          error: accessContext.error.error,
        });
      }
      if (NO_ACCESS_ROLES.has(accessContext.role)) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
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

      const filterParams = { ...filters };
      delete filterParams.page;
      delete filterParams.limit;
      delete filterParams.sortBy;
      delete filterParams.sortOrder;
      delete filterParams.search;

      const filter = this.buildFilter(filterParams, search);
      const sort = this.buildSort(sortBy, sortOrder);

      const docs = await this.model
        .find(filter)
        .populate(this.populateFields)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean();

      const total = await this.model.countDocuments(filter);

      // Apply DTO if exists
      let formattedDocs = this.dto
        ? docs.map((doc) => this.dto.format(doc))
        : docs;

      // Add signed URLs to all carriers
      formattedDocs = await Promise.all(
        formattedDocs.map((carrier) => this.addSignedUrlsToCarrier(carrier)),
      );

      // Удаляем старое поле type из всех документов (если оно там есть)
      formattedDocs = formattedDocs.map((carrier) => {
        if (carrier && carrier.type !== undefined) {
          const { type, ...rest } = carrier;
          return rest;
        }
        return carrier;
      });

      if (shouldStripPaymentFields(accessContext.role)) {
        formattedDocs = formattedDocs.map((carrier) =>
          stripPaymentFields(carrier),
        );
      }

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
      this.handleError(res, error, "Failed to fetch carriers");
    }
  };

  /**
   * Override getById to add signed URLs
   */
  getById = async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: "Invalid ID format",
        });
      }

      const accessContext = await getUserContext(req);
      if (accessContext.error) {
        return res.status(accessContext.error.status).json({
          success: false,
          error: accessContext.error.error,
        });
      }
      if (NO_ACCESS_ROLES.has(accessContext.role)) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
        });
      }

      const doc = await this.model.findById(id).populate(this.populateFields);

      if (!doc) {
        return res.status(404).json({
          success: false,
          error: "Carrier not found",
        });
      }

      let formattedDoc = this.dto ? this.dto.format(doc) : doc;
      formattedDoc = await this.addSignedUrlsToCarrier(formattedDoc);

      if (shouldStripPaymentFields(accessContext.role)) {
        formattedDoc = stripPaymentFields(formattedDoc);
      }

      // Удаляем старое поле type из ответа (если оно там есть)
      if (formattedDoc && formattedDoc.type !== undefined) {
        delete formattedDoc.type;
      }

      res.status(200).json({
        success: true,
        data: formattedDoc,
      });
    } catch (error) {
      this.handleError(res, error, "Failed to fetch carrier");
    }
  };

  // Переопределяем create для проверки уникальности email, mcNumber, dotNumber
  create = async (req, res) => {
    try {
      if (!ADMIN_ROLES.has(req.user?.role)) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
        });
      }

      // Валидация данных
      if (this.validationRules.create) {
        const validation = this.validateData(
          req.body,
          this.validationRules.create,
        );
        if (!validation.isValid) {
          return res.status(400).json({
            success: false,
            error: "Validation failed",
            details: validation.errors,
          });
        }
      }

      const carrierData = req.body;

      // Проверяем уникальность email, mcNumber, dotNumber
      const emailToCheck =
        carrierData.email && carrierData.email.trim() !== ""
          ? carrierData.email.trim().toLowerCase()
          : null;
      const mcNumberToCheck =
        carrierData.mcNumber && carrierData.mcNumber.trim() !== ""
          ? carrierData.mcNumber.trim()
          : null;
      const dotNumberToCheck =
        carrierData.dotNumber && carrierData.dotNumber.trim() !== ""
          ? carrierData.dotNumber.trim()
          : null;

      // Проверяем на дубликаты
      const duplicateChecks = [];
      if (emailToCheck) {
        duplicateChecks.push(
          Carrier.findOne({ email: emailToCheck }).select("_id name email"),
        );
      }
      if (mcNumberToCheck) {
        duplicateChecks.push(
          Carrier.findOne({ mcNumber: mcNumberToCheck }).select(
            "_id name mcNumber",
          ),
        );
      }
      if (dotNumberToCheck) {
        duplicateChecks.push(
          Carrier.findOne({ dotNumber: dotNumberToCheck }).select(
            "_id name dotNumber",
          ),
        );
      }

      if (duplicateChecks.length > 0) {
        const duplicates = await Promise.all(duplicateChecks);
        const duplicate = duplicates.find((d) => d !== null);

        if (duplicate) {
          // Найден дубликат
          let duplicateField = "";
          let duplicateValue = "";
          if (duplicate.email === emailToCheck) {
            duplicateField = "email";
            duplicateValue = emailToCheck;
          } else if (duplicate.mcNumber === mcNumberToCheck) {
            duplicateField = "MC Number";
            duplicateValue = mcNumberToCheck;
          } else if (duplicate.dotNumber === dotNumberToCheck) {
            duplicateField = "DOT Number";
            duplicateValue = dotNumberToCheck;
          }

          return res.status(400).json({
            success: false,
            error: "Duplicate carrier",
            message: `Carrier with ${duplicateField} "${duplicateValue}" already exists (Carrier: ${duplicate.name || "Unknown"})`,
          });
        }
      }

      // Подготовка данных
      const data = this.prepareCreateData(req);

      // Нормализуем email, mcNumber, dotNumber
      if (data.email !== undefined) {
        if (
          data.email &&
          typeof data.email === "string" &&
          data.email.trim() !== ""
        ) {
          data.email = data.email.trim().toLowerCase();
        } else {
          // Если email пустой, устанавливаем undefined (для sparse index)
          data.email = undefined;
        }
      }
      if (
        data.mcNumber !== undefined &&
        data.mcNumber &&
        typeof data.mcNumber === "string"
      ) {
        data.mcNumber = data.mcNumber.trim() || undefined;
      }
      if (
        data.dotNumber !== undefined &&
        data.dotNumber &&
        typeof data.dotNumber === "string"
      ) {
        data.dotNumber = data.dotNumber.trim() || undefined;
      }

      const normalizedEquipment = normalizeCarrierEquipment(data);
      if (normalizedEquipment.equipment.length > 0) {
        data.equipment = normalizedEquipment.equipment;
      }
      if (normalizedEquipment.equipmentType.length > 0) {
        data.equipmentType = normalizedEquipment.equipmentType;
      }
      if (normalizedEquipment.size.length > 0) {
        data.size = normalizedEquipment.size;
      }

      // Handle multiple PDF file uploads
      if (req.uploadedFiles?.pdfs && req.uploadedFiles.pdfs.length > 0) {
        data.pdfs = req.uploadedFiles.pdfs;
      }

      // Создание записи
      const newDoc = new this.model(data);

      try {
        const saved = await newDoc.save();

        if (this.historyModel) {
          await this.createHistoryRecord(
            saved._id,
            "created",
            req.user?.id,
            [],
          );
        }

        try {
          const entity = saved.toObject ? saved.toObject() : (saved.toJSON ? saved.toJSON() : saved);
          await notificationClient.sendCreatedEvent("carrier", entity, req.user, { includeEntityData: true });
        } catch (notifErr) {
          console.error("[CarrierController] Failed to send carrier created notification", notifErr);
        }

        // Применение DTO
        let formattedDoc = this.dto ? this.dto.format(saved) : saved;
        formattedDoc = await this.addSignedUrlsToCarrier(formattedDoc);

        // Удаляем старое поле type из ответа (если оно там есть)
        if (formattedDoc && formattedDoc.type !== undefined) {
          delete formattedDoc.type;
        }

        res.status(201).json({
          success: true,
          data: formattedDoc,
          message: `${this.modelName} created successfully`,
        });
      } catch (saveError) {
        // Обрабатываем ошибки уникальности от MongoDB
        if (saveError.code === 11000) {
          const duplicateField = Object.keys(saveError.keyPattern)[0];
          // Используем data вместо carrierData, так как data уже нормализован
          const duplicateValue = data[duplicateField];

          let displayValue = duplicateValue;
          if (Array.isArray(duplicateValue)) {
            // Фильтруем undefined/null из массива перед отображением
            const validValues = duplicateValue.filter(
              (v) => v !== undefined && v !== null && v !== "",
            );
            displayValue =
              validValues.length > 0 ? validValues[0] : "undefined";
          } else if (
            duplicateValue === undefined ||
            duplicateValue === null ||
            duplicateValue === ""
          ) {
            displayValue = "undefined";
          }

          let fieldDisplayName = duplicateField;
          if (duplicateField === "mcNumber") {
            fieldDisplayName = "MC Number";
          } else if (duplicateField === "dotNumber") {
            fieldDisplayName = "DOT Number";
          }

          return res.status(400).json({
            success: false,
            error: "Duplicate carrier",
            message: `Carrier with ${fieldDisplayName} "${displayValue}" already exists`,
          });
        }
        throw saveError;
      }
    } catch (error) {
      this.handleError(res, error, "Failed to create carrier");
    }
  };

  // Переопределяем update для проверки уникальности email, mcNumber, dotNumber
  update = async (req, res) => {
    try {
      if (!ADMIN_ROLES.has(req.user?.role)) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
        });
      }

      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: "Invalid ID format",
        });
      }

      const existingCarrier = await Carrier.findById(id).lean();
      if (!existingCarrier) {
        return res.status(404).json({
          success: false,
          error: "Carrier not found",
        });
      }

      const carrierData = req.body;

      // Удаляем старое поле emails если оно есть (больше не используется)
      if (carrierData.emails !== undefined) {
        delete carrierData.emails;
      }

      // Проверяем уникальность email перед обновлением
      if (carrierData.email && carrierData.email.trim() !== "") {
        const newEmail = carrierData.email.trim().toLowerCase();
        if (newEmail !== existingCarrier.email) {
          const existingCarrierWithEmail = await Carrier.findOne({
            email: newEmail,
            _id: { $ne: id },
          });
          if (existingCarrierWithEmail) {
            return res.status(400).json({
              success: false,
              error: "Duplicate carrier",
              message: `Carrier with email "${newEmail}" already exists (Carrier: ${existingCarrierWithEmail.name || "Unknown"})`,
            });
          }
        }
      }

      // Проверяем уникальность mcNumber перед обновлением
      if (carrierData.mcNumber && carrierData.mcNumber.trim() !== "") {
        const newMcNumber = carrierData.mcNumber.trim();
        if (newMcNumber !== existingCarrier.mcNumber) {
          const existingCarrierWithMc = await Carrier.findOne({
            mcNumber: newMcNumber,
            _id: { $ne: id },
          });
          if (existingCarrierWithMc) {
            return res.status(400).json({
              success: false,
              error: "Duplicate carrier",
              message: `Carrier with MC Number "${newMcNumber}" already exists (Carrier: ${existingCarrierWithMc.name || "Unknown"})`,
            });
          }
        }
      }

      // Проверяем уникальность dotNumber перед обновлением
      if (carrierData.dotNumber && carrierData.dotNumber.trim() !== "") {
        const newDotNumber = carrierData.dotNumber.trim();
        if (newDotNumber !== existingCarrier.dotNumber) {
          const existingCarrierWithDot = await Carrier.findOne({
            dotNumber: newDotNumber,
            _id: { $ne: id },
          });
          if (existingCarrierWithDot) {
            return res.status(400).json({
              success: false,
              error: "Duplicate carrier",
              message: `Carrier with DOT Number "${newDotNumber}" already exists (Carrier: ${existingCarrierWithDot.name || "Unknown"})`,
            });
          }
        }
      }

      const data = this.prepareUpdateData(req);

      if (typeof data.people === "string") {
        try {
          data.people = JSON.parse(data.people);
        } catch (e) {
          data.people = [];
        }
      }
      if (typeof data.address === "string") {
        try {
          data.address = JSON.parse(data.address);
        } catch (e) {
          data.address = {};
        }
      }
      if (typeof data.equipment === "string") {
        try {
          data.equipment = JSON.parse(data.equipment);
        } catch (e) {
          data.equipment = [];
        }
      }
      if (typeof data.capabilities === "string") {
        try {
          data.capabilities = JSON.parse(data.capabilities);
        } catch (e) {
          data.capabilities = [];
        }
      }
      if (typeof data.certifications === "string") {
        try {
          data.certifications = JSON.parse(data.certifications);
        } catch (e) {
          data.certifications = [];
        }
      }

      if (data.type !== undefined) {
        delete data.type;
      }
      // Также удаляем type из базы, если он там есть
      if (existingCarrier.type !== undefined) {
        data.$unset = { type: "" };
      }

      // Нормализуем email, mcNumber, dotNumber в data (после prepareUpdateData)
      if (data.email !== undefined) {
        if (
          data.email &&
          typeof data.email === "string" &&
          data.email.trim() !== ""
        ) {
          data.email = data.email.trim().toLowerCase();
        } else {
          // Если email пустой, устанавливаем undefined (для sparse index)
          data.email = undefined;
        }
      }
      if (data.mcNumber !== undefined && data.mcNumber) {
        data.mcNumber = data.mcNumber.trim();
      }
      if (data.dotNumber !== undefined && data.dotNumber) {
        data.dotNumber = data.dotNumber.trim();
      }

      const normalizedEquipment = normalizeCarrierEquipment(data);
      if (normalizedEquipment.equipment.length > 0) {
        data.equipment = normalizedEquipment.equipment;
      }
      if (normalizedEquipment.equipmentType.length > 0) {
        data.equipmentType = normalizedEquipment.equipmentType;
      }
      if (normalizedEquipment.size.length > 0) {
        data.size = normalizedEquipment.size;
      }

      // Handle multiple PDF file uploads
      const currentPdfs = existingCarrier.pdfs || [];
      const newUploadedPdfs = req.uploadedFiles?.pdfs || [];

      // Получаем existingPdfs от frontend (файлы которые пользователь хочет сохранить)
      let keepPdfs = currentPdfs;
      if (req.body.existingPdfs !== undefined) {
        keepPdfs =
          typeof req.body.existingPdfs === "string"
            ? JSON.parse(req.body.existingPdfs)
            : req.body.existingPdfs;
        if (!Array.isArray(keepPdfs)) keepPdfs = [];
      }

      // Находим файлы которые нужно удалить
      const filesToDelete = currentPdfs.filter(
        (url) => !keepPdfs.includes(url),
      );

      // Удаляем файлы из S3
      if (filesToDelete.length > 0) {
        setImmediate(async () => {
          try {
            await deleteFromS3Multiple(filesToDelete);
          } catch (deleteError) {
            console.error(
              "[CarrierController] Failed to delete files from S3:",
              deleteError,
            );
          }
        });
      }

      // Обновляем только если есть изменения в файлах
      if (newUploadedPdfs.length > 0 || filesToDelete.length > 0) {
        data.pdfs = [...keepPdfs, ...newUploadedPdfs];
      }

      // Обновление записи
      const updated = await Carrier.findByIdAndUpdate(id, data, {
        new: true,
        runValidators: true,
      }).lean();

      if (!updated) {
        return res.status(404).json({
          success: false,
          error: "Carrier not found",
        });
      }

      const historyChanges = this.historyModel ? this.getChanges(existingCarrier, carrierData) : [];
      if (this.historyModel && historyChanges.length > 0 && req.user?.id) {
        await this.createHistoryRecord(id, "updated", req.user.id, historyChanges);
      }

      if (historyChanges.length > 0) {
        try {
          const changes = historyChanges.map((c) => ({ field: c.field, from: c.oldValue, to: c.newValue }));
          await notificationClient.sendUpdatedEvent("carrier", updated, req.user, changes, { includeEntityData: true });
        } catch (notifErr) {
          console.error("[CarrierController] Failed to send carrier updated notification", notifErr);
        }
      }

      // Применение DTO
      let formattedDoc = this.dto ? this.dto.format(updated) : updated;
      formattedDoc = await this.addSignedUrlsToCarrier(formattedDoc);

      // Удаляем старое поле type из ответа (если оно там есть)
      if (formattedDoc.type !== undefined) {
        delete formattedDoc.type;
      }

      res.status(200).json({
        success: true,
        data: formattedDoc,
        message: `${this.modelName} updated successfully`,
      });
    } catch (error) {
      // Обрабатываем ошибки уникальности от MongoDB
      if (error.code === 11000) {
        const duplicateField = Object.keys(error.keyPattern)[0];
        // Используем req.body, так как он всегда доступен в catch блоке
        const duplicateValue = req.body?.[duplicateField];

        let displayValue = duplicateValue;
        if (Array.isArray(duplicateValue)) {
          // Фильтруем undefined/null из массива перед отображением
          const validValues = duplicateValue.filter(
            (v) => v !== undefined && v !== null && v !== "",
          );
          displayValue = validValues.length > 0 ? validValues[0] : "undefined";
        } else if (
          duplicateValue === undefined ||
          duplicateValue === null ||
          duplicateValue === ""
        ) {
          displayValue = "undefined";
        }

        let fieldDisplayName = duplicateField;
        if (duplicateField === "mcNumber") {
          fieldDisplayName = "MC Number";
        } else if (duplicateField === "dotNumber") {
          fieldDisplayName = "DOT Number";
        }

        return res.status(400).json({
          success: false,
          error: "Duplicate carrier",
          message: `Carrier with ${fieldDisplayName} "${displayValue}" already exists`,
        });
      }
      this.handleError(res, error, "Failed to update carrier");
    }
  };

  // Переопределяем метод search для более точного поиска по конкретным полям
  search = async (req, res) => {
    try {
      if (req.params && req.params.id) {
        return res.status(400).json({
          success: false,
          error:
            "Search endpoint does not accept ID parameter. Use /api/carriers/:id for specific carrier lookup.",
        });
      }

      const accessContext = await getUserContext(req);
      if (accessContext.error) {
        return res.status(accessContext.error.status).json({
          success: false,
          error: accessContext.error.error,
        });
      }
      if (NO_ACCESS_ROLES.has(accessContext.role)) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
        });
      }

      const {
        name,
        companyName,
        dba,
        mcNumber,
        dotNumber,
        type, // Фильтр по типу (driver или dispatcher)
        email,
        phoneNumber,
        status,
        city,
        state,
        equipmentType,
        size,
        capabilities,
        certifications,
        createdAt,
        orderId, // Поиск по Load orderId
        "address.address": addressAddress,
        zipCode,
        q: searchTerm, // Общий поиск по всем полям
        page = 1,
        limit = 10,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = req.query;

      const filter = {};

      // Функция для экранирования специальных символов в regex
      const escapeRegex = (str) => {
        return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      };

      const normalizeList = (value) => {
        if (!value) return [];
        if (Array.isArray(value)) {
          return value.map((item) => String(item).trim()).filter(Boolean);
        }
        if (typeof value === "string") {
          return value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
        }
        return [];
      };

      // Поиск по name (частичное совпадение, case-insensitive)
      if (name && name.trim() !== "") {
        const escapedName = escapeRegex(name.trim());
        filter.name = { $regex: escapedName, $options: "i" };
      }

      // Поиск по companyName (частичное совпадение, case-insensitive)
      if (companyName && companyName.trim() !== "") {
        const escapedCompanyName = escapeRegex(companyName.trim());
        filter.companyName = { $regex: escapedCompanyName, $options: "i" };
      }

      if (dba && dba.trim() !== "") {
        const escapedDba = escapeRegex(dba.trim());
        filter.dba = { $regex: escapedDba, $options: "i" };
      }

      // Поиск по mcNumber (частичное совпадение, case-insensitive)
      if (mcNumber && mcNumber.trim() !== "") {
        const escapedMcNumber = escapeRegex(mcNumber.trim());
        filter.mcNumber = { $regex: escapedMcNumber, $options: "i" };
      }

      // Поиск по dotNumber (частичное совпадение, case-insensitive)
      if (dotNumber && dotNumber.trim() !== "") {
        const escapedDotNumber = escapeRegex(dotNumber.trim());
        filter.dotNumber = { $regex: escapedDotNumber, $options: "i" };
      }

      // Поиск по email (частичное совпадение, case-insensitive)
      if (email && email.trim() !== "") {
        const escapedEmail = escapeRegex(email.trim().toLowerCase());
        filter.email = { $regex: escapedEmail, $options: "i" };
      }

      // Поиск по phoneNumber (частичное совпадение)
      if (phoneNumber && phoneNumber.trim() !== "") {
        const escapedPhone = escapeRegex(phoneNumber.trim());
        filter.phoneNumber = { $regex: escapedPhone, $options: "i" };
      }

      // Фильтр по статусу
      if (status && status.trim() !== "") {
        filter.status = status.trim();
      }

      // Фильтр по городу/штату
      if (city && city.trim() !== "") {
        const escapedCity = escapeRegex(city.trim());
        filter["address.city"] = { $regex: escapedCity, $options: "i" };
      }
      if (state && state.trim() !== "") {
        const escapedState = escapeRegex(state.trim());
        filter["address.state"] = { $regex: escapedState, $options: "i" };
      }
      if (addressAddress && addressAddress.trim() !== "") {
        const escapedAddress = escapeRegex(addressAddress.trim());
        filter["address.address"] = { $regex: escapedAddress, $options: "i" };
      }
      if (zipCode && zipCode.trim() !== "") {
        const escapedZipCode = escapeRegex(zipCode.trim());
        filter["address.zipCode"] = { $regex: escapedZipCode, $options: "i" };
      }

      const equipmentTypeList = normalizeList(equipmentType);
      if (equipmentTypeList.length > 0) {
        filter.equipmentType = { $in: equipmentTypeList };
      }

      const sizeList = normalizeList(size);
      if (sizeList.length > 0) {
        filter.size = { $in: sizeList };
      }

      const capabilitiesList = normalizeList(capabilities);
      if (capabilitiesList.length > 0) {
        filter.capabilities = { $in: capabilitiesList };
      }

      const certificationsList = normalizeList(certifications);
      if (certificationsList.length > 0) {
        filter.certifications = { $in: certificationsList };
      }

      if (type && (type === "driver" || type === "dispatcher")) {
        filter["people.type"] = type;
      }

      // Фильтр по дате создания (createdAt)
      if (createdAt && createdAt.trim() !== "") {
        if (createdAt.includes("to")) {
          const [start, end] = createdAt.split(" to ");
          const startDate = new Date(start);
          const endDate = new Date(end);
          if (!Number.isNaN(startDate) && !Number.isNaN(endDate)) {
            filter.createdAt = { $gte: startDate, $lte: endDate };
          }
        } else {
          const date = new Date(createdAt);
          if (!Number.isNaN(date)) {
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);
            filter.createdAt = { $gte: startOfDay, $lte: endOfDay };
          }
        }
      }

      const hasSpecificFilters = Boolean(
        name ||
        companyName ||
        dba ||
        mcNumber ||
        dotNumber ||
        email ||
        phoneNumber ||
        status ||
        city ||
        state ||
        addressAddress ||
        zipCode ||
        equipmentTypeList.length > 0 ||
        sizeList.length > 0 ||
        capabilitiesList.length > 0 ||
        certificationsList.length > 0 ||
        createdAt ||
        orderId,
      );

      // Поиск по orderId через связанные Load (для фильтра)
      let carrierIdsFromOrderIdFilter = [];
      if (orderId && orderId.trim() !== "") {
        try {
          const loads = await Load.find({
            orderId: { $regex: escapeRegex(orderId.trim()), $options: "i" },
          })
            .select("carrier")
            .lean();

          carrierIdsFromOrderIdFilter = loads
            .map((load) => load.carrier)
            .filter(
              (carrierId) =>
                carrierId && mongoose.Types.ObjectId.isValid(carrierId),
            );

          if (carrierIdsFromOrderIdFilter.length > 0) {
            if (filter._id) {
              const existingIds = Array.isArray(filter._id.$in)
                ? filter._id.$in
                : [filter._id];
              filter._id = {
                $in: [
                  ...new Set([...existingIds, ...carrierIdsFromOrderIdFilter]),
                ],
              };
            } else {
              filter._id = { $in: carrierIdsFromOrderIdFilter };
            }
          } else {
            filter._id = { $in: [] };
          }
        } catch (error) {
          console.error("Error searching loads by orderId:", error);
        }
      }

      // Поиск по orderId в searchTerm
      let carrierIdsFromSearchTerm = [];
      if (searchTerm && searchTerm.trim() !== "" && !orderId) {
        try {
          const loads = await Load.find({
            orderId: { $regex: escapeRegex(searchTerm.trim()), $options: "i" },
          })
            .select("carrier")
            .lean();

          carrierIdsFromSearchTerm = loads
            .map((load) => load.carrier)
            .filter(
              (carrierId) =>
                carrierId && mongoose.Types.ObjectId.isValid(carrierId),
            );
        } catch (error) {
          console.error(
            "Error searching loads by orderId in searchTerm:",
            error,
          );
        }
      }

      if (searchTerm && searchTerm.trim() !== "") {
        const escapedSearchTerm = escapeRegex(searchTerm.trim());
        const searchRegex = { $regex: escapedSearchTerm, $options: "i" };
        const searchOr = [
          { name: searchRegex },
          { companyName: searchRegex },
          { dba: searchRegex },
          { mcNumber: searchRegex },
          { dotNumber: searchRegex },
          { email: searchRegex },
          { phoneNumber: searchRegex },
          { "address.address": searchRegex },
          { "address.zipCode": searchRegex },
          { equipmentType: searchRegex },
          { size: searchRegex },
          { capabilities: searchRegex },
          { certifications: searchRegex },
          { "people.name": searchRegex },
          { "people.email": searchRegex },
          { "people.phoneNumber": searchRegex },
        ];

        if (carrierIdsFromSearchTerm.length > 0) {
          searchOr.push({ _id: { $in: carrierIdsFromSearchTerm } });
        }

        if (hasSpecificFilters) {
          if (!filter.$and) {
            filter.$and = [];
          }
          filter.$and.push({ $or: searchOr });
        } else {
          filter.$or = searchOr;
        }
      }

      // Построение сортировки
      const sort = {};
      sort[sortBy] = sortOrder === "asc" ? 1 : -1;

      // Выполнение запроса
      let carriers;
      try {
        carriers = await this.model
          .find(filter)
          .sort(sort)
          .skip((page - 1) * limit)
          .limit(parseInt(limit))
          .lean();
      } catch (queryError) {
        if (queryError.name === "CastError") {
          return res.status(400).json({
            success: false,
            error: "Invalid search parameter format",
            message: `Invalid value in search criteria: ${queryError.message || "Please check your search parameters"}`,
          });
        }
        throw queryError;
      }

      const total = await this.model.countDocuments(filter);

      let formattedCarriers = carriers;
      formattedCarriers = await Promise.all(
        formattedCarriers.map((carrier) =>
          this.addSignedUrlsToCarrier(carrier),
        ),
      );
      formattedCarriers = formattedCarriers.map((carrier) => {
        if (carrier && carrier.type !== undefined) {
          const { type, ...rest } = carrier;
          return rest;
        }
        return carrier;
      });
      if (shouldStripPaymentFields(accessContext.role)) {
        formattedCarriers = formattedCarriers.map((carrier) =>
          stripPaymentFields(carrier),
        );
      }

      res.status(200).json({
        success: true,
        data: formattedCarriers,
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          limit: parseInt(limit),
        },
      });
    } catch (error) {
      console.error("Search carriers error:", error);

      if (error.name === "CastError") {
        return res.status(400).json({
          success: false,
          error: "Invalid search parameter format",
          message: "Please check your search criteria and try again",
        });
      }

      this.handleError(res, error, "Failed to search carriers");
    }
  };

  // Remove carrier file (PDF)
  removeFile = async (req, res) => {
    try {
      if (!ADMIN_ROLES.has(req.user?.role)) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
        });
      }

      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: "Invalid ID format",
        });
      }

      const updated = await Carrier.findByIdAndUpdate(
        id,
        { $unset: { file: 1 } },
        { new: true },
      );

      if (!updated) {
        return res.status(404).json({
          success: false,
          error: "Carrier not found",
        });
      }

      res.status(200).json({
        success: true,
        data: updated,
        message: "Carrier file removed successfully",
      });
    } catch (error) {
      this.handleError(res, error, "Failed to remove carrier file");
    }
  };

  delete = async (req, res) => {
    try {
      if (!ADMIN_ROLES.has(req.user?.role)) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
        });
      }

      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: "Invalid ID format",
        });
      }

      const doc = await this.model.findById(id);
      if (!doc) {
        return res.status(404).json({
          success: false,
          error: "Carrier not found",
        });
      }

      await this.model.findByIdAndDelete(id);

      res.status(200).json({
        success: true,
        message: "Carrier deleted successfully",
      });
    } catch (error) {
      this.handleError(res, error, "Failed to delete carrier");
    }
  };

  // Получить все loads для конкретного carrier
  getCarrierLoads = async (req, res) => {
    try {
      const { id } = req.params;
      const { page = 1, limit = 10 } = req.query;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: "Invalid ID format",
        });
      }

      const accessContext = await getUserContext(req);
      if (accessContext.error) {
        return res.status(accessContext.error.status).json({
          success: false,
          error: accessContext.error.error,
        });
      }
      if (NO_ACCESS_ROLES.has(accessContext.role)) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
        });
      }

      if (!ADMIN_ROLES.has(accessContext.role)) {
        const allowedCarrierIds = await getAllowedCarrierIds(accessContext);
        if (!allowedCarrierIds.includes(id)) {
          return res.status(403).json({
            success: false,
            error: "Access denied",
          });
        }
      }

      const carrier = await Carrier.findById(id).lean();

      if (!carrier) {
        return res.status(404).json({
          success: false,
          error: "Carrier not found",
        });
      }

      const loadFilter = { carrier: id };
      if (accessContext.role === "freightBroker") {
        loadFilter.createdBy = accessContext.user._id;
      } else if (!ADMIN_ROLES.has(accessContext.role)) {
        loadFilter.customer = { $in: accessContext.allowedCustomerIds || [] };
      }

      const loads = await Load.find(loadFilter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean();

      const total = await Load.countDocuments(loadFilter);

      const carrierPayload = shouldStripPaymentFields(accessContext.role)
        ? stripPaymentFields(carrier)
        : carrier;

      res.status(200).json({
        success: true,
        data: {
          carrier: carrierPayload,
          loads: loads,
        },
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          limit: parseInt(limit),
        },
      });
    } catch (error) {
      this.handleError(res, error, "Failed to fetch carrier loads");
    }
  };
}

module.exports = new CarrierController();
