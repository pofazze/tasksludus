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
    // Step 1: Exchange code for short-lived token (returns {access_token, user_id})
    const codeData = await this._exchangeCode(code);
    const shortToken = codeData.access_token;
    const igUserId = String(codeData.user_id);

    // Step 2: Try to exchange for long-lived token (60 days)
    const longToken = await this._exchangeForLongLived(shortToken);
    const finalToken = longToken.access_token;
    const expiresIn = longToken.expires_in || 3600;

    // Step 3: Try to get username (best-effort, not blocking)
    let igUsername = null;
    try {
      const igUser = await this._getIgUser(finalToken);
      igUsername = igUser.username;
    } catch (err) {
      logger.warn('Could not fetch IG username — saving without it', { error: err.message });
    }

    // Step 4: Encrypt and save
    const { encrypted, iv, authTag } = encrypt(finalToken);

    const tokenData = {
      client_id: clientId,
      ig_user_id: igUserId,
      ig_username: igUsername,
      access_token_encrypted: encrypted,
      token_iv: iv,
      token_auth_tag: authTag,
      token_expires_at: new Date(Date.now() + expiresIn * 1000),
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

    const body = new URLSearchParams({
      grant_type: 'ig_refresh_token',
      access_token: token,
    });

    // Try versioned URL first, then unversioned
    const urls = [
      `${META_GRAPH_URL}/v22.0/refresh_access_token`,
      `${META_GRAPH_URL}/refresh_access_token`,
    ];

    let data;
    for (const url of urls) {
      const res = await fetch(url, { method: 'POST', body });
      if (res.ok) {
        data = await res.json();
        break;
      }
      const err = await res.json().catch(() => ({}));
      logger.warn('Token refresh attempt failed', { clientId, status: res.status, error: err });
    }

    if (!data) {
      throw Object.assign(new Error('Failed to refresh Instagram token'), { status: 502 });
    }

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
    logger.info('Code exchange successful', { userId: data.user_id, hasToken: !!data.access_token });
    return data;
  }

  async _exchangeForLongLived(shortToken) {
    const body = new URLSearchParams({
      grant_type: 'ig_exchange_token',
      client_secret: env.meta.appSecret,
      access_token: shortToken,
    });

    const urls = [
      `${META_GRAPH_URL}/v22.0/access_token`,
      `${META_GRAPH_URL}/access_token`,
    ];

    for (const url of urls) {
      logger.info('Attempting long-lived token exchange', { url });
      const res = await fetch(url, { method: 'POST', body });
      if (res.ok) {
        const data = await res.json();
        logger.info('Long-lived token exchange successful', { expiresIn: data.expires_in });
        return data;
      }
      const err = await res.json().catch(() => ({}));
      logger.warn('Long-lived token exchange attempt failed', { url, status: res.status, error: err });
    }

    logger.warn('All long-lived exchange attempts failed — using short-lived token (1h)');
    return { access_token: shortToken, expires_in: 3600 };
  }

  async _getIgUser(accessToken) {
    const body = new URLSearchParams({
      fields: 'user_id,username',
      access_token: accessToken,
    });
    const res = await fetch(`${META_GRAPH_URL}/v22.0/me`, { method: 'POST', body });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('Failed to fetch IG user info', { error: err });
      throw Object.assign(new Error('Failed to fetch Instagram user info'), { status: 502 });
    }
    return res.json();
  }
}

module.exports = new InstagramOAuthService();
