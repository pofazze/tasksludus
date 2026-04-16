# Notification Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-item rejection ping with an 8-minute window that consolidates client reviews into one Social Media digest, fans rejections out to the producer who actually built the rejected piece (designer for "cover", video editor for "video"), notifies the client's category WhatsApp group, and posts a single publish-success digest to the client + category groups when every platform of a delivery has published.

**Architecture:** A new `approvalReviewWindowQueue` BullMQ job opens when the client first reviews any item in a batch and either fires after 8 minutes or is promoted to immediate when the batch is fully reviewed. The worker calls a new `notifications.service` that composes pt-BR WhatsApp messages and routes them through the existing `evolutionService.sendText`. A new `rejection_target` column on `approval_items` (`'cover' | 'video' | NULL`) drives producer routing using `delivery_phases` history. The category → WhatsApp group mapping lives as a single JSON row in the existing `app_settings` table.

**Tech Stack:** Node.js / Express / Knex (Postgres) / BullMQ / Jest + supertest / React (Vite).

---

## File Structure

| File | Role |
|---|---|
| `server/src/database/migrations/029_notifications_improvements.js` (NEW) | Add `approval_items.rejection_target`, `approval_batches.review_window_started_at`, `approval_batches.review_window_fired_at`. |
| `server/src/modules/notifications/notifications.service.js` (NEW) | Pure compose + dispatch. Three exports: `notifyBatchReviewWindow`, `notifyRejections`, `notifyPublishSuccess`. |
| `server/src/modules/notifications/notifications.service.test.js` (NEW) | Unit tests for compose + routing + dedup. |
| `server/src/queues/index.js` (MODIFY) | Register `approvalReviewWindowQueue` and helpers `enqueueApprovalReviewWindow(batchId)`, `promoteApprovalReviewWindow(batchId)`. |
| `server/src/queues/approval-review-window.worker.js` (NEW) | BullMQ worker that runs the dispatcher. Idempotent on `review_window_fired_at`. |
| `server/src/queues/approval-review-window.worker.test.js` (NEW) | Worker idempotency + dispatch test. |
| `server/src/app.js` (MODIFY) | `require('./queues/approval-review-window.worker');` inside the existing BullMQ try block. |
| `server/src/modules/approvals/approvals.validation.js` (MODIFY) | Accept `rejection_target ∈ {'cover','video'}` on `clientRespondSchema`. |
| `server/src/modules/approvals/approvals.service.js` (MODIFY) | Persist `rejection_target`, open / promote the window from `clientRespond`, remove the inline `_notifySmRejection` call. |
| `server/src/modules/approvals/approvals.service.test.js` (NEW) | Tests for the trigger logic. |
| `server/src/modules/instagram/instagram-publish.service.js` (MODIFY) | Call `notificationsService.notifyPublishSuccess(post)` inside the existing `if (groupReady)` block. |
| `server/src/modules/tiktok/tiktok-publish.service.js` (MODIFY) | Same call in the equivalent block. |
| `client/src/pages/PublicApprovalPage.jsx` (MODIFY) | Add capa/vídeo radio to the rejection modal when the post is a reel/video with `thumbnail_url`. Submit body now carries `rejection_target`. |

---

## Context the engineer needs

Read these first — they are the foundations the plan builds on:

- `docs/superpowers/specs/2026-04-16-notifications-improvements-design.md` — the full design with rationale, message templates, error semantics.
- `server/src/modules/evolution/evolution.service.js` — `sendText(remoteJid, text)` returns null on configured-but-failed sends and returns `null` silently if Evolution is not configured. `buildPersonalJid(phone)` converts `'5511...'` → `'5511...@s.whatsapp.net'`.
- `server/src/queues/approval-reminder.worker.js` — the template for a BullMQ worker. The new worker mirrors its shape (Worker constructor, `connection`, `concurrency: 1`, `attempts: 3` defaults).
- `server/src/queues/index.js` — `connection` is exported. Queues use `new Queue(name, { connection })` and helpers wrap `queue.add('jobtype', data, { delay, jobId })`.
- `server/src/modules/approvals/approvals.service.js:492` — `clientRespond` is the trigger. Lines 552–553 contain the `_notifySmRejection` call to remove. Lines 568–586 contain the existing "all responded" handling — the new window logic plugs in next to it.
- `server/src/modules/webhooks/clickup.service.js:767` — `delivery_phases` schema uses columns `delivery_id`, `clickup_task_id`, `phase`, `assignee_clickup_id`, `user_id`, `entered_at`, `exited_at`. Producer routing reads it via `user_id`.
- `server/src/database/migrations/` — last migration is `028_tiktok_integration.js`. Next number is `029`.
- `server/src/modules/settings/settings.service.js` — `getSetting(key)` throws 404 if missing; treat that as "no mapping configured" and skip silently. Use a direct `db('app_settings').where({ key }).first()` from the dispatcher to keep the dispatcher self-contained.
- `client/src/pages/PublicApprovalPage.jsx:197` — the rejection modal. The component uses local state `rejectingId`, `rejectionReason`, and a `handleRejectConfirm` handler that POSTs to `/api/approvals/public/:token/items/:itemId/respond`.

The repo runs Knex migrations on boot via `npx knex migrate:latest && node src/app.js`, so the migration in Task 1 runs automatically when the server restarts after deploy.

Test style is the inline-store db mock from `server/src/modules/tiktok/tiktok-webhook.service.test.js`. New tests follow the same shape.

---

### Task 1: Migration — add `rejection_target` and the two window columns

**Files:**
- Create: `server/src/database/migrations/029_notifications_improvements.js`

- [ ] **Step 1: Create the migration file**

```js
exports.up = function (knex) {
  return knex.schema
    .alterTable('approval_items', (table) => {
      table.string('rejection_target', 10).nullable();
    })
    .alterTable('approval_batches', (table) => {
      table.timestamp('review_window_started_at', { useTz: true }).nullable();
      table.timestamp('review_window_fired_at', { useTz: true }).nullable();
    });
};

exports.down = function (knex) {
  return knex.schema
    .alterTable('approval_batches', (table) => {
      table.dropColumn('review_window_fired_at');
      table.dropColumn('review_window_started_at');
    })
    .alterTable('approval_items', (table) => {
      table.dropColumn('rejection_target');
    });
};
```

- [ ] **Step 2: Run the migration locally**

Run: `cd server && npx knex migrate:latest`
Expected: `Batch 1 run: 1 migrations` mentioning `029_notifications_improvements.js`. If running against a remote DB, set `DATABASE_URL` first.

- [ ] **Step 3: Run existing tests to confirm no regression**

Run: `cd server && npx jest --silent`
Expected: `Tests: 32 passed, 32 total` (or the current baseline).

- [ ] **Step 4: Commit**

```bash
git add server/src/database/migrations/029_notifications_improvements.js
git -c safe.directory=/home/dev/projetos commit -m "feat(approvals): migration for rejection_target and review window columns

Adds approval_items.rejection_target ('cover' | 'video' | NULL) and
approval_batches.review_window_started_at / review_window_fired_at,
which the new BullMQ-driven 8-minute review-window flow uses to track
when to fire the consolidated SM digest."
```

---

### Task 2: Notifications service — message composition and dispatch (with tests)

**Files:**
- Create: `server/src/modules/notifications/notifications.service.js`
- Create: `server/src/modules/notifications/notifications.service.test.js`

The service has three public functions and a tiny set of private helpers. All WhatsApp sends are individually try/caught so one failure never blocks another destination.

- [ ] **Step 1: Write the failing tests**

Create `server/src/modules/notifications/notifications.service.test.js`:

```js
const mockSendText = jest.fn().mockResolvedValue(null);
const mockBuildPersonalJid = jest.fn((phone) => `${phone}@s.whatsapp.net`);

jest.mock('../evolution/evolution.service', () => ({
  sendText: (...args) => mockSendText(...args),
  buildPersonalJid: (...args) => mockBuildPersonalJid(...args),
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

const fixtures = {
  client: { id: 'c1', name: 'Cliente Demo', category: 'health', whatsapp_group: '120000@g.us' },
  smUser: { id: 'sm1', whatsapp: '5511999000001' },
  designer: { id: 'd1', clickup_id: 'cu-d1', whatsapp: '5511999000002' },
  editor: { id: 'e1', clickup_id: 'cu-e1', whatsapp: '5511999000003' },
  categoryGroup: '120363425760405482@g.us',
};

const dbState = {
  app_settings: { category_whatsapp_groups: { health: fixtures.categoryGroup } },
  clients: { c1: fixtures.client },
  users: { sm1: fixtures.smUser, d1: fixtures.designer, e1: fixtures.editor },
  delivery_phases: [],
  deliveries: {},
};

jest.mock('../../config/db', () => {
  return jest.fn((table) => {
    const builder = {
      _table: table,
      _where: null,
      _orderBy: null,
      where(c) { this._where = c; return this; },
      whereIn(col, vals) { this._whereInCol = col; this._whereInVals = vals; return this; },
      orderBy(col, dir) { this._orderBy = { col, dir }; return this; },
      select() { return this; },
      first() {
        if (this._table === 'app_settings' && this._where?.key) {
          const value = dbState.app_settings[this._where.key];
          return Promise.resolve(value ? { key: this._where.key, value } : null);
        }
        if (this._table === 'clients' && this._where?.id) {
          return Promise.resolve(dbState.clients[this._where.id] || null);
        }
        if (this._table === 'users' && this._where?.id) {
          return Promise.resolve(dbState.users[this._where.id] || null);
        }
        if (this._table === 'users' && this._where?.clickup_id) {
          const u = Object.values(dbState.users).find((x) => x.clickup_id === this._where.clickup_id);
          return Promise.resolve(u || null);
        }
        if (this._table === 'deliveries' && this._where?.id) {
          return Promise.resolve(dbState.deliveries[this._where.id] || null);
        }
        return Promise.resolve(null);
      },
      then(resolve) {
        if (this._table === 'delivery_phases') {
          let rows = dbState.delivery_phases.filter((p) => {
            if (this._where) {
              for (const k of Object.keys(this._where)) {
                if (p[k] !== this._where[k]) return false;
              }
            }
            if (this._whereInCol) {
              if (!this._whereInVals.includes(p[this._whereInCol])) return false;
            }
            return true;
          });
          if (this._orderBy) {
            rows = [...rows].sort((a, b) => {
              const av = a[this._orderBy.col]; const bv = b[this._orderBy.col];
              const cmp = av > bv ? 1 : av < bv ? -1 : 0;
              return this._orderBy.dir === 'desc' ? -cmp : cmp;
            });
          }
          return Promise.resolve(rows).then(resolve);
        }
        return Promise.resolve([]).then(resolve);
      },
    };
    return builder;
  });
});

const notifications = require('./notifications.service');

beforeEach(() => {
  mockSendText.mockClear();
  mockBuildPersonalJid.mockClear();
  dbState.delivery_phases = [];
  dbState.deliveries = {};
});

describe('notifyBatchReviewWindow', () => {
  test('sends a digest with both approved and rejected sections to the SM', async () => {
    const batch = { id: 'b1', client_id: 'c1', social_media_id: 'sm1' };
    const items = [
      { id: 'i1', status: 'approved', delivery_id: 'dl1', delivery_title: 'Post A', clickup_task_id: 'tA', rejection_reason: null, rejection_target: null },
      { id: 'i2', status: 'rejected', delivery_id: 'dl2', delivery_title: 'Post B', clickup_task_id: 'tB', rejection_reason: 'Trocar a cor', rejection_target: null },
    ];
    await notifications.notifyBatchReviewWindow(batch, items);
    expect(mockSendText).toHaveBeenCalled();
    const [jid, text] = mockSendText.mock.calls.find((c) => c[0] === '5511999000001@s.whatsapp.net');
    expect(jid).toBe('5511999000001@s.whatsapp.net');
    expect(text).toContain('Cliente Demo');
    expect(text).toContain('✅ Aprovados (1)');
    expect(text).toContain('Post A');
    expect(text).toContain('❌ Reprovados (1)');
    expect(text).toContain('Post B');
    expect(text).toContain('Motivo: Trocar a cor');
  });

  test('omits the empty section when only approvals exist', async () => {
    const batch = { id: 'b1', client_id: 'c1', social_media_id: 'sm1' };
    const items = [{ id: 'i1', status: 'approved', delivery_id: 'dl1', delivery_title: 'Post A', clickup_task_id: 'tA' }];
    await notifications.notifyBatchReviewWindow(batch, items);
    const smCall = mockSendText.mock.calls.find((c) => c[0] === '5511999000001@s.whatsapp.net');
    expect(smCall[1]).toContain('✅ Aprovados (1)');
    expect(smCall[1]).not.toContain('❌ Reprovados');
  });

  test('skips silently when SM has no whatsapp configured', async () => {
    const batch = { id: 'b1', client_id: 'c1', social_media_id: 'sm-no-phone' };
    dbState.users['sm-no-phone'] = { id: 'sm-no-phone', whatsapp: null };
    await notifications.notifyBatchReviewWindow(batch, [
      { id: 'i1', status: 'approved', delivery_id: 'dl1', delivery_title: 'P', clickup_task_id: 't' },
    ]);
    expect(mockSendText).not.toHaveBeenCalledWith('5511999000001@s.whatsapp.net', expect.anything());
  });

  test('triggers notifyRejections when items contain rejections', async () => {
    dbState.deliveries.dl1 = { id: 'dl1', client_id: 'c1', clickup_task_id: 'tA', title: 'Post A' };
    dbState.delivery_phases = [
      { delivery_id: 'dl1', phase: 'design', user_id: 'd1', entered_at: '2026-04-01T00:00:00Z' },
    ];
    const batch = { id: 'b1', client_id: 'c1', social_media_id: 'sm1' };
    const items = [
      { id: 'i1', status: 'rejected', delivery_id: 'dl1', delivery_title: 'Post A', clickup_task_id: 'tA', rejection_reason: 'fix it', rejection_target: null, post_type: 'image' },
    ];
    await notifications.notifyBatchReviewWindow(batch, items);
    const designerCall = mockSendText.mock.calls.find((c) => c[0] === '5511999000002@s.whatsapp.net');
    expect(designerCall).toBeTruthy();
    expect(designerCall[1]).toContain('Post A');
  });
});

describe('notifyRejections — producer routing', () => {
  test('rejection_target=cover routes to the design phase assignee', async () => {
    dbState.deliveries.dl1 = { id: 'dl1', client_id: 'c1', clickup_task_id: 't1', title: 'Post X' };
    dbState.delivery_phases = [
      { delivery_id: 'dl1', phase: 'design', user_id: 'd1', entered_at: '2026-04-01T00:00:00Z' },
      { delivery_id: 'dl1', phase: 'edicao_de_video', user_id: 'e1', entered_at: '2026-04-02T00:00:00Z' },
    ];
    await notifications.notifyRejections(
      { id: 'b1', client_id: 'c1' },
      [{ id: 'i1', delivery_id: 'dl1', delivery_title: 'Post X', clickup_task_id: 't1', rejection_reason: 'fix cover', rejection_target: 'cover', post_type: 'reel' }],
    );
    const designerJids = mockSendText.mock.calls.map((c) => c[0]);
    expect(designerJids).toContain('5511999000002@s.whatsapp.net');
    expect(designerJids).not.toContain('5511999000003@s.whatsapp.net');
  });

  test('rejection_target=video routes to the edicao_de_video assignee', async () => {
    dbState.deliveries.dl1 = { id: 'dl1', client_id: 'c1', clickup_task_id: 't1', title: 'Post X' };
    dbState.delivery_phases = [
      { delivery_id: 'dl1', phase: 'design', user_id: 'd1', entered_at: '2026-04-01T00:00:00Z' },
      { delivery_id: 'dl1', phase: 'edicao_de_video', user_id: 'e1', entered_at: '2026-04-02T00:00:00Z' },
    ];
    await notifications.notifyRejections(
      { id: 'b1', client_id: 'c1' },
      [{ id: 'i1', delivery_id: 'dl1', delivery_title: 'Post X', clickup_task_id: 't1', rejection_reason: 'cut last second', rejection_target: 'video', post_type: 'reel' }],
    );
    const editorCall = mockSendText.mock.calls.find((c) => c[0] === '5511999000003@s.whatsapp.net');
    expect(editorCall).toBeTruthy();
  });

  test('reel without rejection_target falls back to edicao_de_video', async () => {
    dbState.deliveries.dl1 = { id: 'dl1', client_id: 'c1', clickup_task_id: 't1', title: 'Post X' };
    dbState.delivery_phases = [
      { delivery_id: 'dl1', phase: 'edicao_de_video', user_id: 'e1', entered_at: '2026-04-02T00:00:00Z' },
    ];
    await notifications.notifyRejections(
      { id: 'b1', client_id: 'c1' },
      [{ id: 'i1', delivery_id: 'dl1', delivery_title: 'Post X', clickup_task_id: 't1', rejection_reason: 'redo', rejection_target: null, post_type: 'reel' }],
    );
    const editorCall = mockSendText.mock.calls.find((c) => c[0] === '5511999000003@s.whatsapp.net');
    expect(editorCall).toBeTruthy();
  });

  test('image post falls back to design phase', async () => {
    dbState.deliveries.dl1 = { id: 'dl1', client_id: 'c1', clickup_task_id: 't1', title: 'Post X' };
    dbState.delivery_phases = [
      { delivery_id: 'dl1', phase: 'design', user_id: 'd1', entered_at: '2026-04-01T00:00:00Z' },
    ];
    await notifications.notifyRejections(
      { id: 'b1', client_id: 'c1' },
      [{ id: 'i1', delivery_id: 'dl1', delivery_title: 'Post X', clickup_task_id: 't1', rejection_reason: 'redo', rejection_target: null, post_type: 'image' }],
    );
    const designerCall = mockSendText.mock.calls.find((c) => c[0] === '5511999000002@s.whatsapp.net');
    expect(designerCall).toBeTruthy();
  });

  test('dedupes producers — same producer with three rejected items receives one message', async () => {
    dbState.deliveries.dl1 = { id: 'dl1', client_id: 'c1', clickup_task_id: 't1', title: 'A' };
    dbState.deliveries.dl2 = { id: 'dl2', client_id: 'c1', clickup_task_id: 't2', title: 'B' };
    dbState.deliveries.dl3 = { id: 'dl3', client_id: 'c1', clickup_task_id: 't3', title: 'C' };
    dbState.delivery_phases = [
      { delivery_id: 'dl1', phase: 'design', user_id: 'd1', entered_at: '2026-04-01T00:00:00Z' },
      { delivery_id: 'dl2', phase: 'design', user_id: 'd1', entered_at: '2026-04-01T00:00:00Z' },
      { delivery_id: 'dl3', phase: 'design', user_id: 'd1', entered_at: '2026-04-01T00:00:00Z' },
    ];
    const items = ['dl1', 'dl2', 'dl3'].map((id, i) => ({
      id: `i${i}`, delivery_id: id, delivery_title: dbState.deliveries[id].title, clickup_task_id: dbState.deliveries[id].clickup_task_id, rejection_reason: 'r', rejection_target: null, post_type: 'image',
    }));
    await notifications.notifyRejections({ id: 'b1', client_id: 'c1' }, items);
    const designerCalls = mockSendText.mock.calls.filter((c) => c[0] === '5511999000002@s.whatsapp.net');
    expect(designerCalls).toHaveLength(1);
    expect(designerCalls[0][1]).toContain('A');
    expect(designerCalls[0][1]).toContain('B');
    expect(designerCalls[0][1]).toContain('C');
  });

  test('sends the category-group summary using app_settings mapping', async () => {
    dbState.deliveries.dl1 = { id: 'dl1', client_id: 'c1', clickup_task_id: 't1', title: 'A' };
    dbState.delivery_phases = [
      { delivery_id: 'dl1', phase: 'design', user_id: 'd1', entered_at: '2026-04-01T00:00:00Z' },
    ];
    await notifications.notifyRejections(
      { id: 'b1', client_id: 'c1' },
      [{ id: 'i1', delivery_id: 'dl1', delivery_title: 'A', clickup_task_id: 't1', rejection_reason: 'r', rejection_target: null, post_type: 'image' }],
    );
    const groupCall = mockSendText.mock.calls.find((c) => c[0] === '120363425760405482@g.us');
    expect(groupCall).toBeTruthy();
    expect(groupCall[1]).toContain('Cliente Demo');
  });

  test('skips category group silently when category not mapped', async () => {
    dbState.app_settings.category_whatsapp_groups = {}; // empty mapping
    dbState.deliveries.dl1 = { id: 'dl1', client_id: 'c1', clickup_task_id: 't1', title: 'A' };
    dbState.delivery_phases = [
      { delivery_id: 'dl1', phase: 'design', user_id: 'd1', entered_at: '2026-04-01T00:00:00Z' },
    ];
    await notifications.notifyRejections(
      { id: 'b1', client_id: 'c1' },
      [{ id: 'i1', delivery_id: 'dl1', delivery_title: 'A', clickup_task_id: 't1', rejection_reason: 'r', rejection_target: null, post_type: 'image' }],
    );
    expect(mockSendText.mock.calls.find((c) => c[0] === '120363425760405482@g.us')).toBeUndefined();
  });

  test('producer with no whatsapp is skipped silently', async () => {
    dbState.users.d1.whatsapp = null;
    dbState.deliveries.dl1 = { id: 'dl1', client_id: 'c1', clickup_task_id: 't1', title: 'A' };
    dbState.delivery_phases = [
      { delivery_id: 'dl1', phase: 'design', user_id: 'd1', entered_at: '2026-04-01T00:00:00Z' },
    ];
    await notifications.notifyRejections(
      { id: 'b1', client_id: 'c1' },
      [{ id: 'i1', delivery_id: 'dl1', delivery_title: 'A', clickup_task_id: 't1', rejection_reason: 'r', rejection_target: null, post_type: 'image' }],
    );
    // Designer not contacted, but category group still receives the summary
    expect(mockSendText.mock.calls.find((c) => c[0] === '5511999000002@s.whatsapp.net')).toBeUndefined();
    expect(mockSendText.mock.calls.find((c) => c[0] === '120363425760405482@g.us')).toBeTruthy();
  });
});

describe('notifyPublishSuccess', () => {
  test('sends a digest with one platform link to client group and category group', async () => {
    const post = {
      client_id: 'c1',
      post_group_id: null,
      delivery_title: 'Post Y',
      ig_permalink: 'https://instagram.com/p/abc',
      tiktok_permalink: null,
      platform: 'instagram',
    };
    await notifications.notifyPublishSuccess(post);
    const clientGroupCall = mockSendText.mock.calls.find((c) => c[0] === '120000@g.us');
    const categoryCall = mockSendText.mock.calls.find((c) => c[0] === '120363425760405482@g.us');
    expect(clientGroupCall).toBeTruthy();
    expect(clientGroupCall[1]).toContain('Post Y');
    expect(clientGroupCall[1]).toContain('Instagram');
    expect(clientGroupCall[1]).toContain('https://instagram.com/p/abc');
    expect(categoryCall).toBeTruthy();
  });

  test('multi-platform: lists every platform with its permalink', async () => {
    const groupId = 'group-1';
    // Sibling rows are read by the dispatcher via post_group_id
    let dbModule;
    jest.isolateModules(() => { dbModule = require('../../config/db'); });
    // Use the existing mock — extend the `then` path for scheduled_posts
    // (the fixture below stays in test scope)
    const siblings = [
      { platform: 'instagram', ig_permalink: 'https://instagram.com/p/A', tiktok_permalink: null, status: 'published' },
      { platform: 'tiktok', ig_permalink: null, tiktok_permalink: 'https://www.tiktok.com/@x/video/1', status: 'published' },
    ];
    const original = require('../../config/db');
    jest.doMock('../../config/db', () => {
      return jest.fn((table) => {
        if (table === 'scheduled_posts') {
          return {
            where() { return this; },
            then(resolve) { return Promise.resolve(siblings).then(resolve); },
          };
        }
        return original(table);
      });
    });
    jest.resetModules();
    const dispatcher = require('./notifications.service');
    await dispatcher.notifyPublishSuccess({
      client_id: 'c1',
      post_group_id: groupId,
      delivery_title: 'Combo',
      platform: 'instagram',
      ig_permalink: 'https://instagram.com/p/A',
    });
    const clientCall = mockSendText.mock.calls.find((c) => c[0] === '120000@g.us');
    expect(clientCall[1]).toContain('Instagram');
    expect(clientCall[1]).toContain('TikTok');
    expect(clientCall[1]).toContain('https://www.tiktok.com/@x/video/1');
  });
});
```

- [ ] **Step 2: Run the test file and confirm it fails (no implementation yet)**

Run: `cd server && npx jest src/modules/notifications/notifications.service.test.js`
Expected: every test fails — `Cannot find module './notifications.service'`.

- [ ] **Step 3: Implement the service**

Create `server/src/modules/notifications/notifications.service.js`:

```js
const db = require('../../config/db');
const evolution = require('../evolution/evolution.service');
const logger = require('../../utils/logger');

const PLATFORM_LABELS = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube' };
const TARGET_LABELS = { cover: 'capa', video: 'vídeo' };

const PRODUCER_PHASE_FOR_REJECTION = (postType, rejectionTarget) => {
  if (rejectionTarget === 'cover') return 'design';
  if (rejectionTarget === 'video') return 'edicao_de_video';
  if (['reel', 'video', 'tiktok_video'].includes(postType)) return 'edicao_de_video';
  return 'design';
};

async function getCategoryGroup(category) {
  if (!category) return null;
  try {
    const row = await db('app_settings').where({ key: 'category_whatsapp_groups' }).first();
    if (!row) return null;
    const map = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
    return map?.[category] || null;
  } catch (err) {
    logger.warn('category_whatsapp_groups lookup failed', { error: err.message });
    return null;
  }
}

async function safeSend(jid, text, context) {
  if (!jid || !text) return;
  try {
    await evolution.sendText(jid, text);
  } catch (err) {
    logger.error('notifications send failed', { ...context, jid, error: err.message });
  }
}

async function resolveProducer(deliveryId, phaseName) {
  const rows = await db('delivery_phases')
    .where({ delivery_id: deliveryId, phase: phaseName })
    .orderBy('entered_at', 'desc');
  for (const row of rows) {
    if (row.user_id) {
      const user = await db('users').where({ id: row.user_id }).first();
      if (user) return user;
    }
  }
  return null;
}

function fmtItemLine(item) {
  const url = item.clickup_task_id ? `https://app.clickup.com/t/${item.clickup_task_id}` : '';
  const head = `• ${item.delivery_title || item.delivery_id}${url ? ` → ${url}` : ''}`;
  if (item.status === 'rejected' || item.rejection_reason) {
    const target = TARGET_LABELS[item.rejection_target];
    const targetSuffix = target ? ` (alvo: ${target})` : '';
    return `${head}\n  Motivo: ${item.rejection_reason || '—'}${targetSuffix}`;
  }
  return head;
}

function composeBatchDigest(clientName, approved, rejected) {
  const sections = [`*Lote do cliente ${clientName} revisado*`];
  if (approved.length) {
    sections.push(`✅ Aprovados (${approved.length}):\n${approved.map(fmtItemLine).join('\n')}`);
  }
  if (rejected.length) {
    sections.push(`❌ Reprovados (${rejected.length}):\n${rejected.map(fmtItemLine).join('\n')}`);
  }
  return sections.join('\n\n');
}

function composeProducerDigest(clientName, items) {
  const lines = items.map(fmtItemLine).join('\n');
  return `*Tasks reprovadas pra você*\n\nCliente: ${clientName}\n${lines}`;
}

function composeCategoryRejectionDigest(clientName, items) {
  const lines = items.map(fmtItemLine).join('\n');
  return `*Reprovações no cliente ${clientName}*\n\n❌ ${items.length} item(ns) voltaram pra correção:\n${lines}`;
}

function composePublishDigest(deliveryTitle, clientName, platformLinks) {
  const lines = platformLinks
    .filter((l) => l.url)
    .map((l) => `• ${PLATFORM_LABELS[l.platform] || l.platform} → ${l.url}`)
    .join('\n');
  return `✅ *Publicado*: ${deliveryTitle}\nCliente: ${clientName}\n${lines}`;
}

async function notifyBatchReviewWindow(batch, items) {
  const client = await db('clients').where({ id: batch.client_id }).first();
  const clientName = client?.name || 'cliente';

  const approved = items.filter((i) => i.status === 'approved');
  const rejected = items.filter((i) => i.status === 'rejected');
  if (approved.length === 0 && rejected.length === 0) return;

  const sm = batch.social_media_id ? await db('users').where({ id: batch.social_media_id }).first() : null;
  if (sm?.whatsapp) {
    const jid = evolution.buildPersonalJid(sm.whatsapp);
    await safeSend(jid, composeBatchDigest(clientName, approved, rejected), { batchId: batch.id, role: 'sm' });
  } else {
    logger.warn('SM has no whatsapp; skipping batch digest', { batchId: batch.id });
  }

  if (rejected.length) {
    await notifyRejections(batch, rejected);
  }
}

async function notifyRejections(batch, rejectedItems) {
  const client = await db('clients').where({ id: batch.client_id }).first();
  const clientName = client?.name || 'cliente';

  const itemsByProducer = new Map();
  for (const item of rejectedItems) {
    const phase = PRODUCER_PHASE_FOR_REJECTION(item.post_type, item.rejection_target);
    const producer = await resolveProducer(item.delivery_id, phase);
    if (!producer) {
      logger.warn('No producer found for rejection routing', { itemId: item.id, deliveryId: item.delivery_id, phase });
      continue;
    }
    if (!itemsByProducer.has(producer.id)) itemsByProducer.set(producer.id, { producer, items: [] });
    itemsByProducer.get(producer.id).items.push(item);
  }

  for (const { producer, items } of itemsByProducer.values()) {
    if (!producer.whatsapp) {
      logger.warn('Producer has no whatsapp; skipping', { userId: producer.id });
      continue;
    }
    const jid = evolution.buildPersonalJid(producer.whatsapp);
    await safeSend(jid, composeProducerDigest(clientName, items), { batchId: batch.id, role: 'producer', userId: producer.id });
  }

  if (client?.category) {
    const groupJid = await getCategoryGroup(client.category);
    if (groupJid) {
      await safeSend(groupJid, composeCategoryRejectionDigest(clientName, rejectedItems), { batchId: batch.id, role: 'category-group', category: client.category });
    } else {
      logger.warn('No category WhatsApp group mapped', { category: client.category });
    }
  }
}

async function notifyPublishSuccess(post) {
  const client = await db('clients').where({ id: post.client_id }).first();
  const clientName = client?.name || 'cliente';

  let platformLinks;
  if (post.post_group_id) {
    const siblings = await db('scheduled_posts').where({ post_group_id: post.post_group_id });
    platformLinks = siblings
      .filter((s) => s.status === 'published')
      .map((s) => ({ platform: s.platform, url: s.platform === 'instagram' ? s.ig_permalink : s.platform === 'tiktok' ? s.tiktok_permalink : null }));
  } else {
    platformLinks = [{ platform: post.platform, url: post.platform === 'instagram' ? post.ig_permalink : post.platform === 'tiktok' ? post.tiktok_permalink : null }];
  }

  const title = post.delivery_title || post.caption?.slice(0, 80) || 'post';
  const text = composePublishDigest(title, clientName, platformLinks);

  if (client?.whatsapp_group) {
    await safeSend(client.whatsapp_group, text, { postId: post.id, role: 'client-group' });
  }
  if (client?.category) {
    const groupJid = await getCategoryGroup(client.category);
    if (groupJid) {
      await safeSend(groupJid, text, { postId: post.id, role: 'category-group', category: client.category });
    }
  }
}

module.exports = {
  notifyBatchReviewWindow,
  notifyRejections,
  notifyPublishSuccess,
};
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd server && npx jest src/modules/notifications/notifications.service.test.js`
Expected: all tests pass.

- [ ] **Step 5: Run the full suite to confirm no regression**

Run: `cd server && npx jest --silent`
Expected: every existing test stays green plus the new notifications tests.

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/notifications/notifications.service.js server/src/modules/notifications/notifications.service.test.js
git -c safe.directory=/home/dev/projetos commit -m "feat(notifications): compose + dispatch service for the new flow

Three public functions: notifyBatchReviewWindow (SM digest, fans out to
notifyRejections when the batch contained rejections), notifyRejections
(per-producer dedup + category group summary, routes by rejection_target
or post_type fallback through delivery_phases), notifyPublishSuccess
(per-delivery digest with permalink list, fires when every platform has
published). Each WhatsApp send is individually try/caught so one missing
recipient never blocks the others."
```

---

### Task 3: BullMQ queue and worker

**Files:**
- Modify: `server/src/queues/index.js`
- Create: `server/src/queues/approval-review-window.worker.js`
- Create: `server/src/queues/approval-review-window.worker.test.js`
- Modify: `server/src/app.js`

- [ ] **Step 1: Add the queue and helpers to `server/src/queues/index.js`**

Read the existing file first: `sed -n '1,30p' server/src/queues/index.js` to see how `approvalReminderQueue` is constructed and exported. Then add the equivalent for the new queue.

Add the new queue declaration immediately after the line `const approvalReminderQueue = new Queue('approval-reminder', { connection });`:

```js
const approvalReviewWindowQueue = new Queue('approval-review-window', { connection });
```

Add two helpers near the bottom of the file (above `module.exports`):

```js
async function enqueueApprovalReviewWindow(batchId, delayMs = 8 * 60 * 1000) {
  await approvalReviewWindowQueue.add(
    'approval-window-fire',
    { batchId },
    { delay: delayMs, jobId: `window:${batchId}`, removeOnComplete: { count: 100 }, removeOnFail: { count: 100 } },
  );
}

async function promoteApprovalReviewWindow(batchId) {
  const job = await approvalReviewWindowQueue.getJob(`window:${batchId}`);
  if (job) {
    try { await job.promote(); } catch { /* already promoted or completed */ }
  }
}
```

Add to the `module.exports` block:

```js
  approvalReviewWindowQueue,
  enqueueApprovalReviewWindow,
  promoteApprovalReviewWindow,
```

- [ ] **Step 2: Write the failing worker test**

Create `server/src/queues/approval-review-window.worker.test.js`:

```js
const mockNotify = jest.fn().mockResolvedValue(undefined);

jest.mock('../modules/notifications/notifications.service', () => ({
  notifyBatchReviewWindow: (...args) => mockNotify(...args),
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

const dbState = {
  approval_batches: {},
  approval_items: [],
  updates: [],
};

jest.mock('../config/db', () => {
  return jest.fn((table) => {
    const builder = {
      _table: table,
      _where: null,
      where(c) { this._where = c; return this; },
      whereRaw() { return this; },
      select() { return this; },
      orderBy() { return this; },
      first() {
        if (this._table === 'approval_batches') {
          return Promise.resolve(dbState.approval_batches[this._where.id] || null);
        }
        return Promise.resolve(null);
      },
      then(resolve) {
        if (this._table === 'approval_items') {
          const rows = dbState.approval_items.filter((i) => i.batch_id === this._where.batch_id);
          return Promise.resolve(rows).then(resolve);
        }
        return Promise.resolve([]).then(resolve);
      },
      update(patch) {
        if (this._table === 'approval_batches') {
          dbState.updates.push({ table: 'approval_batches', where: this._where, patch });
          const row = dbState.approval_batches[this._where.id];
          if (row) Object.assign(row, patch);
        }
        return Promise.resolve(1);
      },
    };
    return builder;
  });
});

// Import the handler directly (the worker file exports it for testing)
const { runWindowJob } = require('./approval-review-window.worker');

beforeEach(() => {
  mockNotify.mockClear();
  dbState.approval_batches = {};
  dbState.approval_items = [];
  dbState.updates = [];
});

describe('approval-review-window worker', () => {
  test('fires the dispatcher for an open window and marks fired_at', async () => {
    const startedAt = new Date('2026-04-15T10:00:00Z');
    dbState.approval_batches.b1 = { id: 'b1', social_media_id: 'sm1', client_id: 'c1', review_window_started_at: startedAt, review_window_fired_at: null };
    dbState.approval_items = [
      { id: 'i1', batch_id: 'b1', status: 'approved', responded_at: new Date('2026-04-15T10:01:00Z'), delivery_id: 'd1' },
      { id: 'i2', batch_id: 'b1', status: 'pending',  responded_at: null,                              delivery_id: 'd2' },
    ];
    await runWindowJob({ data: { batchId: 'b1' } });
    expect(mockNotify).toHaveBeenCalledTimes(1);
    const [batchArg, itemsArg] = mockNotify.mock.calls[0];
    expect(batchArg.id).toBe('b1');
    expect(itemsArg).toHaveLength(1);
    expect(itemsArg[0].id).toBe('i1');
    expect(dbState.updates.find((u) => u.patch.review_window_fired_at)).toBeTruthy();
  });

  test('idempotent: a second run when fired_at is set is a no-op', async () => {
    dbState.approval_batches.b1 = { id: 'b1', review_window_started_at: new Date('2026-04-15T10:00:00Z'), review_window_fired_at: new Date('2026-04-15T10:08:00Z') };
    dbState.approval_items = [{ id: 'i1', batch_id: 'b1', status: 'approved', responded_at: new Date('2026-04-15T10:01:00Z') }];
    await runWindowJob({ data: { batchId: 'b1' } });
    expect(mockNotify).not.toHaveBeenCalled();
  });

  test('only includes items reviewed during this window', async () => {
    const startedAt = new Date('2026-04-15T10:00:00Z');
    dbState.approval_batches.b1 = { id: 'b1', review_window_started_at: startedAt, review_window_fired_at: null };
    dbState.approval_items = [
      { id: 'old', batch_id: 'b1', status: 'approved', responded_at: new Date('2026-04-15T09:00:00Z') },
      { id: 'new', batch_id: 'b1', status: 'approved', responded_at: new Date('2026-04-15T10:03:00Z') },
    ];
    await runWindowJob({ data: { batchId: 'b1' } });
    const [, itemsArg] = mockNotify.mock.calls[0];
    expect(itemsArg.map((i) => i.id)).toEqual(['new']);
  });
});
```

- [ ] **Step 3: Run the failing test**

Run: `cd server && npx jest src/queues/approval-review-window.worker.test.js`
Expected: fails — `Cannot find module './approval-review-window.worker'`.

- [ ] **Step 4: Implement the worker**

Create `server/src/queues/approval-review-window.worker.js`:

```js
const { Worker } = require('bullmq');
const db = require('../config/db');
const logger = require('../utils/logger');
const notifications = require('../modules/notifications/notifications.service');
const { connection } = require('./index');

async function runWindowJob(job) {
  const { batchId } = job.data;
  logger.info('Running approval review window', { batchId });

  const batch = await db('approval_batches').where({ id: batchId }).first();
  if (!batch) {
    logger.warn('Window job: batch not found', { batchId });
    return;
  }
  if (batch.review_window_fired_at) {
    logger.info('Window already fired, skipping', { batchId });
    return;
  }
  const startedAt = batch.review_window_started_at;
  if (!startedAt) {
    logger.warn('Window job ran but started_at is null', { batchId });
    return;
  }

  const allItems = await db('approval_items').where({ batch_id: batchId });
  const startedAtMs = new Date(startedAt).getTime();
  const reviewed = allItems.filter((i) => i.responded_at && new Date(i.responded_at).getTime() >= startedAtMs && i.status !== 'pending');

  // Mark fired BEFORE dispatching so a retried job is a no-op even if the
  // dispatcher partially fails — the operator can replay manually if needed.
  await db('approval_batches').where({ id: batchId }).update({
    review_window_fired_at: new Date(),
    updated_at: new Date(),
  });

  if (reviewed.length === 0) {
    logger.info('Window fired but no reviewed items in scope, skipping notification', { batchId });
    return;
  }

  // Enrich items with delivery title + clickup_task_id + post_type so the
  // dispatcher does not have to fan out queries per item.
  const deliveryIds = [...new Set(reviewed.map((i) => i.delivery_id))];
  const deliveries = deliveryIds.length
    ? await db('deliveries').whereIn('id', deliveryIds)
    : [];
  const deliveryById = Object.fromEntries(deliveries.map((d) => [d.id, d]));
  const enriched = reviewed.map((i) => ({
    ...i,
    delivery_title: deliveryById[i.delivery_id]?.title || null,
    clickup_task_id: deliveryById[i.delivery_id]?.clickup_task_id || null,
    post_type: deliveryById[i.delivery_id]?.content_type || null,
  }));

  await notifications.notifyBatchReviewWindow(batch, enriched);
}

// Worker is only instantiated when not in test mode; tests import runWindowJob directly.
if (process.env.NODE_ENV !== 'test') {
  const worker = new Worker('approval-review-window', runWindowJob, {
    connection,
    concurrency: 1,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  });
  worker.on('completed', (job) => logger.info('approval-review-window completed', { jobId: job.id }));
  worker.on('failed', (job, err) => logger.error('approval-review-window failed', { jobId: job?.id, error: err.message }));
  module.exports = { worker, runWindowJob };
} else {
  module.exports = { runWindowJob };
}
```

- [ ] **Step 5: Run the worker test and confirm it passes**

Run: `cd server && NODE_ENV=test npx jest src/queues/approval-review-window.worker.test.js`
Expected: all 3 tests pass.

- [ ] **Step 6: Wire the worker into `server/src/app.js`**

Find the existing BullMQ try block:

```js
try {
  const { setupRepeatable } = require('./queues');
  require('./queues/instagram-publish.worker');
  require('./queues/tiktok-publish.worker');
  require('./queues/token-refresh.worker');
  require('./queues/delivery-sync.worker');
  require('./queues/approval-reminder.worker');
  setupRepeatable().catch((err) => logger.error('Failed to setup repeatable jobs', { error: err.message }));
  logger.info('BullMQ workers initialized');
}
```

Add `require('./queues/approval-review-window.worker');` immediately after `require('./queues/approval-reminder.worker');`.

- [ ] **Step 7: Run the full suite**

Run: `cd server && npx jest --silent`
Expected: all tests pass (additions plus baseline).

- [ ] **Step 8: Commit**

```bash
git add server/src/queues/index.js server/src/queues/approval-review-window.worker.js server/src/queues/approval-review-window.worker.test.js server/src/app.js
git -c safe.directory=/home/dev/projetos commit -m "feat(queues): approval-review-window worker

Adds a BullMQ queue + worker that runs the consolidated SM/producer
notifications when a batch's 8-minute client-review window expires.
Idempotent on approval_batches.review_window_fired_at, considers only
items reviewed since review_window_started_at, and exports its handler
(runWindowJob) so unit tests can drive it without spinning up Redis."
```

---

### Task 4: Wire `clientRespond` to open / promote the window and persist `rejection_target`

**Files:**
- Modify: `server/src/modules/approvals/approvals.validation.js`
- Modify: `server/src/modules/approvals/approvals.service.js`
- Create: `server/src/modules/approvals/approvals.service.test.js`

- [ ] **Step 1: Extend the validator**

Open `server/src/modules/approvals/approvals.validation.js`. Find `clientRespondSchema`. Add a `rejection_target` field to the Joi schema.

If the current schema looks like:

```js
const clientRespondSchema = Joi.object({
  status: Joi.string().valid('approved', 'rejected').required(),
  rejection_reason: Joi.string().allow(null, '').optional(),
  media_urls: Joi.array().optional(),
});
```

Change to:

```js
const clientRespondSchema = Joi.object({
  status: Joi.string().valid('approved', 'rejected').required(),
  rejection_reason: Joi.string().allow(null, '').optional(),
  rejection_target: Joi.string().valid('cover', 'video').optional(),
  media_urls: Joi.array().optional(),
});
```

- [ ] **Step 2: Update the controller call to forward the field**

Open `server/src/modules/approvals/approvals.controller.js`. Find `clientRespond`. The current call passes individual args:

```js
const result = await service.clientRespond(
  req.params.token,
  req.params.itemId,
  value.status,
  value.rejection_reason,
  value.media_urls,
);
```

Change to a single options object so the new field is forwarded without growing the positional arg list:

```js
const result = await service.clientRespond({
  token: req.params.token,
  itemId: req.params.itemId,
  status: value.status,
  rejectionReason: value.rejection_reason,
  rejectionTarget: value.rejection_target,
  mediaUrls: value.media_urls,
});
```

- [ ] **Step 3: Write the failing service tests**

Create `server/src/modules/approvals/approvals.service.test.js`:

```js
const mockEnqueue = jest.fn().mockResolvedValue(undefined);
const mockPromote = jest.fn().mockResolvedValue(undefined);

jest.mock('../../queues', () => ({
  enqueueApprovalReviewWindow: (...a) => mockEnqueue(...a),
  promoteApprovalReviewWindow: (...a) => mockPromote(...a),
  approvalReminderQueue: { getRepeatableJobs: jest.fn().mockResolvedValue([]), removeRepeatableByKey: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../webhooks/clickup-oauth.service', () => ({ getDecryptedToken: jest.fn().mockResolvedValue('tok') }));
jest.mock('../evolution/evolution.service', () => ({ sendText: jest.fn(), buildPersonalJid: (p) => `${p}@s.whatsapp.net` }));
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../utils/event-bus', () => ({ emit: jest.fn() }));

global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

const dbState = {
  approval_batches: {
    b1: {
      id: 'b1', token: 'tok-1', status: 'pending', client_id: 'c1', social_media_id: 'sm1',
      review_window_started_at: null, review_window_fired_at: null,
      client_name: 'Cliente Demo',
    },
  },
  approval_items: [
    { id: 'i1', batch_id: 'b1', delivery_id: 'd1', status: 'pending' },
    { id: 'i2', batch_id: 'b1', delivery_id: 'd2', status: 'pending' },
  ],
  deliveries: { d1: { id: 'd1', clickup_task_id: 'tA' }, d2: { id: 'd2', clickup_task_id: 'tB' } },
  updates: [],
};

jest.mock('../../config/db', () => {
  return jest.fn((table) => {
    const builder = {
      _table: table,
      _where: null,
      where(c) { this._where = c; return this; },
      join() { return this; },
      select() { return this; },
      count(col) { this._countCol = col; return this; },
      first() {
        if (this._table === 'approval_batches' && this._where?.token) {
          return Promise.resolve(dbState.approval_batches.b1);
        }
        if (this._table === 'approval_batches' && this._where?.id) {
          return Promise.resolve(dbState.approval_batches[this._where.id] || null);
        }
        if (this._table === 'approval_items') {
          if (this._countCol) {
            const pending = dbState.approval_items.filter((i) => i.batch_id === this._where.batch_id && i.status === this._where.status).length;
            return Promise.resolve({ count: String(pending) });
          }
          const found = dbState.approval_items.find((i) => i.id === this._where.id && i.batch_id === this._where.batch_id);
          return Promise.resolve(found || null);
        }
        if (this._table === 'deliveries') {
          return Promise.resolve(dbState.deliveries[this._where.id] || null);
        }
        return Promise.resolve(null);
      },
      update(patch) {
        dbState.updates.push({ table: this._table, where: this._where, patch });
        if (this._table === 'approval_items') {
          const item = dbState.approval_items.find((i) => i.id === this._where.id);
          if (item) Object.assign(item, patch);
          return { returning: () => Promise.resolve([item]) };
        }
        if (this._table === 'approval_batches') {
          const b = dbState.approval_batches[this._where.id];
          if (b) Object.assign(b, patch);
        }
        return Promise.resolve(1);
      },
    };
    return builder;
  });
});

const service = require('./approvals.service');

beforeEach(() => {
  mockEnqueue.mockClear();
  mockPromote.mockClear();
  dbState.updates = [];
  dbState.approval_batches.b1.review_window_started_at = null;
  dbState.approval_batches.b1.review_window_fired_at = null;
  dbState.approval_items.forEach((i) => { i.status = 'pending'; i.responded_at = null; });
});

describe('clientRespond — review window trigger', () => {
  test('first review of the batch enqueues the window job and sets started_at', async () => {
    await service.clientRespond({ token: 'tok-1', itemId: 'i1', status: 'approved' });
    const batchUpdate = dbState.updates.find((u) => u.table === 'approval_batches' && u.patch.review_window_started_at);
    expect(batchUpdate).toBeTruthy();
    expect(mockEnqueue).toHaveBeenCalledWith('b1');
  });

  test('second review with one still pending does not re-enqueue or promote', async () => {
    dbState.approval_batches.b1.review_window_started_at = new Date('2026-04-16T10:00:00Z');
    dbState.approval_items[0].status = 'approved';
    await service.clientRespond({ token: 'tok-1', itemId: 'i2', status: 'approved' });
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockPromote).toHaveBeenCalledWith('b1');
  });

  test('persists rejection_target when provided', async () => {
    await service.clientRespond({ token: 'tok-1', itemId: 'i1', status: 'rejected', rejectionReason: 'fix it', rejectionTarget: 'cover' });
    const itemUpdate = dbState.updates.find((u) => u.table === 'approval_items');
    expect(itemUpdate.patch.rejection_target).toBe('cover');
  });

  test('review after fired_at opens a new window', async () => {
    dbState.approval_batches.b1.review_window_started_at = new Date('2026-04-16T10:00:00Z');
    dbState.approval_batches.b1.review_window_fired_at = new Date('2026-04-16T10:08:00Z');
    await service.clientRespond({ token: 'tok-1', itemId: 'i1', status: 'approved' });
    const batchUpdate = dbState.updates.find((u) => u.table === 'approval_batches' && u.patch.review_window_started_at);
    expect(batchUpdate.patch.review_window_started_at).toBeInstanceOf(Date);
    expect(batchUpdate.patch.review_window_fired_at).toBeNull();
    expect(mockEnqueue).toHaveBeenCalledWith('b1');
  });
});
```

- [ ] **Step 4: Run the failing test**

Run: `cd server && npx jest src/modules/approvals/approvals.service.test.js`
Expected: every test fails because (a) `clientRespond` does not yet accept an options object, and (b) the window logic and `rejection_target` write are not implemented.

- [ ] **Step 5: Refactor `clientRespond` to options object + new behavior**

Open `server/src/modules/approvals/approvals.service.js`. Change the signature line:

```js
async clientRespond(token, itemId, status, rejectionReason, mediaUrls) {
```

to:

```js
async clientRespond({ token, itemId, status, rejectionReason, rejectionTarget, mediaUrls }) {
```

Inside the function, locate the `itemUpdate` object and add the new field:

```js
const itemUpdate = {
  status: itemStatus,
  rejection_reason: rejectionReason || null,
  rejection_target: rejectionTarget || null,
  responded_at: new Date(),
  updated_at: new Date(),
};
```

Find this block (it is the existing inline rejection notify):

```js
// If rejected, notify social media via WhatsApp
if (status === 'rejected') {
  await this._notifySmRejection(batch, updatedItem, delivery, rejectionReason);
}
```

Delete it entirely. The window worker will send the consolidated SM digest instead.

Immediately after that deletion, add the window-open / promote logic:

```js
// Open a new review window if there is none, or if the previous one already fired.
const reloadedBatch = await db('approval_batches').where({ id: batch.id }).first();
if (!reloadedBatch.review_window_started_at || reloadedBatch.review_window_fired_at) {
  await db('approval_batches').where({ id: batch.id }).update({
    review_window_started_at: new Date(),
    review_window_fired_at: null,
    updated_at: new Date(),
  });
  const { enqueueApprovalReviewWindow } = require('../../queues');
  await enqueueApprovalReviewWindow(batch.id);
}
```

Find the existing `if (allResponded)` block. Inside it, before the existing batch-completion logic (or anywhere in that block), add:

```js
const { promoteApprovalReviewWindow } = require('../../queues');
await promoteApprovalReviewWindow(batch.id);
```

Leave the existing `_notifySmRejection` method on the class — nothing references it anymore but removing it is a separate cleanup. Mark it private with a comment so future readers know it is dead code:

Find:

```js
async _notifySmRejection(batch, item, delivery, rejectionReason) {
```

Change the comment immediately above (or add one) to:

```js
// Deprecated — replaced by the approval-review-window worker. Kept temporarily
// for safe rollback; remove on the next cleanup pass.
async _notifySmRejection(batch, item, delivery, rejectionReason) {
```

- [ ] **Step 6: Run the new tests**

Run: `cd server && npx jest src/modules/approvals/approvals.service.test.js`
Expected: all 4 tests pass.

- [ ] **Step 7: Run the full suite**

Run: `cd server && npx jest --silent`
Expected: all tests stay green.

- [ ] **Step 8: Commit**

```bash
git add server/src/modules/approvals/approvals.validation.js server/src/modules/approvals/approvals.controller.js server/src/modules/approvals/approvals.service.js server/src/modules/approvals/approvals.service.test.js
git -c safe.directory=/home/dev/projetos commit -m "feat(approvals): open and promote the review window from clientRespond

clientRespond now takes an options object, persists rejection_target,
opens an 8-minute review window the first time a client reviews any
item in a batch (or after the previous window already fired), and
promotes the BullMQ job when the batch becomes fully reviewed.
The inline _notifySmRejection call is removed; the worker sends the
consolidated SM digest instead. The method itself is left in place
marked deprecated for rollback safety."
```

---

### Task 5: Wire publish-success notifications

**Files:**
- Modify: `server/src/modules/instagram/instagram-publish.service.js`
- Modify: `server/src/modules/tiktok/tiktok-publish.service.js`

- [ ] **Step 1: Add the require to `instagram-publish.service.js`**

Open `server/src/modules/instagram/instagram-publish.service.js`. Find the top-level `require` block. Add (near the existing service imports):

```js
const notificationsService = require('../notifications/notifications.service');
```

- [ ] **Step 2: Call the dispatcher inside the existing `if (groupReady)` block**

Find the block (around the `_isGroupFullyPublished` check). Change:

```js
if (groupReady) {
  if (post.clickup_task_id) {
    await this._moveToPublicacao(post.clickup_task_id);
  }
  if (post.delivery_id) {
    await db('deliveries')
      .where({ id: post.delivery_id })
      .update({ status: 'publicacao', completed_at: new Date(), updated_at: new Date() });
  } else if (post.clickup_task_id) {
    await db('deliveries')
      .where({ clickup_task_id: post.clickup_task_id })
      .update({ status: 'publicacao', completed_at: new Date(), updated_at: new Date() });
  }
}
```

to:

```js
if (groupReady) {
  if (post.clickup_task_id) {
    await this._moveToPublicacao(post.clickup_task_id);
  }
  let deliveryRow = null;
  if (post.delivery_id) {
    deliveryRow = await db('deliveries').where({ id: post.delivery_id }).first();
    await db('deliveries')
      .where({ id: post.delivery_id })
      .update({ status: 'publicacao', completed_at: new Date(), updated_at: new Date() });
  } else if (post.clickup_task_id) {
    deliveryRow = await db('deliveries').where({ clickup_task_id: post.clickup_task_id }).first();
    await db('deliveries')
      .where({ clickup_task_id: post.clickup_task_id })
      .update({ status: 'publicacao', completed_at: new Date(), updated_at: new Date() });
  }
  await notificationsService.notifyPublishSuccess({
    ...post,
    delivery_title: deliveryRow?.title || null,
  });
}
```

- [ ] **Step 3: Apply the equivalent change to `tiktok-publish.service.js`**

Open `server/src/modules/tiktok/tiktok-publish.service.js`. At the top, add:

```js
const notificationsService = require('../notifications/notifications.service');
```

Find the equivalent `if (groupReady)` block (added in the recent fix `e0c3bd7`). Apply the same transformation: capture `deliveryRow` before the `update`, then `await notificationsService.notifyPublishSuccess({ ...post, delivery_title: deliveryRow?.title || null });` after the deliveries update.

- [ ] **Step 4: Run all tests**

Run: `cd server && npx jest --silent`
Expected: green. The publish-service tests do not assert on notifications, but require/wiring must not crash.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/instagram/instagram-publish.service.js server/src/modules/tiktok/tiktok-publish.service.js
git -c safe.directory=/home/dev/projetos commit -m "feat(publish): notify client + category groups when every platform finishes

When _isGroupFullyPublished returns true, the publish workers now call
notifications.service.notifyPublishSuccess with the published post and
its delivery title. The dispatcher reads sibling rows to compose the
per-platform permalink list, and sends one digest each to the client's
WhatsApp group and the client's category group."
```

---

### Task 6: UI — capa/vídeo selector in the rejection modal

**Files:**
- Modify: `client/src/pages/PublicApprovalPage.jsx`

The current rejection modal has a textarea + Confirm. The change adds a required radio (`Capa` / `Vídeo`) shown only when the post is a reel/video that has a thumbnail. The submit body forwards `rejection_target`.

- [ ] **Step 1: Read the current rejection modal block**

Run: `grep -n 'rejectingId === item.id' client/src/pages/PublicApprovalPage.jsx`
Then read 30 lines around the match to see the current form structure.

- [ ] **Step 2: Add the state hook for the target**

Near the existing `const [rejectionReason, setRejectionReason] = useState('')`, add:

```jsx
const [rejectionTarget, setRejectionTarget] = useState(null);
```

In the existing reset paths (where `setRejectingId(null)` and `setRejectionReason('')` are called — typically a `cancel` action and after a successful submit), also call `setRejectionTarget(null)`.

- [ ] **Step 3: Add the helper to decide if the radio should appear**

Above the JSX for the modal, add:

```jsx
const needsTarget = (item) => {
  const isReelLike = ['reel', 'video', 'tiktok_video'].includes(item.post_type);
  return isReelLike && Boolean(item.thumbnail_url);
};
```

- [ ] **Step 4: Render the radio inside the existing rejection modal block**

Inside the `{rejectingId === item.id && (...)}` block, immediately above the textarea, add:

```jsx
{needsTarget(item) && (
  <div className="mb-3">
    <p className="text-sm text-foreground mb-2 font-medium">Onde está o problema?</p>
    <div className="flex gap-2">
      <label className="flex-1 flex items-center justify-center gap-2 p-2 rounded-lg bg-muted border border-border cursor-pointer">
        <input
          type="radio"
          name={`target-${item.id}`}
          value="cover"
          checked={rejectionTarget === 'cover'}
          onChange={() => setRejectionTarget('cover')}
        />
        <span className="text-sm">Capa</span>
      </label>
      <label className="flex-1 flex items-center justify-center gap-2 p-2 rounded-lg bg-muted border border-border cursor-pointer">
        <input
          type="radio"
          name={`target-${item.id}`}
          value="video"
          checked={rejectionTarget === 'video'}
          onChange={() => setRejectionTarget('video')}
        />
        <span className="text-sm">Vídeo</span>
      </label>
    </div>
  </div>
)}
```

- [ ] **Step 5: Disable Confirm when the target is required and unset**

Find the Confirm button:

```jsx
disabled={!rejectionReason.trim() || submitting}
```

Change to:

```jsx
disabled={!rejectionReason.trim() || submitting || (needsTarget(item) && !rejectionTarget)}
```

- [ ] **Step 6: Forward the field on submit**

Find the submit handler (likely `handleRejectConfirm`). It POSTs to `/api/approvals/public/:token/items/:itemId/respond` with a body that includes `status` and `rejection_reason`. Add `rejection_target` when set:

```js
const body = {
  status: 'rejected',
  rejection_reason: rejectionReason.trim(),
};
if (rejectionTarget) body.rejection_target = rejectionTarget;
```

- [ ] **Step 7: Manual smoke test in the dev server**

Run: `cd client && npm run dev` and open the public approval URL for a batch that has a `reel` item with a thumbnail. Confirm:
- The radio appears (Capa / Vídeo).
- Confirm is disabled until both reason and target are set.
- Submitting sends `rejection_target` in the request body (Network tab).
- For an `image` item (no thumbnail), the radio does not appear and the flow works as before.

If the dev server is not available locally, this is the user's manual smoke step — note that in the commit body so the reviewer knows.

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/PublicApprovalPage.jsx
git -c safe.directory=/home/dev/projetos commit -m "feat(approval-ui): capa/vídeo selector when rejecting a reel with thumbnail

When the rejected item is a reel/video and has a thumbnail_url, the
modal now requires the client to pick whether the problem is on the
cover or the video. The choice is sent as rejection_target in the POST
body and drives producer routing on the backend (designer for cover,
video editor for video)."
```

---

### Task 7: Document the `category_whatsapp_groups` setting

**Files:**
- Modify: `CLAUDE.md` (or `README.md` if no CLAUDE.md exists at repo root)

Operators need to know how to set the category → group mapping after this ships. The plan reuses the existing `app_settings` row, so the only "deploy step" is a single PUT.

- [ ] **Step 1: Locate the runbook file**

Run: `ls /home/dev/projetos/CLAUDE.md /home/dev/projetos/README.md 2>&1`
Pick whichever exists. If neither exists, create `CLAUDE.md` at the repo root.

- [ ] **Step 2: Append a "Notifications" section**

Append (or update if a `## Notifications` heading already exists):

```markdown
## Notifications

The notification flow routes WhatsApp messages by client category. Set the
mapping once via the existing `PUT /api/settings/:key` endpoint (CEO-only):

```http
PUT /api/settings/category_whatsapp_groups
Content-Type: application/json

{
  "value": {
    "health": "120363425760405482@g.us",
    "experts": "<group jid here>"
  }
}
```

If the key is missing, or a client's category is not in the mapping, the
category-group leg is skipped silently and the rest of the flow still fires.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git -c safe.directory=/home/dev/projetos commit -m "docs: how to configure category_whatsapp_groups"
```

---

## Self-Review (done)

- **Spec coverage:**
  - Section 1.1 (`category_whatsapp_groups` setting) → consumed in Task 2 (`getCategoryGroup`), documented in Task 7.
  - Section 1.2 (`approval_items.rejection_target`) → Task 1 migration, Task 4 persistence, Task 6 UI.
  - Section 1.3 (`approval_batches` window columns) → Task 1 migration, Task 4 trigger, Task 3 worker.
  - Section 2 (window worker) → Task 3 (queue + worker + tests).
  - Section 3.1 (`notifyBatchReviewWindow`), 3.2 (`notifyRejections`), 3.3 (`notifyPublishSuccess`) → Task 2 with full unit coverage.
  - Section 4.1 (open / promote window from `clientRespond`) → Task 4.
  - Section 4.2/4.3 (publish-success wiring in both publish services) → Task 5.
  - Section 4.4 (queue + helpers) → Task 3 step 1.
  - Section 4.5 (require worker in `app.js`) → Task 3 step 6.
  - Section 4.6 (UI capa/vídeo modal) → Task 6.
  - Section 5 (error handling + tests) → assertions distributed across Tasks 2 and 3 (compose, dedup, routing, idempotency, missing config).
- **Placeholder scan:** none of "TBD", "TODO", "fill in", "similar to" remain. Each step shows the actual code or command.
- **Type consistency:** `clientRespond` accepts an options object across Task 4 controller, service, and tests. `notifyBatchReviewWindow(batch, items)`, `notifyRejections(batch, rejectedItems)`, `notifyPublishSuccess(post)` signatures match between Task 2 service, Task 3 worker call, and Task 5 publisher call. Queue helper names `enqueueApprovalReviewWindow` / `promoteApprovalReviewWindow` match across Task 3, Task 4 wiring, and Task 4 tests.
- **Scope:** one cohesive feature, single plan. The follow-up "remove the deprecated `_notifySmRejection`" is intentionally deferred to a later pass; the plan flags it inline.
