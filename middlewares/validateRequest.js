const { validationResult } = require('express-validator');

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  const extractedErrors = errors.array().map(err => ({
    field: err.param,
    message: err.msg
  }));

  return res.status(422).json({
    message: 'Validation failed.',
    errors: extractedErrors
  });
};

// Middleware для валидации с Joi схемой
const validateRequestWithSchema = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req);
    if (error) {
      const extractedErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(422).json({
        message: 'Validation failed.',
        errors: extractedErrors
      });
    }
    next();
  };
};

module.exports = { validateRequest, validateRequestWithSchema };
