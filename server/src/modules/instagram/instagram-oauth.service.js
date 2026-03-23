const crypto = require('crypto');
const db = require('../../config/db');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const { encrypt, decrypt } = require('../../utils/encryption');

const IG_AUTH_URL = 'https://www.instagram.com/oauth/authorize';
const IG_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const IG_GRAPH_URL = 'https://graph.instagram.com';

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

    return `${IG_AUTH_URL}?${params.toString()}`;
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
    const codeData = await this._exchangeCode(code);
    const shortToken = codeData.access_token;
    const igUserId = String(codeData.user_id);

    // Step 2: Exchange for long-lived token (60 days)
    const longTokenData = await this._exchangeForLongLived(shortToken);
    const finalToken = longTokenData.access_token;
    const expiresIn = longTokenData.expires_in || 5184000;

    // Step 3: Get username (best-effort)
    let igUsername = null;
    try {
      const igUser = await this._getIgUser(finalToken);
      igUsername = igUser.username;
    } catch (err) {
      logger.warn('Could not fetch IG username', { error: err.message });
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

    const existing = await db('client_instagram_tokens').where({ client_id: clientId }).first();
    if (existing) {
      const [updated] = await db('client_instagram_tokens')
        .where({ client_id: clientId })
        .update({ ...tokenData, updated_at: new Date() })
        .returning('*');
      logger.info('Instagram connected (updated)', { clientId, igUsername, igUserId });
      return updated;
    }

    const [created] = await db('client_instagram_tokens').insert(tokenData).returning('*');
    logger.info('Instagram connected (new)', { clientId, igUsername, igUserId });
    return created;
  }

  async refreshToken(clientId) {
    const token = await this.getDecryptedToken(clientId);
    const url = `${IG_GRAPH_URL}/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`;

    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('Token refresh failed', { clientId, error: err });
      await db('client_instagram_tokens')
        .where({ client_id: clientId })
        .update({ is_active: false, updated_at: new Date() });
      throw Object.assign(new Error('Token refresh failed — reconnection required'), { status: 502 });
    }

    const data = await res.json();
    const { encrypted, iv, authTag } = encrypt(data.access_token);

    const [updated] = await db('client_instagram_tokens')
      .where({ client_id: clientId })
      .update({
        access_token_encrypted: encrypted,
        token_iv: iv,
        token_auth_tag: authTag,
        token_expires_at: new Date(Date.now() + (data.expires_in || 5184000) * 1000),
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

    if (!row) return { connected: false };

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
      client_secret: env.meta.igAppSecret,
      grant_type: 'authorization_code',
      redirect_uri: env.meta.redirectUri,
      code,
    });

    logger.info('Exchanging code via Instagram Login');
    const res = await fetch(IG_TOKEN_URL, { method: 'POST', body: form });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('Code exchange failed', { error: err });
      throw Object.assign(new Error(err.error_message || 'Failed to exchange authorization code'), { status: 502 });
    }

    const data = await res.json();
    logger.info('Code exchange successful', { userId: data.user_id, tokenPrefix: data.access_token?.slice(0, 4) });
    return data;
  }

  async _exchangeForLongLived(shortToken) {
    const params = new URLSearchParams({
      grant_type: 'ig_exchange_token',
      client_secret: env.meta.igAppSecret,
      access_token: shortToken,
    });

    const url = `${IG_GRAPH_URL}/access_token?${params.toString()}`;
    logger.info('Attempting long-lived token exchange');

    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      logger.info('Long-lived token obtained', { expiresIn: data.expires_in });
      return data;
    }

    const err = await res.json().catch(() => ({}));
    logger.warn('Long-lived exchange failed, using short-lived', { error: err });
    return { access_token: shortToken, expires_in: 3600 };
  }

  async _getIgUser(accessToken) {
    const res = await fetch(`${IG_GRAPH_URL}/me?fields=user_id,username&access_token=${accessToken}`);
    if (res.ok) return res.json();

    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to fetch user info');
  }
}

module.exports = new InstagramOAuthService();
