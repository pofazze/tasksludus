const express = require('express');
const { authenticate, managementLevel } = require('../../middleware/auth');
const controller = require('./youtube.controller');

const router = express.Router();

router.get('/oauth/callback', controller.oauthCallback.bind(controller));

router.use(authenticate);

router.get('/oauth/url/:clientId', managementLevel, controller.getOAuthUrl.bind(controller));
router.get('/oauth/status/:clientId', controller.getConnectionStatus.bind(controller));
router.delete('/oauth/:clientId', managementLevel, controller.disconnect.bind(controller));

module.exports = router;
