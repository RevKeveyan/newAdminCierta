const Joi = require('joi');

// Валидация для получения общей статистики
const getGeneralStatsValidation = {
  query: Joi.object({
    period: Joi.string().valid('day', 'month', 'year').default('month'),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional()
  })
};

// Валидация для получения статистики пользователя
const getUserStatsValidation = {
  params: Joi.object({
    userId: Joi.string().hex().length(24).required()
  }),
  query: Joi.object({
    period: Joi.string().valid('day', 'month', 'year').default('month'),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional()
  })
};

// Валидация для получения статистики всех пользователей
const getAllUsersStatsValidation = {
  query: Joi.object({
    period: Joi.string().valid('day', 'month', 'year').default('month'),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional()
  })
};

// Валидация для получения детальной статистики
const getDetailedStatsValidation = {
  query: Joi.object({
    userId: Joi.string().hex().length(24).optional(),
    startDate: Joi.date().iso().required(),
    endDate: Joi.date().iso().required()
  })
};

// Валидация для обновления статистики
const updateStatsValidation = {
  body: Joi.object({
    force: Joi.boolean().default(false)
  })
};

module.exports = {
  getGeneralStatsValidation,
  getUserStatsValidation,
  getAllUsersStatsValidation,
  getDetailedStatsValidation,
  updateStatsValidation
};

