const crypto = require('crypto');
const db = require('../../config/db');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const { encrypt, decrypt } = require('../../utils/encryption');

const CLICKUP_AUTH_URL = 'https://app.clickup.com/api';
const CLICKUP_TOKEN_URL = 'https://api.clickup.com/api/v2/oauth/token';
const CLICKUP_USER_URL = 'https://api.clickup.com/api/v2/user';

class ClickUpOAuthService {
  /**
   * Build the ClickUp OAuth authorization URL
   */
  getAuthorizationUrl() {
    const state = crypto.randomBytes(16).toString('hex');

    const params = new URLSearchParams({
      client_id: env.clickup.clientId,
      redirect_uri: env.clickup.redirectUri,
      state,
    });

    return { url: `${CLICKUP_AUTH_URL}?${params.toString()}`, state };
  }

  /**
   * Exchange authorization code for access token, fetch user info, save encrypted
   */
  async handleCallback(code, connectedBy) {
    // Step 1: Exchange code for access token
    const tokenRes = await fetch(CLICKUP_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: env.clickup.clientId,
        client_secret: env.clickup.clientSecret,
        code,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      logger.error('ClickUp code exchange failed', { error: err });
      throw Object.assign(
        new Error(err.err || 'Failed to exchange authorization code'),
        { status: 502 }
      );
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      throw Object.assign(new Error('No access_token in ClickUp response'), { status: 502 });
    }

    // Step 2: Get user info
    let clickupUserId = null;
    let clickupUsername = null;
    let clickupEmail = null;

    try {
      const userRes = await fetch(CLICKUP_USER_URL, {
        headers: { Authorization: accessToken },
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        clickupUserId = String(userData.user?.id);
        clickupUsername = userData.user?.username;
        clickupEmail = userData.user?.email;
      }
    } catch (err) {
      logger.warn('Could not fetch ClickUp user info', { error: err.message });
    }

    // Step 3: Encrypt and save (single-row: deactivate any existing, then insert)
    const { encrypted, iv, authTag } = encrypt(accessToken);

    await db('clickup_oauth_tokens').where({ is_active: true }).update({ is_active: false, updated_at: new Date() });

    const [created] = await db('clickup_oauth_tokens')
      .insert({
        clickup_user_id: clickupUserId,
        clickup_username: clickupUsername,
        clickup_email: clickupEmail,
        access_token_encrypted: encrypted,
        token_iv: iv,
        token_auth_tag: authTag,
        is_active: true,
        connected_by: connectedBy || null,
      })
      .returning('*');

    logger.info('ClickUp OAuth connected', { clickupUsername, clickupEmail });
    return created;
  }

  /**
   * Get decrypted ClickUp token. Falls back to env var if no OAuth token saved.
   */
  async getDecryptedToken() {
    const row = await db('clickup_oauth_tokens')
      .where({ is_active: true })
      .first();

    if (row) {
      return decrypt(row.access_token_encrypted, row.token_iv, row.token_auth_tag);
    }

    // Fallback to env var for backwards compatibility
    if (env.clickup.apiToken) {
      return env.clickup.apiToken;
    }

    throw Object.assign(new Error('ClickUp not connected — no OAuth token or API token configured'), { status: 404 });
  }

  /**
   * Disconnect ClickUp OAuth (delete active row)
   */
  async disconnect() {
    const deleted = await db('clickup_oauth_tokens').where({ is_active: true }).del();
    if (!deleted) {
      throw Object.assign(new Error('No active ClickUp connection found'), { status: 404 });
    }
    logger.info('ClickUp OAuth disconnected');
    return { success: true };
  }

  /**
   * Get connection status
   */
  async getConnectionStatus() {
    const row = await db('clickup_oauth_tokens')
      .where({ is_active: true })
      .select('clickup_username', 'clickup_email', 'is_active', 'created_at')
      .first();

    if (!row) {
      // Check if env token is set
      if (env.clickup.apiToken) {
        return { connected: true, source: 'env', username: null, email: null };
      }
      return { connected: false };
    }

    return {
      connected: true,
      source: 'oauth',
      username: row.clickup_username,
      email: row.clickup_email,
      connectedAt: row.created_at,
    };
  }
}

module.exports = new ClickUpOAuthService();
