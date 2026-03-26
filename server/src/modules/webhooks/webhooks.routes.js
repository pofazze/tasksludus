const { Router } = require('express');
const controller = require('./webhooks.controller');
const { authenticate, ceoOnly } = require('../../middleware/auth');

const router = Router();

// Public endpoint — ClickUp sends webhooks here (no auth)
router.post('/clickup', controller.clickup);

// Admin endpoints — manage webhooks (requires auth + CEO)
router.get('/clickup', authenticate, ceoOnly, controller.listClickup);
router.post('/clickup/register', authenticate, ceoOnly, controller.registerClickup);
router.post('/clickup/sync', authenticate, ceoOnly, controller.sync);
router.get('/events', authenticate, ceoOnly, controller.listEvents);

// ClickUp OAuth
router.get('/clickup/oauth/url', authenticate, ceoOnly, controller.clickupOAuthUrl);
router.get('/clickup/oauth/callback', controller.clickupOAuthCallback); // public — ClickUp redirects here
router.delete('/clickup/oauth', authenticate, ceoOnly, controller.clickupOAuthDisconnect);
router.get('/clickup/oauth/status', authenticate, controller.clickupOAuthStatus);

module.exports = router;
