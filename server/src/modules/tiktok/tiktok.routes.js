const express = require('express');
const { authenticate, managementLevel } = require('../../middleware/auth');
const controller = require('./tiktok.controller');
const mediaProxy = require('./tiktok-media-proxy.controller');

const router = express.Router();

// Public endpoints (TikTok calls these directly)
router.get('/oauth/callback', controller.oauthCallback.bind(controller));
router.post('/webhook', controller.webhook.bind(controller));
router.get('/media/:postId/:index', mediaProxy.serveMedia);

// Authenticated endpoints
router.use(authenticate);

router.get('/oauth/url/:clientId', managementLevel, controller.getOAuthUrl.bind(controller));
router.get('/oauth/status/:clientId', controller.getConnectionStatus.bind(controller));
router.delete('/oauth/:clientId', managementLevel, controller.disconnect.bind(controller));

module.exports = router;
