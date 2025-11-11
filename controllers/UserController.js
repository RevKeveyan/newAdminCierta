const UniversalBaseController = require('./UniversalBaseController');
const User = require('../models/User');
const UserDTO = require('../DTO/user.dto');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

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
          role: { required: true, type: 'string' }
        },
        update: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          email: { type: 'email' },
          role: { type: 'string' }
        }
      }
    });
  }

  // Переопределяем create для обработки пароля
  create = async (req, res) => {
    try {
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
      const hashedPassword = await bcrypt.hash(password, 8);

      const newUser = new this.model({
        ...rest,
        password: hashedPassword,
        profileImage: req.uploadedFiles?.[0] || null
      });

      const saved = await newUser.save();
      
      // Применение DTO
      const formattedUser = this.dto ? this.dto.format(saved) : saved;

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

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format'
        });
      }

      // Валидация данных
      if (this.validationRules.update) {
        const validation = this.validateData(req.body, this.validationRules.update);
        if (!validation.isValid) {
          return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: validation.errors
          });
        }
      }

      // Получаем существующего пользователя для сравнения
      const existingUser = await this.model.findById(id);
      if (!existingUser) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Фильтруем только измененные поля
      const updateData = this.filterChangedFields(existingUser, req.body);
      
      // Если нет изменений, возвращаем существующего пользователя
      if (Object.keys(updateData).length === 0) {
        const formattedUser = this.dto ? this.dto.format(existingUser) : existingUser;
        return res.status(200).json({
          success: true,
          data: formattedUser,
          message: 'No changes detected'
        });
      }
      
      // Обработка пароля
      if (updateData.password) {
        updateData.password = await bcrypt.hash(updateData.password, 8);
      }
      
      // Обработка изображения
      if (req.uploadedFiles?.[0]) {
        updateData.profileImage = req.uploadedFiles[0];
      }

      const updated = await this.model.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      );

      // Применение DTO
      const formattedUser = this.dto ? this.dto.format(updated) : updated;

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

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format'
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

      const formattedUser = this.dto ? this.dto.format(updated) : updated;

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

      const formattedUser = this.dto ? this.dto.format(user) : user;

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
      
      // Если нет изменений, возвращаем существующего пользователя
      if (Object.keys(updateData).length === 0) {
        const formattedUser = this.dto ? this.dto.format(existingUser) : existingUser;
        return res.status(200).json({
          success: true,
          data: formattedUser,
          message: 'No changes detected'
        });
      }
      
      // Обработка пароля
      if (updateData.password) {
        updateData.password = await bcrypt.hash(updateData.password, 8);
      }
      
      // Обработка изображения
      if (req.uploadedFiles?.[0]) {
        updateData.profileImage = req.uploadedFiles[0];
      }

      const updated = await this.model.findByIdAndUpdate(
        userId,
        updateData,
        { new: true, runValidators: true }
      );

      const formattedUser = this.dto ? this.dto.format(updated) : updated;

      res.status(200).json({
        success: true,
        data: formattedUser,
        message: 'Profile updated successfully'
      });
    } catch (error) {
      this.handleError(res, error, 'Failed to update profile');
    }
  };

}

module.exports = new UserController();
