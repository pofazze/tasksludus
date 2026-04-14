const oauthService = require('./tiktok-oauth.service');
const webhookService = require('./tiktok-webhook.service');
const logger = require('../../utils/logger');
const { clientUrl } = require('../../config/env');

class TikTokController {
  async getOAuthUrl(req, res, next) {
    try {
      const { clientId } = req.params;
      const url = await oauthService.getAuthorizationUrl(clientId);
      res.json({ url });
    } catch (err) {
      next(err);
    }
  }

  async oauthCallback(req, res, next) {
    try {
      const { code, state, error } = req.query;

      if (error) {
        return res.redirect(`${clientUrl}/clients?tiktok=denied`);
      }

      const { clientId } = oauthService.parseState(state);
      await oauthService.handleCallback(code, clientId);

      return res.redirect(`${clientUrl}/clients/${clientId}?tiktok=connected`);
    } catch (err) {
      next(err);
    }
  }

  async getConnectionStatus(req, res, next) {
    try {
      const { clientId } = req.params;
      const status = await oauthService.getConnectionStatus(clientId);
      res.json(status);
    } catch (err) {
      next(err);
    }
  }

  async disconnect(req, res, next) {
    try {
      const { clientId } = req.params;
      await oauthService.disconnectClient(clientId);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }

  async webhook(req, res) {
    const signature = req.headers['tiktok-signature'];
    const rawBody = req.rawBody;

    const valid = webhookService.verifySignature(rawBody, signature);
    if (!valid) {
      logger.warn('TikTok webhook signature verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    res.status(200).json({ ok: true });

    Promise.resolve(webhookService.processEvent(req.body)).catch((err) => {
      logger.error('TikTok webhook processing error (post-response)', { error: err.message });
    });
  }
}

module.exports = new TikTokController();
