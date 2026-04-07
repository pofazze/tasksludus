const settingsService = require('./settings.service');
const evolutionService = require('../evolution/evolution.service');

class SettingsController {
  async listSettings(req, res, next) {
    try {
      const settings = await settingsService.listSettings();
      res.json(settings);
    } catch (err) {
      next(err);
    }
  }

  async updateSetting(req, res, next) {
    try {
      const { value } = req.body;
      if (value === undefined) return res.status(400).json({ error: 'Value is required' });

      const setting = await settingsService.updateSetting(req.params.key, value, req.user.id);
      res.json(setting);
    } catch (err) {
      next(err);
    }
  }

  async listIntegrations(req, res, next) {
    try {
      const integrations = await settingsService.listIntegrations();
      res.json(integrations);
    } catch (err) {
      next(err);
    }
  }

  async updateIntegration(req, res, next) {
    try {
      const { config, is_active } = req.body;
      const integration = await settingsService.updateIntegration(req.params.id, config, is_active);
      res.json(integration);
    } catch (err) {
      next(err);
    }
  }
  async testClickUp(req, res, next) {
    try {
      const result = await settingsService.testClickUp();
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async testInstagram(req, res, next) {
    try {
      const result = await settingsService.testInstagram(req.body?.access_token);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
  async evolutionCreateInstance(req, res, next) {
    try {
      const { instanceName, number } = req.body;
      if (!instanceName || !number) {
        return res.status(400).json({ error: 'instanceName and number are required' });
      }
      const result = await evolutionService.createInstance(instanceName, number);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async evolutionConnect(req, res, next) {
    try {
      const { instanceName } = req.params;
      const result = await evolutionService.connectInstance(instanceName);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async evolutionConnectionState(req, res, next) {
    try {
      const { instanceName } = req.params;
      const result = await evolutionService.connectionState(instanceName);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new SettingsController();
