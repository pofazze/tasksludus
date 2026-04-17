const oauthService = require('./youtube-oauth.service');
const logger = require('../../utils/logger');
const { clientUrl } = require('../../config/env');

class YouTubeController {
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
        return res.redirect(`${clientUrl}/clients?youtube=denied`);
      }

      const { clientId } = oauthService.parseState(state);
      await oauthService.handleCallback(code, clientId);

      return res.redirect(`${clientUrl}/clients/${clientId}?youtube=connected`);
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
}

module.exports = new YouTubeController();
