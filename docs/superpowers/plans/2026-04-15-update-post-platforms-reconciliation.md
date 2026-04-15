# Update Scheduled Post — Platform Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `PATCH /api/instagram/scheduled-posts/:id` honor the `platforms` array, so editing a post in the UI and toggling Instagram/TikTok creates or removes the sibling `scheduled_posts` row for the other platform.

**Architecture:** The create endpoint already loops over `platforms` and inserts one `scheduled_posts` row per platform, sharing a `post_group_id`. The update endpoint currently strips `platforms` at the validation layer and deletes `platform_overrides` in the handler, so the user's platform toggle is silently dropped. The fix: (1) let the validator pass `platforms`/`platform_overrides` through, (2) treat them as the **desired end state** for the group identified by `clickup_task_id` (falling back to `post_group_id` or the post id for loose rows), (3) add missing platforms, remove unwanted ones (only when status is draft/scheduled/failed), update the surviving rows, and re-normalize `post_group_id`. The existing row that the client patched stays the primary — the response shape stays the same when `platforms` is absent.

**Tech Stack:** Node.js / Express / Joi / Knex (Postgres) / BullMQ / Jest + supertest.

---

## File Structure

- **Modify:** `server/src/modules/instagram/instagram.validation.js` — unstrip `platforms` and `platform_overrides` on the update schema so the controller actually receives them.
- **Modify:** `server/src/modules/instagram/instagram.controller.js` — rewrite `updateScheduledPost` to reconcile the group when `platforms` is in the payload.
- **Create:** `server/src/modules/instagram/instagram.controller.test.js` — Jest + supertest integration tests covering add/remove/no-op/publishing-row scenarios.

No frontend changes — the client already sends the correct payload.

---

## Context the engineer needs

Read these before starting:

- `server/src/modules/instagram/instagram.controller.js` lines 113–161 (`createScheduledPost`) — the reference for how to spawn a per-platform row.
- `server/src/modules/instagram/instagram.controller.js` lines 163–205 (`updateScheduledPost`) — the function being rewritten.
- `server/src/modules/instagram/instagram.validation.js` — the `.strip()` calls on `platforms` / `platform_overrides` are why today's handler never sees them.
- `server/src/queues/index.js` lines 16–57 — `schedulePost(postId, scheduledAt, platform)`, `cancelScheduledPost(postId)`, `reschedulePost(postId, newScheduledAt, platform)`. Platform is required so jobs land in the right queue.
- `server/src/modules/tiktok/tiktok.webhook.integration.test.js` — the shape this repo uses for supertest integration tests (mock db, mount router, send requests).

**Key domain rules:**
- `scheduled_posts` rows sharing a `clickup_task_id` are siblings of the same delivery; `post_group_id` is set when there are 2+ platforms, null otherwise.
- A row whose status is `published` or `publishing` must never be deleted or have its platform changed. Skip those platforms in the "remove" branch and refuse to re-touch them.
- Story-typed posts (`post_type === 'story'`) are Instagram-only — the controller must silently skip creating a tiktok row for a story, mirroring what `createScheduledPost` does at line 126.

---

### Task 1: Let the validator pass `platforms` / `platform_overrides` through on update

**Files:**
- Modify: `server/src/modules/instagram/instagram.validation.js` lines 45–46

- [ ] **Step 1: Open the file and confirm the current shape**

Run: `sed -n '29,47p' server/src/modules/instagram/instagram.validation.js`

Expected: the update schema with `platforms: Joi.array().items(...).strip()` and `platform_overrides: Joi.object().strip()`.

- [ ] **Step 2: Replace the two `.strip()` fields**

Edit `server/src/modules/instagram/instagram.validation.js` — replace the two lines:

```js
  platforms: Joi.array().items(Joi.string().valid('instagram', 'tiktok')).strip(),
  platform_overrides: Joi.object().strip(),
```

with:

```js
  platforms: Joi.array().items(Joi.string().valid('instagram', 'tiktok')).min(1).optional(),
  platform_overrides: Joi.object().pattern(
    Joi.string().valid('instagram', 'tiktok'),
    Joi.object({
      caption: Joi.string().max(2200).optional(),
      scheduled_at: Joi.date().iso().optional(),
    })
  ).optional(),
```

- [ ] **Step 3: Sanity-check existing tiktok tests still pass**

Run: `cd server && npx jest src/modules/tiktok --silent`
Expected: `Tests: 26 passed`.

- [ ] **Step 4: Commit**

```bash
git add server/src/modules/instagram/instagram.validation.js
git commit -m "fix(instagram): allow platforms/platform_overrides on update payload

Stripping them at validation silently dropped the user's platform toggle
when editing a post. The handler rewrite in the next commit depends on
the controller actually receiving these fields."
```

---

### Task 2: Write failing integration tests for the new update behavior

**Files:**
- Create: `server/src/modules/instagram/instagram.controller.test.js`

These tests drive the handler rewrite in Task 3. Follow the style of `server/src/modules/tiktok/tiktok.webhook.integration.test.js`: mock the DB with an in-memory store, mock the queue helpers, mount the routes, and drive the endpoint with supertest.

- [ ] **Step 1: Create the test file**

Write the complete file `server/src/modules/instagram/instagram.controller.test.js`:

```js
const request = require('supertest');
const express = require('express');

// In-memory store simulating scheduled_posts
const store = {
  rows: [],
  inserted: [],
  deleted: [],
  updated: [],
  reset() {
    this.rows = [];
    this.inserted = [];
    this.deleted = [];
    this.updated = [];
  },
};

jest.mock('../../config/db', () => {
  const db = jest.fn((table) => {
    const qb = {
      _table: table,
      _where: null,
      where(c) { this._where = c; return this; },
      whereIn() { return this; },
      select() { return this; },
      first() {
        if (this._table !== 'scheduled_posts') return Promise.resolve(null);
        const row = store.rows.find((r) => r.id === (this._where && this._where.id));
        return Promise.resolve(row || null);
      },
      del() {
        if (this._table !== 'scheduled_posts') return Promise.resolve(0);
        const before = store.rows.length;
        store.rows = store.rows.filter((r) => r.id !== this._where.id);
        store.deleted.push(this._where.id);
        return Promise.resolve(before - store.rows.length);
      },
      insert(row) {
        const inserted = { id: `row-${store.rows.length + 1}`, ...row };
        store.rows.push(inserted);
        store.inserted.push(inserted);
        return { returning: () => Promise.resolve([inserted]) };
      },
      update(patch) {
        const row = store.rows.find((r) => r.id === (this._where && this._where.id));
        if (row) Object.assign(row, patch);
        store.updated.push({ id: this._where && this._where.id, patch });
        return { returning: () => Promise.resolve([row]) };
      },
    };
    return qb;
  });
  return db;
});

jest.mock('../../queues', () => ({
  schedulePost: jest.fn().mockResolvedValue(undefined),
  reschedulePost: jest.fn().mockResolvedValue(undefined),
  cancelScheduledPost: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../middleware/auth', () => ({
  authenticate: (req, _res, next) => { req.user = { id: 'user-1' }; next(); },
  managementLevel: (_req, _res, next) => next(),
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

jest.mock('../webhooks/clickup.service', () => ({
  moveToAgendado: jest.fn().mockResolvedValue(undefined),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/instagram', require('./instagram.routes'));
  return app;
}

function seedInstagramPost(overrides = {}) {
  const row = {
    id: 'post-ig',
    client_id: 'client-1',
    delivery_id: 'deliv-1',
    clickup_task_id: 'task-abc',
    caption: 'hello',
    post_type: 'reel',
    media_urls: JSON.stringify([{ url: 'https://x/a.mp4', type: 'video', order: 0 }]),
    thumbnail_url: null,
    scheduled_at: null,
    platform: 'instagram',
    post_group_id: null,
    status: 'draft',
    created_by: 'user-1',
    ...overrides,
  };
  store.rows.push(row);
  return row;
}

beforeEach(() => store.reset());

describe('PATCH /api/instagram/scheduled-posts/:id — platform reconciliation', () => {
  test('adding tiktok to an instagram-only post creates a sibling tiktok row and shares post_group_id', async () => {
    seedInstagramPost();
    const res = await request(buildApp())
      .patch('/api/instagram/scheduled-posts/post-ig')
      .send({ platforms: ['instagram', 'tiktok'] });
    expect(res.status).toBe(200);
    const tiktok = store.rows.find((r) => r.platform === 'tiktok');
    expect(tiktok).toBeTruthy();
    expect(tiktok.clickup_task_id).toBe('task-abc');
    expect(tiktok.post_type).toBe('reel');
    const groupIds = new Set(store.rows.map((r) => r.post_group_id));
    expect(groupIds.size).toBe(1);
    expect([...groupIds][0]).toBeTruthy();
  });

  test('removing tiktok from a multi-platform group deletes the draft tiktok row and nulls post_group_id on the survivor', async () => {
    const gid = 'group-1';
    seedInstagramPost({ post_group_id: gid });
    seedInstagramPost({ id: 'post-tt', platform: 'tiktok', post_group_id: gid });
    const res = await request(buildApp())
      .patch('/api/instagram/scheduled-posts/post-ig')
      .send({ platforms: ['instagram'] });
    expect(res.status).toBe(200);
    expect(store.rows.find((r) => r.id === 'post-tt')).toBeUndefined();
    expect(store.deleted).toContain('post-tt');
    const survivor = store.rows.find((r) => r.id === 'post-ig');
    expect(survivor.post_group_id).toBeNull();
    const { cancelScheduledPost } = require('../../queues');
    expect(cancelScheduledPost).toHaveBeenCalledWith('post-tt');
  });

  test('removing a published platform is refused and leaves the row intact', async () => {
    const gid = 'group-1';
    seedInstagramPost({ status: 'published', post_group_id: gid });
    seedInstagramPost({ id: 'post-tt', platform: 'tiktok', post_group_id: gid });
    const res = await request(buildApp())
      .patch('/api/instagram/scheduled-posts/post-tt')
      .send({ platforms: ['tiktok'] });
    expect(res.status).toBe(409);
    expect(store.rows.find((r) => r.id === 'post-ig').status).toBe('published');
  });

  test('story post_type silently skips tiktok row creation', async () => {
    seedInstagramPost({ post_type: 'story' });
    const res = await request(buildApp())
      .patch('/api/instagram/scheduled-posts/post-ig')
      .send({ platforms: ['instagram', 'tiktok'] });
    expect(res.status).toBe(200);
    expect(store.rows.filter((r) => r.platform === 'tiktok')).toHaveLength(0);
  });

  test('platform_overrides apply the caption override only to tiktok', async () => {
    seedInstagramPost();
    const res = await request(buildApp())
      .patch('/api/instagram/scheduled-posts/post-ig')
      .send({
        caption: 'ig caption',
        platforms: ['instagram', 'tiktok'],
        platform_overrides: { tiktok: { caption: 'tiktok caption' } },
      });
    expect(res.status).toBe(200);
    const ig = store.rows.find((r) => r.platform === 'instagram');
    const tt = store.rows.find((r) => r.platform === 'tiktok');
    expect(ig.caption).toBe('ig caption');
    expect(tt.caption).toBe('tiktok caption');
  });

  test('request with no platforms field still updates the single post (backward compat)', async () => {
    seedInstagramPost();
    const res = await request(buildApp())
      .patch('/api/instagram/scheduled-posts/post-ig')
      .send({ caption: 'edited' });
    expect(res.status).toBe(200);
    expect(store.rows.find((r) => r.id === 'post-ig').caption).toBe('edited');
    expect(store.rows.filter((r) => r.platform === 'tiktok')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the new test file and confirm it fails**

Run: `cd server && npx jest src/modules/instagram/instagram.controller.test.js`
Expected: every `adding tiktok`, `removing tiktok`, `platform_overrides`, `story` and `removing a published platform` test fails — the current handler does not create sibling rows or delete siblings. The `backward compat` test may pass; that is acceptable.

- [ ] **Step 3: Commit**

```bash
git add server/src/modules/instagram/instagram.controller.test.js
git commit -m "test(instagram): add failing tests for updateScheduledPost platform reconciliation

Pins the contract: toggling platforms on an existing post should
create or delete sibling rows, preserve post_group_id coherence,
apply platform_overrides, and refuse to edit published rows."
```

---

### Task 3: Rewrite `updateScheduledPost` to reconcile platforms

**Files:**
- Modify: `server/src/modules/instagram/instagram.controller.js` (replace the existing `updateScheduledPost` body, lines 163–205, and add a private helper)

- [ ] **Step 1: Import `crypto` at the top if not already imported**

Run: `sed -n '1,10p' server/src/modules/instagram/instagram.controller.js`

Confirm that `const crypto = require('crypto');` (or `require('node:crypto')`) is present near the top of the file — `createScheduledPost` uses `crypto.randomUUID()` so it almost certainly is. If it isn't, add `const crypto = require('crypto');` after the other `require` calls.

- [ ] **Step 2: Replace the `updateScheduledPost` method**

Replace the whole method (from `async updateScheduledPost(req, res, next) {` through its closing `}`) with:

```js
  async updateScheduledPost(req, res, next) {
    try {
      const { error, value } = updateScheduledPostSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const existing = await db('scheduled_posts').where({ id: req.params.id }).first();
      if (!existing) return res.status(404).json({ error: 'Post not found' });

      if (['published', 'publishing'].includes(existing.status)) {
        return res.status(400).json({ error: 'Cannot edit a published or publishing post' });
      }

      // Is the client asking us to change the platform set?
      const reconcilePlatforms = Array.isArray(value.platforms);
      const desiredPlatforms = reconcilePlatforms ? [...new Set(value.platforms)] : null;
      const overrides = value.platform_overrides || {};

      // Fields that apply to every surviving row in the group
      const sharedFields = { ...value };
      delete sharedFields.platforms;
      delete sharedFields.platform_overrides;
      delete sharedFields.platform;
      if (sharedFields.media_urls) sharedFields.media_urls = JSON.stringify(sharedFields.media_urls);

      // Derive new status from scheduled_at if the client touched it
      let derivedStatus = null;
      if (value.scheduled_at) derivedStatus = 'scheduled';
      else if (value.scheduled_at === null) derivedStatus = 'draft';

      // --- Single-post path (no platforms field) ---
      if (!reconcilePlatforms) {
        const updateData = { ...sharedFields, updated_at: new Date() };
        if (derivedStatus) updateData.status = derivedStatus;

        const [updated] = await db('scheduled_posts')
          .where({ id: req.params.id })
          .update(updateData)
          .returning('*');

        if (updated.status === 'scheduled' && updated.scheduled_at) {
          await reschedulePost(updated.id, updated.scheduled_at, updated.platform);
          this._moveToAgendado(updated);
        } else if (updated.status === 'draft') {
          await cancelScheduledPost(updated.id);
        }

        return res.json(updated);
      }

      // --- Multi-platform reconcile path ---
      // Group = all rows that share this delivery. Fall back to post_group_id or
      // just the edited row if the delivery key is missing.
      const siblingsFilter = existing.clickup_task_id
        ? { clickup_task_id: existing.clickup_task_id }
        : existing.post_group_id
          ? { post_group_id: existing.post_group_id }
          : { id: existing.id };
      const siblings = await db('scheduled_posts').where(siblingsFilter);

      // Published/publishing siblings are frozen — if the user tried to remove their
      // platform, that's a conflict. We never delete or mutate those rows.
      const frozen = siblings.filter((s) => ['published', 'publishing'].includes(s.status));
      const toRemove = siblings.filter(
        (s) => !desiredPlatforms.includes(s.platform) && !frozen.includes(s),
      );
      const frozenBeingRemoved = frozen.filter((s) => !desiredPlatforms.includes(s.platform));
      if (frozenBeingRemoved.length > 0) {
        return res.status(409).json({
          error: 'Cannot remove a platform whose post is already published or publishing',
          platforms: frozenBeingRemoved.map((s) => s.platform),
        });
      }

      // After reconcile, how many rows will share this delivery? This drives post_group_id.
      const survivingPlatforms = new Set([
        ...frozen.map((s) => s.platform),
        ...desiredPlatforms.filter((p) => !(p === 'tiktok' && (sharedFields.post_type || existing.post_type) === 'story')),
      ]);
      const groupCount = survivingPlatforms.size;
      const groupId = groupCount > 1
        ? (siblings.find((s) => s.post_group_id)?.post_group_id || crypto.randomUUID())
        : null;

      // 1. Delete unwanted draft/scheduled/failed siblings
      for (const row of toRemove) {
        await cancelScheduledPost(row.id);
        await db('scheduled_posts').where({ id: row.id }).del();
      }

      // 2. Upsert each desired platform
      const results = [];
      for (const platform of desiredPlatforms) {
        const effectivePostType = sharedFields.post_type || existing.post_type;
        if (platform === 'tiktok' && effectivePostType === 'story') continue;

        const platformOverride = overrides[platform] || {};
        const platformCaption = platformOverride.caption !== undefined
          ? platformOverride.caption
          : (sharedFields.caption !== undefined ? sharedFields.caption : undefined);
        const platformScheduledAt = platformOverride.scheduled_at !== undefined
          ? platformOverride.scheduled_at
          : (sharedFields.scheduled_at !== undefined ? sharedFields.scheduled_at : undefined);

        const sibling = siblings.find((s) => s.platform === platform);

        if (sibling) {
          // Skip frozen siblings — they stay as-is
          if (frozen.includes(sibling)) {
            results.push(sibling);
            continue;
          }
          const patch = { ...sharedFields, updated_at: new Date() };
          if (platformCaption !== undefined) patch.caption = platformCaption;
          if (platformScheduledAt !== undefined) patch.scheduled_at = platformScheduledAt;
          patch.post_group_id = groupId;
          if (derivedStatus) patch.status = derivedStatus;

          const [updated] = await db('scheduled_posts')
            .where({ id: sibling.id })
            .update(patch)
            .returning('*');

          if (updated.status === 'scheduled' && updated.scheduled_at) {
            await reschedulePost(updated.id, updated.scheduled_at, updated.platform);
            this._moveToAgendado(updated);
          } else if (updated.status === 'draft') {
            await cancelScheduledPost(updated.id);
          }
          results.push(updated);
        } else {
          // Create a new row for this platform
          const newRow = {
            client_id: existing.client_id,
            delivery_id: existing.delivery_id,
            clickup_task_id: existing.clickup_task_id,
            caption: platformCaption !== undefined ? platformCaption : existing.caption,
            post_type: effectivePostType,
            media_urls: sharedFields.media_urls || existing.media_urls,
            thumbnail_url: sharedFields.thumbnail_url !== undefined ? sharedFields.thumbnail_url : existing.thumbnail_url,
            scheduled_at: platformScheduledAt !== undefined ? platformScheduledAt : existing.scheduled_at,
            platform,
            post_group_id: groupId,
            status: derivedStatus || (platformScheduledAt ? 'scheduled' : 'draft'),
            created_by: req.user.id,
          };
          const [inserted] = await db('scheduled_posts').insert(newRow).returning('*');
          if (inserted.status === 'scheduled' && inserted.scheduled_at) {
            await schedulePost(inserted.id, inserted.scheduled_at, platform);
            this._moveToAgendado(inserted);
          }
          results.push(inserted);
        }
      }

      // 3. Normalize post_group_id on any frozen siblings we kept
      for (const row of frozen) {
        if (row.post_group_id !== groupId) {
          await db('scheduled_posts').where({ id: row.id }).update({ post_group_id: groupId });
        }
      }

      // Return the row the client originally patched first, siblings after
      const primary = results.find((r) => r.id === existing.id) || results[0];
      const ordered = [primary, ...results.filter((r) => r.id !== primary.id)];
      return res.json(ordered.length === 1 ? ordered[0] : ordered);
    } catch (err) {
      next(err);
    }
  }
```

- [ ] **Step 3: Run the instagram controller tests**

Run: `cd server && npx jest src/modules/instagram/instagram.controller.test.js`
Expected: all 6 tests pass.

- [ ] **Step 4: Run the entire repo test suite to confirm no regression**

Run: `cd server && npx jest --silent`
Expected: all tests pass (tiktok webhook + integration + new instagram tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/instagram/instagram.controller.js
git commit -m "fix(instagram): reconcile platforms on scheduled post update

When the client sends a platforms array on PATCH, treat it as the
desired set for the delivery group: add a row for each new platform,
delete draft/scheduled rows for platforms that were removed, and keep
post_group_id coherent (null when only one row remains, shared uuid
otherwise). Published and publishing rows are frozen — attempting to
remove their platform returns 409. Story post_type still silently
skips tiktok, matching createScheduledPost."
```

---

### Task 4: Manual verification against production data

**Files:** none (prod smoke test)

- [ ] **Step 1: Pick a draft delivery in the UI that was originally instagram-only**

Open TasksLudus, edit the scheduled post for any draft delivery, toggle TikTok on in the platform selector, save.

- [ ] **Step 2: Confirm the DB has two rows**

Run in a terminal linked to Railway:

```bash
DB_URL=$(railway variables --service Postgres --json 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('DATABASE_PUBLIC_URL',''))") && \
DATABASE_URL="$DB_URL" node -e "
const db = require('./server/src/config/db');
(async () => {
  const rows = await db('scheduled_posts').where({ clickup_task_id: process.argv[1] }).select('id','platform','status','post_group_id');
  console.log(rows);
  await db.destroy();
})();
" <clickup_task_id>
```

Expected: two rows (`instagram` + `tiktok`) sharing the same non-null `post_group_id`.

- [ ] **Step 3: Click "Publicar" on the delivery and watch the Railway logs**

Run: `railway logs --service server --lines 200 | grep -iE "tiktok|publish"`
Expected: both `Processing publish job` (instagram) and `Processing TikTok publish job` entries appear.

- [ ] **Step 4: Toggle TikTok off in the UI and confirm the tiktok row is deleted**

Repeat the DB query. Expected: only the `instagram` row remains; its `post_group_id` is `NULL`.

No commit — this is a manual smoke test gate before closing the task.

---

## Self-Review (done)

- **Spec coverage:** user wants toggling platforms in the UI to create/remove rows — Task 3 does that. User wants existing publish paths untouched — single-post path (no `platforms` field) preserves current behavior. User wants the tiktok publish to trigger when a tiktok row exists — that already works once the row is created.
- **Placeholders:** none.
- **Type consistency:** helper names (`schedulePost`, `reschedulePost`, `cancelScheduledPost`, `_moveToAgendado`) match what the existing controller already uses.
- **Scope:** single plan, single module, one commit per task. Tests co-located with the code they cover.
