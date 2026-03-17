const clickupService = require('./clickup.service');
const clickupSyncService = require('./clickup-sync.service');
const logger = require('../../utils/logger');

class WebhooksController {
  /**
   * Receive ClickUp webhook events
   * POST /api/webhooks/clickup
   */
  async clickup(req, res) {
    // ClickUp sends a signature in the header
    const signature = req.headers['x-signature'];
    const rawBody = req.rawBody;

    if (rawBody && signature) {
      const valid = clickupService.verifySignature(rawBody, signature);
      if (!valid) {
        logger.warn('ClickUp webhook signature verification failed');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const event = req.body;

    // ClickUp health check — respond immediately
    if (!event.event) {
      return res.json({ ok: true });
    }

    // Respond immediately, process async
    res.json({ ok: true });

    // Process event in background
    try {
      await clickupService.processEvent(event);
    } catch (err) {
      logger.error(`Webhook processing error: ${err.message}`);
    }
  }

  /**
   * Register webhook with ClickUp
   * POST /api/webhooks/clickup/register
   */
  async registerClickup(req, res, next) {
    try {
      const { endpoint_url } = req.body;
      if (!endpoint_url) {
        return res.status(400).json({ error: 'endpoint_url required' });
      }

      const result = await clickupService.registerWebhook(endpoint_url);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * List registered ClickUp webhooks
   * GET /api/webhooks/clickup
   */
  async listClickup(_req, res, next) {
    try {
      const result = await clickupService.listWebhooks();
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get webhook event history
   * GET /api/webhooks/events
   */
  async listEvents(req, res, next) {
    try {
      const { limit = 50, source, event_type } = req.query;
      const query = require('../../config/db')('webhook_events')
        .orderBy('created_at', 'desc')
        .limit(Math.min(Number(limit), 200));

      if (source) query.where('source', source);
      if (event_type) query.where('event_type', event_type);

      const events = await query;
      res.json(events);
    } catch (err) {
      next(err);
    }
  }
  /**
   * Full sync from ClickUp
   * POST /api/webhooks/clickup/sync
   */
  async sync(req, res, next) {
    try {
      const stats = await clickupSyncService.fullSync();
      res.json(stats);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new WebhooksController();
