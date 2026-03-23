const express = require('express');
const { authenticate, managementLevel } = require('../../middleware/auth');
const controller = require('./instagram.controller');

const router = express.Router();

// OAuth endpoints
// Callback is public (Meta redirects here)
router.get('/oauth/callback', controller.handleOAuthCallback.bind(controller));

// Authenticated endpoints
router.use(authenticate);

router.get('/oauth/url/:clientId', managementLevel, controller.getOAuthUrl.bind(controller));
router.delete('/oauth/:clientId', managementLevel, controller.disconnectOAuth.bind(controller));
router.get('/oauth/status/:clientId', controller.getConnectionStatus.bind(controller));

// Scheduled posts
router.get('/scheduled', controller.listScheduledPosts.bind(controller));
router.get('/scheduled/:id', controller.getScheduledPost.bind(controller));
router.post('/scheduled', managementLevel, controller.createScheduledPost.bind(controller));
router.put('/scheduled/:id', controller.updateScheduledPost.bind(controller));
router.delete('/scheduled/:id', managementLevel, controller.deleteScheduledPost.bind(controller));
router.post('/scheduled/:id/publish-now', controller.publishNow.bind(controller));

// Calendar
router.get('/calendar/:clientId', controller.getCalendar.bind(controller));

module.exports = router;
