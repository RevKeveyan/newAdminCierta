const express = require('express');
const router = express.Router();

const { PaymentReceivableController, PaymentPayableController } = require('../controllers/PaymentController');
const { verifyToken } = require('../middlewares/authMiddleware');
const { checkRole } = require('../middlewares/roleMiddleware');

// ==========================================
// PAYMENT RECEIVABLE ROUTES (от customers)
// ==========================================

/**
 * @route GET /payments/receivable
 * @desc Получить все receivable платежи с пагинацией
 * @access Private
 */
router.get(
  '/receivable',
  // verifyToken,
  // checkRole(['admin', 'manager', 'accountant']),
  PaymentReceivableController.getAll
);

/**
 * @route GET /payments/receivable/status/:status
 * @desc Получить receivable по статусу
 * @access Private
 */
router.get(
  '/receivable/status/:status',
  // verifyToken,
  // checkRole(['admin', 'manager', 'accountant']),
  PaymentReceivableController.getByStatus
);

/**
 * @route GET /payments/receivable/customer/:customerId
 * @desc Получить receivable по customer
 * @access Private
 */
router.get(
  '/receivable/customer/:customerId',
  // verifyToken,
  // checkRole(['admin', 'manager', 'accountant']),
  PaymentReceivableController.getByCustomer
);

/**
 * @route GET /payments/receivable/load/:loadId
 * @desc Получить receivable по loadId
 * @access Private
 */
router.get(
  '/receivable/load/:loadId',
  // verifyToken,
  // checkRole(['admin', 'manager', 'accountant']),
  PaymentReceivableController.getByLoad
);

/**
 * @route GET /payments/receivable/:id
 * @desc Получить receivable по ID
 * @access Private
 */
router.get(
  '/receivable/:id',
  // verifyToken,
  // checkRole(['admin', 'manager', 'accountant']),
  PaymentReceivableController.getById
);

/**
 * @route POST /payments/receivable
 * @desc Создать новый receivable (обычно создается автоматически)
 * @access Private
 */
router.post(
  '/receivable',
  // verifyToken,
  // checkRole(['admin', 'accountant']),
  PaymentReceivableController.create
);

/**
 * @route PUT /payments/receivable/:id
 * @desc Обновить receivable
 * @access Private
 */
router.put(
  '/receivable/:id',
  // verifyToken,
  // checkRole(['admin', 'accountant']),
  PaymentReceivableController.update
);

/**
 * @route PUT /payments/receivable/:id/received
 * @desc Отметить как получено (устанавливает invoicedDate)
 * @access Private
 */
router.put(
  '/receivable/:id/received',
  // verifyToken,
  // checkRole(['admin', 'accountant']),
  PaymentReceivableController.markAsReceived
);

/**
 * @route DELETE /payments/receivable/:id
 * @desc Удалить receivable
 * @access Private (только admin)
 */
router.delete(
  '/receivable/:id',
  // verifyToken,
  // checkRole(['admin']),
  PaymentReceivableController.delete
);


// ==========================================
// PAYMENT PAYABLE ROUTES (для carriers)
// ==========================================

/**
 * @route GET /payments/payable
 * @desc Получить все payable платежи с пагинацией
 * @access Private
 */
router.get(
  '/payable',
  // verifyToken,
  // checkRole(['admin', 'manager', 'accountant']),
  PaymentPayableController.getAll
);

/**
 * @route GET /payments/payable/carrier/:carrierId
 * @desc Получить payable по carrier
 * @access Private
 */
router.get(
  '/payable/carrier/:carrierId',
  // verifyToken,
  // checkRole(['admin', 'manager', 'accountant']),
  PaymentPayableController.getByCarrier
);

/**
 * @route GET /payments/payable/load/:loadId
 * @desc Получить payable по loadId
 * @access Private
 */
router.get(
  '/payable/load/:loadId',
  // verifyToken,
  // checkRole(['admin', 'manager', 'accountant']),
  PaymentPayableController.getByLoad
);

/**
 * @route GET /payments/payable/:id
 * @desc Получить payable по ID
 * @access Private
 */
router.get(
  '/payable/:id',
  // verifyToken,
  // checkRole(['admin', 'manager', 'accountant']),
  PaymentPayableController.getById
);

/**
 * @route POST /payments/payable
 * @desc Создать новый payable (обычно создается автоматически)
 * @access Private
 */
router.post(
  '/payable',
  // verifyToken,
  // checkRole(['admin', 'accountant']),
  PaymentPayableController.create
);

/**
 * @route PUT /payments/payable/:id
 * @desc Обновить payable (банковские реквизиты)
 * @access Private
 */
router.put(
  '/payable/:id',
  // verifyToken,
  // checkRole(['admin', 'accountant']),
  PaymentPayableController.update
);

/**
 * @route DELETE /payments/payable/:id
 * @desc Удалить payable
 * @access Private (только admin)
 */
router.delete(
  '/payable/:id',
  // verifyToken,
  // checkRole(['admin']),
  PaymentPayableController.delete
);

module.exports = router;
