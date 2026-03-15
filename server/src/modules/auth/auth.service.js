const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../../config/db');
const env = require('../../config/env');

class AuthService {
  async login(email, password) {
    const user = await db('users').where({ email, is_active: true }).first();
    if (!user) {
      throw Object.assign(new Error('Invalid credentials'), { status: 401 });
    }

    if (!user.password_hash) {
      throw Object.assign(new Error('Please login with Google'), { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw Object.assign(new Error('Invalid credentials'), { status: 401 });
    }

    return this._generateTokens(user);
  }

  async googleLogin(googleId, email, name, avatarUrl) {
    let user = await db('users').where({ google_id: googleId }).first();

    if (!user) {
      user = await db('users').where({ email }).first();
      if (user) {
        // Link Google account to existing user
        await db('users').where({ id: user.id }).update({ google_id: googleId, avatar_url: avatarUrl });
        user.google_id = googleId;
      }
    }

    if (!user) {
      throw Object.assign(new Error('No account found. Please use an invite link.'), { status: 401 });
    }

    if (!user.is_active) {
      throw Object.assign(new Error('Account is deactivated'), { status: 401 });
    }

    return this._generateTokens(user);
  }

  async registerFromInvite(token, name, password, googleId) {
    const invite = await db('invite_tokens')
      .where({ token })
      .whereNull('used_at')
      .where('expires_at', '>', new Date())
      .first();

    if (!invite) {
      throw Object.assign(new Error('Invalid or expired invite'), { status: 400 });
    }

    const existing = await db('users').where({ email: invite.email }).first();
    if (existing) {
      throw Object.assign(new Error('User already exists'), { status: 409 });
    }

    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    const [user] = await db('users')
      .insert({
        name,
        email: invite.email,
        password_hash: passwordHash,
        google_id: googleId || null,
        role: invite.role,
        producer_type: invite.producer_type || null,
      })
      .returning('*');

    await db('invite_tokens').where({ id: invite.id }).update({ used_at: new Date() });

    return this._generateTokens(user);
  }

  async createInvite(email, role, producerType, invitedBy) {
    const existing = await db('users').where({ email }).first();
    if (existing) {
      throw Object.assign(new Error('User with this email already exists'), { status: 409 });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const [invite] = await db('invite_tokens')
      .insert({
        email,
        role,
        producer_type: producerType || null,
        invited_by: invitedBy,
        token,
        expires_at: expiresAt,
      })
      .returning('*');

    return invite;
  }

  async refreshToken(refreshToken) {
    try {
      const payload = jwt.verify(refreshToken, env.jwt.refreshSecret);
      if (payload.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      const user = await db('users').where({ id: payload.sub, is_active: true }).first();
      if (!user) {
        throw new Error('User not found');
      }

      return this._generateTokens(user);
    } catch (_err) {
      throw Object.assign(new Error('Invalid refresh token'), { status: 401 });
    }
  }

  _generateTokens(user) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      producerType: user.producer_type,
    };

    const accessToken = jwt.sign(
      { ...payload, type: 'access' },
      env.jwt.secret,
      { expiresIn: env.jwt.expiresIn }
    );

    const refreshToken = jwt.sign(
      { ...payload, type: 'refresh' },
      env.jwt.refreshSecret,
      { expiresIn: env.jwt.refreshExpiresIn }
    );

    const { password_hash, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      accessToken,
      refreshToken,
    };
  }
}

module.exports = new AuthService();
