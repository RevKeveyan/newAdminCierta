const UniversalBaseController = require('./UniversalBaseController');
const User = require('../models/User');
const UserDTO = require('../DTO/user.dto');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const notificationClient = require('../services/notificationClient');
const notificationService = require('../services/notificationService');
const { buildChanges } = require('../utils/diffChanges');
const auditFields = require('../audit/fields');
const { getSignedUrlForObject, deleteFromS3Multiple } = require('../services/s3Service');
const { sendUserCreatedMail, sendUserUpdatedMail } = require('../mailer/mailer');

const ADMIN_ROLES = new Set(['admin', 'manager']);

function isAdminManager(role) {
  return ADMIN_ROLES.has(role);
}

class UserController extends UniversalBaseController {
  constructor() {
    super(User, {
      dto: UserDTO,
      searchFields: ['firstName', 'lastName', 'email', 'companyName'],
      validationRules: {
        create: {
          firstName: { required: true, type: 'string' },
          lastName: { required: true, type: 'string' },
          email: { required: true, type: 'email' },
          password: { required: true, type: 'string' },
          role: { 
            required: true, 
            type: 'string',
            enum: [
              "admin",
              "manager",
              "accountingManager",
              "accountingIn",
              "accountingOut",
              "freightBroker",
              "dispatcher",
              "Pre-dispatcher",
              "partner",
              "salesAgent",
              "bidAgent",
            ]
          }
        },
        update: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          email: { type: 'email' },
          role: { 
            type: 'string',
            enum: [
              "admin",
              "manager",
              "accountingManager",
              "accountingIn",
              "accountingOut",
              "freightBroker",
              "dispatcher",
              "Pre-dispatcher",
              "partner",
              "salesAgent",
              "bidAgent",
            ]
          },
          allowedCustomers: { type: 'array' }
        }
      }
    });
  }

  /**
   * Helper function to convert S3 keys to signed URLs in user object
   * @param {Object} user - User object (can be plain object or mongoose document)
   * @returns {Promise<Object>} - User object with signed URLs
   */
  async addSignedUrlsToUser(user) {
    if (!user) return user;

    // Convert to plain object if mongoose document
    const userObj = user.toObject ? user.toObject() : user;
    const result = { ...userObj };

    // Helper to convert array of keys to signed URLs
    const convertArrayToSignedUrls = async (arr) => {
      if (!Array.isArray(arr) || arr.length === 0) return arr;
      return Promise.all(
        arr.map(async (key) => {
          if (typeof key === 'string' && !key.startsWith('http')) {
            const signedUrl = await getSignedUrlForObject(key, 300);
            return signedUrl || key;
          }
          return key;
        })
      );
    };

    // Convert profileImage S3 key to signed URL
    if (result.profileImage && typeof result.profileImage === 'string') {
      // Check if it's already a URL (starts with http) or an S3 key
      if (!result.profileImage.startsWith('http')) {
        const signedUrl = await getSignedUrlForObject(result.profileImage, 300);
        if (signedUrl) {
          result.profileImage = signedUrl;
        }
      }
    }

    // Convert pdfs array S3 keys to signed URLs
    if (result.pdfs && Array.isArray(result.pdfs)) {
      result.pdfs = await convertArrayToSignedUrls(result.pdfs);
    }

    return result;
  }

  /**
   * Override getAll to add signed URLs
   */
  getAll = async (req, res) => {
    try {
      if (!isAdminManager(req.user?.role)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const {
        page = 1,
        limit: requestedLimit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc',
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
        .populate('allowedCustomers', 'companyName _id')
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean();

      const total = await this.model.countDocuments(filter);

      // Apply DTO
      let formattedDocs = this.dto ? docs.map(doc => this.dto.format(doc)) : docs;
      
      // Add signed URLs to all users
      formattedDocs = await Promise.all(
        formattedDocs.map(user => this.addSignedUrlsToUser(user))
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
      this.handleError(res, error, 'Failed to fetch users');
    }
  };

  search = async (req, res) => {
    try {
      if (!isAdminManager(req.user?.role)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
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

      const filter = this.buildSearchFilter(filters, searchTerm);
      const sort = this.buildSort(sortBy, sortOrder);

      const docs = await this.model
        .find(filter)
        .populate(this.populateFields)
        .populate('allowedCustomers', 'companyName _id')
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean();

      const total = await this.model.countDocuments(filter);

      let formattedDocs = this.dto ? docs.map(doc => this.dto.format(doc)) : docs;
      formattedDocs = await Promise.all(
        formattedDocs.map(user => this.addSignedUrlsToUser(user))
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
      this.handleError(res, error, 'Failed to fetch users');
    }
  };

  /**
   * Override getById to add signed URLs
   */
  getById = async (req, res) => {
    try {
      if (!isAdminManager(req.user?.role)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const { id } = req.params;
      
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format'
        });
      }

      const doc = await this.model
        .findById(id)
        .populate(this.populateFields)
        .populate('allowedCustomers', 'companyName _id');

      if (!doc) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      let formattedDoc = this.dto ? this.dto.format(doc) : doc;
      formattedDoc = await this.addSignedUrlsToUser(formattedDoc);

      res.status(200).json({
        success: true,
        data: formattedDoc
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to fetch user');
    }
  };

  // Переопределяем create для обработки пароля
  create = async (req, res) => {
    try {
      if (!isAdminManager(req.user?.role)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      // Валидация данных
      if (this.validationRules.create) {
        const validation = this.validateData(req.body, this.validationRules.create);
        if (!validation.isValid) {
          return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: validation.errors
          });
        }
      }

      const { password, ...rest } = req.body;
      
      // Optimize bcrypt rounds for better performance (reduced from 10 to 8)
      const hashedPassword = await bcrypt.hash(password, 12);

      const newUser = new this.model({
        ...rest,
        password: hashedPassword,
        profileImage: req.uploadedUserFiles?.profileImage || null,
        pdfs: req.uploadedFiles?.pdfs || []
      });

      const saved = await newUser.save();

      try {
        const entity = saved.toObject ? saved.toObject() : (saved.toJSON ? saved.toJSON() : saved);
        await notificationClient.sendCreatedEvent('user', entity, req.user, { includeEntityData: true });
      } catch (notifErr) {
        console.error('[UserController] Failed to send user created notification', notifErr);
      }

      // Log user creation to UserHistory
      const userAuditService = require('../services/userAuditService');
      await userAuditService.logUserChange({
        entityId: saved._id,
        action: 'created',
        actor: {
          actorId: req.user?.id || saved._id,
          actorRole: req.user?.role || 'system',
          actorEmail: req.user?.email || null
        },
        changes: Object.keys(rest).map(key => ({
          field: key,
          from: null,
          to: rest[key]
        }))
      });

      // Send welcome email with user credentials (without role)
      try {
        await sendUserCreatedMail({
          firstName: saved.firstName,
          email: saved.email,
          password: password
        });
      } catch (emailError) {
        console.error('Failed to send user creation email:', emailError);
      }

      // Применение DTO
      let formattedUser = this.dto ? this.dto.format(saved) : saved;
      
      // Convert S3 keys to signed URLs
      formattedUser = await this.addSignedUrlsToUser(formattedUser);

      res.status(201).json({
        success: true,
        data: formattedUser,
        message: 'User created successfully'
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to create user');
    }
  };

  // Переопределяем update для обработки пароля
  update = async (req, res) => {
    try {
      const { id } = req.params;
      const currentUserId = req.user?.id;
      const currentUserRole = req.user?.role;

      if (!currentUserId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      if (!isAdminManager(currentUserRole)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format'
        });
      }

      // Security: Filter out dangerous fields from req.body
      // Never allow client to modify: _id, id, userId, createdAt, updatedAt, role (unless admin)
      const dangerousFields = ['_id', 'id', 'userId', 'createdAt', 'updatedAt', '__v'];
      const filteredBody = { ...req.body };
      
      // Remove dangerous fields
      dangerousFields.forEach(field => {
        delete filteredBody[field];
      });

      const isAdmin = currentUserRole === 'admin' || 'manager';
      if (!isAdmin && filteredBody.role) {
        delete filteredBody.role;
        console.warn(`[Security] Non-admin user ${currentUserId} attempted to change role`);
      }

      // Валидация данных
      if (this.validationRules.update) {
        const validation = this.validateData(filteredBody, this.validationRules.update);
        if (!validation.isValid) {
          return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: validation.errors
          });
        }
      }

      // Получаем существующего пользователя для сравнения
      // НЕ используем populate для allowedCustomers, чтобы получить реальные ObjectId из БД
      const existingUser = await this.model.findById(id).select('+allowedCustomers').lean();
      if (!existingUser) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      
      // Фильтруем только измененные поля (используем отфильтрованные данные)
      const updateData = this.filterChangedFields(existingUser, filteredBody);
      
      // ВАЖНО: allowedCustomers всегда должен быть в updateData для синхронизации связей,
      // даже если значение не изменилось (нужно обновить Customer.allowedUsers)
      if (filteredBody.allowedCustomers !== undefined) {
        updateData.allowedCustomers = filteredBody.allowedCustomers;
      }
      
      console.log('[UserController] ===== UPDATE REQUEST DEBUG =====');
      console.log('[UserController] req.body.allowedCustomers:', JSON.stringify(req.body.allowedCustomers));
      console.log('[UserController] filteredBody.allowedCustomers:', JSON.stringify(filteredBody.allowedCustomers));
      console.log('[UserController] updateData.allowedCustomers:', JSON.stringify(updateData.allowedCustomers));
      console.log('[UserController] existingUser.allowedCustomers:', JSON.stringify(existingUser.allowedCustomers));
      
      // Обработка пароля
      let originalPassword = null;
      if (updateData.password) {
        originalPassword = updateData.password;
        updateData.password = await bcrypt.hash(updateData.password, 12);
      }
      
      // Обработка изображения профиля
      if (req.uploadedUserFiles?.profileImage) {
        updateData.profileImage = req.uploadedUserFiles.profileImage;
      }

      // Обработка PDF файлов пользователя (множественные файлы)
      const currentPdfs = existingUser.pdfs || [];
      const newUploadedPdfs = req.uploadedFiles?.pdfs || [];
      
      // Получаем existingPdfs от frontend (файлы которые пользователь хочет сохранить)
      let keepPdfs = currentPdfs; // По умолчанию сохраняем все текущие файлы
      if (req.body.existingPdfs !== undefined) {
        keepPdfs = typeof req.body.existingPdfs === 'string' 
          ? JSON.parse(req.body.existingPdfs) 
          : req.body.existingPdfs;
        if (!Array.isArray(keepPdfs)) keepPdfs = [];
      }
      
      // Находим файлы которые нужно удалить (есть в БД, но нет в keepPdfs)
      const filesToDelete = currentPdfs.filter(url => !keepPdfs.includes(url));
      
      // Удаляем файлы из S3 (асинхронно, не блокируем ответ)
      if (filesToDelete.length > 0) {
        setImmediate(async () => {
          try {
            await deleteFromS3Multiple(filesToDelete);
            console.log(`[UserController] Deleted ${filesToDelete.length} files from S3`);
          } catch (deleteError) {
            console.error('[UserController] Failed to delete files from S3:', deleteError);
          }
        });
      }
      
      // Финальный список PDF: keepPdfs + новые загруженные
      const finalPdfs = [...keepPdfs, ...newUploadedPdfs];
      
      // Обновляем только если есть изменения в файлах
      if (newUploadedPdfs.length > 0 || filesToDelete.length > 0) {
        updateData.pdfs = finalPdfs;
      }

      // Если нет изменений, возвращаем существующего пользователя
      if (Object.keys(updateData).length === 0) {
        const formattedUser = this.dto ? this.dto.format(existingUser) : existingUser;
        return res.status(200).json({
          success: true,
          data: formattedUser,
          message: 'No changes detected'
        });
      }

      // Синхронизация allowedCustomers с allowedUsers в Customer модели (ДО обновления User)
      // ВАЖНО: обрабатываем даже пустой массив [] - это значит удалить все связи
      if (updateData.allowedCustomers !== undefined) {
        const Customer = require('../models/Customer');
        const userId = mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
        
        console.log('[UserController] ===== DEBUG allowedCustomers sync =====');
        console.log('[UserController] User ID:', userId.toString());
        console.log('[UserController] updateData.allowedCustomers (from UI):', JSON.stringify(updateData.allowedCustomers));
        console.log('[UserController] Type of updateData.allowedCustomers:', typeof updateData.allowedCustomers, Array.isArray(updateData.allowedCustomers));
        
        // ШАГ 1: Удаляем user из ВСЕХ customers где он был (независимо от того, что в UI)
        const removeResult = await Customer.updateMany(
          { allowedUsers: userId },
          { $pull: { allowedUsers: userId } }
        );
        console.log('[UserController] STEP 1: Removed user from ALL customers:', removeResult.modifiedCount);
        
        // Проверяем что удалили
        const afterRemove = await Customer.find({ allowedUsers: userId }).select('_id companyName').lean();
        console.log('[UserController] After remove - customers with user:', afterRemove.map(c => ({ id: c._id.toString(), companyName: c.companyName })));
        
        // ШАГ 2: Добавляем user ТОЛЬКО в те customers, которые пришли из UI (может быть пустой массив!)
        const newCustomerIds = Array.isArray(updateData.allowedCustomers) 
          ? updateData.allowedCustomers
              .filter(cid => mongoose.Types.ObjectId.isValid(cid))
              .map(cid => new mongoose.Types.ObjectId(cid))
          : [];
        
        console.log('[UserController] STEP 2: New customer IDs from UI to add:', newCustomerIds.map(id => id.toString()));
        console.log('[UserController] STEP 2: Array length:', newCustomerIds.length);
        
        // Добавляем даже если массив пустой (это нормально - значит удалили все связи)
        if (newCustomerIds.length > 0) {
          const addResult = await Customer.updateMany(
            { _id: { $in: newCustomerIds } },
            { $addToSet: { allowedUsers: userId } }
          );
          console.log('[UserController] Added user to customers:', addResult.modifiedCount);
        } else {
          console.log('[UserController] No customers to add - all connections removed');
        }
        
        // Проверяем финальный результат
        const finalCustomers = await Customer.find({ allowedUsers: userId }).select('_id companyName').lean();
        console.log('[UserController] FINAL: Customers with user after sync:', finalCustomers.map(c => ({ id: c._id.toString(), companyName: c.companyName })));
        console.log('[UserController] FINAL: Count:', finalCustomers.length);
        console.log('[UserController] ===== END DEBUG =====');
      } else {
        console.log('[UserController] WARNING: updateData.allowedCustomers is undefined - sync skipped!');
      }

      // Обновляем User в БД - ВАЖНО: allowedCustomers должен быть массивом ObjectId
      // Преобразуем строки в ObjectId если нужно
      if (updateData.allowedCustomers !== undefined && Array.isArray(updateData.allowedCustomers)) {
        updateData.allowedCustomers = updateData.allowedCustomers
          .filter(cid => mongoose.Types.ObjectId.isValid(cid))
          .map(cid => mongoose.Types.ObjectId.isValid(cid) ? new mongoose.Types.ObjectId(cid) : cid);
        console.log('[UserController] updateData.allowedCustomers before save:', updateData.allowedCustomers.map(id => id.toString()));
      }

      const updated = await this.model.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      ).lean();
      
      // Проверяем что allowedCustomers действительно обновился в БД
      const verifyUser = await this.model.findById(id).select('allowedCustomers').lean();
      console.log('[UserController] Verify: allowedCustomers in DB after update:', verifyUser.allowedCustomers?.map(id => id.toString()) || []);
      
      // Проверяем что Customer.allowedUsers тоже обновился
      if (updateData.allowedCustomers !== undefined) {
        const Customer = require('../models/Customer');
        const userId = mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
        const verifyCustomers = await Customer.find({ allowedUsers: userId }).select('_id companyName').lean();
        console.log('[UserController] Verify: Customers with user in allowedUsers:', verifyCustomers.map(c => ({ id: c._id.toString(), companyName: c.companyName })));
      }

      // Log user changes to UserHistory
      const userAuditService = require('../services/userAuditService');
      const oldUser = existingUser;
      const changes = [];
      
      Object.keys(updateData).forEach(key => {
        if (key !== 'pdfs' && key !== 'profileImage') { // Skip file fields
          const oldValue = oldUser[key];
          const newValue = updateData[key];
          if (oldValue !== newValue) {
            changes.push({
              field: key,
              from: oldValue,
              to: newValue
            });
          }
        }
      });

      if (changes.length > 0) {
        await userAuditService.logUserChange({
          entityId: id,
          action: updateData.role !== oldUser.role ? 'role_change' :
                  updateData.status !== oldUser.status ? 'status_change' :
                  updateData.allowedCustomers !== undefined ? 'permissions_change' : 'updated',
          actor: {
            actorId: req.user?.id,
            actorRole: req.user?.role || 'unknown',
            actorEmail: req.user?.email || null
          },
          changes
        });
        try {
          await notificationClient.sendUpdatedEvent('user', updated, req.user, changes, { includeEntityData: true });
        } catch (notifErr) {
          console.error('[UserController] Failed to send user updated notification', notifErr);
        }
      }

      // Send update email with user data (without role)
      try {
        const emailData = {
          firstName: updated.firstName,
          lastName: updated.lastName,
          email: updated.email
        };
        
        // Only include password if it was changed
        if (originalPassword) {
          emailData.password = originalPassword;
        }
        
        await sendUserUpdatedMail(emailData);
      } catch (emailError) {
        console.error('Failed to send user update email:', emailError);
      }

      // Применение DTO
      let formattedUser = this.dto ? this.dto.format(updated) : updated;
      
      // Convert S3 keys to signed URLs
      formattedUser = await this.addSignedUrlsToUser(formattedUser);

      res.status(200).json({
        success: true,
        data: formattedUser,
        message: 'User updated successfully'
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to update user');
    }
  };

  // Специфичные методы для User
  getByRole = async (req, res) => {
    try {
      if (!isAdminManager(req.user?.role)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const { role } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const users = await this.model
        .find({ role })
        .select('-password')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

      const total = await this.model.countDocuments({ role });

      const formattedUsers = this.dto ? users.map(user => this.dto.format(user)) : users;

      res.status(200).json({
        success: true,
        data: formattedUsers,
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to fetch users by role');
    }
  };

  updateStatus = async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const currentUserId = req.user?.id;
      const currentUserRole = req.user?.role;

      if (!currentUserId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format'
        });
      }

      if (!isAdminManager(currentUserRole)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const updated = await this.model.findByIdAndUpdate(
        id,
        { status },
        { new: true }
      );

      if (!updated) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      let formattedUser = this.dto ? this.dto.format(updated) : updated;
      
      // Convert S3 keys to signed URLs
      formattedUser = await this.addSignedUrlsToUser(formattedUser);

      res.status(200).json({
        success: true,
        data: formattedUser,
        message: 'User status updated successfully'
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to update user status');
    }
  };

  getProfile = async (req, res) => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'User not authenticated'
        });
      }

      const user = await this.model.findById(userId).select('-password');
      
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      let formattedUser = this.dto ? this.dto.format(user) : user;
      
      // Convert S3 keys to signed URLs
      formattedUser = await this.addSignedUrlsToUser(formattedUser);

      res.status(200).json({
        success: true,
        data: formattedUser
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to fetch user profile');
    }
  };

  updateProfile = async (req, res) => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'User not authenticated'
        });
      }

      // Получаем существующего пользователя для сравнения
      const existingUser = await this.model.findById(userId);
      if (!existingUser) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Фильтруем только измененные поля
      const updateData = this.filterChangedFields(existingUser, req.body);
      
      // Обработка пароля
      if (updateData.password) {
        updateData.password = await bcrypt.hash(updateData.password, 12);
      }
      
      // Обработка изображения профиля
      if (req.uploadedUserFiles?.profileImage) {
        // Новый файл загружен - удаляем старый из S3
        if (existingUser.profileImage) {
          setImmediate(async () => {
            try {
              await deleteFromS3Multiple([existingUser.profileImage]);
              console.log(`[UserController] Deleted old profile image from S3`);
            } catch (deleteError) {
              console.error('[UserController] Failed to delete old profile image from S3:', deleteError);
            }
          });
        }
        updateData.profileImage = req.uploadedUserFiles.profileImage;
      } else if (req.body.profileImage === '' || req.body.profileImage === 'null' || req.body.profileImage === null) {
        // Удаление аватара - удаляем из БД и S3
        if (existingUser.profileImage) {
          // Удаляем старый файл из S3 (асинхронно)
          setImmediate(async () => {
            try {
              await deleteFromS3Multiple([existingUser.profileImage]);
              console.log(`[UserController] Deleted profile image from S3`);
            } catch (deleteError) {
              console.error('[UserController] Failed to delete profile image from S3:', deleteError);
            }
          });
        }
        updateData.profileImage = undefined; // Удаляем из БД
      }

      // Обработка PDF файлов пользователя (множественные файлы)
      const currentPdfs = existingUser.pdfs || [];
      const newUploadedPdfs = req.uploadedFiles?.pdfs || [];
      
      // Получаем existingPdfs от frontend (файлы которые пользователь хочет сохранить)
      let keepPdfs = currentPdfs; // По умолчанию сохраняем все текущие файлы
      if (req.body.existingPdfs !== undefined) {
        keepPdfs = typeof req.body.existingPdfs === 'string' 
          ? JSON.parse(req.body.existingPdfs) 
          : req.body.existingPdfs;
        if (!Array.isArray(keepPdfs)) keepPdfs = [];
      }
      
      // Находим файлы которые нужно удалить (есть в БД, но нет в keepPdfs)
      const filesToDelete = currentPdfs.filter(url => !keepPdfs.includes(url));
      
      // Удаляем файлы из S3 (асинхронно, не блокируем ответ)
      if (filesToDelete.length > 0) {
        setImmediate(async () => {
          try {
            await deleteFromS3Multiple(filesToDelete);
            console.log(`[UserController] Deleted ${filesToDelete.length} files from S3`);
          } catch (deleteError) {
            console.error('[UserController] Failed to delete files from S3:', deleteError);
          }
        });
      }
      
      // Финальный список PDF: keepPdfs + новые загруженные
      const finalPdfs = [...keepPdfs, ...newUploadedPdfs];
      
      // Обновляем только если есть изменения в файлах
      if (newUploadedPdfs.length > 0 || filesToDelete.length > 0) {
        updateData.pdfs = finalPdfs;
      }

      // Если нет изменений, возвращаем существующего пользователя
      if (Object.keys(updateData).length === 0) {
        let formattedUser = this.dto ? this.dto.format(existingUser) : existingUser;
        formattedUser = await this.addSignedUrlsToUser(formattedUser);
        return res.status(200).json({
          success: true,
          data: formattedUser,
          message: 'No changes detected'
        });
      }

      const updated = await this.model.findByIdAndUpdate(
        userId,
        updateData,
        { new: true, runValidators: true }
      );

      let formattedUser = this.dto ? this.dto.format(updated) : updated;
      formattedUser = await this.addSignedUrlsToUser(formattedUser);

      res.status(200).json({
        success: true,
        data: formattedUser,
        message: 'Profile updated successfully'
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to update profile');
    }
  };

  // Override delete to add permission checks
  delete = async (req, res) => {
    try {
      const { id } = req.params;
      const currentUserId = req.user?.id;
      const currentUserRole = req.user?.role;

      if (!currentUserId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format'
        });
      }

      if (!isAdminManager(currentUserRole)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      // Prevent self-deletion
      if (id === currentUserId.toString()) {
        return res.status(403).json({
          success: false,
          error: 'Access denied: You cannot delete your own account'
        });
      }

      const doc = await this.model.findById(id);
      if (!doc) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      await this.model.findByIdAndDelete(id);

      res.status(200).json({
        success: true,
        message: 'User deleted successfully'
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to delete user');
    }
  };

  // Remove user file (PDF)
  removeUserFile = async (req, res) => {
    try {
      const { id } = req.params;
      const currentUserId = req.user?.id;
      const currentUserRole = req.user?.role;

      if (!currentUserId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format'
        });
      }

      if (!isAdminManager(currentUserRole)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const updated = await this.model.findByIdAndUpdate(
        id,
        { $set: { pdfs: [] } },
        { new: true }
      );

      if (!updated) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      const formattedUser = this.dto ? this.dto.format(updated) : updated;

      res.status(200).json({
        success: true,
        data: formattedUser,
        message: 'User file removed successfully'
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to remove user file');
    }
  };

  /**
   * GET /users/:id/allowedCustomers
   * Get customers that are in allowedCustomers of THIS specific user
   * Returns only companyName
   */
  getAllowedCustomers = async (req, res) => {
    try {
      if (!isAdminManager(req.user?.role)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const { id } = req.params; // userId из URL
      const Customer = require('../models/Customer');

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid user ID format'
        });
      }

      // Get THIS specific user with populated allowedCustomers
      const user = await this.model
        .findById(id)
        .populate('allowedCustomers', 'companyName _id')
        .lean();

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Extract customers from THIS user's allowedCustomers
      const customers = [];
      if (user.allowedCustomers && Array.isArray(user.allowedCustomers)) {
        user.allowedCustomers.forEach(customer => {
          if (customer && typeof customer === 'object') {
            customers.push({
              id: (customer._id || customer.id).toString(),
              companyName: customer.companyName || ''
            });
          }
        });
      }

      res.status(200).json({
        success: true,
        data: customers
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to fetch allowed customers');
    }
  };

}

module.exports = new UserController();
