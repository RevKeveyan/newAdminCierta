const { body } = require('express-validator');

exports.productCreateValidation = [
  body('name')
    .notEmpty().withMessage('Name is required.')
    .isLength({ min: 2 }).withMessage('Name must be at least 2 characters long.'),

  body('type')
    .notEmpty().withMessage('Type is required.')
    .isIn(['motorcycle', 'car']).withMessage('Invalid type. Allowed types: motorcycle, car.'),

  body('price')
    .optional()
    .isFloat({ gt: 0 }).withMessage('Price must be a positive number.'),

  body('description')
    .optional()
    .isLength({ max: 1000 }).withMessage('Description can be up to 1000 characters long.')
];
