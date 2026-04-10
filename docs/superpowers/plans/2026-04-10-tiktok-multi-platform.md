# TikTok + Multi-Platform Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add TikTok publishing support and multi-platform architecture so posts can target Instagram, TikTok, or both.

**Architecture:** Each platform gets its own `scheduled_post` row. Posts targeting multiple platforms share a `post_group_id`. TikTok OAuth, publishing, and queue workers mirror the existing Instagram patterns. ClickUp tags pre-select platforms.

**Tech Stack:** Node.js, Knex migrations, BullMQ, TikTok Content Posting API v2, React frontend

**Spec:** `docs/specs/2026-04-09-tiktok-multi-platform-design.md`

---

### Task 1: Database Migrations

**Files:**
- Create: `server/src/database/migrations/028_tiktok_integration.js`

- [ ] **Step 1: Create migration file**

```javascript
// server/src/database/migrations/028_tiktok_integration.js
exports.up = async function (knex) {
  // 1. Add platform + post_group_id to scheduled_posts
  await knex.schema.alterTable('scheduled_posts', (table) => {
    table.string('platform', 20).notNullable().defaultTo('instagram');
    table.uuid('post_group_id').nullable();
    table.string('tiktok_publish_id', 100).nullable();
    table.string('tiktok_permalink', 500).nullable();

    table.index('platform');
    table.index('post_group_id');
  });

  // 2. Create client_tiktok_tokens table
  await knex.schema.createTable('client_tiktok_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('client_id').notNullable().references('id').inTable('clients').onDelete('CASCADE');
    table.string('tiktok_open_id', 255);
    table.string('tiktok_username', 255);
    table.text('access_token_encrypted');
    table.text('token_iv');
    table.text('token_auth_tag');
    table.timestamp('token_expires_at');
    table.text('refresh_token_encrypted');
    table.text('refresh_token_iv');
    table.text('refresh_token_auth_tag');
    table.timestamp('refresh_expires_at');
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);

    table.unique('client_id');
  });

  // 3. Add target_platforms to deliveries
  await knex.schema.alterTable('deliveries', (table) => {
    table.jsonb('target_platforms').defaultTo('["instagram"]');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('deliveries', (table) => {
    table.dropColumn('target_platforms');
  });
  await knex.schema.dropTableIfExists('client_tiktok_tokens');
  await knex.schema.alterTable('scheduled_posts', (table) => {
    table.dropColumn('platform');
    table.dropColumn('post_group_id');
    table.dropColumn('tiktok_publish_id');
    table.dropColumn('tiktok_permalink');
  });
};
```

- [ ] **Step 2: Run migration**

Run: `cd server && npx knex migrate:latest`
Expected: Migration applies, 3 changes (alter scheduled_posts, create client_tiktok_tokens, alter deliveries)

- [ ] **Step 3: Commit**

```bash
git add server/src/database/migrations/028_tiktok_integration.js
git commit -m "feat: add TikTok database schema (tokens table, platform fields, target_platforms)"
```

---

### Task 2: Environment Configuration

**Files:**
- Modify: `server/src/config/env.js`

- [ ] **Step 1: Add TikTok config section**

In `server/src/config/env.js`, add after the `meta` block (after line 51):

```javascript
  tiktok: {
    clientKey: process.env.TIKTOK_CLIENT_KEY,
    clientSecret: process.env.TIKTOK_CLIENT_SECRET,
    redirectUri: process.env.TIKTOK_REDIRECT_URI || 'https://server-production-bea3.up.railway.app/api/tiktok/oauth/callback',
  },
```

- [ ] **Step 2: Commit**

```bash
git add server/src/config/env.js
git commit -m "feat: add TikTok environment configuration"
```

---

### Task 3: TikTok OAuth Service

**Files:**
- Create: `server/src/modules/tiktok/tiktok-oauth.service.js`

- [ ] **Step 1: Create the OAuth service**

```javascript
// server/src/modules/tiktok/tiktok-oauth.service.js
const crypto = require('crypto');
const db = require('../../config/db');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const { encrypt, decrypt } = require('../../utils/encryption');

const TT_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TT_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const TT_REVOKE_URL = 'https://open.tiktokapis.com/v2/oauth/revoke/';
const TT_USERINFO_URL = 'https://open.tiktokapis.com/v2/user/info/';

class TikTokOAuthService {
  getAuthorizationUrl(clientId) {
    const state = Buffer.from(JSON.stringify({
      clientId,
      nonce: crypto.randomBytes(16).toString('hex'),
    })).toString('base64url');

    const params = new URLSearchParams({
      client_key: env.tiktok.clientKey,
      response_type: 'code',
      scope: 'video.publish,user.info.basic',
      redirect_uri: env.tiktok.redirectUri,
      state,
    });

    return `${TT_AUTH_URL}?${params.toString()}`;
  }

  parseState(stateParam) {
    try {
      return JSON.parse(Buffer.from(stateParam, 'base64url').toString());
    } catch {
      throw Object.assign(new Error('Invalid OAuth state'), { status: 400 });
    }
  }

  async handleCallback(code, clientId) {
    // Exchange code for tokens
    const tokenData = await this._exchangeCode(code);

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const openId = tokenData.open_id;
    const accessExpiresIn = tokenData.expires_in || 86400; // 24h
    const refreshExpiresIn = tokenData.refresh_expires_in || 31536000; // 365d

    // Fetch username
    let username = null;
    try {
      const userInfo = await this._getUserInfo(accessToken);
      username = userInfo.display_name || null;
    } catch (err) {
      logger.warn('Could not fetch TikTok user info', { error: err.message });
    }

    // Encrypt tokens
    const accessEnc = encrypt(accessToken);
    const refreshEnc = encrypt(refreshToken);

    const row = {
      client_id: clientId,
      tiktok_open_id: openId,
      tiktok_username: username,
      access_token_encrypted: accessEnc.encrypted,
      token_iv: accessEnc.iv,
      token_auth_tag: accessEnc.authTag,
      token_expires_at: new Date(Date.now() + accessExpiresIn * 1000),
      refresh_token_encrypted: refreshEnc.encrypted,
      refresh_token_iv: refreshEnc.iv,
      refresh_token_auth_tag: refreshEnc.authTag,
      refresh_expires_at: new Date(Date.now() + refreshExpiresIn * 1000),
      is_active: true,
    };

    const existing = await db('client_tiktok_tokens').where({ client_id: clientId }).first();
    if (existing) {
      const [updated] = await db('client_tiktok_tokens')
        .where({ client_id: clientId })
        .update({ ...row, updated_at: new Date() })
        .returning('*');
      logger.info('TikTok connected (updated)', { clientId, username, openId });
      return updated;
    }

    const [created] = await db('client_tiktok_tokens').insert(row).returning('*');
    logger.info('TikTok connected (new)', { clientId, username, openId });
    return created;
  }

  async refreshToken(clientId) {
    const tokenRow = await db('client_tiktok_tokens')
      .where({ client_id: clientId, is_active: true })
      .first();

    if (!tokenRow) {
      throw Object.assign(new Error('TikTok not connected for this client'), { status: 404 });
    }

    const currentRefresh = decrypt(
      tokenRow.refresh_token_encrypted,
      tokenRow.refresh_token_iv,
      tokenRow.refresh_token_auth_tag
    );

    const form = new URLSearchParams({
      client_key: env.tiktok.clientKey,
      client_secret: env.tiktok.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: currentRefresh,
    });

    const res = await fetch(TT_TOKEN_URL, {
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
      throw Object.assign(new Error('TikTok token refresh failed — reconnection required'), { status: 502 });
    }

    const data = await res.json();
    const accessEnc = encrypt(data.access_token);
    const refreshEnc = encrypt(data.refresh_token);

    const [updated] = await db('client_tiktok_tokens')
      .where({ client_id: clientId })
      .update({
        access_token_encrypted: accessEnc.encrypted,
        token_iv: accessEnc.iv,
        token_auth_tag: accessEnc.authTag,
        token_expires_at: new Date(Date.now() + (data.expires_in || 86400) * 1000),
        refresh_token_encrypted: refreshEnc.encrypted,
        refresh_token_iv: refreshEnc.iv,
        refresh_token_auth_tag: refreshEnc.authTag,
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
    const row = await db('client_tiktok_tokens')
      .where({ client_id: clientId, is_active: true })
      .first();

    if (!row) {
      throw Object.assign(new Error('No TikTok connection found'), { status: 404 });
    }

    // Revoke token
    try {
      const token = decrypt(row.access_token_encrypted, row.token_iv, row.token_auth_tag);
      await fetch(TT_REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: env.tiktok.clientKey,
          client_secret: env.tiktok.clientSecret,
          token,
        }),
      });
    } catch (err) {
      logger.warn('TikTok token revocation failed', { clientId, error: err.message });
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

    const res = await fetch(TT_TOKEN_URL, {
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
    logger.info('TikTok code exchange successful', { openId: data.open_id });
    return data;
  }

  async _getUserInfo(accessToken) {
    const res = await fetch(`${TT_USERINFO_URL}?fields=display_name,avatar_url`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to fetch TikTok user info');
    }
    const data = await res.json();
    return data.data?.user || {};
  }
}

module.exports = new TikTokOAuthService();
```

- [ ] **Step 2: Commit**

```bash
git add server/src/modules/tiktok/tiktok-oauth.service.js
git commit -m "feat: add TikTok OAuth service (auth, callback, refresh, revoke)"
```

---

### Task 4: TikTok Controller + Routes

**Files:**
- Create: `server/src/modules/tiktok/tiktok.controller.js`
- Create: `server/src/modules/tiktok/tiktok.routes.js`

- [ ] **Step 1: Create the controller**

```javascript
// server/src/modules/tiktok/tiktok.controller.js
const oauthService = require('./tiktok-oauth.service');
const env = require('../../config/env');
const logger = require('../../utils/logger');

class TikTokController {
  async getOAuthUrl(req, res, next) {
    try {
      const url = oauthService.getAuthorizationUrl(req.params.clientId);
      res.json({ url });
    } catch (err) {
      next(err);
    }
  }

  async oauthCallback(req, res, next) {
    try {
      const { code, state, error: oauthError } = req.query;

      if (oauthError) {
        logger.warn('TikTok OAuth denied', { error: oauthError });
        const baseUrl = (env.clientUrl || 'http://localhost:4401').split(',')[0].trim();
        return res.redirect(`${baseUrl}/clients?tiktok=denied`);
      }

      const { clientId } = oauthService.parseState(state);
      await oauthService.handleCallback(code, clientId);

      const baseUrl = (env.clientUrl || 'http://localhost:4401').split(',')[0].trim();
      res.redirect(`${baseUrl}/clients/${clientId}?tiktok=connected`);
    } catch (err) {
      next(err);
    }
  }

  async getConnectionStatus(req, res, next) {
    try {
      const status = await oauthService.getConnectionStatus(req.params.clientId);
      res.json(status);
    } catch (err) {
      next(err);
    }
  }

  async disconnect(req, res, next) {
    try {
      const result = await oauthService.disconnectClient(req.params.clientId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new TikTokController();
```

- [ ] **Step 2: Create the routes**

```javascript
// server/src/modules/tiktok/tiktok.routes.js
const express = require('express');
const { authenticate, managementLevel } = require('../../middleware/auth');
const controller = require('./tiktok.controller');

const router = express.Router();

// Public: OAuth callback (TikTok redirects here)
router.get('/oauth/callback', controller.oauthCallback.bind(controller));

// Authenticated routes
router.use(authenticate);

router.get('/oauth/url/:clientId', managementLevel, controller.getOAuthUrl.bind(controller));
router.get('/oauth/status/:clientId', controller.getConnectionStatus.bind(controller));
router.delete('/oauth/:clientId', managementLevel, controller.disconnect.bind(controller));

module.exports = router;
```

- [ ] **Step 3: Register in app.js**

In `server/src/app.js`, add after line 24:
```javascript
const tiktokRoutes = require('./modules/tiktok/tiktok.routes');
```

Add after line 95 (`app.use('/api/instagram', instagramRoutes);`):
```javascript
app.use('/api/tiktok', tiktokRoutes);
```

- [ ] **Step 4: Commit**

```bash
git add server/src/modules/tiktok/tiktok.controller.js server/src/modules/tiktok/tiktok.routes.js server/src/app.js
git commit -m "feat: add TikTok OAuth routes and controller"
```

---

### Task 5: TikTok Publish Service

**Files:**
- Create: `server/src/modules/tiktok/tiktok-publish.service.js`

- [ ] **Step 1: Create the publish service**

```javascript
// server/src/modules/tiktok/tiktok-publish.service.js
const db = require('../../config/db');
const logger = require('../../utils/logger');
const eventBus = require('../../utils/event-bus');
const tiktokOAuth = require('./tiktok-oauth.service');

const TT_API = 'https://open.tiktokapis.com/v2';

class TikTokPublishService {
  async executeScheduledPost(postId) {
    const post = await db('scheduled_posts').where({ id: postId }).first();
    if (!post) throw new Error(`Post ${postId} not found`);
    if (post.status === 'published') return;
    if (post.platform !== 'tiktok') throw new Error(`Post ${postId} is not a TikTok post`);

    await db('scheduled_posts').where({ id: postId }).update({ status: 'publishing', updated_at: new Date() });

    try {
      const token = await tiktokOAuth.getDecryptedToken(post.client_id);
      const mediaUrls = typeof post.media_urls === 'string' ? JSON.parse(post.media_urls) : (post.media_urls || []);
      const caption = post.caption || '';

      let result;
      const isVideo = ['reel', 'video'].includes(post.post_type) ||
        (mediaUrls.length > 0 && mediaUrls.every((m) => m.type === 'video'));

      if (isVideo) {
        const videoUrl = mediaUrls.find((m) => m.type === 'video')?.url;
        if (!videoUrl) throw new Error('No video URL found for TikTok video post');
        result = await this.publishVideo(token, videoUrl, caption);
      } else {
        const imageUrls = mediaUrls.filter((m) => m.type === 'image').map((m) => m.url);
        if (imageUrls.length === 0) throw new Error('No image URLs found for TikTok photo post');
        const coverIndex = 0;
        result = await this.publishPhoto(token, imageUrls, caption, coverIndex);
      }

      // Poll until published
      const finalStatus = await this.pollPublishStatus(token, result.publish_id);

      const [updated] = await db('scheduled_posts')
        .where({ id: postId })
        .update({
          status: 'published',
          tiktok_publish_id: result.publish_id,
          published_at: new Date(),
          updated_at: new Date(),
        })
        .returning('*');

      logger.info('TikTok post published', { postId, publishId: result.publish_id });
      eventBus.emit('sse', { type: 'post:updated', payload: { id: postId, status: 'published' } });

      // Move ClickUp task if linked
      if (post.clickup_task_id) {
        try {
          const clickupService = require('../webhooks/clickup.service');
          await clickupService._moveClickUpTask
            ? clickupService._moveClickUpTask(post.clickup_task_id, 'publicação')
            : null;
        } catch (err) {
          logger.warn('Failed to move ClickUp task after TikTok publish', { error: err.message });
        }
      }

      // Update delivery if linked
      if (post.delivery_id) {
        await db('deliveries')
          .where({ id: post.delivery_id })
          .update({ status: 'publicacao', updated_at: new Date() });
        eventBus.emit('sse', { type: 'delivery:updated', payload: { id: post.delivery_id } });
      }

      return updated;
    } catch (err) {
      const retryCount = (post.retry_count || 0) + 1;
      const newStatus = retryCount > 2 ? 'failed' : 'scheduled';

      await db('scheduled_posts')
        .where({ id: postId })
        .update({
          status: newStatus,
          error_message: err.message,
          retry_count: retryCount,
          updated_at: new Date(),
        });

      logger.error('TikTok publish failed', { postId, attempt: retryCount, error: err.message });
      eventBus.emit('sse', { type: 'post:updated', payload: { id: postId, status: newStatus } });
      throw err;
    }
  }

  async publishVideo(token, videoUrl, caption, privacyLevel = 'PUBLIC_TO_EVERYONE') {
    const body = {
      post_info: {
        title: caption.slice(0, 2200),
        privacy_level: privacyLevel,
        disable_comment: false,
        disable_duet: false,
        disable_stitch: false,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: videoUrl,
      },
    };

    const res = await fetch(`${TT_API}/post/publish/video/init/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (data.error?.code !== 'ok') {
      throw new Error(`TikTok video init failed: ${data.error?.code} - ${data.error?.message}`);
    }

    logger.info('TikTok video init success', { publishId: data.data?.publish_id });
    return data.data;
  }

  async publishPhoto(token, photoUrls, caption, coverIndex = 0, privacyLevel = 'PUBLIC_TO_EVERYONE') {
    const body = {
      media_type: 'PHOTO',
      post_mode: 'DIRECT_POST',
      post_info: {
        title: caption.slice(0, 90),
        description: caption.slice(0, 4000),
        privacy_level: privacyLevel,
        disable_comment: false,
      },
      source_info: {
        photo_images: photoUrls,
        photo_cover_index: coverIndex,
      },
    };

    const res = await fetch(`${TT_API}/post/publish/content/init/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (data.error?.code !== 'ok') {
      throw new Error(`TikTok photo init failed: ${data.error?.code} - ${data.error?.message}`);
    }

    logger.info('TikTok photo init success', { publishId: data.data?.publish_id });
    return data.data;
  }

  async queryCreatorInfo(token) {
    const res = await fetch(`${TT_API}/post/publish/creator_info/query/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
    });

    const data = await res.json();
    if (data.error?.code !== 'ok') {
      throw new Error(`TikTok creator info failed: ${data.error?.code} - ${data.error?.message}`);
    }

    return data.data;
  }

  async pollPublishStatus(token, publishId, maxAttempts = 15) {
    const delays = [5000, 10000, 20000, 30000, 60000]; // escalating

    for (let i = 0; i < maxAttempts; i++) {
      const delay = delays[Math.min(i, delays.length - 1)];
      await new Promise((r) => setTimeout(r, delay));

      const res = await fetch(`${TT_API}/post/publish/status/fetch/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({ publish_id: publishId }),
      });

      const data = await res.json();
      const status = data.data?.status;

      logger.info('TikTok publish status poll', { publishId, attempt: i + 1, status });

      if (status === 'PUBLISH_COMPLETE') return data.data;
      if (status === 'FAILED' || data.error?.code !== 'ok') {
        throw new Error(`TikTok publish failed: ${data.data?.fail_reason || data.error?.message || 'unknown'}`);
      }
      // PROCESSING_UPLOAD, PROCESSING_DOWNLOAD — continue polling
    }

    throw new Error(`TikTok publish timed out after ${maxAttempts} attempts`);
  }
}

module.exports = new TikTokPublishService();
```

- [ ] **Step 2: Commit**

```bash
git add server/src/modules/tiktok/tiktok-publish.service.js
git commit -m "feat: add TikTok publish service (video, photo, carousel, status polling)"
```

---

### Task 6: TikTok BullMQ Queue + Worker

**Files:**
- Modify: `server/src/queues/index.js`
- Create: `server/src/queues/tiktok-publish.worker.js`
- Modify: `server/src/queues/token-refresh.worker.js`
- Modify: `server/src/app.js`

- [ ] **Step 1: Add TikTok queue to index.js**

In `server/src/queues/index.js`, add after line 10:
```javascript
const tiktokPublishQueue = new Queue('tiktok-publish', { connection });
```

Update `schedulePost` function to accept platform and route to correct queue. Replace the existing `schedulePost` function (lines 15-25):

```javascript
async function schedulePost(postId, scheduledAt, platform = 'instagram') {
  const delay = new Date(scheduledAt).getTime() - Date.now();
  const jobId = `post-${postId}-${Date.now()}`;
  const queue = platform === 'tiktok' ? tiktokPublishQueue : instagramPublishQueue;
  if (delay <= 0) {
    await queue.add('publish', { postId }, { jobId });
  } else {
    await queue.add('publish', { postId }, { delay, jobId });
  }
  logger.info('Post scheduled in queue', { postId, platform, delay: Math.round(delay / 1000) + 's' });
}
```

Update `cancelScheduledPost` to check both queues. Replace lines 27-47:

```javascript
async function cancelScheduledPost(postId) {
  const queues = [instagramPublishQueue, tiktokPublishQueue];
  for (const queue of queues) {
    try {
      const states = ['delayed', 'waiting', 'active'];
      for (const state of states) {
        const jobs = await queue.getJobs([state]);
        for (const job of jobs) {
          if (job.data?.postId === postId) {
            try {
              await job.remove();
              logger.info('Scheduled post removed from queue', { postId, jobId: job.id, state });
            } catch {
              // Job may be locked by active worker
            }
          }
        }
      }
    } catch (err) {
      logger.warn('Could not remove scheduled job', { postId, error: err.message });
    }
  }
}
```

Add `tiktokPublishQueue` to module.exports:
```javascript
module.exports = {
  instagramPublishQueue,
  tiktokPublishQueue,
  tokenRefreshQueue,
  // ... rest unchanged
};
```

- [ ] **Step 2: Create TikTok publish worker**

```javascript
// server/src/queues/tiktok-publish.worker.js
const { Worker } = require('bullmq');
const logger = require('../utils/logger');
const publishService = require('../modules/tiktok/tiktok-publish.service');
const { connection } = require('./index');

const worker = new Worker('tiktok-publish', async (job) => {
  const { postId } = job.data;
  logger.info('Processing TikTok publish job', { postId, jobId: job.id });
  await publishService.executeScheduledPost(postId);
}, {
  connection,
  concurrency: 1,
  limiter: {
    max: 5,
    duration: 60 * 1000,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 30000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
});

worker.on('completed', (job) => {
  logger.info('TikTok publish job completed', { jobId: job.id, postId: job.data.postId });
});

worker.on('failed', (job, err) => {
  logger.error('TikTok publish job failed', { jobId: job?.id, postId: job?.data?.postId, error: err.message });
});

module.exports = worker;
```

- [ ] **Step 3: Add TikTok token refresh to token-refresh.worker.js**

In `server/src/queues/token-refresh.worker.js`, add after the Instagram refresh block inside the worker handler:

```javascript
  // TikTok token refresh
  try {
    const tiktokOAuth = require('../modules/tiktok/tiktok-oauth.service');
    const tiktokTokens = await tiktokOAuth.getTokensExpiringWithin(1);
    logger.info(`Found ${tiktokTokens.length} TikTok tokens to refresh`);

    for (const token of tiktokTokens) {
      try {
        await tiktokOAuth.refreshToken(token.client_id);
        logger.info('TikTok token refreshed', { clientId: token.client_id });
      } catch (err) {
        logger.error('TikTok token refresh failed', { clientId: token.client_id, error: err.message });
      }
    }
  } catch (err) {
    logger.error('TikTok token refresh block failed', { error: err.message });
  }
```

- [ ] **Step 4: Register worker in app.js**

In `server/src/app.js`, add after line 110 (`require('./queues/instagram-publish.worker');`):
```javascript
  require('./queues/tiktok-publish.worker');
```

- [ ] **Step 5: Commit**

```bash
git add server/src/queues/index.js server/src/queues/tiktok-publish.worker.js server/src/queues/token-refresh.worker.js server/src/app.js
git commit -m "feat: add TikTok BullMQ queue, publish worker, and token refresh"
```

---

### Task 7: Multi-Platform Scheduling (Controller + Validation)

**Files:**
- Modify: `server/src/modules/instagram/instagram.controller.js`
- Modify: `server/src/modules/instagram/instagram.validation.js`

- [ ] **Step 1: Update validation to accept platform fields**

In `server/src/modules/instagram/instagram.validation.js`, update the `createScheduledPostSchema` to add:

```javascript
  platform: Joi.string().valid('instagram', 'tiktok').default('instagram'),
  platforms: Joi.array().items(Joi.string().valid('instagram', 'tiktok')).optional(),
  platform_overrides: Joi.object().pattern(
    Joi.string().valid('instagram', 'tiktok'),
    Joi.object({
      caption: Joi.string().max(2200).optional(),
      scheduled_at: Joi.date().iso().optional(),
    })
  ).optional(),
```

- [ ] **Step 2: Update createScheduledPost in controller**

In `server/src/modules/instagram/instagram.controller.js`, replace the `createScheduledPost` method to support multi-platform:

```javascript
  async createScheduledPost(req, res, next) {
    try {
      const { error, value } = createScheduledPostSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const platforms = value.platforms || [value.platform || 'instagram'];
      const overrides = value.platform_overrides || {};
      const postGroupId = platforms.length > 1 ? crypto.randomUUID() : null;

      const createdPosts = [];

      for (const platform of platforms) {
        // Skip story for TikTok
        if (platform === 'tiktok' && value.post_type === 'story') continue;

        const platformOverride = overrides[platform] || {};
        const caption = platformOverride.caption || value.caption;
        const scheduledAt = platformOverride.scheduled_at || value.scheduled_at;

        const postData = {
          client_id: value.client_id,
          delivery_id: value.delivery_id || null,
          clickup_task_id: value.clickup_task_id || null,
          caption,
          post_type: value.post_type,
          media_urls: JSON.stringify(value.media_urls),
          thumbnail_url: value.thumbnail_url || null,
          scheduled_at: scheduledAt || null,
          platform,
          post_group_id: postGroupId,
          status: scheduledAt ? 'scheduled' : 'draft',
          created_by: req.user.id,
        };

        const [post] = await db('scheduled_posts').insert(postData).returning('*');

        if (post.status === 'scheduled' && post.scheduled_at) {
          await schedulePost(post.id, post.scheduled_at, platform);
          this._moveToAgendado(post);
        }

        createdPosts.push(post);
      }

      res.status(201).json(createdPosts.length === 1 ? createdPosts[0] : createdPosts);
    } catch (err) {
      next(err);
    }
  }
```

Add `const crypto = require('crypto');` at the top of the file if not already imported.

- [ ] **Step 3: Update schedulePost import to pass platform**

In `server/src/modules/instagram/instagram.controller.js`, update the existing scheduling calls in `updateScheduledPost` to pass platform:

Replace:
```javascript
await reschedulePost(updated.id, updated.scheduled_at);
```
With:
```javascript
await reschedulePost(updated.id, updated.scheduled_at, updated.platform);
```

And in `reschedulePost` in `queues/index.js`, update to accept platform:
```javascript
async function reschedulePost(postId, newScheduledAt, platform = 'instagram') {
  await cancelScheduledPost(postId);
  await schedulePost(postId, newScheduledAt, platform);
}
```

- [ ] **Step 4: Commit**

```bash
git add server/src/modules/instagram/instagram.controller.js server/src/modules/instagram/instagram.validation.js server/src/queues/index.js
git commit -m "feat: multi-platform scheduling support (create posts for instagram + tiktok)"
```

---

### Task 8: ClickUp Sync - Platform Tags

**Files:**
- Modify: `server/src/modules/webhooks/clickup.service.js`
- Modify: `server/src/modules/webhooks/clickup-sync.service.js`

- [ ] **Step 1: Add platform tag mapping to clickup.service.js**

Add after the `PUBLISHABLE_FORMATS` constant at the top of `clickup.service.js`:

```javascript
const PLATFORM_TAGS = {
  'instagram': 'instagram', 'insta': 'instagram', 'ig': 'instagram',
  'tiktok': 'tiktok', 'tik tok': 'tiktok', 'tt': 'tiktok',
};

function extractPlatformsFromTags(tags) {
  if (!tags || !Array.isArray(tags)) return ['instagram'];
  const platforms = new Set();
  for (const tag of tags) {
    const name = (tag.name || tag).toLowerCase().trim();
    if (PLATFORM_TAGS[name]) {
      platforms.add(PLATFORM_TAGS[name]);
    }
  }
  return platforms.size > 0 ? [...platforms] : ['instagram'];
}
```

- [ ] **Step 2: Update autoCreateDelivery to save target_platforms**

In the `autoCreateDelivery` method, where it does `db('deliveries').insert({...})`, add:

```javascript
target_platforms: JSON.stringify(extractPlatformsFromTags(task.tags)),
```

- [ ] **Step 3: Update autoCreateScheduledPost to create per platform**

In `autoCreateScheduledPost`, after determining media/caption/postType, replace the single insert with a loop:

```javascript
      const platforms = delivery.target_platforms
        ? (typeof delivery.target_platforms === 'string' ? JSON.parse(delivery.target_platforms) : delivery.target_platforms)
        : ['instagram'];
      const postGroupId = platforms.length > 1 ? crypto.randomUUID() : null;

      for (const platform of platforms) {
        // Skip story for TikTok
        if (platform === 'tiktok' && postType === 'story') continue;

        // Check platform token exists
        const tokenTable = platform === 'tiktok' ? 'client_tiktok_tokens' : 'client_instagram_tokens';
        const platformToken = await db(tokenTable)
          .where({ client_id: delivery.client_id, is_active: true })
          .first();
        if (!platformToken) {
          logger.info(`Client ${delivery.client_id} has no ${platform} connected — skipping auto-draft`);
          continue;
        }

        const existing = await db('scheduled_posts')
          .where({ delivery_id: delivery.id, platform })
          .whereIn('status', ['draft', 'scheduled'])
          .first();

        if (existing) {
          // Update existing
          await db('scheduled_posts').where({ id: existing.id }).update({
            caption, media_urls: JSON.stringify(mediaUrls), thumbnail_url: thumbnailUrl,
            post_type: postType, scheduled_at: scheduledAt, post_group_id: postGroupId,
            updated_at: new Date(),
          });
        } else {
          // Create new
          await db('scheduled_posts').insert({
            client_id: delivery.client_id,
            delivery_id: delivery.id,
            clickup_task_id: clickupTaskId,
            caption, post_type: postType,
            media_urls: JSON.stringify(mediaUrls),
            thumbnail_url: thumbnailUrl,
            scheduled_at: scheduledAt,
            status: scheduledAt ? 'scheduled' : 'draft',
            platform, post_group_id: postGroupId,
            created_by: userId,
          });
        }
      }
```

Add `const crypto = require('crypto');` at the top if not already imported.

- [ ] **Step 4: Update handleTaskUpdated to sync tags**

In `handleTaskUpdated`, where it processes field changes, add handling for tag changes:

```javascript
      if (item.field === 'tag' || item.field === 'tags') {
        const platforms = extractPlatformsFromTags(task.tags);
        updates.target_platforms = JSON.stringify(platforms);
      }
```

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/webhooks/clickup.service.js server/src/modules/webhooks/clickup-sync.service.js
git commit -m "feat: ClickUp tag sync for target platforms (instagram/tiktok)"
```

---

### Task 9: Frontend - TikTok Service + Platform Selector in Form

**Files:**
- Create: `client/src/services/tiktok.js`
- Modify: `client/src/components/instagram/ScheduledPostForm.jsx`

- [ ] **Step 1: Create TikTok frontend service**

```javascript
// client/src/services/tiktok.js
import api from './api';

export const getOAuthUrl = (clientId) =>
  api.get(`/tiktok/oauth/url/${clientId}`).then((r) => r.data);

export const getConnectionStatus = (clientId) =>
  api.get(`/tiktok/oauth/status/${clientId}`).then((r) => r.data);

export const disconnectTikTok = (clientId) =>
  api.delete(`/tiktok/oauth/${clientId}`).then((r) => r.data);
```

- [ ] **Step 2: Add platform selector to ScheduledPostForm**

In `client/src/components/instagram/ScheduledPostForm.jsx`:

Add to imports:
```javascript
import { Instagram } from 'lucide-react';
```

Add platforms to form state (inside the `useState` block, after `scheduled_at`):
```javascript
    platforms: ['instagram'],
    tiktok_caption: '',
    tiktok_scheduled_at: '',
    customize_caption: false,
    customize_schedule: false,
```

Add platform selector UI after the client select and before post type. Add this JSX block:

```jsx
            {/* Platforms */}
            <div className="space-y-1.5">
              <Label>Plataformas</Label>
              <div className="flex gap-1.5">
                {[
                  { value: 'instagram', label: 'Instagram' },
                  { value: 'tiktok', label: 'TikTok' },
                ].map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setForm((f) => {
                        const has = f.platforms.includes(value);
                        const next = has
                          ? f.platforms.filter((p) => p !== value)
                          : [...f.platforms, value];
                        return { ...f, platforms: next.length > 0 ? next : f.platforms };
                      });
                    }}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer',
                      form.platforms.includes(value)
                        ? 'bg-[#9A48EA]/15 text-[#C084FC] ring-1 ring-[#9A48EA]/30'
                        : 'bg-muted/50 text-muted-foreground hover:bg-surface-3/50'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
```

Update `handleSubmit` to send `platforms` and overrides:

```javascript
      const payload = {
        ...form,
        platforms: form.platforms,
        status: asDraft ? 'draft' : 'scheduled',
        thumbnail_url: form.post_type === 'reel' ? (form.thumbnail_url || null) : null,
        media_urls: JSON.stringify(form.media_urls),
      };

      // Add platform overrides if customized
      if (form.platforms.length > 1) {
        const overrides = {};
        if (form.customize_caption && form.tiktok_caption) {
          overrides.tiktok = { ...overrides.tiktok, caption: form.tiktok_caption };
        }
        if (form.customize_schedule && form.tiktok_scheduled_at) {
          overrides.tiktok = { ...overrides.tiktok, scheduled_at: form.tiktok_scheduled_at };
        }
        if (Object.keys(overrides).length > 0) {
          payload.platform_overrides = overrides;
        }
      }

      // Remove internal fields
      delete payload.tiktok_caption;
      delete payload.tiktok_scheduled_at;
      delete payload.customize_caption;
      delete payload.customize_schedule;
```

- [ ] **Step 3: Add customize toggles for multi-platform**

After the caption textarea, add conditionally:

```jsx
            {/* TikTok overrides */}
            {form.platforms.length > 1 && form.platforms.includes('tiktok') && (
              <div className="space-y-3 p-3 rounded-lg bg-card border border-border">
                <span className="text-xs font-medium text-muted-foreground">Personalizar TikTok</span>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.customize_caption}
                    onChange={(e) => setForm((f) => ({ ...f, customize_caption: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-xs text-muted-foreground">Legenda diferente</span>
                </label>
                {form.customize_caption && (
                  <textarea
                    value={form.tiktok_caption}
                    onChange={(e) => setForm((f) => ({ ...f, tiktok_caption: e.target.value.slice(0, 2200) }))}
                    rows={3}
                    className="w-full rounded-lg border border-border bg-transparent px-2.5 py-2 text-sm text-foreground resize-none focus:border-primary focus:ring-3 focus:ring-primary/50 outline-none"
                    placeholder="Legenda do TikTok..."
                  />
                )}

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.customize_schedule}
                    onChange={(e) => setForm((f) => ({ ...f, customize_schedule: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-xs text-muted-foreground">Horario diferente</span>
                </label>
                {form.customize_schedule && (
                  <DateTimePicker
                    value={form.tiktok_scheduled_at}
                    onChange={(v) => setForm((f) => ({ ...f, tiktok_scheduled_at: v }))}
                  />
                )}
              </div>
            )}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/services/tiktok.js client/src/components/instagram/ScheduledPostForm.jsx
git commit -m "feat: frontend platform selector and TikTok service"
```

---

### Task 10: Frontend - Calendar Platform Badges + Filter

**Files:**
- Modify: `client/src/pages/ScheduleCalendarPage.jsx`

- [ ] **Step 1: Add platform badge to post chips**

In `ScheduleCalendarPage.jsx`, where post chips are rendered (around line 249), add a platform indicator after the thumbnail:

```jsx
{p.platform === 'tiktok' && (
  <span className="text-[8px] font-bold text-muted-foreground shrink-0">TK</span>
)}
```

And in the detail panel (around line 300), add platform badge:

```jsx
<span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
  p.platform === 'tiktok' ? 'bg-pink-500/15 text-pink-400' : 'bg-purple-500/15 text-purple-400'
}`}>
  {p.platform === 'tiktok' ? 'TikTok' : 'Instagram'}
</span>
```

- [ ] **Step 2: Add platform filter**

Add platform filter state:
```javascript
const [platformFilter, setPlatformFilter] = useState('all');
```

Add filter select in the header area, and filter the posts:
```javascript
const filteredPosts = posts.filter((p) =>
  (platformFilter === 'all' || p.platform === platformFilter)
);
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/ScheduleCalendarPage.jsx
git commit -m "feat: platform badges and filter on schedule calendar"
```

---

### Task 11: Frontend - Client TikTok Connection

**Files:**
- Modify: client component where Instagram connect button exists (find the client detail/settings page)

- [ ] **Step 1: Find and update client settings page**

Search for the Instagram connect button component. Add a TikTok connect button alongside it using the same pattern:

```jsx
// TikTok connection
const [tiktokStatus, setTiktokStatus] = useState(null);

useEffect(() => {
  getConnectionStatus(clientId).then(setTiktokStatus);
}, [clientId]);

// In JSX, alongside Instagram button:
{tiktokStatus?.connected ? (
  <div className="flex items-center gap-2">
    <span className="text-xs text-muted-foreground">TikTok: @{tiktokStatus.username}</span>
    <Button variant="ghost" size="sm" onClick={() => disconnectTikTok(clientId)}>
      Desconectar
    </Button>
  </div>
) : (
  <Button size="sm" onClick={async () => {
    const { url } = await getOAuthUrl(clientId);
    window.location.href = url;
  }}>
    Conectar TikTok
  </Button>
)}
```

- [ ] **Step 2: Commit**

```bash
git add <modified-file>
git commit -m "feat: TikTok connect/disconnect button on client page"
```

---

### Task 12: Approval Flow - Platform Selection

**Files:**
- Modify: `client/src/components/approvals/ApprovalReviewSheet.jsx`
- Modify: `server/src/modules/approvals/approvals.service.js`

- [ ] **Step 1: Add platform badges to ApprovalReviewSheet**

In `ApprovalReviewSheet.jsx`, add platform state and selector. After the post type badge in SheetDescription:

```jsx
{delivery?.target_platforms && (
  <span className="ml-2 text-xs text-muted-foreground">
    {(typeof delivery.target_platforms === 'string'
      ? JSON.parse(delivery.target_platforms)
      : delivery.target_platforms
    ).map((p) => p === 'tiktok' ? 'TikTok' : 'Instagram').join(' + ')}
  </span>
)}
```

- [ ] **Step 2: Update smApprove to create per platform**

In `server/src/modules/approvals/approvals.service.js`, in the `smApprove` method, update the scheduled_post creation to loop over `delivery.target_platforms`:

```javascript
    const platforms = delivery.target_platforms
      ? (typeof delivery.target_platforms === 'string' ? JSON.parse(delivery.target_platforms) : delivery.target_platforms)
      : ['instagram'];
    const postGroupId = platforms.length > 1 ? require('crypto').randomUUID() : null;

    for (const platform of platforms) {
      if (platform === 'tiktok' && postData.post_type === 'story') continue;

      const existingPost = await db('scheduled_posts')
        .where({ delivery_id: deliveryId, platform })
        .first();

      if (existingPost) {
        await db('scheduled_posts')
          .where({ id: existingPost.id })
          .update({ ...postData, platform, post_group_id: postGroupId });
      } else {
        await db('scheduled_posts').insert({
          client_id: delivery.client_id,
          delivery_id: deliveryId,
          clickup_task_id: delivery.clickup_task_id || null,
          status: 'draft',
          created_by: userId,
          platform,
          post_group_id: postGroupId,
          ...postData,
        });
      }
    }
```

- [ ] **Step 3: Update listSmPending to include target_platforms**

In `listSmPending` query, add `'deliveries.target_platforms'` to the select clause.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/approvals/ApprovalReviewSheet.jsx server/src/modules/approvals/approvals.service.js
git commit -m "feat: multi-platform support in approval flow"
```

---

### Task 13: Final Integration + Smoke Test

- [ ] **Step 1: Verify all files exist and server starts**

Run: `cd server && node -e "require('./src/app');" && echo "OK"`

- [ ] **Step 2: Run migration on production**

Ensure migration 028 runs on deploy.

- [ ] **Step 3: Set environment variables on Railway**

```
TIKTOK_CLIENT_KEY=<from TikTok Developer Portal>
TIKTOK_CLIENT_SECRET=<from TikTok Developer Portal>
TIKTOK_REDIRECT_URI=https://server-production-bea3.up.railway.app/api/tiktok/oauth/callback
```

- [ ] **Step 4: Smoke test checklist**

1. OAuth: Connect a TikTok account via client settings
2. Schedule: Create a post with platforms = ["instagram", "tiktok"]
3. Verify: 2 scheduled_posts created with same post_group_id
4. Calendar: Both posts visible with platform badges
5. Publish: TikTok post publishes via worker

- [ ] **Step 5: Final commit**

```bash
git commit -m "feat: TikTok integration complete - OAuth, publishing, multi-platform scheduling"
```
