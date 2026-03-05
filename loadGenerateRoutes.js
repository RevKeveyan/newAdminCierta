const loadController = require('./controllers/LoadController');

function registerLoadGenerateRoutes(router) {
  router.post('/generate-bol', loadController.generateBOL.bind(loadController));
  router.post('/generate-rate-confirmation', loadController.generateRateConfirmation.bind(loadController));
  router.post('/:id/generate-bol', loadController.generateBOL.bind(loadController));
  router.post('/:id/generate-rate-confirmation', loadController.generateRateConfirmation.bind(loadController));
  return router;
}

module.exports = { registerLoadGenerateRoutes };
