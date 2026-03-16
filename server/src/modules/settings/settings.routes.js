const express = require('express');
const settingsController = require('./settings.controller');
const { authenticate, ceoOnly } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', settingsController.listSettings.bind(settingsController));
router.put('/:key', ceoOnly, settingsController.updateSetting.bind(settingsController));

router.get('/integrations', settingsController.listIntegrations.bind(settingsController));
router.put('/integrations/:id', ceoOnly, settingsController.updateIntegration.bind(settingsController));

module.exports = router;
