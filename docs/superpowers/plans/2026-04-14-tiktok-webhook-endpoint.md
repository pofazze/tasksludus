# TikTok Webhook Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public `POST /api/tiktok/webhook` endpoint that verifies the `Tiktok-Signature` header, persists events to `webhook_events`, and reacts to authorization revocation and content-publishing events.

**Architecture:** A thin controller receives the request, a dedicated service validates the HMAC-SHA256 signature against the raw body (captured by Express's `verify` hook), logs to `webhook_events`, and dispatches per-event handlers that update `client_tiktok_tokens` (on `authorization.removed`) or `scheduled_posts` (on `post.publish.*`). The endpoint returns `200` immediately even on internal failures so TikTok doesn't retry — persistence + async processing absorb errors.

**Tech Stack:** Node.js 20, Express 4, Knex (PostgreSQL), Node `crypto` (HMAC), Jest + supertest

**Spec source:** Chosen inline (option 2 from conversation on 2026-04-14). TikTok webhook format verified from TikTok Developer Portal docs via context7:
- Header: `Tiktok-Signature: t=<unix_timestamp>,s=<hex_hmac>`
- Signed string: `<timestamp>.<raw_body>` (string concat, literal period)
- Algorithm: HMAC-SHA256 with `TIKTOK_CLIENT_SECRET` as key, hex lowercase output
- Response: MUST return 200 or TikTok retries with exponential backoff for 72h
- Events used:
  - `authorization.removed` — user revoked OAuth (payload: `reason` int 0-5)
  - `post.publish.complete` — post published from inbox draft (payload: `publish_id`, `publish_type`)
  - `post.publish.publicly_available` — post is now publicly viewable (payload: `publish_id`, `post_id`, `publish_type`)
  - `post.publish.failed` — publishing failed (payload: `publish_id`, `reason`, `publish_type`)
  - `post.publish.inbox_delivered`, `post.publish.no_longer_publicaly_available` — logged only

---

### Task 1: Capture raw body for TikTok webhook path

**Files:**
- Modify: `server/src/app.js:55-62`

- [ ] **Step 1: Update the `verify` callback on `express.json()` to also capture `/api/tiktok/webhook`**

Replace the existing middleware block:

```javascript
// Body parsing — capture raw body for webhook signature verification
app.use(express.json({
  verify: (req, _res, buf) => {
    if (req.url.startsWith('/api/webhooks/') || req.path === '/api/tiktok/webhook') {
      req.rawBody = buf.toString();
    }
  },
}));
```

- [ ] **Step 2: Verify the server still boots**

Run: `cd server && node -e "require('./src/app')"` (or `npm run dev` and Ctrl-C after "Server running on port").
Expected: logs `Server running on port 4400` and no stack traces related to middleware.

- [ ] **Step 3: Commit**

```bash
git add server/src/app.js
git commit -m "feat(tiktok): capture raw body for webhook signature verification"
```

---

### Task 2: Signature verification service

Pure logic, no DB, no HTTP — easiest to test first and locks in the verified HMAC format.

**Files:**
- Create: `server/src/modules/tiktok/tiktok-webhook.service.js`
- Create: `server/src/modules/tiktok/tiktok-webhook.service.test.js`

- [ ] **Step 1: Write the failing tests**

Create `server/src/modules/tiktok/tiktok-webhook.service.test.js`:

```javascript
const crypto = require('crypto');

jest.mock('../../config/env', () => ({
  tiktok: { clientSecret: 'test-client-secret' },
}));

const { verifySignature, parseSignatureHeader } = require('./tiktok-webhook.service');

const SECRET = 'test-client-secret';
const BODY = '{"client_key":"k","event":"authorization.removed","create_time":1,"user_openid":"o","content":"{\\"reason\\":1}"}';

function sign(body, timestamp, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

describe('parseSignatureHeader', () => {
  test('parses valid header', () => {
    expect(parseSignatureHeader('t=1633174587,s=abc123')).toEqual({ timestamp: '1633174587', signature: 'abc123' });
  });

  test('parses header with spaces', () => {
    expect(parseSignatureHeader('t=1633174587, s=abc123')).toEqual({ timestamp: '1633174587', signature: 'abc123' });
  });

  test('returns null for missing parts', () => {
    expect(parseSignatureHeader('t=1633174587')).toBeNull();
    expect(parseSignatureHeader('s=abc123')).toBeNull();
    expect(parseSignatureHeader('')).toBeNull();
    expect(parseSignatureHeader(undefined)).toBeNull();
  });
});

describe('verifySignature', () => {
  const now = 1_700_000_000;

  test('accepts valid signature within tolerance', () => {
    const t = now - 10;
    const header = `t=${t},s=${sign(BODY, t)}`;
    expect(verifySignature(BODY, header, { now })).toBe(true);
  });

  test('rejects tampered body', () => {
    const t = now;
    const header = `t=${t},s=${sign(BODY, t)}`;
    expect(verifySignature(`${BODY}x`, header, { now })).toBe(false);
  });

  test('rejects wrong secret', () => {
    const t = now;
    const header = `t=${t},s=${sign(BODY, t, 'wrong-secret')}`;
    expect(verifySignature(BODY, header, { now })).toBe(false);
  });

  test('rejects timestamp older than 300 seconds', () => {
    const t = now - 301;
    const header = `t=${t},s=${sign(BODY, t)}`;
    expect(verifySignature(BODY, header, { now })).toBe(false);
  });

  test('rejects timestamp more than 300 seconds in the future', () => {
    const t = now + 301;
    const header = `t=${t},s=${sign(BODY, t)}`;
    expect(verifySignature(BODY, header, { now })).toBe(false);
  });

  test('rejects malformed header', () => {
    expect(verifySignature(BODY, 'not-a-signature', { now })).toBe(false);
    expect(verifySignature(BODY, undefined, { now })).toBe(false);
    expect(verifySignature(BODY, '', { now })).toBe(false);
  });

  test('rejects when client_secret is not configured', () => {
    const t = now;
    const header = `t=${t},s=${sign(BODY, t, '')}`;
    expect(verifySignature(BODY, header, { now, clientSecret: '' })).toBe(false);
  });

  test('rejects signature with wrong hex length (timing-safe guard)', () => {
    const t = now;
    const header = `t=${t},s=abc`;
    expect(verifySignature(BODY, header, { now })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest src/modules/tiktok/tiktok-webhook.service.test.js`
Expected: FAIL with `Cannot find module './tiktok-webhook.service'`.

- [ ] **Step 3: Implement the service**

Create `server/src/modules/tiktok/tiktok-webhook.service.js`:

```javascript
const crypto = require('crypto');
const env = require('../../config/env');

const TIMESTAMP_TOLERANCE_SECONDS = 300;

function parseSignatureHeader(header) {
  if (!header || typeof header !== 'string') return null;
  const parts = {};
  header.split(',').forEach((kv) => {
    const [k, v] = kv.trim().split('=');
    if (k && v) parts[k] = v;
  });
  if (!parts.t || !parts.s) return null;
  return { timestamp: parts.t, signature: parts.s };
}

function verifySignature(rawBody, header, opts = {}) {
  const clientSecret = opts.clientSecret !== undefined ? opts.clientSecret : env.tiktok.clientSecret;
  const now = opts.now !== undefined ? opts.now : Math.floor(Date.now() / 1000);

  if (!clientSecret) return false;
  if (rawBody == null) return false;

  const parsed = parseSignatureHeader(header);
  if (!parsed) return false;

  const timestamp = Number(parsed.timestamp);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(now - timestamp) > TIMESTAMP_TOLERANCE_SECONDS) return false;

  const signedPayload = `${parsed.timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', clientSecret).update(signedPayload).digest('hex');

  const expectedBuf = Buffer.from(expected, 'hex');
  const receivedBuf = Buffer.from(parsed.signature, 'hex');
  if (expectedBuf.length !== receivedBuf.length) return false;

  try {
    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    return false;
  }
}

module.exports = {
  parseSignatureHeader,
  verifySignature,
  TIMESTAMP_TOLERANCE_SECONDS,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx jest src/modules/tiktok/tiktok-webhook.service.test.js`
Expected: all 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/tiktok/tiktok-webhook.service.js server/src/modules/tiktok/tiktok-webhook.service.test.js
git commit -m "feat(tiktok): add webhook signature verification"
```

---

### Task 3: Event processing

Extends the webhook service with `processEvent(event)`, persisting to `webhook_events` and dispatching handlers. Each event handler is a separate exported function for testability.

**Files:**
- Modify: `server/src/modules/tiktok/tiktok-webhook.service.js`
- Modify: `server/src/modules/tiktok/tiktok-webhook.service.test.js`

- [ ] **Step 1: Add failing tests for `processEvent` and handlers**

Append to `server/src/modules/tiktok/tiktok-webhook.service.test.js`:

```javascript
// ---- processEvent / handlers ----

const mockDb = {
  inserts: [],
  updates: [],
};

jest.mock('../../config/db', () => {
  return jest.fn((table) => {
    const builder = {
      _table: table,
      _where: null,
      where(conditions) { this._where = conditions; return this; },
      first() { return Promise.resolve(mockDb.firstResult || null); },
      insert(row) {
        mockDb.inserts.push({ table: this._table, row });
        return {
          returning: () => Promise.resolve([{ id: 'evt-1', ...row }]),
        };
      },
      update(row) {
        mockDb.updates.push({ table: this._table, where: this._where, row });
        return Promise.resolve(1);
      },
    };
    return builder;
  });
});

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../utils/event-bus', () => ({
  emit: jest.fn(),
}));

const service = require('./tiktok-webhook.service');
const eventBus = require('../../utils/event-bus');

beforeEach(() => {
  mockDb.inserts.length = 0;
  mockDb.updates.length = 0;
  mockDb.firstResult = null;
  eventBus.emit.mockClear();
});

describe('processEvent', () => {
  test('logs every event to webhook_events with source=tiktok', async () => {
    const event = {
      client_key: 'k', event: 'post.publish.complete', create_time: 1,
      user_openid: 'o', content: JSON.stringify({ publish_id: 'p-1', publish_type: 'DIRECT_POST' }),
    };
    await service.processEvent(event);
    expect(mockDb.inserts).toHaveLength(1);
    expect(mockDb.inserts[0]).toMatchObject({
      table: 'webhook_events',
      row: expect.objectContaining({ source: 'tiktok', event_type: 'post.publish.complete' }),
    });
  });

  test('authorization.removed marks client tokens inactive', async () => {
    mockDb.firstResult = { id: 'tok-1', client_id: 'client-123' };
    const event = {
      client_key: 'k', event: 'authorization.removed', create_time: 1,
      user_openid: 'open-abc', content: JSON.stringify({ reason: 1 }),
    };
    await service.processEvent(event);
    const tokUpdate = mockDb.updates.find((u) => u.table === 'client_tiktok_tokens');
    expect(tokUpdate).toBeTruthy();
    expect(tokUpdate.where).toEqual({ tiktok_open_id: 'open-abc' });
    expect(tokUpdate.row).toMatchObject({ is_active: false });
  });

  test('post.publish.complete marks scheduled_post published and emits SSE', async () => {
    mockDb.firstResult = { id: 'post-1', client_id: 'client-1', delivery_id: null };
    const event = {
      client_key: 'k', event: 'post.publish.complete', create_time: 1, user_openid: 'o',
      content: JSON.stringify({ publish_id: 'pub-1', publish_type: 'DIRECT_POST' }),
    };
    await service.processEvent(event);
    const update = mockDb.updates.find((u) => u.table === 'scheduled_posts');
    expect(update).toBeTruthy();
    expect(update.where).toEqual({ tiktok_publish_id: 'pub-1' });
    expect(update.row).toMatchObject({ status: 'published' });
    expect(eventBus.emit).toHaveBeenCalledWith('post:updated', expect.objectContaining({ id: 'post-1' }));
  });

  test('post.publish.publicly_available saves tiktok post_id and permalink', async () => {
    mockDb.firstResult = { id: 'post-1', client_id: 'client-1', tiktok_username: 'johndoe' };
    const event = {
      client_key: 'k', event: 'post.publish.publicly_available', create_time: 1, user_openid: 'o',
      content: JSON.stringify({ publish_id: 'pub-1', post_id: '7300000000000000000', publish_type: 'DIRECT_POST' }),
    };
    await service.processEvent(event);
    const update = mockDb.updates.find((u) => u.table === 'scheduled_posts');
    expect(update.row.tiktok_permalink).toContain('7300000000000000000');
  });

  test('post.publish.failed marks scheduled_post failed with reason', async () => {
    mockDb.firstResult = { id: 'post-1', client_id: 'client-1' };
    const event = {
      client_key: 'k', event: 'post.publish.failed', create_time: 1, user_openid: 'o',
      content: JSON.stringify({ publish_id: 'pub-1', reason: 'video_too_long', publish_type: 'DIRECT_POST' }),
    };
    await service.processEvent(event);
    const update = mockDb.updates.find((u) => u.table === 'scheduled_posts');
    expect(update.row).toMatchObject({ status: 'failed' });
    expect(update.row.last_error).toContain('video_too_long');
  });

  test('unknown events are logged but not fatal', async () => {
    const event = { client_key: 'k', event: 'something.weird', create_time: 1, user_openid: 'o', content: '{}' };
    await expect(service.processEvent(event)).resolves.toBeUndefined();
    expect(mockDb.inserts).toHaveLength(1);
  });

  test('malformed content string does not throw', async () => {
    const event = { client_key: 'k', event: 'post.publish.complete', create_time: 1, user_openid: 'o', content: 'not-json' };
    await expect(service.processEvent(event)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest src/modules/tiktok/tiktok-webhook.service.test.js`
Expected: FAIL — `service.processEvent is not a function`.

- [ ] **Step 3: Extend the service**

Append to `server/src/modules/tiktok/tiktok-webhook.service.js` (keep the existing `parseSignatureHeader`/`verifySignature` exports and append handlers + `processEvent`):

```javascript
const db = require('../../config/db');
const logger = require('../../utils/logger');
const eventBus = require('../../utils/event-bus');

function parseContent(raw) {
  if (!raw) return {};
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

async function logEvent(event) {
  const [row] = await db('webhook_events')
    .insert({
      source: 'tiktok',
      event_type: event.event || 'unknown',
      webhook_id: null,
      payload: JSON.stringify(event),
      status: 'received',
    })
    .returning('*');
  return row;
}

async function handleAuthorizationRemoved(event) {
  const openId = event.user_openid;
  if (!openId) return;
  const token = await db('client_tiktok_tokens').where({ tiktok_open_id: openId }).first();
  if (!token) {
    logger.warn('TikTok authorization.removed: no token found', { openId });
    return;
  }
  await db('client_tiktok_tokens')
    .where({ tiktok_open_id: openId })
    .update({
      is_active: false,
      access_token_encrypted: null,
      token_iv: null,
      token_auth_tag: null,
      refresh_token_encrypted: null,
      refresh_token_iv: null,
      refresh_token_auth_tag: null,
      updated_at: new Date(),
    });
  logger.info('TikTok authorization revoked', { clientId: token.client_id, openId });
  eventBus.emit('tiktok:disconnected', { clientId: token.client_id });
}

async function updateScheduledPostByPublishId(publishId, patch) {
  const post = await db('scheduled_posts').where({ tiktok_publish_id: publishId }).first();
  if (!post) {
    logger.warn('TikTok webhook: scheduled_post not found', { publishId });
    return null;
  }
  await db('scheduled_posts').where({ tiktok_publish_id: publishId }).update({ ...patch, updated_at: new Date() });
  eventBus.emit('post:updated', { id: post.id, clientId: post.client_id });
  return post;
}

async function handlePublishComplete(event) {
  const content = parseContent(event.content);
  if (!content.publish_id) return;
  await updateScheduledPostByPublishId(content.publish_id, {
    status: 'published',
    published_at: new Date(),
  });
}

async function handlePublishPubliclyAvailable(event) {
  const content = parseContent(event.content);
  if (!content.publish_id) return;
  const post = await db('scheduled_posts').where({ tiktok_publish_id: content.publish_id }).first();
  if (!post) {
    logger.warn('TikTok publicly_available: scheduled_post not found', { publishId: content.publish_id });
    return;
  }
  const username = post.tiktok_username || null;
  const permalink = content.post_id
    ? `https://www.tiktok.com/${username ? `@${username}` : ''}/video/${content.post_id}`
    : null;
  await db('scheduled_posts')
    .where({ tiktok_publish_id: content.publish_id })
    .update({
      status: 'published',
      tiktok_permalink: permalink,
      updated_at: new Date(),
    });
  eventBus.emit('post:updated', { id: post.id, clientId: post.client_id });
}

async function handlePublishFailed(event) {
  const content = parseContent(event.content);
  if (!content.publish_id) return;
  await updateScheduledPostByPublishId(content.publish_id, {
    status: 'failed',
    last_error: `TikTok webhook: ${content.reason || 'unknown reason'}`,
  });
}

async function processEvent(event) {
  try {
    await logEvent(event);
    switch (event.event) {
      case 'authorization.removed':
        await handleAuthorizationRemoved(event); break;
      case 'post.publish.complete':
        await handlePublishComplete(event); break;
      case 'post.publish.publicly_available':
        await handlePublishPubliclyAvailable(event); break;
      case 'post.publish.failed':
        await handlePublishFailed(event); break;
      case 'post.publish.inbox_delivered':
      case 'post.publish.no_longer_publicaly_available':
        logger.info(`TikTok webhook (logged only): ${event.event}`);
        break;
      default:
        logger.info(`TikTok webhook (unhandled): ${event.event}`);
    }
  } catch (err) {
    logger.error('TikTok webhook processEvent failed', { error: err.message, event: event?.event });
  }
}

module.exports.logEvent = logEvent;
module.exports.processEvent = processEvent;
module.exports.handleAuthorizationRemoved = handleAuthorizationRemoved;
module.exports.handlePublishComplete = handlePublishComplete;
module.exports.handlePublishPubliclyAvailable = handlePublishPubliclyAvailable;
module.exports.handlePublishFailed = handlePublishFailed;
```

Note: `scheduled_posts` already has columns `status`, `tiktok_publish_id`, `tiktok_permalink`, `published_at`, `updated_at`, `client_id` (migration 028). If `last_error` does not exist on `scheduled_posts`, drop it from the `failed` handler — the test expects it in the update row, but if the column is missing, Knex will throw at runtime. Verify with:

```bash
psql "$DATABASE_URL" -c "\d scheduled_posts" | grep -i error
```

If the column is missing, either (a) add it via a new migration (`029_scheduled_posts_last_error.js` adding `table.text('last_error').nullable()`) **or** (b) remove `last_error` from the failed handler and the matching assertion in the test. Pick (a) if you want an audit trail of publish errors, (b) otherwise.

- [ ] **Step 4: Decide and apply one of (a) or (b) from the note above**

If (a), add the migration:

```javascript
// server/src/database/migrations/029_scheduled_posts_last_error.js
exports.up = async function (knex) {
  await knex.schema.alterTable('scheduled_posts', (table) => {
    table.text('last_error').nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('scheduled_posts', (table) => {
    table.dropColumn('last_error');
  });
};
```

Run: `cd server && npx knex migrate:latest`
Expected: output `Batch N run: 1 migrations` including `029_scheduled_posts_last_error.js`.

If (b), delete the `last_error` key from `handlePublishFailed` and remove the `last_error` assertion from the test.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npx jest src/modules/tiktok/tiktok-webhook.service.test.js`
Expected: all ~17 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/tiktok/tiktok-webhook.service.js server/src/modules/tiktok/tiktok-webhook.service.test.js
# Include the migration if (a) was chosen:
git add server/src/database/migrations/029_scheduled_posts_last_error.js 2>/dev/null || true
git commit -m "feat(tiktok): process webhook events (auth removed, publish lifecycle)"
```

---

### Task 4: Public route and controller handler

Wires the service into Express. The route must be registered **before** `router.use(authenticate)` so it stays public.

**Files:**
- Modify: `server/src/modules/tiktok/tiktok.controller.js`
- Modify: `server/src/modules/tiktok/tiktok.routes.js`
- Create: `server/src/modules/tiktok/tiktok.webhook.integration.test.js`

- [ ] **Step 1: Write the failing integration test**

Create `server/src/modules/tiktok/tiktok.webhook.integration.test.js`:

```javascript
const crypto = require('crypto');
const request = require('supertest');
const express = require('express');

jest.mock('./tiktok-webhook.service', () => ({
  verifySignature: jest.fn(),
  processEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../middleware/auth', () => ({
  authenticate: (req, _res, next) => next(),
  managementLevel: (_req, _res, next) => next(),
}));

const webhookService = require('./tiktok-webhook.service');

function buildApp() {
  const app = express();
  app.use(express.json({
    verify: (req, _res, buf) => {
      if (req.path === '/api/tiktok/webhook') req.rawBody = buf.toString();
    },
  }));
  app.use('/api/tiktok', require('./tiktok.routes'));
  return app;
}

describe('POST /api/tiktok/webhook', () => {
  beforeEach(() => {
    webhookService.verifySignature.mockReset();
    webhookService.processEvent.mockClear();
  });

  test('returns 200 and dispatches when signature is valid', async () => {
    webhookService.verifySignature.mockReturnValue(true);
    const body = { client_key: 'k', event: 'authorization.removed', create_time: 1, user_openid: 'o', content: '{}' };
    const res = await request(buildApp())
      .post('/api/tiktok/webhook')
      .set('Tiktok-Signature', 't=1,s=deadbeef')
      .send(body);
    expect(res.status).toBe(200);
    expect(webhookService.processEvent).toHaveBeenCalledWith(body);
  });

  test('returns 401 when signature is invalid', async () => {
    webhookService.verifySignature.mockReturnValue(false);
    const res = await request(buildApp())
      .post('/api/tiktok/webhook')
      .set('Tiktok-Signature', 't=1,s=bad')
      .send({ event: 'whatever' });
    expect(res.status).toBe(401);
    expect(webhookService.processEvent).not.toHaveBeenCalled();
  });

  test('returns 200 even if processEvent throws (async swallow)', async () => {
    webhookService.verifySignature.mockReturnValue(true);
    webhookService.processEvent.mockRejectedValueOnce(new Error('db down'));
    const res = await request(buildApp())
      .post('/api/tiktok/webhook')
      .set('Tiktok-Signature', 't=1,s=ok')
      .send({ event: 'post.publish.complete', content: '{}' });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest src/modules/tiktok/tiktok.webhook.integration.test.js`
Expected: FAIL — 404 Not Found (route doesn't exist yet).

- [ ] **Step 3: Add controller method**

Modify `server/src/modules/tiktok/tiktok.controller.js`. Add `webhookService` require at top and a new `webhook` method inside the class:

```javascript
const oauthService = require('./tiktok-oauth.service');
const webhookService = require('./tiktok-webhook.service');
const logger = require('../../utils/logger');
const { clientUrl } = require('../../config/env');

class TikTokController {
  async getOAuthUrl(req, res, next) {
    try {
      const { clientId } = req.params;
      const url = await oauthService.getAuthorizationUrl(clientId);
      res.json({ url });
    } catch (err) {
      next(err);
    }
  }

  async oauthCallback(req, res, next) {
    try {
      const { code, state, error } = req.query;

      if (error) {
        return res.redirect(`${clientUrl}/clients?tiktok=denied`);
      }

      const { clientId } = oauthService.parseState(state);
      await oauthService.handleCallback(code, clientId);

      return res.redirect(`${clientUrl}/clients/${clientId}?tiktok=connected`);
    } catch (err) {
      next(err);
    }
  }

  async getConnectionStatus(req, res, next) {
    try {
      const { clientId } = req.params;
      const status = await oauthService.getConnectionStatus(clientId);
      res.json(status);
    } catch (err) {
      next(err);
    }
  }

  async disconnect(req, res, next) {
    try {
      const { clientId } = req.params;
      await oauthService.disconnectClient(clientId);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }

  async webhook(req, res) {
    const signature = req.headers['tiktok-signature'];
    const rawBody = req.rawBody;

    const valid = webhookService.verifySignature(rawBody, signature);
    if (!valid) {
      logger.warn('TikTok webhook signature verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    res.status(200).json({ ok: true });

    Promise.resolve(webhookService.processEvent(req.body)).catch((err) => {
      logger.error('TikTok webhook processing error (post-response)', { error: err.message });
    });
  }
}

module.exports = new TikTokController();
```

- [ ] **Step 4: Register the public route**

Modify `server/src/modules/tiktok/tiktok.routes.js` — add the webhook route **before** `router.use(authenticate)`:

```javascript
const express = require('express');
const { authenticate, managementLevel } = require('../../middleware/auth');
const controller = require('./tiktok.controller');

const router = express.Router();

// Public endpoints (before authenticate middleware)
router.get('/oauth/callback', controller.oauthCallback.bind(controller));
router.post('/webhook', controller.webhook.bind(controller));

// Authenticated endpoints
router.use(authenticate);

router.get('/oauth/url/:clientId', managementLevel, controller.getOAuthUrl.bind(controller));
router.get('/oauth/status/:clientId', controller.getConnectionStatus.bind(controller));
router.delete('/oauth/:clientId', managementLevel, controller.disconnect.bind(controller));

module.exports = router;
```

- [ ] **Step 5: Run integration test to verify it passes**

Run: `cd server && npx jest src/modules/tiktok/tiktok.webhook.integration.test.js`
Expected: all 3 tests PASS.

- [ ] **Step 6: Run the full TikTok test file to ensure no regressions**

Run: `cd server && npx jest src/modules/tiktok/`
Expected: all tests PASS (20 total across both files).

- [ ] **Step 7: Smoke test against the running server**

Start the dev server in another terminal: `cd server && npm run dev`

Then in this terminal compute a valid signature and hit the endpoint:

```bash
SECRET="$(grep TIKTOK_CLIENT_SECRET server/.env | cut -d= -f2 | tr -d '\"' )"
BODY='{"client_key":"test","event":"post.publish.inbox_delivered","create_time":1,"user_openid":"o","content":"{}"}'
TS=$(date +%s)
SIG=$(printf '%s' "${TS}.${BODY}" | openssl dgst -sha256 -hmac "$SECRET" -r | cut -d' ' -f1)
curl -s -o /dev/null -w "valid=%{http_code}\n" \
  -X POST http://localhost:4400/api/tiktok/webhook \
  -H "Content-Type: application/json" \
  -H "Tiktok-Signature: t=${TS},s=${SIG}" \
  --data-binary "$BODY"

curl -s -o /dev/null -w "invalid=%{http_code}\n" \
  -X POST http://localhost:4400/api/tiktok/webhook \
  -H "Content-Type: application/json" \
  -H "Tiktok-Signature: t=${TS},s=deadbeef" \
  --data-binary "$BODY"
```

Expected output:
```
valid=200
invalid=401
```

If `TIKTOK_CLIENT_SECRET` isn't in `server/.env` locally, either add it or skip this step and rely on the integration test.

- [ ] **Step 8: Commit**

```bash
git add server/src/modules/tiktok/tiktok.controller.js server/src/modules/tiktok/tiktok.routes.js server/src/modules/tiktok/tiktok.webhook.integration.test.js
git commit -m "feat(tiktok): expose POST /api/tiktok/webhook with signature check"
```

---

### Task 5: Register webhook in TikTok Developer Portal and verify end-to-end

No code here — this is the operational step that produced the original 401.

**Files:** none.

- [ ] **Step 1: Deploy to Railway**

```bash
git push origin HEAD
```

Wait for Railway to redeploy `server` (watch logs in Railway dashboard until "Server running on port 4400").

- [ ] **Step 2: Smoke test the deployed endpoint**

Re-run the `curl` commands from Task 4 Step 7 but pointing at the deployed URL:

```bash
BASE="https://server-production-bea3.up.railway.app"
# same SECRET/BODY/TS/SIG construction as before, then:
curl -s -o /dev/null -w "valid=%{http_code}\n" -X POST "$BASE/api/tiktok/webhook" \
  -H "Content-Type: application/json" \
  -H "Tiktok-Signature: t=${TS},s=${SIG}" \
  --data-binary "$BODY"
```

Expected: `valid=200`.

- [ ] **Step 3: Register the webhook URL in the TikTok Developer Portal**

1. Open https://developers.tiktok.com/apps → `tasksludus` app → Sandbox (not Production; production is still in review).
2. Products → Webhooks → Callback URL → set to:
   ```
   https://server-production-bea3.up.railway.app/api/tiktok/webhook
   ```
3. Click `Test URL`.

Expected: portal shows `200 OK` for the test call.

- [ ] **Step 4: Trigger a real event to confirm processing**

With the same Sandbox app, run the OAuth flow (from the frontend or by calling `/api/tiktok/oauth/url/:clientId`) to connect a test TikTok account, then disconnect from inside the TikTok app's "Manage apps" page. Within ~1 minute, check:

```sql
-- should show the authorization.removed event
SELECT event_type, status, created_at FROM webhook_events
  WHERE source = 'tiktok' ORDER BY created_at DESC LIMIT 5;

-- should show is_active = false for that client
SELECT client_id, is_active, token_expires_at FROM client_tiktok_tokens
  WHERE tiktok_open_id = '<the open_id of the disconnected account>';
```

Expected: row logged in `webhook_events`; `is_active` is `false`; token columns are nulled.

- [ ] **Step 5: Update memory if operational details changed**

If the TikTok app's Sandbox client_key/secret differ from what's in memory (`memory/tiktok_app_credentials.md`), update that memory file with the current values.

---

## Self-Review

**Spec coverage:**
- Public `POST /api/tiktok/webhook` endpoint → Task 4 (controller + route)
- HMAC-SHA256 signature verification on `Tiktok-Signature` using `TIKTOK_CLIENT_SECRET` → Task 2
- Timestamp replay protection (±300s) → Task 2 test 4 + 5
- Event handlers for authorization revocation and publish lifecycle → Task 3
- Persistence to `webhook_events` for audit → Task 3 (`logEvent`)
- Returns 200 even on internal errors (per TikTok retry policy) → Task 4 Step 3 (`Promise.resolve(...).catch(...)`)
- Raw body capture wired to the request path → Task 1
- Portal registration + smoke test → Task 5

**Placeholder scan:** No TBD/TODO/"similar to Task N" references. Every code step is complete. Test vectors are concrete numbers.

**Type consistency:**
- Service exports `parseSignatureHeader`, `verifySignature`, `processEvent`, `handleAuthorizationRemoved`, `handlePublishComplete`, `handlePublishPubliclyAvailable`, `handlePublishFailed`, `logEvent`, `TIMESTAMP_TOLERANCE_SECONDS` — consistent across Tasks 2–4.
- Column names used in updates (`is_active`, `status`, `tiktok_publish_id`, `tiktok_permalink`, `published_at`, `updated_at`, `last_error`) match migration 028 and the conditional migration 029 in Task 3 Step 4.
- Event names match the verified list from TikTok docs exactly (including the docs' spelling `no_longer_publicaly_available`).

**Open decision:** Task 3 Step 4 forks on whether to add a `last_error` column (migration 029) or drop the field. The plan lets the implementer pick and is internally consistent either way.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-14-tiktok-webhook-endpoint.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session with checkpoints for review.

Which approach?
