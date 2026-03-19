const crypto = require('crypto');
const db = require('../../config/db');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const { encrypt, decrypt } = require('../../utils/encryption');

const META_GRAPH_URL = 'https://graph.instagram.com';
const META_AUTH_URL = 'https://www.instagram.com/oauth/authorize';
const META_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';

class InstagramOAuthService {
  getAuthorizationUrl(clientId) {
    const state = Buffer.from(JSON.stringify({
      clientId,
      nonce: crypto.randomBytes(16).toString('hex'),
    })).toString('base64url');

    const params = new URLSearchParams({
      client_id: env.meta.appId,
      redirect_uri: env.meta.redirectUri,
      response_type: 'code',
      scope: 'instagram_business_basic,instagram_business_content_publish',
      state,
    });

    return `${META_AUTH_URL}?${params.toString()}`;
  }

  parseState(stateParam) {
    try {
      return JSON.parse(Buffer.from(stateParam, 'base64url').toString());
    } catch {
      throw Object.assign(new Error('Invalid OAuth state'), { status: 400 });
    }
  }

  async handleCallback(code, clientId) {
    // Step 1: Exchange code for short-lived token
    const shortToken = await this._exchangeCode(code);

    // Step 2: Exchange for long-lived token (60 days)
    const longToken = await this._exchangeForLongLived(shortToken);

    // Step 3: Get Instagram user info
    const igUser = await this._getIgUser(longToken.access_token);

    // Step 4: Encrypt and save
    const { encrypted, iv, authTag } = encrypt(longToken.access_token);

    const tokenData = {
      client_id: clientId,
      ig_user_id: igUser.user_id,
      ig_username: igUser.username,
      access_token_encrypted: encrypted,
      token_iv: iv,
      token_auth_tag: authTag,
      token_expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      token_refreshed_at: new Date(),
      is_active: true,
    };

    // Upsert (one token per client)
    const existing = await db('client_instagram_tokens').where({ client_id: clientId }).first();
    if (existing) {
      const [updated] = await db('client_instagram_tokens')
        .where({ client_id: clientId })
        .update({ ...tokenData, updated_at: new Date() })
        .returning('*');
      return updated;
    }

    const [created] = await db('client_instagram_tokens').insert(tokenData).returning('*');
    return created;
  }

  async refreshToken(clientId) {
    const token = await this.getDecryptedToken(clientId);
    const url = `${META_GRAPH_URL}/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`;

    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('Token refresh failed', { clientId, error: err });
      throw Object.assign(new Error('Failed to refresh Instagram token'), { status: 502 });
    }

    const data = await res.json();
    const { encrypted, iv, authTag } = encrypt(data.access_token);

    const [updated] = await db('client_instagram_tokens')
      .where({ client_id: clientId })
      .update({
        access_token_encrypted: encrypted,
        token_iv: iv,
        token_auth_tag: authTag,
        token_expires_at: new Date(Date.now() + data.expires_in * 1000),
        token_refreshed_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');

    logger.info('Token refreshed', { clientId, expiresAt: updated.token_expires_at });
    return updated;
  }

  async getDecryptedToken(clientId) {
    const row = await db('client_instagram_tokens')
      .where({ client_id: clientId, is_active: true })
      .first();

    if (!row) {
      throw Object.assign(new Error('Instagram not connected for this client'), { status: 404 });
    }

    return decrypt(row.access_token_encrypted, row.token_iv, row.token_auth_tag);
  }

  async disconnectClient(clientId) {
    const deleted = await db('client_instagram_tokens').where({ client_id: clientId }).del();
    if (!deleted) {
      throw Object.assign(new Error('No Instagram connection found'), { status: 404 });
    }
    return { success: true };
  }

  async getConnectionStatus(clientId) {
    const row = await db('client_instagram_tokens')
      .where({ client_id: clientId, is_active: true })
      .select('ig_username', 'token_expires_at', 'is_active', 'token_refreshed_at')
      .first();

    if (!row) {
      return { connected: false };
    }

    return {
      connected: true,
      username: row.ig_username,
      expiresAt: row.token_expires_at,
      refreshedAt: row.token_refreshed_at,
    };
  }

  async getTokensExpiringWithin(days) {
    const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return db('client_instagram_tokens')
      .where('is_active', true)
      .where('token_expires_at', '<', cutoff)
      .select('client_id', 'ig_username', 'token_expires_at');
  }

  // --- Private helpers ---

  async _exchangeCode(code) {
    const form = new URLSearchParams({
      client_id: env.meta.appId,
      client_secret: env.meta.appSecret,
      grant_type: 'authorization_code',
      redirect_uri: env.meta.redirectUri,
      code,
    });

    const res = await fetch(META_TOKEN_URL, {
      method: 'POST',
      body: form,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('Code exchange failed', { error: err });
      throw Object.assign(new Error('Failed to exchange authorization code'), { status: 502 });
    }

    const data = await res.json();
    return data.access_token;
  }

  async _exchangeForLongLived(shortToken) {
    const params = new URLSearchParams({
      grant_type: 'ig_exchange_token',
      client_secret: env.meta.appSecret,
      access_token: shortToken,
    });

    const res = await fetch(`${META_GRAPH_URL}/access_token?${params.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('Long-lived token exchange failed', { error: err });
      throw Object.assign(new Error('Failed to obtain long-lived token'), { status: 502 });
    }

    return res.json();
  }

  async _getIgUser(accessToken) {
    const res = await fetch(`${META_GRAPH_URL}/me?fields=user_id,username&access_token=${accessToken}`);
    if (!res.ok) {
      throw Object.assign(new Error('Failed to fetch Instagram user info'), { status: 502 });
    }
    return res.json();
  }
}

module.exports = new InstagramOAuthService();
