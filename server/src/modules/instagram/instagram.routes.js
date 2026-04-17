const express = require('express');
const multer = require('multer');
const { authenticate, managementLevel, managementOrSocialMedia, managementOrClientOwn } = require('../../middleware/auth');
const controller = require('./instagram.controller');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

// OAuth endpoints
// Callback is public (Meta redirects here)
router.get('/oauth/callback', controller.handleOAuthCallback.bind(controller));

// Media proxy — public so Instagram can fetch images
router.get('/media-proxy', controller.mediaProxy.bind(controller));

// Temp media — pre-downloaded files served to Instagram during publish
router.get('/temp-media/:token', controller.serveTempMedia.bind(controller));

// Authenticated endpoints
router.use(authenticate);

router.get('/oauth/url/:clientId', managementOrClientOwn, controller.getOAuthUrl.bind(controller));
router.delete('/oauth/:clientId', managementOrClientOwn, controller.disconnectOAuth.bind(controller));
router.get('/oauth/status/:clientId', managementOrClientOwn, controller.getConnectionStatus.bind(controller));

// Scheduled posts
router.get('/scheduled', controller.listScheduledPosts.bind(controller));
router.get('/scheduled/:id', controller.getScheduledPost.bind(controller));
router.post('/scheduled', managementOrSocialMedia, controller.createScheduledPost.bind(controller));
router.put('/scheduled/:id', controller.updateScheduledPost.bind(controller));
router.delete('/scheduled/:id', managementOrSocialMedia, controller.deleteScheduledPost.bind(controller));
router.post('/scheduled/:id/publish-now', controller.publishNow.bind(controller));

// Media upload
router.post('/upload-media', upload.single('file'), controller.uploadMedia.bind(controller));

// Calendar
router.get('/calendar/:clientId', controller.getCalendar.bind(controller));

module.exports = router;
