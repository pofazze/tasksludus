const crypto = require('crypto');
const db = require('../../config/db');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const { encrypt, decrypt } = require('../../utils/encryption');

const FB_AUTH_URL = 'https://www.facebook.com/dialog/oauth';
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
      config_id: env.meta.fbLoginConfigId,
      state,
    });

    return `${FB_AUTH_URL}?${params.toString()}`;
  }

  parseState(stateParam) {
    try {
      return JSON.parse(Buffer.from(stateParam, 'base64url').toString());
    } catch {
      throw Object.assign(new Error('Invalid OAuth state'), { status: 400 });
    }
  }

  async handleCallback(code, clientId) {
    // Step 1: Exchange code for short-lived user token (EAA...)
    const shortToken = await this._exchangeCode(code);

    // Step 2: Exchange for long-lived user token (60 days)
    const longToken = await this._exchangeForLongLived(shortToken);

    // Step 3: Discover IG Business Account via Facebook Pages API
    const igAccount = await this._discoverIgAccount(longToken);

    // Step 4: Encrypt page access token and save
    // Page tokens from long-lived user tokens don't expire
    const { encrypted, iv, authTag } = encrypt(igAccount.pageAccessToken);

    const tokenData = {
      client_id: clientId,
      ig_user_id: igAccount.igBusinessAccountId,
      ig_username: igAccount.igUsername,
      access_token_encrypted: encrypted,
      token_iv: iv,
      token_auth_tag: authTag,
      token_expires_at: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000),
      token_refreshed_at: new Date(),
      is_active: true,
    };

    const existing = await db('client_instagram_tokens').where({ client_id: clientId }).first();
    if (existing) {
      const [updated] = await db('client_instagram_tokens')
        .where({ client_id: clientId })
        .update({ ...tokenData, updated_at: new Date() })
        .returning('*');
      logger.info('Instagram connected (updated)', { clientId, igUsername: igAccount.igUsername });
      return updated;
    }

    const [created] = await db('client_instagram_tokens').insert(tokenData).returning('*');
    logger.info('Instagram connected (new)', { clientId, igUsername: igAccount.igUsername });
    return created;
  }

  async refreshToken(clientId) {
    // Page tokens from long-lived user tokens don't expire under normal conditions.
    // Validate the token is still working.
    const token = await this.getDecryptedToken(clientId);

    const res = await fetch(`${FB_GRAPH_URL}/me?access_token=${token}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('Token validation failed — marking inactive', { clientId, error: err });
      await db('client_instagram_tokens')
        .where({ client_id: clientId })
        .update({ is_active: false, updated_at: new Date() });
      throw Object.assign(new Error('Instagram token is no longer valid — reconnection required'), { status: 502 });
    }

    const [updated] = await db('client_instagram_tokens')
      .where({ client_id: clientId })
      .update({ token_refreshed_at: new Date(), updated_at: new Date() })
      .returning('*');

    logger.info('Token validated', { clientId });
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
    return db('client_instagram_tokens')
      .where('is_active', true)
      .select('client_id', 'ig_username', 'token_expires_at');
  }

  // --- Private helpers ---

  async _exchangeCode(code) {
    const params = new URLSearchParams({
      client_id: env.meta.appId,
      client_secret: env.meta.appSecret,
      redirect_uri: env.meta.redirectUri,
      code,
    });

    const url = `${FB_GRAPH_URL}/oauth/access_token?${params.toString()}`;
    logger.info('Exchanging code via Facebook Login', {
      redirect_uri: env.meta.redirectUri,
      secret_prefix: env.meta.appSecret?.slice(0, 6),
    });

    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('Code exchange failed', { error: err });
      throw Object.assign(new Error(err.error?.message || 'Failed to exchange authorization code'), { status: 502 });
    }

    const data = await res.json();
    logger.info('Code exchange successful', { tokenPrefix: data.access_token?.slice(0, 4) });
    return data.access_token;
  }

  async _exchangeForLongLived(shortToken) {
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: env.meta.appId,
      client_secret: env.meta.appSecret,
      fb_exchange_token: shortToken,
    });

    const url = `${FB_GRAPH_URL}/oauth/access_token?${params.toString()}`;
    logger.info('Exchanging for long-lived token');

    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('Long-lived token exchange failed', { error: err });
      throw Object.assign(new Error(err.error?.message || 'Failed to exchange for long-lived token'), { status: 502 });
    }

    const data = await res.json();
    logger.info('Long-lived token obtained', { expiresIn: data.expires_in });
    return data.access_token;
  }

  async _discoverIgAccount(userToken) {
    const url = `${FB_GRAPH_URL}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${userToken}`;
    logger.info('Discovering Instagram Business Account via Pages API');

    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      logger.error('Failed to fetch Facebook Pages', { error: err });
      throw Object.assign(new Error(err.error?.message || 'Failed to fetch Facebook Pages'), { status: 502 });
    }

    const data = await res.json();
    const pages = data.data || [];
    logger.info('Pages found', { count: pages.length, names: pages.map((p) => p.name) });

    const page = pages.find((p) => p.instagram_business_account);
    if (!page) {
      throw Object.assign(
        new Error('Nenhuma página do Facebook com conta Instagram Business vinculada foi encontrada.'),
        { status: 400 }
      );
    }

    logger.info('Instagram Business Account found', {
      pageName: page.name,
      igAccountId: page.instagram_business_account.id,
      igUsername: page.instagram_business_account.username,
    });

    return {
      pageAccessToken: page.access_token,
      igBusinessAccountId: page.instagram_business_account.id,
      igUsername: page.instagram_business_account.username || null,
    };
  }
}

module.exports = new InstagramOAuthService();
