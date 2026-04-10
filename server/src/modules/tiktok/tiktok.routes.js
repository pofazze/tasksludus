const express = require('express');
const { authenticate, managementLevel } = require('../../middleware/auth');
const controller = require('./tiktok.controller');

const router = express.Router();

// OAuth callback is public (TikTok redirects here)
router.get('/oauth/callback', controller.oauthCallback.bind(controller));

// Authenticated endpoints
router.use(authenticate);

router.get('/oauth/url/:clientId', managementLevel, controller.getOAuthUrl.bind(controller));
router.get('/oauth/status/:clientId', controller.getConnectionStatus.bind(controller));
router.delete('/oauth/:clientId', managementLevel, controller.disconnect.bind(controller));

module.exports = router;
