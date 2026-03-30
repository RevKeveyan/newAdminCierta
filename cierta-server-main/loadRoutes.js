const express = require('express');
const loadController = require('./controllers/LoadController');

const router = express.Router();
const ctrl = loadController;

router.get('/', ctrl.getAll.bind(ctrl));
router.get('/search', ctrl.search.bind(ctrl));
router.get('/history', ctrl.getAllLoadHistory.bind(ctrl));
router.get('/by-status', ctrl.getByStatus.bind(ctrl));
router.get('/driver/:driverId', ctrl.getByCarrier.bind(ctrl));
router.get('/customer/:customerId', ctrl.getByCustomer.bind(ctrl));

router.post('/', ctrl.create.bind(ctrl));
router.post('/generate-bol', ctrl.generateBOL.bind(ctrl));
router.post('/generate-rate-confirmation', ctrl.generateRateConfirmation.bind(ctrl));

router.patch('/status/:id', ctrl.updateStatus.bind(ctrl));

router.get('/:id', ctrl.getById.bind(ctrl));
router.put('/:id', ctrl.update.bind(ctrl));
router.post('/:id/duplicate', ctrl.duplicateLoad.bind(ctrl));
router.get('/:id/history', ctrl.getLoadHistory.bind(ctrl));
router.post('/:id/generate-bol', ctrl.generateBOL.bind(ctrl));
router.post('/:id/generate-rate-confirmation', ctrl.generateRateConfirmation.bind(ctrl));
router.delete('/:id', ctrl.delete.bind(ctrl));

module.exports = router;
