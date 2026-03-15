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

  async googleCallback(req, res, next) {
    try {
      const { id: googleId, emails, displayName, photos } = req.user;
      const email = emails[0].value;
      const avatarUrl = photos?.[0]?.value || null;

      const result = await authService.googleLogin(googleId, email, displayName, avatarUrl);

      // Redirect to frontend with tokens
      const params = new URLSearchParams({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
      res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/auth/callback?${params}`);
    } catch (err) {
      next(err);
    }
  }

  async acceptInvite(req, res, next) {
    try {
      const { token } = req.params;
      const { error, value } = registerFromInviteSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const result = await authService.registerFromInvite(
        token,
        value.name,
        value.password,
        value.google_id
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  async createInvite(req, res, next) {
    try {
      const { error, value } = createInviteSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const invite = await authService.createInvite(
        value.email,
        value.role,
        value.producer_type,
        req.user.id
      );
      res.status(201).json(invite);
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
    // JWT is stateless — client just discards the token
    // Future: add token to Redis blacklist
    res.json({ message: 'Logged out' });
  }

  async me(req, res) {
    res.json({ user: req.user });
  }
}

module.exports = new AuthController();
