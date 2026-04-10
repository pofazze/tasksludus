const crypto = require('crypto');
const db = require('../../config/db');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const { encrypt, decrypt } = require('../../utils/encryption');

const TK_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const TK_REVOKE_URL = 'https://open.tiktokapis.com/v2/oauth/revoke/';
const TK_USER_URL = 'https://open.tiktokapis.com/v2/user/info/?fields=display_name,avatar_url';

class TikTokOAuthService {
  getAuthorizationUrl(clientId) {
    const state = Buffer.from(JSON.stringify({
      clientId,
      nonce: crypto.randomBytes(16).toString('hex'),
    })).toString('base64url');

    const params = new URLSearchParams({
      client_key: env.tiktok.clientKey,
      redirect_uri: env.tiktok.redirectUri,
      response_type: 'code',
      scope: 'video.publish,user.info.basic',
      state,
    });

    return `${TK_AUTH_URL}?${params.toString()}`;
  }

  parseState(stateParam) {
    try {
      return JSON.parse(Buffer.from(stateParam, 'base64url').toString());
    } catch {
      throw Object.assign(new Error('Invalid OAuth state'), { status: 400 });
    }
  }

  async handleCallback(code, clientId) {
    // Step 1: Exchange code for tokens
    const tokenData = await this._exchangeCode(code);

    // Step 2: Get user info
    let tiktokUsername = null;
    try {
      const userInfo = await this._getUserInfo(tokenData.access_token);
      tiktokUsername = userInfo.data?.user?.display_name || null;
    } catch (err) {
      logger.warn('Could not fetch TikTok user info', { error: err.message });
    }

    // Step 3: Encrypt access token
    const { encrypted: accessEncrypted, iv: accessIv, authTag: accessAuthTag } = encrypt(tokenData.access_token);

    // Step 4: Encrypt refresh token
    const { encrypted: refreshEncrypted, iv: refreshIv, authTag: refreshAuthTag } = encrypt(tokenData.refresh_token);

    const record = {
      client_id: clientId,
      tiktok_open_id: tokenData.open_id,
      tiktok_username: tiktokUsername,
      access_token_encrypted: accessEncrypted,
      token_iv: accessIv,
      token_auth_tag: accessAuthTag,
      token_expires_at: new Date(Date.now() + (tokenData.expires_in || 86400) * 1000),
      refresh_token_encrypted: refreshEncrypted,
      refresh_token_iv: refreshIv,
      refresh_token_auth_tag: refreshAuthTag,
      refresh_expires_at: new Date(Date.now() + (tokenData.refresh_expires_in || 31536000) * 1000),
      is_active: true,
    };

    const existing = await db('client_tiktok_tokens').where({ client_id: clientId }).first();
    if (existing) {
      const [updated] = await db('client_tiktok_tokens')
        .where({ client_id: clientId })
        .update({ ...record, updated_at: new Date() })
        .returning('*');
      logger.info('TikTok connected (updated)', { clientId, tiktokUsername, openId: tokenData.open_id });
      return updated;
    }

    const [created] = await db('client_tiktok_tokens').insert(record).returning('*');
    logger.info('TikTok connected (new)', { clientId, tiktokUsername, openId: tokenData.open_id });
    return created;
  }

  async refreshToken(clientId) {
    const row = await db('client_tiktok_tokens')
      .where({ client_id: clientId, is_active: true })
      .first();

    if (!row) {
      throw Object.assign(new Error('TikTok not connected for this client'), { status: 404 });
    }

    const currentRefreshToken = decrypt(row.refresh_token_encrypted, row.refresh_token_iv, row.refresh_token_auth_tag);

    const form = new URLSearchParams({
      client_key: env.tiktok.clientKey,
      client_secret: env.tiktok.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: currentRefreshToken,
    });

    const res = await fetch(TK_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('TikTok token refresh failed', { clientId, error: err });
      await db('client_tiktok_tokens')
        .where({ client_id: clientId })
        .update({ is_active: false, updated_at: new Date() });
      throw Object.assign(new Error('Token refresh failed — reconnection required'), { status: 502 });
    }

    const data = await res.json();

    const { encrypted: accessEncrypted, iv: accessIv, authTag: accessAuthTag } = encrypt(data.access_token);
    const { encrypted: refreshEncrypted, iv: refreshIv, authTag: refreshAuthTag } = encrypt(data.refresh_token);

    const [updated] = await db('client_tiktok_tokens')
      .where({ client_id: clientId })
      .update({
        access_token_encrypted: accessEncrypted,
        token_iv: accessIv,
        token_auth_tag: accessAuthTag,
        token_expires_at: new Date(Date.now() + (data.expires_in || 86400) * 1000),
        refresh_token_encrypted: refreshEncrypted,
        refresh_token_iv: refreshIv,
        refresh_token_auth_tag: refreshAuthTag,
        refresh_expires_at: new Date(Date.now() + (data.refresh_expires_in || 31536000) * 1000),
        updated_at: new Date(),
      })
      .returning('*');

    logger.info('TikTok token refreshed', { clientId, expiresAt: updated.token_expires_at });
    return updated;
  }

  async getDecryptedToken(clientId) {
    const row = await db('client_tiktok_tokens')
      .where({ client_id: clientId, is_active: true })
      .first();

    if (!row) {
      throw Object.assign(new Error('TikTok not connected for this client'), { status: 404 });
    }

    return decrypt(row.access_token_encrypted, row.token_iv, row.token_auth_tag);
  }

  async disconnectClient(clientId) {
    const row = await db('client_tiktok_tokens').where({ client_id: clientId }).first();
    if (!row) {
      throw Object.assign(new Error('No TikTok connection found'), { status: 404 });
    }

    try {
      const accessToken = decrypt(row.access_token_encrypted, row.token_iv, row.token_auth_tag);
      const form = new URLSearchParams({
        client_key: env.tiktok.clientKey,
        client_secret: env.tiktok.clientSecret,
        token: accessToken,
      });

      const res = await fetch(TK_REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        logger.warn('TikTok token revocation failed (proceeding with local delete)', { clientId, error: err });
      } else {
        logger.info('TikTok token revoked', { clientId });
      }
    } catch (err) {
      logger.warn('Could not revoke TikTok token (proceeding with local delete)', { clientId, error: err.message });
    }

    await db('client_tiktok_tokens').where({ client_id: clientId }).del();
    return { success: true };
  }

  async getConnectionStatus(clientId) {
    const row = await db('client_tiktok_tokens')
      .where({ client_id: clientId, is_active: true })
      .select('tiktok_username', 'token_expires_at', 'is_active')
      .first();

    if (!row) return { connected: false };

    return {
      connected: true,
      username: row.tiktok_username,
      expiresAt: row.token_expires_at,
    };
  }

  async getTokensExpiringWithin(days) {
    const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return db('client_tiktok_tokens')
      .where('is_active', true)
      .where('token_expires_at', '<', cutoff)
      .select('client_id', 'tiktok_username', 'token_expires_at');
  }

  // --- Private helpers ---

  async _exchangeCode(code) {
    const form = new URLSearchParams({
      client_key: env.tiktok.clientKey,
      client_secret: env.tiktok.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: env.tiktok.redirectUri,
    });

    logger.info('Exchanging code via TikTok OAuth');
    const res = await fetch(TK_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('TikTok code exchange failed', { error: err });
      throw Object.assign(new Error(err.error_description || 'Failed to exchange authorization code'), { status: 502 });
    }

    const data = await res.json();
    logger.info('TikTok code exchange successful', { openId: data.open_id, tokenPrefix: data.access_token?.slice(0, 4) });
    return data;
  }

  async _getUserInfo(accessToken) {
    const res = await fetch(TK_USER_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.ok) return res.json();

    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to fetch TikTok user info');
  }
}

module.exports = new TikTokOAuthService();
