# YouTube Integration + Client Portal Setup Wizard — Design

**Date:** 2026-04-17
**Goal:** Add YouTube as a third publishing platform in TasksLudus (OAuth connect, resumable video upload, Shorts/normal detection, thumbnail, scheduling via YouTube's native `publishAt`) and build a social-connections wizard inside the existing client portal so clients can self-serve connect Instagram, TikTok, and YouTube.

---

## Problem

TasksLudus publishes to Instagram and TikTok but not YouTube. Clients with YouTube channels must manually upload content the agency produces, breaking the end-to-end automation. Additionally, connecting social accounts is admin-only today — the client portal exists but is scaffolding with zero real users.

## Goal

**Phase 1 — YouTube Publish:**
OAuth flow to connect a client's YouTube channel, a BullMQ worker that downloads the video, does a resumable upload via YouTube Data API v3, sets a custom thumbnail, and leverages YouTube's native `publishAt` for scheduling. Shorts are detected automatically (≤60s + vertical) with manual override via `post_type`.

**Phase 2 — Client Portal Setup Wizard:**
The client logs into TasksLudus, sees a "Minhas Redes Sociais" section with three cards (Instagram, TikTok, YouTube), and self-serves the OAuth connect for each. Auth is scoped so clients can only connect their own accounts.

Out of scope: community posts (no official API), YouTube Analytics, live streaming, playlist management, client signup UX redesign.

---

## Data Model

### `client_youtube_tokens` — new table

```sql
CREATE TABLE client_youtube_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  channel_id varchar(255),
  channel_title varchar(255),
  access_token_encrypted text,
  token_iv text,
  token_auth_tag text,
  refresh_token_encrypted text,
  refresh_token_iv text,
  refresh_token_auth_tag text,
  token_expires_at timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (client_id)
);
```

Mirrors `client_tiktok_tokens` exactly. One row per client. Tokens encrypted with the same `TOKEN_ENCRYPTION_KEY` env var used by Instagram and TikTok.

### `scheduled_posts` — two new columns

```sql
ALTER TABLE scheduled_posts
  ADD COLUMN youtube_video_id varchar(50),
  ADD COLUMN youtube_permalink varchar(500);
```

`youtube_permalink` is `https://youtube.com/watch?v=X` for normal videos or `https://youtube.com/shorts/X` for Shorts.

### Post types

`yt_shorts` already exists in `POST_TYPES` and `PIPELINE` (scaffolded earlier). Add `yt_video` for long-form YouTube videos:

- Backend: `instagram.validation.js` POST_TYPES array gets `'yt_video'`.
- Frontend: `ScheduledPostForm.jsx` and `PostReviewSheet.jsx` POST_TYPES get `{ value: 'yt_video', label: 'Vídeo YouTube', icon: Film, platforms: ['youtube'] }`.
- `reel` already has `platforms: ['instagram', 'tiktok']` — extend to `['instagram', 'tiktok', 'youtube']` so a reel can go to all three.

### Platform registration

Add `'youtube'` as a valid platform value in:
- `instagram.validation.js` — Joi `.valid('instagram', 'tiktok', 'youtube')` on create and update schemas.
- `clickup.service.js` `extractPlatformsFromTags` — `{ youtube: 'youtube', yt: 'youtube' }`.
- `PLATFORM_LABELS` constants (already has `YouTube` from Phase 1 reports work).

### Config in `env.js`

```js
youtube: {
  clientId: process.env.YOUTUBE_CLIENT_ID,
  clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
  redirectUri: process.env.YOUTUBE_REDIRECT_URI,
}
```

---

## Phase 1 — YouTube Publish

### OAuth Flow

Module: `server/src/modules/youtube/`

Files: `youtube-oauth.service.js`, `youtube.controller.js`, `youtube.routes.js`.

**Scopes requested:** `https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube` (upload + thumbnails.set).

**Flow:**
1. `GET /api/youtube/oauth/url/:clientId` → builds Google OAuth URL with `state={clientId}`, redirects.
2. Google redirects to `GET /api/youtube/oauth/callback?code=X&state=Y`.
3. Backend exchanges code → `access_token` + `refresh_token`.
4. Fetches `channels.list?mine=true&part=snippet` → extracts `channel_id`, `channel_title`.
5. Encrypts tokens, stores in `client_youtube_tokens`.
6. Redirects to `${clientUrl}/clients/${clientId}?youtube=connected`.

**Routes:**
- `GET /oauth/callback` — public (Google redirects here).
- `GET /oauth/url/:clientId` — authenticated, `managementOrSocialMedia` OR client-own (Phase 2).
- `GET /oauth/status/:clientId` — authenticated, returns `{ connected, channelTitle, channelId }`.
- `DELETE /oauth/:clientId` — authenticated, `managementLevel`, deactivates token.

### Publish Service

File: `server/src/modules/youtube/youtube-publish.service.js`

```
executeScheduledPost(postId):
  1. Load scheduled_post + client_youtube_tokens
  2. Refresh token if expired (< 5min remaining)
  3. Resolve media URL → download video to Buffer
     - From ClickUp attachment or catbox temp URL
     - Stream to /tmp file if > 50MB
  4. Determine publish type:
     - post_type === 'yt_shorts' OR post_type === 'reel' → Short
     - post_type === 'yt_video' → Normal
     - Else → default Short (agency content is typically short/vertical)
  5. Build metadata:
     snippet: { title: caption.slice(0,100), description: caption, tags: [], categoryId: '22' }
     status:
       - publishNow: { privacyStatus: 'public' }
       - scheduled: { privacyStatus: 'private', publishAt: scheduled_at.toISOString() }
     If Short and title doesn't contain #Shorts: append ' #Shorts'
  6. POST resumable upload init:
     POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status
     Headers: Authorization: Bearer {token}, Content-Type: application/json
     Body: { snippet, status }
     → Response Location header = upload URI
  7. PUT video bytes to upload URI:
     Headers: Content-Type: video/mp4, Content-Length: {size}
     Body: raw bytes
     → Response: { id: videoId, ... }
  8. If thumbnail_url exists:
     Download thumbnail → POST https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId={videoId}
     Content-Type: image/jpeg or image/png
  9. Build permalink:
     Short → https://youtube.com/shorts/{videoId}
     Normal → https://youtube.com/watch?v={videoId}
  10. Update scheduled_posts: youtube_video_id, youtube_permalink, status='published', published_at=now()
  11. If groupReady → moveToPublicacao + notifyPublishSuccess (same as IG/TikTok)
  12. Cleanup: delete /tmp file if used
```

### Short vs Normal Detection

Priority order:
1. `post_type === 'yt_shorts'` → force Short
2. `post_type === 'yt_video'` → force Normal
3. `post_type === 'reel'` → Short (reels are vertical short content)
4. Else → default Short

No ffprobe dependency. Trust the post_type the SM selected. Clean and dependency-free.

### BullMQ Worker

File: `server/src/queues/youtube-publish.worker.js`

Mirrors `tiktok-publish.worker.js`:
- Concurrency: 1 (uploads are heavy)
- Attempts: 3 with exponential backoff (30s, 60s, 120s)
- On `quotaExceeded` error: do NOT retry (mark failed immediately)
- Exports `runYoutubePublishJob` for direct test invocation

### Queue routing

`server/src/queues/index.js` — `schedulePost()` helper changes from:
```js
const queue = platform === 'tiktok' ? tiktokPublishQueue : instagramPublishQueue;
```
to:
```js
const QUEUE_BY_PLATFORM = {
  tiktok: tiktokPublishQueue,
  youtube: youtubePublishQueue,
};
const queue = QUEUE_BY_PLATFORM[platform] || instagramPublishQueue;
```

### Token Refresh

The existing `token-refresh.worker.js` already refreshes Instagram and TikTok tokens. Add a YouTube block:
- Query `client_youtube_tokens` where `is_active = true` and `token_expires_at < now() + 1 day`.
- For each: call Google's token endpoint with the refresh_token → update access_token + expiry.
- Google refresh tokens don't expire unless revoked, so only access_token needs periodic refresh.

### Scheduling Strategy

Use YouTube's native `publishAt` field:
- **Scheduled post**: worker uploads immediately with `privacyStatus: 'private'` + `publishAt: ISO datetime`. YouTube auto-publishes at that time.
- **Publish now**: worker uploads with `privacyStatus: 'public'`. Goes live immediately after processing.

This is more reliable than BullMQ delay because the video is already on YouTube's servers — no risk of server downtime at publish time.

The BullMQ job still fires at `scheduled_at` time to trigger the upload. The difference: for Instagram/TikTok the job publishes at fire time; for YouTube the job uploads at fire time but the video goes public at `publishAt` (which could be the same time or later).

### Notifications Integration

`youtube-publish.service.js` implements `_isGroupFullyPublished(post)` and calls `notificationsService.notifyPublishSuccess(post)` inside `if (groupReady)`, same as IG and TikTok. The notification compose already handles `youtube_permalink` (via the `PLATFORM_LABELS` and permalink reading logic in `notifications.service.js`).

### Frontend Changes (Phase 1)

**ClientProfilePage.jsx:**
- Add YouTube connection card (same pattern as Instagram/TikTok cards).
- `GET /api/youtube/oauth/status/:clientId` → render connected/disconnected state.

**ScheduledPostForm.jsx + PostReviewSheet.jsx:**
- Platform toggle: add `{ value: 'youtube', label: 'YouTube' }`.
- POST_TYPES: add `{ value: 'yt_video', label: 'Vídeo YouTube', icon: Film, platforms: ['youtube'] }`.
- Extend `reel` platforms: `['instagram', 'tiktok', 'youtube']`.

**AgendamentoTab:** no change — dedup + platform badges handle YouTube automatically.

**Notifications (`notifications.service.js`):**
- `notifyPublishSuccess` already reads `post.youtube_permalink` → just needs the `platform === 'youtube'` branch in the permalink selection:
```js
const url = s.platform === 'instagram' ? s.ig_permalink
  : s.platform === 'tiktok' ? s.tiktok_permalink
  : s.platform === 'youtube' ? s.youtube_permalink
  : null;
```

---

## Phase 2 — Client Portal Setup Wizard

### Portal Fixes (prerequisite)

`PortalPage.jsx` currently fetches all deliveries without filtering. Fix:
- Backend: add `GET /api/deliveries?clientId=X` filter, or add a dedicated portal endpoint that auto-filters by `clients.user_id = req.user.id`.
- Frontend: pass the user's associated `client_id` (derived from `clients.user_id = req.user.id`) to the deliveries fetch.

### Social Connections Section

Inside `PortalPage.jsx`, above the deliveries list, add a "Minhas Redes Sociais" section:

```
┌─────────────────────────────────────────────────┐
│ Minhas Redes Sociais                            │
│                                                 │
│ [Instagram icon]  ✅ Conectado: @username        │
│                   [Desconectar]                 │
│                                                 │
│ [TikTok icon]     ⚠️ Não conectado               │
│                   [Conectar TikTok]             │
│                                                 │
│ [YouTube icon]    ⚠️ Não conectado               │
│                   [Conectar YouTube]            │
│                                                 │
│ Progresso: 1 de 3 conectados ████░░░░░          │
└─────────────────────────────────────────────────┘
```

Each card:
- Fetches connection status from the respective `GET /api/*/oauth/status/:clientId`.
- "Conectar" → redirects to `GET /api/*/oauth/url/:clientId` → OAuth flow → returns to `/portal?platform=connected`.
- "Desconectar" → calls `DELETE /api/*/oauth/:clientId` (only if the client role is allowed — see permissions below).
- Progress bar: `connected / 3 * 100%`.

### Permission Scoping for Client Role

The OAuth URL endpoints (`/api/instagram/oauth/url/:clientId`, `/api/tiktok/oauth/url/:clientId`, `/api/youtube/oauth/url/:clientId`) currently require `managementLevel` or `managementOrSocialMedia`. They need to also accept role `client` when the client is connecting their own account.

Implementation: in each OAuth URL route handler, add a check:
```js
if (req.user.role === 'client') {
  const client = await db('clients').where({ user_id: req.user.id }).first();
  if (!client || client.id !== req.params.clientId) {
    return res.status(403).json({ error: 'You can only connect your own accounts' });
  }
}
```

This pattern applies to:
- `GET /api/instagram/oauth/url/:clientId`
- `GET /api/tiktok/oauth/url/:clientId`
- `GET /api/youtube/oauth/url/:clientId`
- `GET /api/*/oauth/status/:clientId` (read-only, less sensitive but still scoped)
- `DELETE /api/*/oauth/:clientId` (disconnect — client can disconnect their own only)

### Client Onboarding Flow

1. Admin creates user invite with `role: 'client'` via existing invite endpoint.
2. Admin sets `clients.user_id` to link the user to the client record (may need a UI field or API param during invite).
3. Client receives invite link (email or WhatsApp) → registers → logs in.
4. Client sees `/portal` with:
   - "Minhas Redes Sociais" section (3 cards, all pending initially).
   - Deliveries table (filtered to their client).
5. Client clicks each "Conectar" → OAuth → returns.
6. All 3 connected → progress bar full.

### Invite Enhancement

The existing `createInvite` endpoint in `auth.service.js` accepts `role: 'client'`. It may need a `clientId` parameter so the created user automatically gets `clients.user_id` set:
- Add optional `client_id` to the invite schema.
- On registration via invite token, if `client_id` is present: `UPDATE clients SET user_id = newUser.id WHERE id = client_id`.

---

## Error Handling

### YouTube-specific errors

| Error | Action |
|---|---|
| `quotaExceeded` (403) | Mark failed immediately, do NOT retry. Error message: "Quota diária do YouTube excedida. Tente novamente amanhã." |
| Token expired mid-upload | Refresh inline, retry current chunk (resumable protocol supports this) |
| `uploadLimitExceeded` | Mark failed. "Limite de uploads atingido para este canal." |
| Video rejected by YouTube (copyright, policy) | Poll `videos.list?id=X&part=status,processingDetails` after upload. If `processingStatus: 'failed'` or `rejectionReason` set → mark failed with YouTube's reason. |
| File too large for memory (>50MB) | Stream to `/tmp`, upload from file, cleanup after. |
| Network interruption during upload | Resumable protocol handles this — query upload progress, resume from last byte. |

### Portal errors

- OAuth denied by user → redirect to portal with `?error=denied`, show toast.
- Client tries to connect another client's account → 403 inline.
- Status endpoint unreachable → show "Erro ao verificar status" with retry button.

---

## Testing

### Phase 1 tests

- `youtube-oauth.service.test.js` — token exchange mock, refresh, encryption/decryption round-trip, channel info fetch.
- `youtube-publish.service.test.js` — resumable upload mock (init + PUT), Short vs Normal detection by post_type, thumbnail upload, quota error handling, permalink generation.
- `youtube.routes.test.js` — supertest: OAuth callback, status endpoint, disconnect.
- `youtube-publish.worker.test.js` — job success/failure/retry, quotaExceeded no-retry.

### Phase 2 tests

- PortalPage smoke — renders 3 platform cards, shows correct connection status.
- Supertest: client role can GET oauth/url for own clientId, 403 for another.
- Supertest: deliveries filtered by client association.
- Invite with `client_id` → registration sets `clients.user_id`.

---

## Sequencing

**Phase 1 plan (YouTube Publish):**
1. Migration: `client_youtube_tokens` table + `scheduled_posts.youtube_video_id` / `youtube_permalink` columns.
2. `env.js` + validation + platform registration (`youtube` in Joi, extractPlatformsFromTags, POST_TYPES).
3. `youtube-oauth.service.js` + tests.
4. `youtube.controller.js` + `youtube.routes.js` + `app.js` mount + supertest.
5. `youtube-publish.service.js` (resumable upload + thumbnail + Short detection) + tests.
6. `youtube-publish.worker.js` + queue registration + `schedulePost` routing + `token-refresh` YouTube block.
7. Frontend: ClientProfilePage YouTube card + platform toggle + `yt_video` post type + `reel` extended to YouTube.
8. Notifications: `youtube_permalink` branch in `notifyPublishSuccess`.
9. Manual production verification.

**Phase 2 plan (Client Portal):**
1. Portal deliveries filter fix (backend + frontend).
2. Social connections section in PortalPage (3 cards + status fetch + progress bar).
3. OAuth permission scoping for client role (3 platform routes).
4. Invite enhancement (`client_id` param + auto-link).
5. Manual verification with a test client account.

Each phase is independently executable. Phase 1 is a prerequisite for Phase 2 (YouTube OAuth must exist before the wizard can offer it).
