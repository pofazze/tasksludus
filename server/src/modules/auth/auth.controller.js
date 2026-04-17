const authService = require('./auth.service');
const { loginSchema, registerFromInviteSchema, createInviteSchema } = require('./auth.validation');

class AuthController {
  async login(req, res, next) {
    try {
      const { error, value } = loginSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const result = await authService.login(value.email, value.password);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async acceptInvite(req, res, next) {
    try {
      const { token } = req.params;
      const { error, value } = registerFromInviteSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const result = await authService.registerFromInvite(token, value.name, value.password);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  async createInvite(req, res, next) {
    try {
      const { error, value } = createInviteSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const result = await authService.createInvite(
        value.email,
        value.role,
        value.producer_type,
        req.user.id,
        { name: value.name, password: value.password, whatsapp: value.whatsapp, clientId: value.client_id }
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  async refresh(req, res, next) {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

      const result = await authService.refreshToken(refreshToken);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async logout(_req, res) {
    res.json({ message: 'Logged out' });
  }

  async me(req, res) {
    res.json({ user: req.user });
  }
}

module.exports = new AuthController();
