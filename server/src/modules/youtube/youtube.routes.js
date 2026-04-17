const express = require('express');
const { authenticate, managementLevel, managementOrClientOwn } = require('../../middleware/auth');
const controller = require('./youtube.controller');

const router = express.Router();

router.get('/oauth/callback', controller.oauthCallback.bind(controller));

router.use(authenticate);

router.get('/oauth/url/:clientId', managementOrClientOwn, controller.getOAuthUrl.bind(controller));
router.get('/oauth/status/:clientId', managementOrClientOwn, controller.getConnectionStatus.bind(controller));
router.delete('/oauth/:clientId', managementOrClientOwn, controller.disconnect.bind(controller));

module.exports = router;
