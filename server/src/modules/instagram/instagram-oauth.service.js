const crypto = require('crypto');
const db = require('../../config/db');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const { encrypt, decrypt } = require('../../utils/encryption');

const IG_AUTH_URL = 'https://www.instagram.com/oauth/authorize';
const IG_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const IG_GRAPH_URL = 'https://graph.instagram.com';
const FB_GRAPH_URL = 'https://graph.facebook.com/v25.0';

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
    // Step 1: Exchange code for short-lived token (IGAA...)
    const codeData = await this._exchangeCode(code);
    const shortToken = codeData.access_token;
    const igUserId = String(codeData.user_id);

    // Step 2: Exchange for long-lived token (60 days)
    const longTokenData = await this._exchangeForLongLived(shortToken);
    const finalToken = longTokenData.access_token;
    const expiresIn = longTokenData.expires_in || 5184000; // 60 days default

    // Step 3: Get username (best-effort)
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

    // Refresh long-lived token (GET, no version prefix)
    const url = `${IG_GRAPH_URL}/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`;

    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('Token refresh failed', { clientId, error: err });

      // Try via graph.facebook.com as fallback
      const fbUrl = `${FB_GRAPH_URL}/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`;
      const res2 = await fetch(fbUrl);
      if (!res2.ok) {
        const err2 = await res2.json().catch(() => ({}));
        logger.error('Token refresh failed (FB fallback)', { clientId, error: err2 });
        await db('client_instagram_tokens')
          .where({ client_id: clientId })
          .update({ is_active: false, updated_at: new Date() });
        throw Object.assign(new Error('Instagram token refresh failed — reconnection required'), { status: 502 });
      }

      const data2 = await res2.json();
      return this._saveRefreshedToken(clientId, data2);
    }

    const data = await res.json();
    return this._saveRefreshedToken(clientId, data);
  }

  async _saveRefreshedToken(clientId, data) {
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
      client_secret: env.meta.igAppSecret,
      grant_type: 'authorization_code',
      redirect_uri: env.meta.redirectUri,
      code,
    });

    logger.info('Exchanging code for token via Instagram Login', {
      redirect_uri: env.meta.redirectUri,
      client_id: env.meta.appId,
      secret_prefix: env.meta.igAppSecret?.slice(0, 6),
      code_prefix: code?.slice(0, 10),
    });

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
    // Try graph.instagram.com WITHOUT version prefix (per Meta docs for Instagram Login)
    const params = new URLSearchParams({
      grant_type: 'ig_exchange_token',
      client_secret: env.meta.igAppSecret,
      access_token: shortToken,
    });

    const url = `${IG_GRAPH_URL}/access_token?${params.toString()}`;
    logger.info('Attempting long-lived token exchange (IG, no version)');

    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      logger.info('Long-lived token obtained', { expiresIn: data.expires_in });
      return data;
    }

    const err = await res.json().catch(() => ({}));
    logger.warn('IG long-lived exchange failed', { status: res.status, error: err });

    // Fallback: try graph.facebook.com
    const fbUrl = `${FB_GRAPH_URL}/access_token?${params.toString()}`;
    logger.info('Retrying long-lived exchange via graph.facebook.com');

    const res2 = await fetch(fbUrl);
    if (res2.ok) {
      const data = await res2.json();
      logger.info('Long-lived token obtained (FB fallback)', { expiresIn: data.expires_in });
      return data;
    }

    const err2 = await res2.json().catch(() => ({}));
    logger.warn('FB long-lived exchange also failed', { status: res2.status, error: err2 });
    logger.warn('Using short-lived token as fallback');
    return { access_token: shortToken, expires_in: 3600 };
  }

  async _getIgUser(accessToken) {
    // Try graph.instagram.com with version
    const res = await fetch(`${IG_GRAPH_URL}/v25.0/me?fields=user_id,username&access_token=${accessToken}`);
    if (res.ok) return res.json();

    // Fallback: without version
    const res2 = await fetch(`${IG_GRAPH_URL}/me?fields=user_id,username&access_token=${accessToken}`);
    if (res2.ok) return res2.json();

    const err = await res2.json().catch(() => ({}));
    logger.error('Failed to fetch IG user info', { error: err });
    throw Object.assign(new Error('Failed to fetch Instagram user info'), { status: 502 });
  }
}

module.exports = new InstagramOAuthService();
