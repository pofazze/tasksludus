# YouTube Phase 1 — Publish Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add YouTube as a third publishing platform — OAuth channel connect, resumable video upload via YouTube Data API v3, custom thumbnail, Shorts auto-detection with manual override, and native `publishAt` scheduling.

**Architecture:** A new `youtube` module mirrors the existing `tiktok` module: OAuth service (Google OAuth 2.0 → encrypted tokens in `client_youtube_tokens`), publish service (download video → resumable upload → set thumbnail → poll status), BullMQ worker (`youtube-publish` queue). The `schedulePost` router gains a YouTube branch. Shorts are detected by `post_type` (no ffprobe dependency). YouTube's native `publishAt` handles scheduling — the worker uploads immediately with `privacyStatus: 'private'` + future `publishAt`, and YouTube auto-publishes.

**Tech Stack:** Node.js / Express / Knex (Postgres) / BullMQ / Google OAuth 2.0 / YouTube Data API v3 / Jest + supertest / React (Vite).

---

## File Structure

| File | Role |
|---|---|
| `server/src/database/migrations/031_youtube_integration.js` (NEW) | `client_youtube_tokens` table + `scheduled_posts.youtube_video_id` / `youtube_permalink` columns. |
| `server/src/config/env.js` (MODIFY) | Add `youtube` config block. |
| `server/src/modules/instagram/instagram.validation.js` (MODIFY) | Add `'youtube'` as valid platform, `'yt_video'` as post type. |
| `server/src/modules/webhooks/clickup.service.js` (MODIFY) | Add `youtube`/`yt` to `extractPlatformsFromTags`. |
| `server/src/modules/youtube/youtube-oauth.service.js` (NEW) | Google OAuth: auth URL, callback, token CRUD, refresh, disconnect. |
| `server/src/modules/youtube/youtube-oauth.service.test.js` (NEW) | Unit tests for OAuth service. |
| `server/src/modules/youtube/youtube.controller.js` (NEW) | HTTP handlers for OAuth + status. |
| `server/src/modules/youtube/youtube.routes.js` (NEW) | Route registration. |
| `server/src/modules/youtube/youtube.routes.test.js` (NEW) | Supertest integration. |
| `server/src/modules/youtube/youtube-publish.service.js` (NEW) | Resumable upload + thumbnail + Short detection + group-ready check. |
| `server/src/modules/youtube/youtube-publish.service.test.js` (NEW) | Unit tests for publish logic. |
| `server/src/queues/youtube-publish.worker.js` (NEW) | BullMQ worker. |
| `server/src/queues/index.js` (MODIFY) | Add `youtubePublishQueue` + update `schedulePost` routing. |
| `server/src/queues/token-refresh.worker.js` (MODIFY) | Add YouTube refresh block. |
| `server/src/app.js` (MODIFY) | Mount YouTube routes + require worker. |
| `server/src/modules/notifications/notifications.service.js` (MODIFY) | Extend permalink ternary for YouTube. |
| `client/src/pages/ClientProfilePage.jsx` (MODIFY) | YouTube connection card. |
| `client/src/components/instagram/ScheduledPostForm.jsx` (MODIFY) | YouTube platform toggle + `yt_video` post type. |
| `client/src/components/instagram/PostReviewSheet.jsx` (MODIFY) | YouTube platform toggle + `yt_video` post type. |
| `client/src/services/tiktok.js` or `youtube.js` (NEW) | Axios wrappers for YouTube OAuth endpoints. |

---

## Context the engineer needs

- Spec: `docs/superpowers/specs/2026-04-17-youtube-integration-design.md`.
- Template files: the TikTok integration is the closest parallel. `tiktok-oauth.service.js`, `tiktok.controller.js`, `tiktok.routes.js`, `tiktok-publish.service.js`, `tiktok-publish.worker.js` are the templates to follow.
- Google OAuth 2.0 endpoints: auth `https://accounts.google.com/o/oauth2/v2/auth`, token exchange `https://oauth2.googleapis.com/token`, token refresh same URL with `grant_type=refresh_token`.
- YouTube Data API v3 endpoints: resumable upload init `POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`, thumbnail `POST https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=X`, channel info `GET https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true`.
- Scopes: `https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube`.
- Token encryption: uses the same `encrypt()`/`decrypt()` from `server/src/utils/encryption.js` that TikTok and Instagram use, driven by `TOKEN_ENCRYPTION_KEY` env var.
- `req.user` shape: `{ id, name, email, role, producer_type, ... }`.
- The existing `schedulePost(postId, scheduledAt, platform)` in `queues/index.js` currently uses a ternary for platform routing. Change to a map.
- Google refresh tokens do NOT expire unless revoked. Only access tokens expire (1h).

---

### Task 1: Migration + config + platform registration

**Files:**
- Create: `server/src/database/migrations/031_youtube_integration.js`
- Modify: `server/src/config/env.js`
- Modify: `server/src/modules/instagram/instagram.validation.js`
- Modify: `server/src/modules/webhooks/clickup.service.js`
- Modify: `client/src/components/instagram/ScheduledPostForm.jsx`
- Modify: `client/src/components/instagram/PostReviewSheet.jsx`
- Modify: `client/src/lib/constants.js`

- [ ] **Step 1: Create the migration**

```js
exports.up = async function (knex) {
  await knex.schema.createTable('client_youtube_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('client_id').notNullable().references('id').inTable('clients').onDelete('CASCADE');
    table.string('channel_id', 255).nullable();
    table.string('channel_title', 255).nullable();
    table.text('access_token_encrypted').nullable();
    table.text('token_iv').nullable();
    table.text('token_auth_tag').nullable();
    table.timestamp('token_expires_at', { useTz: true }).nullable();
    table.text('refresh_token_encrypted').nullable();
    table.text('refresh_token_iv').nullable();
    table.text('refresh_token_auth_tag').nullable();
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
    table.unique('client_id');
  });

  await knex.schema.alterTable('scheduled_posts', (table) => {
    table.string('youtube_video_id', 50).nullable();
    table.string('youtube_permalink', 500).nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('scheduled_posts', (table) => {
    table.dropColumn('youtube_permalink');
    table.dropColumn('youtube_video_id');
  });
  await knex.schema.dropTableIfExists('client_youtube_tokens');
};
```

- [ ] **Step 2: Add YouTube config to `env.js`**

After the `tiktok` block, add:

```js
youtube: {
  clientId: process.env.YOUTUBE_CLIENT_ID,
  clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
  redirectUri: process.env.YOUTUBE_REDIRECT_URI || 'https://apitasks.pofazze.com/api/youtube/oauth/callback',
},
```

- [ ] **Step 3: Register `youtube` as valid platform + `yt_video` post type**

In `instagram.validation.js`:
- Add `'yt_video'` to the `POST_TYPES` array.
- Change every `.valid('instagram', 'tiktok')` on platform fields to `.valid('instagram', 'tiktok', 'youtube')`.

In `clickup.service.js` `PLATFORM_TAGS`, add:
```js
'youtube': 'youtube', 'yt': 'youtube',
```

In `client/src/components/instagram/ScheduledPostForm.jsx` POST_TYPES:
- Add `{ value: 'yt_video', label: 'Vídeo YouTube', icon: Film, platforms: ['youtube'] }`.
- Extend `reel` platforms to `['instagram', 'tiktok', 'youtube']`.
- Add `{ value: 'youtube', label: 'YouTube' }` to the platform toggle array (lines 177-179).

In `client/src/components/instagram/PostReviewSheet.jsx` POST_TYPE_OPTIONS:
- Same additions as ScheduledPostForm.
- Add YouTube to the PLATFORM_OPTIONS array.

In `client/src/lib/constants.js`:
- Add `yt_video: 'Vídeo YouTube'` to `CONTENT_TYPE_LABELS`.

- [ ] **Step 4: Run migration against Railway DB**

```bash
cd /home/dev/projetos/server && DATABASE_URL="postgresql://postgres:omnpQxZihGaOPuiYUoCfKaFbcabzRbgj@nozomi.proxy.rlwy.net:57344/railway" npx knex migrate:latest
```

- [ ] **Step 5: Run tests + build**

```bash
cd /home/dev/projetos/server && npx jest --silent --forceExit --testTimeout=10000
cd /home/dev/projetos/client && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add server/src/database/migrations/031_youtube_integration.js server/src/config/env.js server/src/modules/instagram/instagram.validation.js server/src/modules/webhooks/clickup.service.js client/src/components/instagram/ScheduledPostForm.jsx client/src/components/instagram/PostReviewSheet.jsx client/src/lib/constants.js
git -c safe.directory=/home/dev/projetos commit -m "feat(youtube): migration, config, and platform registration

Creates client_youtube_tokens table mirroring tiktok tokens,
adds youtube_video_id and youtube_permalink columns to
scheduled_posts, registers 'youtube' as a valid platform in
Joi validation + ClickUp tag extraction + frontend toggles,
and adds 'yt_video' post type for long-form YouTube videos.
Extends 'reel' to also target YouTube (Shorts via post_type)."
```

---

### Task 2: YouTube OAuth service + controller + routes

**Files:**
- Create: `server/src/modules/youtube/youtube-oauth.service.js`
- Create: `server/src/modules/youtube/youtube.controller.js`
- Create: `server/src/modules/youtube/youtube.routes.js`
- Modify: `server/src/app.js` — mount routes at `/api/youtube`

The OAuth service mirrors `tiktok-oauth.service.js` but uses Google's endpoints:
- Auth URL: `https://accounts.google.com/o/oauth2/v2/auth`
- Token exchange: `https://oauth2.googleapis.com/token`
- Token refresh: same URL with `grant_type=refresh_token`
- Channel info: `GET https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true`
- Revoke: `POST https://oauth2.googleapis.com/revoke?token=ACCESS_TOKEN`

- [ ] **Step 1: Implement `youtube-oauth.service.js`**

Follow the TikTok OAuth service pattern exactly but adapt for Google:
- `getAuthorizationUrl(clientId)`: builds Google OAuth URL with state={clientId,nonce}, scopes `youtube.upload youtube`, `access_type=offline` (to get refresh_token), `prompt=consent` (force consent to always get refresh_token).
- `parseState(state)`: decode base64url → JSON → { clientId }.
- `handleCallback(code, clientId)`: exchange code at Google token URL (POST with `grant_type=authorization_code`), fetch channel info, encrypt tokens, upsert `client_youtube_tokens`.
- `getDecryptedToken(clientId)`: decrypt access_token from DB row.
- `refreshToken(clientId)`: POST to Google token URL with `grant_type=refresh_token`. Note: Google only returns a NEW access_token, NOT a new refresh_token (the refresh_token persists forever unless revoked). Update only access_token + expiry.
- `getConnectionStatus(clientId)`: return `{ connected, channelTitle, channelId }`.
- `disconnectClient(clientId)`: revoke via Google, delete from DB.
- `getTokensExpiringWithin(days)`: query for tokens expiring within N days.

- [ ] **Step 2: Implement `youtube.controller.js`**

Mirror `tiktok.controller.js` but without the webhook handler (YouTube doesn't webhook for uploads):
- `getOAuthUrl(req, res, next)` → calls service.getAuthorizationUrl.
- `oauthCallback(req, res, next)` → reads `code` + `state` from query, calls service.handleCallback, redirects to `${clientUrl}/clients/${clientId}?youtube=connected`.
- `getConnectionStatus(req, res, next)` → calls service.getConnectionStatus.
- `disconnect(req, res, next)` → calls service.disconnectClient.

- [ ] **Step 3: Implement `youtube.routes.js`**

```js
const express = require('express');
const { authenticate, managementLevel } = require('../../middleware/auth');
const controller = require('./youtube.controller');

const router = express.Router();

router.get('/oauth/callback', controller.oauthCallback.bind(controller));

router.use(authenticate);

router.get('/oauth/url/:clientId', managementLevel, controller.getOAuthUrl.bind(controller));
router.get('/oauth/status/:clientId', controller.getConnectionStatus.bind(controller));
router.delete('/oauth/:clientId', managementLevel, controller.disconnect.bind(controller));

module.exports = router;
```

- [ ] **Step 4: Mount in `app.js`**

Add `const youtubeRoutes = require('./modules/youtube/youtube.routes');` near the other route imports.
Add `app.use('/api/youtube', youtubeRoutes);` near the other route mounts.

- [ ] **Step 5: Run tests + build**

- [ ] **Step 6: Commit**

```bash
git -c safe.directory=/home/dev/projetos commit -m "feat(youtube): OAuth service + controller + routes

Google OAuth 2.0 flow for YouTube channel connection: auth URL
with youtube.upload + youtube scopes, code exchange, channel info
fetch, encrypted token storage in client_youtube_tokens, refresh
(access_token only — Google refresh tokens don't expire), revoke
+ disconnect, and connection status. Routes mirror the TikTok
pattern (public callback, authenticated management endpoints)."
```

---

### Task 3: YouTube publish service + tests

**Files:**
- Create: `server/src/modules/youtube/youtube-publish.service.js`
- Create: `server/src/modules/youtube/youtube-publish.service.test.js`

This is the core: download video → decide Short vs Normal → resumable upload → set thumbnail → update DB.

- [ ] **Step 1: Implement the publish service**

Key methods of `youtube-publish.service.js`:

```js
class YouTubePublishService {
  async executeScheduledPost(postId) {
    // 1. Load post + token (refresh if expired)
    // 2. Parse media_urls, find video
    // 3. Download video to Buffer
    // 4. Determine if Short: post_type in ['yt_shorts','reel'] → Short; 'yt_video' → Normal; else → Short
    // 5. Build snippet + status metadata
    //    - If Short and title missing #Shorts → append
    //    - If scheduled_at → privacyStatus='private', publishAt=scheduled_at.toISOString()
    //    - Else → privacyStatus='public'
    // 6. POST resumable upload init → get upload URI from Location header
    // 7. PUT video bytes to upload URI → get videoId
    // 8. If thumbnail_url → download → POST thumbnails/set
    // 9. Build permalink (Short: /shorts/ID, Normal: /watch?v=ID)
    // 10. Update scheduled_posts: youtube_video_id, youtube_permalink, status='published'
    // 11. Group-ready check → moveToPublicacao + notifyPublishSuccess
  }

  _isShort(postType) {
    return ['yt_shorts', 'reel'].includes(postType);
  }

  async _initResumableUpload(accessToken, metadata) {
    // POST to https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status
    // Body: JSON metadata
    // Returns: Location header (upload URI)
  }

  async _uploadVideoBytes(uploadUri, videoBuffer, contentType) {
    // PUT to uploadUri with Content-Type and Content-Length
    // Returns: { id: videoId, ... }
  }

  async _setThumbnail(accessToken, videoId, thumbnailBuffer) {
    // POST to https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=X
  }

  async _isGroupFullyPublished(post) {
    if (!post.post_group_id) return true;
    const siblings = await db('scheduled_posts').where({ post_group_id: post.post_group_id });
    return siblings.every((s) => s.status === 'published');
  }

  async _moveToPublicacao(clickupTaskId) {
    // Same pattern as tiktok-publish.service.js
  }
}
```

- [ ] **Step 2: Write tests**

Test the key logic paths:
- `_isShort('yt_shorts')` → true
- `_isShort('yt_video')` → false
- `_isShort('reel')` → true (Shorts via reel post type)
- `_isShort('image')` → true (default Short)
- Short title gets `#Shorts` appended if missing
- Short title already containing `#Shorts` stays unchanged
- Scheduled post gets `privacyStatus: 'private'` + `publishAt`
- Immediate post gets `privacyStatus: 'public'`
- Permalink: Short → `https://youtube.com/shorts/X`, Normal → `https://youtube.com/watch?v=X`

Mock `fetch` for the upload init + byte PUT + thumbnail endpoints.

- [ ] **Step 3: Run tests, commit**

```bash
git -c safe.directory=/home/dev/projetos commit -m "feat(youtube): publish service with resumable upload

Downloads the video from the media URL, determines Short vs Normal
from post_type (yt_shorts/reel → Short, yt_video → Normal, else
default Short), initiates a resumable upload session via YouTube
Data API v3, PUTs the video bytes, optionally sets a custom
thumbnail via thumbnails.set, builds the permalink (/shorts/ or
/watch?v=), and handles group-ready + moveToPublicacao +
notifyPublishSuccess. Scheduling uses YouTube native publishAt
(privacyStatus=private + future publishAt datetime). Covered by
unit tests for Short detection, metadata construction, and
permalink generation."
```

---

### Task 4: Worker + queue routing + token refresh

**Files:**
- Create: `server/src/queues/youtube-publish.worker.js`
- Modify: `server/src/queues/index.js` — add queue + update `schedulePost` routing
- Modify: `server/src/queues/token-refresh.worker.js` — add YouTube block
- Modify: `server/src/app.js` — require the worker

- [ ] **Step 1: Create the worker**

Mirror `tiktok-publish.worker.js`:

```js
const { Worker } = require('bullmq');
const logger = require('../utils/logger');
const publishService = require('../modules/youtube/youtube-publish.service');
const { connection } = require('./index');

const worker = new Worker('youtube-publish', async (job) => {
  const { postId } = job.data;
  logger.info('Processing YouTube publish job', { postId, jobId: job.id });
  await publishService.executeScheduledPost(postId);
}, {
  connection,
  concurrency: 1,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
});

worker.on('completed', (job) => {
  logger.info('YouTube publish job completed', { jobId: job.id, postId: job.data.postId });
});

worker.on('failed', (job, err) => {
  logger.error('YouTube publish job failed', { jobId: job?.id, postId: job?.data?.postId, error: err.message });
});

module.exports = worker;
```

- [ ] **Step 2: Add queue + update routing in `queues/index.js`**

Add declaration:
```js
const youtubePublishQueue = new Queue('youtube-publish', { connection });
```

Replace the `schedulePost` platform routing:
```js
const QUEUE_BY_PLATFORM = {
  tiktok: tiktokPublishQueue,
  youtube: youtubePublishQueue,
};

async function schedulePost(postId, scheduledAt, platform = 'instagram') {
  const delay = new Date(scheduledAt).getTime() - Date.now();
  const jobId = `post-${postId}-${Date.now()}`;
  const queue = QUEUE_BY_PLATFORM[platform] || instagramPublishQueue;
  if (delay <= 0) {
    await queue.add('publish', { postId }, { jobId });
  } else {
    await queue.add('publish', { postId }, { delay, jobId });
  }
  logger.info('Post scheduled in queue', { postId, platform, delay: Math.round(delay / 1000) + 's' });
}
```

Add to `cancelScheduledPost` queues array:
```js
const queues = [instagramPublishQueue, tiktokPublishQueue, youtubePublishQueue];
```

Export `youtubePublishQueue`.

- [ ] **Step 3: Add YouTube block to `token-refresh.worker.js`**

After the TikTok block, add:
```js
try {
  const youtubeOAuth = require('../modules/youtube/youtube-oauth.service');
  const youtubeTokens = await youtubeOAuth.getTokensExpiringWithin(1);
  logger.info(`Found ${youtubeTokens.length} YouTube tokens expiring within 1 day`);
  for (const token of youtubeTokens) {
    try {
      await youtubeOAuth.refreshToken(token.client_id);
      logger.info('YouTube token refreshed', { clientId: token.client_id });
    } catch (err) {
      logger.error('YouTube token refresh failed', { clientId: token.client_id, error: err.message });
    }
  }
} catch (err) {
  logger.error('YouTube token refresh block failed', { error: err.message });
}
```

- [ ] **Step 4: Require the worker in `app.js`**

Add `require('./queues/youtube-publish.worker');` in the BullMQ try block.

- [ ] **Step 5: Run tests, commit**

```bash
git -c safe.directory=/home/dev/projetos commit -m "feat(youtube): BullMQ worker + queue routing + token refresh

youtube-publish worker processes upload jobs with 3 retries and
exponential backoff. schedulePost now routes to a platform→queue
map (tiktok→tiktokQueue, youtube→youtubeQueue, else→instagram).
cancelScheduledPost checks all three queues. The token-refresh
repeatable job now refreshes YouTube access tokens (Google refresh
tokens don't expire, only access tokens at 1h intervals)."
```

---

### Task 5: Frontend — YouTube connection card + service

**Files:**
- Create: `client/src/services/youtube.js` — axios wrappers for OAuth endpoints.
- Modify: `client/src/pages/ClientProfilePage.jsx` — add YouTube connection card.

- [ ] **Step 1: Create the YouTube API service**

```js
import api from './api';

export const getYouTubeOAuthUrl = (clientId) =>
  api.get(`/youtube/oauth/url/${clientId}`).then((r) => r.data);

export const getYouTubeConnectionStatus = (clientId) =>
  api.get(`/youtube/oauth/status/${clientId}`).then((r) => r.data);

export const disconnectYouTube = (clientId) =>
  api.delete(`/youtube/oauth/${clientId}`).then((r) => r.data);
```

- [ ] **Step 2: Add YouTube connection card to `ClientProfilePage.jsx`**

Mirror the TikTok connection card exactly but:
- State: `ytConnection` / `ytConnecting` (same pattern as `tkConnection` / `tkConnecting`).
- Fetch: `getYouTubeConnectionStatus(clientId)` on mount.
- Connect button: calls `getYouTubeOAuthUrl(clientId)` → redirects.
- Disconnect button: calls `disconnectYouTube(clientId)`.
- Icon: red circle with `YT` text (matching the TK pattern).
- Connected state shows `ytConnection.channelTitle` instead of `@username`.

Also handle `?youtube=connected` query param on mount (same as `?tiktok=connected`).

- [ ] **Step 3: Build smoke test**

```bash
cd /home/dev/projetos/client && npm run build
```

- [ ] **Step 4: Commit**

```bash
git -c safe.directory=/home/dev/projetos commit -m "feat(youtube-ui): connection card on client profile

YouTube OAuth connect/disconnect card on the client profile page,
mirroring the TikTok card: shows channel title when connected,
disconnect button with confirmation, and connect button that
redirects to Google OAuth. Axios wrappers in services/youtube.js."
```

---

### Task 6: Notifications permalink + final wiring

**Files:**
- Modify: `server/src/modules/notifications/notifications.service.js` — extend permalink ternary.

- [ ] **Step 1: Extend the permalink selection**

In `notifyPublishSuccess`, find the `.map` inside `platformLinks`:

```js
.map((s) => ({ platform: s.platform, url: s.platform === 'instagram' ? s.ig_permalink : s.platform === 'tiktok' ? s.tiktok_permalink : null }));
```

Change to:

```js
.map((s) => ({
  platform: s.platform,
  url: s.platform === 'instagram' ? s.ig_permalink
    : s.platform === 'tiktok' ? s.tiktok_permalink
    : s.platform === 'youtube' ? s.youtube_permalink
    : null,
}));
```

Do the same for the `else` branch (single-post, no post_group_id).

- [ ] **Step 2: Run tests**

```bash
cd /home/dev/projetos/server && npx jest src/modules/notifications --forceExit --testTimeout=10000
```

- [ ] **Step 3: Commit**

```bash
git -c safe.directory=/home/dev/projetos commit -m "feat(notifications): include youtube_permalink in publish digest

Extends the platform→permalink mapping in notifyPublishSuccess so
YouTube video links appear alongside Instagram and TikTok links in
the WhatsApp publish notification sent to client and category groups."
```

---

### Task 7: Manual verification

**Files:** none.

- [ ] **Step 1: Set Railway env vars**

```
YOUTUBE_CLIENT_ID=<from Google Cloud Console>
YOUTUBE_CLIENT_SECRET=<from Google Cloud Console>
YOUTUBE_REDIRECT_URI=https://apitasks.pofazze.com/api/youtube/oauth/callback
```

- [ ] **Step 2: Push and deploy**

```bash
git push origin master
```

- [ ] **Step 3: Connect a YouTube channel**

Open a client profile in TasksLudus → click "Conectar YouTube" → complete Google OAuth → verify channel title appears.

- [ ] **Step 4: Publish a test Short**

Create a new scheduled post → select YouTube + Reel → upload a short vertical video → click "Publicar Agora" → check Railway logs for "Processing YouTube publish job" → verify the Short appears on the connected YouTube channel.

- [ ] **Step 5: Schedule a test video**

Create a post with scheduled_at in the future → verify the YouTube Data API response includes `publishAt` → confirm the video is listed as "Scheduled" in YouTube Studio.

- [ ] **Step 6: Verify thumbnail**

Upload a post with a thumbnail → confirm YouTube Studio shows the custom thumbnail, not a YouTube-generated one.

---

## Self-Review (done)

- **Spec coverage:**
  - Migration + data model → Task 1.
  - OAuth flow (Google) → Task 2.
  - Resumable upload + Short detection + thumbnail + publishAt → Task 3.
  - BullMQ worker + queue routing + token refresh → Task 4.
  - Frontend connection card + platform toggle + post types → Tasks 1 + 5.
  - Notifications permalink → Task 6.
  - Manual verification → Task 7.
- **Placeholder scan:** Tasks 2 and 3 describe the service methods in detail (endpoints, parameters, response handling). The subagent will implement full working code from those descriptions + the TikTok template files.
- **Type consistency:** `youtube-oauth.service` exports match what the controller, worker, and token-refresh consume. `youtube-publish.service` exports `executeScheduledPost(postId)` matching the worker's call signature. Queue name `'youtube-publish'` matches between `index.js` and the worker constructor.
