const crypto = require('crypto');
const db = require('../../config/db');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const { encrypt, decrypt } = require('../../utils/encryption');

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const YOUTUBE_CHANNELS_URL = 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true';

const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
].join(' ');

class YouTubeOAuthService {
  getAuthorizationUrl(clientId) {
    const state = Buffer.from(JSON.stringify({
      clientId,
      nonce: crypto.randomBytes(16).toString('hex'),
    })).toString('base64url');

    const params = new URLSearchParams({
      client_id: env.youtube.clientId,
      redirect_uri: env.youtube.redirectUri,
      response_type: 'code',
      scope: YOUTUBE_SCOPES,
      state,
      access_type: 'offline',
      prompt: 'consent',
    });

    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
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

    // Step 2: Get channel info
    let channelId = null;
    let channelTitle = null;
    try {
      const channelInfo = await this._getChannelInfo(tokenData.access_token);
      channelId = channelInfo.items?.[0]?.id || null;
      channelTitle = channelInfo.items?.[0]?.snippet?.title || null;
    } catch (err) {
      logger.warn('Could not fetch YouTube channel info', { error: err.message });
    }

    // Step 3: Encrypt access token
    const { encrypted: accessEncrypted, iv: accessIv, authTag: accessAuthTag } = encrypt(tokenData.access_token);

    // Step 4: Encrypt refresh token
    const { encrypted: refreshEncrypted, iv: refreshIv, authTag: refreshAuthTag } = encrypt(tokenData.refresh_token);

    const record = {
      client_id: clientId,
      channel_id: channelId,
      channel_title: channelTitle,
      access_token_encrypted: accessEncrypted,
      token_iv: accessIv,
      token_auth_tag: accessAuthTag,
      token_expires_at: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000),
      refresh_token_encrypted: refreshEncrypted,
      refresh_token_iv: refreshIv,
      refresh_token_auth_tag: refreshAuthTag,
      is_active: true,
    };

    const existing = await db('client_youtube_tokens').where({ client_id: clientId }).first();
    if (existing) {
      const [updated] = await db('client_youtube_tokens')
        .where({ client_id: clientId })
        .update({ ...record, updated_at: new Date() })
        .returning('*');
      logger.info('YouTube connected (updated)', { clientId, channelTitle, channelId });
      return updated;
    }

    const [created] = await db('client_youtube_tokens').insert(record).returning('*');
    logger.info('YouTube connected (new)', { clientId, channelTitle, channelId });
    return created;
  }

  async refreshToken(clientId) {
    const row = await db('client_youtube_tokens')
      .where({ client_id: clientId, is_active: true })
      .first();

    if (!row) {
      throw Object.assign(new Error('YouTube not connected for this client'), { status: 404 });
    }

    const currentRefreshToken = decrypt(row.refresh_token_encrypted, row.refresh_token_iv, row.refresh_token_auth_tag);

    const form = new URLSearchParams({
      client_id: env.youtube.clientId,
      client_secret: env.youtube.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: currentRefreshToken,
    });

    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('YouTube token refresh failed', { clientId, error: err });
      await db('client_youtube_tokens')
        .where({ client_id: clientId })
        .update({ is_active: false, updated_at: new Date() });
      throw Object.assign(new Error('Token refresh failed — reconnection required'), { status: 502 });
    }

    const data = await res.json();

    // Google only returns a new access_token on refresh — refresh_token persists forever
    const { encrypted: accessEncrypted, iv: accessIv, authTag: accessAuthTag } = encrypt(data.access_token);

    const [updated] = await db('client_youtube_tokens')
      .where({ client_id: clientId })
      .update({
        access_token_encrypted: accessEncrypted,
        token_iv: accessIv,
        token_auth_tag: accessAuthTag,
        token_expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000),
        updated_at: new Date(),
      })
      .returning('*');

    logger.info('YouTube token refreshed', { clientId, expiresAt: updated.token_expires_at });
    return updated;
  }

  async getDecryptedToken(clientId) {
    const row = await db('client_youtube_tokens')
      .where({ client_id: clientId, is_active: true })
      .first();

    if (!row) {
      throw Object.assign(new Error('YouTube not connected for this client'), { status: 404 });
    }

    return decrypt(row.access_token_encrypted, row.token_iv, row.token_auth_tag);
  }

  async disconnectClient(clientId) {
    const row = await db('client_youtube_tokens').where({ client_id: clientId }).first();
    if (!row) {
      throw Object.assign(new Error('No YouTube connection found'), { status: 404 });
    }

    try {
      const accessToken = decrypt(row.access_token_encrypted, row.token_iv, row.token_auth_tag);

      const res = await fetch(`${GOOGLE_REVOKE_URL}?token=${accessToken}`, {
        method: 'POST',
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        logger.warn('YouTube token revocation failed (proceeding with local delete)', { clientId, error: err });
      } else {
        logger.info('YouTube token revoked', { clientId });
      }
    } catch (err) {
      logger.warn('Could not revoke YouTube token (proceeding with local delete)', { clientId, error: err.message });
    }

    await db('client_youtube_tokens').where({ client_id: clientId }).del();
    return { success: true };
  }

  async getConnectionStatus(clientId) {
    const row = await db('client_youtube_tokens')
      .where({ client_id: clientId, is_active: true })
      .select('channel_id', 'channel_title', 'token_expires_at', 'is_active')
      .first();

    if (!row) return { connected: false };

    return {
      connected: true,
      channelId: row.channel_id,
      channelTitle: row.channel_title,
      expiresAt: row.token_expires_at,
    };
  }

  async getTokensExpiringWithin(days) {
    const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return db('client_youtube_tokens')
      .where('is_active', true)
      .where('token_expires_at', '<', cutoff)
      .select('client_id', 'channel_title', 'token_expires_at');
  }

  // --- Private helpers ---

  async _exchangeCode(code) {
    const form = new URLSearchParams({
      client_id: env.youtube.clientId,
      client_secret: env.youtube.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: env.youtube.redirectUri,
    });

    logger.info('Exchanging code via Google OAuth');
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('Google code exchange failed', { error: err });
      throw Object.assign(new Error(err.error_description || err.error || 'Failed to exchange authorization code'), { status: 502 });
    }

    const data = await res.json();
    logger.info('Google code exchange successful', { tokenPrefix: data.access_token?.slice(0, 4) });
    return data;
  }

  async _getChannelInfo(accessToken) {
    const res = await fetch(YOUTUBE_CHANNELS_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.ok) return res.json();

    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to fetch YouTube channel info');
  }
}

module.exports = new YouTubeOAuthService();
