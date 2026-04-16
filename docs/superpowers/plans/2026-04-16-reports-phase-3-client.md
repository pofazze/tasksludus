# Reports Phase 3 — Client (Cliente) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Phase 3 of the Reports system — the Client (E) tab of `/relatorios` — with six metrics plus a CSV export that summarize what was published for a given client in a period, the producers who worked on each piece, the rejection volume and categories, and the pipeline cycle time. The tab is scoped per role: management sees every client; account_manager sees only clients where `clients.account_manager_id = req.user.id`.

**Architecture:** Extends the `reports.service` module with six functions keyed off `scheduled_posts` + `deliveries` + `delivery_phases` + `approval_items`. A new controller layer fetches the client upfront, enforces the account_manager scope via `req._scopedAccountManagerId` (set by `reportsAuth('client')` in Phase 1), and exposes one endpoint per metric plus a streaming `/published-list.csv` that reuses the same service function. On the frontend, a shared `ClientSelector` appears above the three tabs' filter bar and drives the Client tab specifically; the rest of the widgets reuse Phase 1/2 primitives.

**Tech Stack:** Node.js / Express / Knex (Postgres) / Jest + supertest / React (Vite) / recharts / tailwind.

---

## File Structure

| File | Role |
|---|---|
| `server/src/modules/reports/reports.service.js` (MODIFY) | Add six Client functions + CSV helper. |
| `server/src/modules/reports/reports.service.test.js` (MODIFY) | Add six describes with unit tests. |
| `server/src/modules/reports/reports.controller.js` (MODIFY) | Add six handlers + `publishedListCsv` that runs the scope check and streams CSV. |
| `server/src/modules/reports/reports.routes.js` (MODIFY) | Register six `/client/:clientId/*` endpoints + one `.csv` route. |
| `server/src/modules/reports/reports.routes.test.js` (MODIFY) | Add supertest cases for each endpoint + scope rejection. |
| `client/src/services/reports.js` (MODIFY) | Add seven axios wrappers. |
| `client/src/components/reports/ClientSelector.jsx` (NEW) | Search-enabled dropdown. |
| `client/src/components/reports/PublishedPostsTable.jsx` (NEW) | Table with columns + CSV download button. |
| `client/src/components/reports/ResponsibilityTable.jsx` (NEW) | Producer roll-up table. |
| `client/src/components/reports/charts/PlatformDonut.jsx` (NEW) | recharts PieChart reusable for platform and post type. |
| `client/src/components/reports/ClientTab.jsx` (NEW, overwrites placeholder if any) | Composition + client gate. |
| `client/src/pages/ReportsPage.jsx` (MODIFY) | Wire `ClientTab`. |

No migrations. No schema changes.

---

## Context the engineer needs

- Spec: `docs/superpowers/specs/2026-04-16-production-metrics-reports-design.md` — "Fase 3 — Cliente" section.
- `reportsAuth('client')` (Phase 1 work) already returns 403 for producer and client; sets `req._scopedAccountManagerId = req.user.id` for account_manager; passes management through unchanged.
- `clients.account_manager_id` already exists on the `clients` table.
- The controller's existing `querySchema` validates `start`, `end`, `clientId?`, `producerId?`, `granularity?`. For Client routes, `clientId` comes from `req.params.clientId` (URL) — the schema still allows it in query for back-compat. The controller's scope check uses the params value.
- Tests keep using the existing in-memory db mock; the service reads `scheduled_posts`, `deliveries`, `delivery_phases`, `approval_items`, `users`, `clients` — the mock already handles all of these.
- `scheduled_posts` columns: `client_id`, `post_group_id`, `platform` ('instagram'|'tiktok'|'youtube'), `post_type` ('reel'|'image'|'carousel'|'story'|'tiktok_video'|'tiktok_photo'|'yt_shorts'), `status`, `ig_permalink`, `tiktok_permalink`, `published_at`, `delivery_id`, `caption`.
- `deliveries` columns used: `id`, `title`, `client_id`, `started_at`, `completed_at`, `content_type`.
- `delivery_phases` columns used: `delivery_id`, `user_id`, `phase`, `entered_at`, `exited_at`.
- `approval_items` columns used: `delivery_id`, `status`, `rejection_category`, `responded_at`.
- `ReportsPage.jsx` currently renders `<p>Em construção (Fase 3).</p>` for the Client tab. Task 6 swaps that for `<ClientTab filters={filters} />`.

---

### Task 1: Service — Client metrics + tests

**Files:**
- Modify: `server/src/modules/reports/reports.service.js` — append six functions + a `publishedListCsvRows` helper + `CLIENT_POST_TYPES` constant.
- Modify: `server/src/modules/reports/reports.service.test.js` — append six describes.

- [ ] **Step 1: Append test seeders helpers**

At the top of `reports.service.test.js`, near the other `seedXxx` helpers, add:

```js
function seedClient(c) { state.clients = state.clients || {}; state.clients[c.id] = { name: c.name || 'Cliente', account_manager_id: null, ...c }; }
function seedScheduledPost(p) {
  state.scheduled_posts = state.scheduled_posts || [];
  state.scheduled_posts.push({
    status: 'published',
    platform: 'instagram',
    post_type: 'reel',
    ig_permalink: null,
    tiktok_permalink: null,
    published_at: new Date('2026-04-15T12:00:00Z'),
    client_id: 'c1',
    delivery_id: null,
    caption: null,
    ...p,
  });
}
```

In the `beforeEach` that resets state, also reset `state.clients = {};` and `state.scheduled_posts = [];`.

Extend the db mock's `.first()` and `.then()` paths to recognise `'clients'` and `'scheduled_posts'` tables. In the existing jest.mock factory for `../../config/db`, the `.first()` branch currently handles `'users'`. Add:

```js
if (this._table === 'clients' && this._where?.id) {
  return Promise.resolve(state.clients[this._where.id] || null);
}
```

And in the `then(resolve)` branch:

```js
if (this._table === 'scheduled_posts') rows = state.scheduled_posts || [];
else if (this._table === 'clients') rows = Object.values(state.clients || {});
```

Keep the existing filters (`_where`, `_whereIn`, `_whereBetween`, `_orderBy`) applying to those new tables too.

- [ ] **Step 2: Append failing tests**

Append to the end of `reports.service.test.js`:

```js
describe('clientSummary', () => {
  test('counts published posts per platform and per post_type', async () => {
    seedClient({ id: 'c1', name: 'Dr X' });
    seedScheduledPost({ client_id: 'c1', platform: 'instagram', post_type: 'reel', published_at: new Date('2026-04-10T10:00:00Z') });
    seedScheduledPost({ client_id: 'c1', platform: 'tiktok', post_type: 'reel', published_at: new Date('2026-04-12T10:00:00Z') });
    seedScheduledPost({ client_id: 'c1', platform: 'instagram', post_type: 'carousel', published_at: new Date('2026-04-13T10:00:00Z') });
    seedScheduledPost({ client_id: 'c1', platform: 'instagram', post_type: 'reel', published_at: new Date('2026-03-10T10:00:00Z') });  // outside range
    const out = await reports.clientSummary({ ...RANGE, clientId: 'c1' });
    expect(out.totalPublished).toBe(3);
    expect(out.byPlatform).toEqual({ instagram: 2, tiktok: 1, youtube: 0 });
    expect(out.byPostType.reel).toBe(2);
    expect(out.byPostType.carousel).toBe(1);
  });
});

describe('publishedList', () => {
  test('returns detailed rows with producersByPhase and firstApproval flag', async () => {
    seedClient({ id: 'c1', name: 'Dr X' });
    seedDelivery({ id: 'd1', client_id: 'c1', clickup_task_id: 't1', title: 'Reel 1', content_type: 'reel' });
    seedScheduledPost({ client_id: 'c1', delivery_id: 'd1', platform: 'instagram', post_type: 'reel', ig_permalink: 'https://instagram.com/p/1', published_at: new Date('2026-04-10T10:00:00Z') });
    seedUser({ id: 'u1', name: 'Ana', producer_type: 'designer' });
    seedUser({ id: 'u2', name: 'Bia', producer_type: 'video_editor' });
    seedPhase({ delivery_id: 'd1', user_id: 'u1', phase: 'design', entered_at: new Date('2026-04-01T10:00:00Z'), exited_at: new Date('2026-04-02T10:00:00Z') });
    seedPhase({ delivery_id: 'd1', user_id: 'u2', phase: 'em_producao_video', entered_at: new Date('2026-04-03T10:00:00Z'), exited_at: new Date('2026-04-03T12:00:00Z') });
    seedApproval({ delivery_id: 'd1', status: 'approved', responded_at: new Date('2026-04-05T10:00:00Z') });
    const out = await reports.publishedList({ ...RANGE, clientId: 'c1' });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      deliveryId: 'd1',
      title: 'Reel 1',
      platform: 'instagram',
      postType: 'reel',
      permalink: 'https://instagram.com/p/1',
      firstApproval: true,
    });
    expect(out[0].producersByPhase.design).toBe('Ana');
    expect(out[0].producersByPhase.em_producao_video).toBe('Bia');
  });
});

describe('clientFirstApprovalRate', () => {
  test('ratio of deliveries approved without any rejections', async () => {
    seedDelivery({ id: 'd1', client_id: 'c1' });
    seedDelivery({ id: 'd2', client_id: 'c1' });
    seedApproval({ delivery_id: 'd1', status: 'approved', responded_at: new Date('2026-04-10T10:00:00Z') });
    seedApproval({ delivery_id: 'd2', status: 'rejected', responded_at: new Date('2026-04-10T10:00:00Z') });
    seedApproval({ delivery_id: 'd2', status: 'approved', responded_at: new Date('2026-04-11T10:00:00Z') });
    const out = await reports.clientFirstApprovalRate({ ...RANGE, clientId: 'c1' });
    expect(out).toMatchObject({ total: 2, firstApproved: 1, rate: 0.5 });
  });
});

describe('clientRejectionVolume', () => {
  test('counts rejections in range by category', async () => {
    seedDelivery({ id: 'd1', client_id: 'c1' });
    seedApproval({ delivery_id: 'd1', status: 'rejected', rejection_category: 'capa', responded_at: new Date('2026-04-10T10:00:00Z') });
    seedApproval({ delivery_id: 'd1', status: 'rejected', rejection_category: 'edicao', responded_at: new Date('2026-04-11T10:00:00Z') });
    seedApproval({ delivery_id: 'd1', status: 'rejected', rejection_category: 'capa', responded_at: new Date('2026-04-12T10:00:00Z') });
    const out = await reports.clientRejectionVolume({ ...RANGE, clientId: 'c1' });
    expect(out.total).toBe(3);
    const capa = out.byCategory.find((r) => r.category === 'capa');
    const edicao = out.byCategory.find((r) => r.category === 'edicao');
    expect(capa.count).toBe(2);
    expect(edicao.count).toBe(1);
  });
});

describe('clientAvgCycleTime', () => {
  test('averages completed minus started in days, and breakdowns by postType', async () => {
    seedDelivery({ id: 'd1', client_id: 'c1', content_type: 'reel', started_at: new Date('2026-04-01T00:00:00Z'), completed_at: new Date('2026-04-04T00:00:00Z') });  // 3d
    seedDelivery({ id: 'd2', client_id: 'c1', content_type: 'reel', started_at: new Date('2026-04-02T00:00:00Z'), completed_at: new Date('2026-04-09T00:00:00Z') });  // 7d
    seedDelivery({ id: 'd3', client_id: 'c1', content_type: 'carrossel', started_at: new Date('2026-04-05T00:00:00Z'), completed_at: new Date('2026-04-07T00:00:00Z') });  // 2d
    const out = await reports.clientAvgCycleTime({ ...RANGE, clientId: 'c1' });
    expect(out.avgDaysStartToPublish).toBe(4);  // (3+7+2)/3 = 4
    expect(out.medianDays).toBe(3);
    const reel = out.byPostType.find((r) => r.postType === 'reel');
    expect(reel.avgDays).toBe(5);
  });
});

describe('clientResponsibilityHistory', () => {
  test('aggregates distinct producers across the clients deliveries in range', async () => {
    seedClient({ id: 'c1' });
    seedDelivery({ id: 'd1', client_id: 'c1', completed_at: new Date('2026-04-10T10:00:00Z') });
    seedDelivery({ id: 'd2', client_id: 'c1', completed_at: new Date('2026-04-12T10:00:00Z') });
    seedUser({ id: 'u1', name: 'Ana', producer_type: 'designer' });
    seedUser({ id: 'u2', name: 'Bia', producer_type: 'video_editor' });
    seedPhase({ delivery_id: 'd1', user_id: 'u1', phase: 'design', entered_at: new Date('2026-04-09T10:00:00Z') });
    seedPhase({ delivery_id: 'd2', user_id: 'u1', phase: 'design', entered_at: new Date('2026-04-11T10:00:00Z') });
    seedPhase({ delivery_id: 'd2', user_id: 'u2', phase: 'em_producao_video', entered_at: new Date('2026-04-11T12:00:00Z') });
    const out = await reports.clientResponsibilityHistory({ ...RANGE, clientId: 'c1' });
    const ana = out.find((r) => r.producerId === 'u1');
    const bia = out.find((r) => r.producerId === 'u2');
    expect(ana).toMatchObject({ producerName: 'Ana', producerType: 'designer', taskCount: 2 });
    expect(ana.phases).toEqual(expect.arrayContaining(['design']));
    expect(bia).toMatchObject({ producerName: 'Bia', taskCount: 1 });
    expect(bia.phases).toEqual(expect.arrayContaining(['em_producao_video']));
  });
});
```

- [ ] **Step 3: Run the failing tests**

```bash
cd /home/dev/projetos/server && npx jest src/modules/reports/reports.service.test.js --testTimeout=10000 --forceExit 2>&1 | tail -25
```

Expected: 6 new describes fail with `reports.clientSummary is not a function` and friends.

- [ ] **Step 4: Implement the functions**

Append to `server/src/modules/reports/reports.service.js` above `module.exports`:

```js
const CLIENT_PLATFORMS = ['instagram', 'tiktok', 'youtube'];
const CLIENT_POST_TYPES_ALL = ['reel', 'image', 'carousel', 'carrossel', 'story', 'tiktok_video', 'tiktok_photo', 'yt_shorts', 'feed', 'video'];

async function clientSummary({ start, end, clientId }) {
  const posts = await db('scheduled_posts');
  const filtered = posts.filter((p) => {
    if (p.client_id !== clientId) return false;
    if (p.status !== 'published') return false;
    const t = p.published_at ? new Date(p.published_at).getTime() : null;
    if (!t) return false;
    return t >= new Date(start).getTime() && t <= new Date(end).getTime();
  });
  const byPlatform = Object.fromEntries(CLIENT_PLATFORMS.map((pl) => [pl, 0]));
  const byPostType = {};
  for (const p of filtered) {
    byPlatform[p.platform] = (byPlatform[p.platform] || 0) + 1;
    const key = p.post_type || 'outro';
    byPostType[key] = (byPostType[key] || 0) + 1;
  }
  return {
    totalPublished: filtered.length,
    byPlatform,
    byPostType,
  };
}

async function publishedList({ start, end, clientId }) {
  const posts = await db('scheduled_posts');
  const deliveries = await db('deliveries');
  const byDelivery = new Map(deliveries.map((d) => [d.id, d]));
  const phases = await db('delivery_phases');
  const items = await db('approval_items');

  const filtered = posts.filter((p) => {
    if (p.client_id !== clientId) return false;
    if (p.status !== 'published') return false;
    const t = p.published_at ? new Date(p.published_at).getTime() : null;
    if (!t) return false;
    return t >= new Date(start).getTime() && t <= new Date(end).getTime();
  });

  const results = [];
  for (const p of filtered) {
    const delivery = byDelivery.get(p.delivery_id);
    const producersByPhase = {};
    const deliveryPhaseRows = phases
      .filter((ph) => ph.delivery_id === p.delivery_id)
      .sort((a, b) => new Date(b.entered_at).getTime() - new Date(a.entered_at).getTime());
    for (const row of deliveryPhaseRows) {
      if (!producersByPhase[row.phase] && row.user_id) {
        const user = await loadUser(row.user_id);
        producersByPhase[row.phase] = user.name;
      }
    }
    const deliveryItems = items.filter((i) => i.delivery_id === p.delivery_id);
    const hasRejection = deliveryItems.some((i) => i.status === 'rejected');
    const hasApproval = deliveryItems.some((i) => i.status === 'approved');
    const firstApproval = hasApproval && !hasRejection;
    const permalink = p.platform === 'instagram' ? p.ig_permalink : p.platform === 'tiktok' ? p.tiktok_permalink : null;
    results.push({
      deliveryId: p.delivery_id,
      title: delivery?.title || p.caption?.slice(0, 80) || p.delivery_id,
      publishedAt: p.published_at,
      platform: p.platform,
      permalink,
      postType: p.post_type,
      producersByPhase,
      firstApproval,
    });
  }
  results.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  return results;
}

async function clientFirstApprovalRate({ start, end, clientId }) {
  const deliveries = await db('deliveries');
  const items = await db('approval_items');
  const clientDeliveries = deliveries.filter((d) => d.client_id === clientId);
  const deliveryIds = new Set(clientDeliveries.map((d) => d.id));

  let total = 0;
  let firstApproved = 0;
  for (const deliveryId of deliveryIds) {
    const forDelivery = items.filter((i) => {
      if (i.delivery_id !== deliveryId) return false;
      const t = i.responded_at ? new Date(i.responded_at).getTime() : null;
      if (!t) return false;
      return t >= new Date(start).getTime() && t <= new Date(end).getTime();
    });
    if (forDelivery.length === 0) continue;
    total += 1;
    const hasReject = forDelivery.some((i) => i.status === 'rejected');
    const hasApprove = forDelivery.some((i) => i.status === 'approved');
    if (hasApprove && !hasReject) firstApproved += 1;
  }
  return { total, firstApproved, rate: total ? firstApproved / total : 0 };
}

async function clientRejectionVolume({ start, end, clientId }) {
  const items = await db('approval_items');
  const deliveries = await db('deliveries');
  const clientDeliveryIds = new Set(deliveries.filter((d) => d.client_id === clientId).map((d) => d.id));

  const counts = new Map();
  let total = 0;
  for (const i of items) {
    if (i.status !== 'rejected') continue;
    if (!clientDeliveryIds.has(i.delivery_id)) continue;
    const t = i.responded_at ? new Date(i.responded_at).getTime() : null;
    if (!t) continue;
    if (t < new Date(start).getTime() || t > new Date(end).getTime()) continue;
    total += 1;
    const key = i.rejection_category || 'outro';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return {
    total,
    byCategory: [...counts.entries()].map(([category, count]) => ({ category, count })),
  };
}

async function clientAvgCycleTime({ start, end, clientId }) {
  const deliveries = await db('deliveries');
  const phases = await db('delivery_phases');
  const byDeliveryPhases = new Map();
  for (const p of phases) {
    if (!byDeliveryPhases.has(p.delivery_id)) byDeliveryPhases.set(p.delivery_id, []);
    byDeliveryPhases.get(p.delivery_id).push(p);
  }
  const durations = [];
  const byTypeMap = new Map();
  for (const d of deliveries) {
    if (d.client_id !== clientId) continue;
    const completed = d.completed_at ? new Date(d.completed_at).getTime() : null;
    if (!completed) continue;
    if (completed < new Date(start).getTime() || completed > new Date(end).getTime()) continue;
    let startedMs = d.started_at ? new Date(d.started_at).getTime() : null;
    if (!startedMs) {
      const rows = byDeliveryPhases.get(d.id) || [];
      if (rows.length) {
        const earliest = rows.reduce((lo, r) => Math.min(lo, new Date(r.entered_at).getTime()), Infinity);
        if (Number.isFinite(earliest)) startedMs = earliest;
      }
    }
    if (!startedMs) continue;
    const days = Math.max(0, Math.round((completed - startedMs) / (24 * 60 * 60 * 1000)));
    durations.push(days);
    const key = d.content_type || 'outro';
    if (!byTypeMap.has(key)) byTypeMap.set(key, []);
    byTypeMap.get(key).push(days);
  }
  const avg = durations.length ? Math.round(durations.reduce((s, n) => s + n, 0) / durations.length) : 0;
  return {
    avgDaysStartToPublish: avg,
    medianDays: median(durations),
    byPostType: [...byTypeMap.entries()].map(([postType, arr]) => ({
      postType,
      avgDays: Math.round(arr.reduce((s, n) => s + n, 0) / arr.length),
    })),
  };
}

async function clientResponsibilityHistory({ start, end, clientId }) {
  const deliveries = await db('deliveries');
  const phases = await db('delivery_phases');
  const inRange = new Set(
    deliveries
      .filter((d) => d.client_id === clientId)
      .filter((d) => {
        const t = d.completed_at ? new Date(d.completed_at).getTime() : null;
        if (!t) return true;
        return t >= new Date(start).getTime() && t <= new Date(end).getTime();
      })
      .map((d) => d.id),
  );
  const rows = phases.filter((p) => inRange.has(p.delivery_id) && p.user_id);
  const byUser = new Map();
  for (const row of rows) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, { deliveryIds: new Set(), phases: new Set() });
    const entry = byUser.get(row.user_id);
    entry.deliveryIds.add(row.delivery_id);
    entry.phases.add(row.phase);
  }
  const results = [];
  for (const [userId, { deliveryIds, phases: phaseSet }] of byUser.entries()) {
    const user = await loadUser(userId);
    results.push({
      producerId: userId,
      producerName: user.name,
      producerType: user.producer_type,
      taskCount: deliveryIds.size,
      phases: [...phaseSet],
    });
  }
  results.sort((a, b) => b.taskCount - a.taskCount);
  return results;
}

function publishedListToCsv(rows) {
  const headers = ['data_publicacao', 'titulo', 'plataforma', 'tipo', 'link', 'designer', 'editor_video', 'aprovacao_primeira'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    const date = r.publishedAt ? new Date(r.publishedAt).toISOString().slice(0, 10) : '';
    const designer = r.producersByPhase?.em_producao_design || r.producersByPhase?.design || '';
    const editor = r.producersByPhase?.em_producao_video || r.producersByPhase?.edicao_de_video || '';
    const row = [
      date,
      csvEscape(r.title),
      r.platform || '',
      r.postType || '',
      csvEscape(r.permalink || ''),
      csvEscape(designer),
      csvEscape(editor),
      r.firstApproval ? 'sim' : 'nao',
    ];
    lines.push(row.join(','));
  }
  return lines.join('\n') + '\n';
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
```

Extend `module.exports` with the six new functions + the helper:

```js
module.exports = {
  firstApprovalRate,
  rejectionRate,
  reworkPerTask,
  rejectionByCategory,
  rejectionByPostType,
  rejectionByTarget,
  ranking,
  volumeTimeseries,
  activeTasks,
  avgPhaseDuration,
  totalHours,
  overdue,
  phaseDistribution,
  weeklyHeatmap,
  avgWorkTimeseries,
  clientSummary,
  publishedList,
  clientFirstApprovalRate,
  clientRejectionVolume,
  clientAvgCycleTime,
  clientResponsibilityHistory,
  publishedListToCsv,
  PRODUCTION_PHASES,
};
```

- [ ] **Step 5: Run the tests**

```bash
cd /home/dev/projetos/server && npx jest src/modules/reports/reports.service.test.js --testTimeout=10000 --forceExit 2>&1 | tail -20
```

Expected: all service tests pass (Phase 1 + Phase 2 + 6 new Phase 3 = 22 describes).

- [ ] **Step 6: Full suite**

```bash
cd /home/dev/projetos/server && npx jest --silent --forceExit --testTimeout=10000 2>&1 | tail -10
```

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add server/src/modules/reports/reports.service.js server/src/modules/reports/reports.service.test.js
git -c safe.directory=/home/dev/projetos commit -m "feat(reports): client metrics service

Six pure functions compute per-client views for Phase 3:
clientSummary (totals + per-platform + per-post-type),
publishedList (detailed rows with producersByPhase and
firstApproval), clientFirstApprovalRate, clientRejectionVolume
(by category), clientAvgCycleTime (mean + median + per post
type, fallback to delivery_phases boundaries when
deliveries.started_at is null), and clientResponsibilityHistory
(distinct producers with task count and phases touched). Also
ships publishedListToCsv for the upcoming CSV export endpoint.
Six new describes cover every function."
```

---

### Task 2: Reports API — handlers, routes, CSV, supertest

**Files:**
- Modify: `server/src/modules/reports/reports.controller.js` — add 6 handlers + `publishedListCsv` streaming handler + `ensureClientAllowed` helper.
- Modify: `server/src/modules/reports/reports.routes.js` — register `/client/:clientId/*` routes under `reportsAuth('client')`.
- Modify: `server/src/modules/reports/reports.routes.test.js` — extend the service mock with 6 new methods + supertest for scoping (403 when account_manager queries a client not theirs).

- [ ] **Step 1: Add controller handlers + helper**

Open `server/src/modules/reports/reports.controller.js`. Near the top imports, add:

```js
const db = require('../../config/db');
```

Add this helper right below `filterByProducer`:

```js
async function ensureClientAllowed(req, res) {
  const clientId = req.params.clientId;
  if (!clientId) {
    res.status(400).json({ error: 'clientId is required' });
    return null;
  }
  const client = await db('clients').where({ id: clientId }).first();
  if (!client) {
    res.status(404).json({ error: 'Client not found' });
    return null;
  }
  if (req._scopedAccountManagerId && client.account_manager_id !== req._scopedAccountManagerId) {
    res.status(403).json({ error: 'Reports: this client is not in your scope' });
    return null;
  }
  return client;
}
```

Append six handlers + the CSV handler above `module.exports`:

```js
async function clientSummary(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const client = await ensureClientAllowed(req, res); if (!client) return;
    const out = await service.clientSummary({ ...v, clientId: req.params.clientId });
    res.json(out);
  } catch (err) { next(err); }
}

async function publishedList(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const client = await ensureClientAllowed(req, res); if (!client) return;
    const out = await service.publishedList({ ...v, clientId: req.params.clientId });
    res.json(out);
  } catch (err) { next(err); }
}

async function clientFirstApprovalRate(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const client = await ensureClientAllowed(req, res); if (!client) return;
    const out = await service.clientFirstApprovalRate({ ...v, clientId: req.params.clientId });
    res.json(out);
  } catch (err) { next(err); }
}

async function clientRejectionVolume(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const client = await ensureClientAllowed(req, res); if (!client) return;
    const out = await service.clientRejectionVolume({ ...v, clientId: req.params.clientId });
    res.json(out);
  } catch (err) { next(err); }
}

async function clientAvgCycleTime(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const client = await ensureClientAllowed(req, res); if (!client) return;
    const out = await service.clientAvgCycleTime({ ...v, clientId: req.params.clientId });
    res.json(out);
  } catch (err) { next(err); }
}

async function clientResponsibilityHistory(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const client = await ensureClientAllowed(req, res); if (!client) return;
    const out = await service.clientResponsibilityHistory({ ...v, clientId: req.params.clientId });
    res.json(out);
  } catch (err) { next(err); }
}

async function publishedListCsv(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const client = await ensureClientAllowed(req, res); if (!client) return;
    const rows = await service.publishedList({ ...v, clientId: req.params.clientId });
    const csv = service.publishedListToCsv(rows);
    const safeName = (client.name || 'cliente').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="publicados_${safeName}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
}
```

Extend `module.exports` with all seven names:

```js
module.exports = {
  firstApprovalRate,
  rejectionRate,
  reworkPerTask,
  rejectionByCategory,
  rejectionByPostType,
  rejectionByTarget,
  ranking,
  volumeTimeseries,
  activeTasks,
  avgPhaseDuration,
  totalHours,
  overdue,
  phaseDistribution,
  weeklyHeatmap,
  avgWorkTimeseries,
  clientSummary,
  publishedList,
  clientFirstApprovalRate,
  clientRejectionVolume,
  clientAvgCycleTime,
  clientResponsibilityHistory,
  publishedListCsv,
};
```

- [ ] **Step 2: Register routes**

Open `server/src/modules/reports/reports.routes.js`. Below the existing `/capacity/*` routes, add:

```js
const clientGuard = reportsAuth('client');
router.get('/client/:clientId/summary', clientGuard, controller.clientSummary);
router.get('/client/:clientId/published-list', clientGuard, controller.publishedList);
router.get('/client/:clientId/published-list.csv', clientGuard, controller.publishedListCsv);
router.get('/client/:clientId/first-approval-rate', clientGuard, controller.clientFirstApprovalRate);
router.get('/client/:clientId/rejection-volume', clientGuard, controller.clientRejectionVolume);
router.get('/client/:clientId/avg-cycle-time', clientGuard, controller.clientAvgCycleTime);
router.get('/client/:clientId/responsibility-history', clientGuard, controller.clientResponsibilityHistory);
```

- [ ] **Step 3: Extend service mock**

Open `server/src/modules/reports/reports.routes.test.js`. Extend the `jest.mock('./reports.service', ...)` factory:

```js
  clientSummary: jest.fn().mockResolvedValue({ totalPublished: 3, byPlatform: { instagram: 2, tiktok: 1, youtube: 0 }, byPostType: { reel: 2, carousel: 1 } }),
  publishedList: jest.fn().mockResolvedValue([{ deliveryId: 'd1', title: 'X', publishedAt: new Date().toISOString(), platform: 'instagram', permalink: 'https://instagram.com/p/1', postType: 'reel', producersByPhase: { design: 'Ana' }, firstApproval: true }]),
  clientFirstApprovalRate: jest.fn().mockResolvedValue({ total: 2, firstApproved: 1, rate: 0.5 }),
  clientRejectionVolume: jest.fn().mockResolvedValue({ total: 1, byCategory: [{ category: 'capa', count: 1 }] }),
  clientAvgCycleTime: jest.fn().mockResolvedValue({ avgDaysStartToPublish: 4, medianDays: 3, byPostType: [{ postType: 'reel', avgDays: 5 }] }),
  clientResponsibilityHistory: jest.fn().mockResolvedValue([{ producerId: 'u1', producerName: 'Ana', producerType: 'designer', taskCount: 2, phases: ['design'] }]),
  publishedListToCsv: jest.fn().mockImplementation((rows) => `data_publicacao,titulo\n2026-04-10,X\n`),
```

- [ ] **Step 4: Mock the db for ensureClientAllowed**

Inside the existing `../../middleware/auth` mock block (or just below it), add a mock for the `config/db` module used by the controller's `ensureClientAllowed` helper:

```js
const mockClients = { c1: { id: 'c1', name: 'Dr X', account_manager_id: null }, c2: { id: 'c2', name: 'Dr Y', account_manager_id: 'otherManagerUser' } };
jest.mock('../../config/db', () => {
  return jest.fn((table) => ({
    where(conditions) {
      return {
        first: () => {
          if (table === 'clients' && conditions?.id) {
            return Promise.resolve(mockClients[conditions.id] || null);
          }
          return Promise.resolve(null);
        },
      };
    },
  }));
});
```

- [ ] **Step 5: Add supertest cases**

Append to `reports.routes.test.js`:

```js
describe('GET /api/reports/client/:clientId — happy paths', () => {
  beforeEach(() => { userForRequest.role = 'manager'; userForRequest.id = 'u1'; });

  test('summary returns 200 with totals and breakdowns', async () => {
    const res = await request(buildApp())
      .get('/api/reports/client/c1/summary')
      .query({ start: '2026-04-01', end: '2026-04-30' });
    expect(res.status).toBe(200);
    expect(res.body.totalPublished).toBe(3);
    expect(res.body.byPlatform.instagram).toBe(2);
  });

  test('published-list returns 200 with detail rows', async () => {
    const res = await request(buildApp())
      .get('/api/reports/client/c1/published-list')
      .query({ start: '2026-04-01', end: '2026-04-30' });
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ platform: 'instagram', firstApproval: true });
  });

  test('published-list.csv returns 200 text/csv', async () => {
    const res = await request(buildApp())
      .get('/api/reports/client/c1/published-list.csv')
      .query({ start: '2026-04-01', end: '2026-04-30' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.text).toContain('data_publicacao');
  });

  test('rejection-volume returns byCategory', async () => {
    const res = await request(buildApp())
      .get('/api/reports/client/c1/rejection-volume')
      .query({ start: '2026-04-01', end: '2026-04-30' });
    expect(res.status).toBe(200);
    expect(res.body.byCategory[0]).toMatchObject({ category: 'capa', count: 1 });
  });
});

describe('GET /api/reports/client/:clientId — scoping', () => {
  test('account_manager is blocked from a client not theirs (403)', async () => {
    userForRequest.role = 'account_manager';
    userForRequest.id = 'amUser';
    const res = await request(buildApp())
      .get('/api/reports/client/c2/summary')
      .query({ start: '2026-04-01', end: '2026-04-30' });
    expect(res.status).toBe(403);
  });

  test('producer gets 403 on client feature', async () => {
    userForRequest.role = 'producer';
    const res = await request(buildApp())
      .get('/api/reports/client/c1/summary')
      .query({ start: '2026-04-01', end: '2026-04-30' });
    expect(res.status).toBe(403);
  });

  test('client role gets 403', async () => {
    userForRequest.role = 'client';
    const res = await request(buildApp())
      .get('/api/reports/client/c1/summary')
      .query({ start: '2026-04-01', end: '2026-04-30' });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 6: Run suites**

```bash
cd /home/dev/projetos/server && npx jest src/modules/reports --testTimeout=10000 --forceExit 2>&1 | tail -10
```

Expected: all reports tests pass (10 auth + 22 service + Phase 1 routes + Phase 2 routes + 7 new client routes).

```bash
cd /home/dev/projetos/server && npx jest --silent --forceExit --testTimeout=10000 2>&1 | tail -10
```

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add server/src/modules/reports/reports.controller.js server/src/modules/reports/reports.routes.js server/src/modules/reports/reports.routes.test.js
git -c safe.directory=/home/dev/projetos commit -m "feat(reports): HTTP endpoints for Client metrics + CSV export

Seven routes under /api/reports/client/:clientId/*, all gated by
reportsAuth('client') and an additional account_manager scope
check that verifies clients.account_manager_id matches
req._scopedAccountManagerId. publishedListCsv streams a UTF-8
CSV with the published posts including producers per phase and
the first-approval flag. Supertest covers happy paths, CSV
headers, producer/client 403 and account_manager wrong-client
403."
```

---

### Task 3: Frontend — axios wrappers for Client

**Files:**
- Modify: `client/src/services/reports.js`

- [ ] **Step 1: Append seven methods**

Inside `reportsApi`, before the closing `};`, add:

```js
  clientSummary: (clientId, params) => api.get(`/reports/client/${clientId}/summary`, { params: qs(params) }).then((r) => r.data),
  publishedList: (clientId, params) => api.get(`/reports/client/${clientId}/published-list`, { params: qs(params) }).then((r) => r.data),
  clientFirstApprovalRate: (clientId, params) => api.get(`/reports/client/${clientId}/first-approval-rate`, { params: qs(params) }).then((r) => r.data),
  clientRejectionVolume: (clientId, params) => api.get(`/reports/client/${clientId}/rejection-volume`, { params: qs(params) }).then((r) => r.data),
  clientAvgCycleTime: (clientId, params) => api.get(`/reports/client/${clientId}/avg-cycle-time`, { params: qs(params) }).then((r) => r.data),
  clientResponsibilityHistory: (clientId, params) => api.get(`/reports/client/${clientId}/responsibility-history`, { params: qs(params) }).then((r) => r.data),
  publishedListCsvUrl: (clientId, params) => {
    const search = new URLSearchParams(qs(params)).toString();
    return `/api/reports/client/${clientId}/published-list.csv${search ? `?${search}` : ''}`;
  },
```

- [ ] **Step 2: Build**

```bash
cd /home/dev/projetos/client && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add client/src/services/reports.js
git -c safe.directory=/home/dev/projetos commit -m "feat(reports-ui): axios wrappers for Client endpoints"
```

---

### Task 4: Frontend — `ClientSelector` + `PublishedPostsTable` + `ResponsibilityTable`

**Files:**
- Create: `client/src/components/reports/ClientSelector.jsx`
- Create: `client/src/components/reports/PublishedPostsTable.jsx`
- Create: `client/src/components/reports/ResponsibilityTable.jsx`

- [ ] **Step 1: Create `ClientSelector`**

Create `client/src/components/reports/ClientSelector.jsx`:

```jsx
import { useEffect, useState } from 'react';
import api from '@/services/api';

export default function ClientSelector({ value, onChange }) {
  const [clients, setClients] = useState([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    api.get('/clients').then((r) => setClients(r.data || [])).catch(() => setClients([]));
  }, []);

  const filtered = clients.filter((c) => !query || c.name.toLowerCase().includes(query.toLowerCase()));
  const selected = clients.find((c) => c.id === value);

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">Cliente</label>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Buscar cliente..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="px-2 py-1 rounded border border-border bg-background text-sm min-w-[200px]"
        />
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value || null)}
          className="px-2 py-1 rounded border border-border bg-background text-sm min-w-[220px]"
        >
          <option value="">{selected ? selected.name : 'Selecione...'}</option>
          {filtered.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `PublishedPostsTable`**

Create `client/src/components/reports/PublishedPostsTable.jsx`:

```jsx
import { ExternalLink, Download } from 'lucide-react';

const PLATFORM_LABELS = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube' };
const POST_TYPE_LABELS = { reel: 'Reel', image: 'Imagem', feed: 'Feed', carousel: 'Carrossel', carrossel: 'Carrossel', story: 'Story', tiktok_video: 'Vídeo TikTok', tiktok_photo: 'Foto TikTok', yt_shorts: 'YT Shorts', video: 'Vídeo' };

function fmtDate(v) {
  if (!v) return '';
  const d = new Date(v);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

export default function PublishedPostsTable({ rows, csvHref }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <h3 className="text-sm font-medium text-foreground">Publicados no período</h3>
        {csvHref && (
          <a
            href={csvHref}
            className="text-xs text-purple-400 hover:underline inline-flex items-center gap-1"
          >
            <Download size={12} /> Exportar CSV
          </a>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3">Data</th>
              <th className="text-left p-3">Título</th>
              <th className="text-left p-3">Plataforma</th>
              <th className="text-left p-3">Tipo</th>
              <th className="text-left p-3">Link</th>
              <th className="text-left p-3">Designer</th>
              <th className="text-left p-3">Editor</th>
              <th className="text-center p-3">Aprov. 1ª</th>
            </tr>
          </thead>
          <tbody>
            {(!rows || rows.length === 0) && (
              <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Sem publicações no período.</td></tr>
            )}
            {(rows || []).map((r) => (
              <tr key={r.deliveryId + r.platform} className="border-t border-border">
                <td className="p-3 whitespace-nowrap">{fmtDate(r.publishedAt)}</td>
                <td className="p-3 max-w-[280px] truncate" title={r.title}>{r.title}</td>
                <td className="p-3">{PLATFORM_LABELS[r.platform] || r.platform}</td>
                <td className="p-3">{POST_TYPE_LABELS[r.postType] || r.postType}</td>
                <td className="p-3">
                  {r.permalink ? (
                    <a href={r.permalink} target="_blank" rel="noreferrer" className="text-purple-400 hover:underline inline-flex items-center gap-1">
                      <ExternalLink size={12} /> Abrir
                    </a>
                  ) : '—'}
                </td>
                <td className="p-3">{r.producersByPhase?.em_producao_design || r.producersByPhase?.design || '—'}</td>
                <td className="p-3">{r.producersByPhase?.em_producao_video || r.producersByPhase?.edicao_de_video || '—'}</td>
                <td className="p-3 text-center">{r.firstApproval ? '✅' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `ResponsibilityTable`**

Create `client/src/components/reports/ResponsibilityTable.jsx`:

```jsx
const PRODUCER_TYPE_LABELS = {
  designer: 'Designer',
  video_editor: 'Editor de Vídeo',
  captation: 'Captação',
  social_media: 'Social Media',
};

const PHASE_LABELS = {
  em_producao_design: 'Produção — Design',
  em_producao_video: 'Produção — Vídeo',
  design: 'Design (fila)',
  edicao_de_video: 'Vídeo (fila)',
  captacao: 'Captação',
  estruturacao: 'Estruturação',
  correcao: 'Correção',
  aprovacao: 'Aprovação',
  agendamento: 'Agendamento',
  agendado: 'Agendado',
};

export default function ResponsibilityTable({ rows }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <h3 className="text-sm font-medium text-foreground p-3 border-b border-border">Responsáveis no período</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3">Produtor</th>
              <th className="text-left p-3">Função</th>
              <th className="text-right p-3">Tasks</th>
              <th className="text-left p-3">Fases</th>
            </tr>
          </thead>
          <tbody>
            {(!rows || rows.length === 0) && (
              <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Sem produtores envolvidos no período.</td></tr>
            )}
            {(rows || []).map((r) => (
              <tr key={r.producerId} className="border-t border-border">
                <td className="p-3 font-medium">{r.producerName}</td>
                <td className="p-3 text-muted-foreground">{PRODUCER_TYPE_LABELS[r.producerType] || '—'}</td>
                <td className="p-3 text-right">{r.taskCount}</td>
                <td className="p-3 text-xs">{(r.phases || []).map((p) => PHASE_LABELS[p] || p).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Build smoke**

```bash
cd /home/dev/projetos/client && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add client/src/components/reports/ClientSelector.jsx client/src/components/reports/PublishedPostsTable.jsx client/src/components/reports/ResponsibilityTable.jsx
git -c safe.directory=/home/dev/projetos commit -m "feat(reports-ui): ClientSelector, PublishedPostsTable, ResponsibilityTable"
```

---

### Task 5: Frontend — `PlatformDonut` chart + `ClientRejectionBarChart` reuse

**Files:**
- Create: `client/src/components/reports/charts/PlatformDonut.jsx`

- [ ] **Step 1: Create the reusable donut**

Create `client/src/components/reports/charts/PlatformDonut.jsx`:

```jsx
import { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#9A48EA', '#3B82F6', '#F59E0B', '#10B981', '#EF4444', '#06B6D4', '#8B5CF6'];

export default function PlatformDonut({ title, data, labelMap }) {
  const series = useMemo(() => {
    return Object.entries(data || {})
      .filter(([, v]) => v && v > 0)
      .map(([name, value]) => ({ name, label: labelMap?.[name] || name, value }));
  }, [data, labelMap]);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-medium text-foreground mb-3">{title}</h3>
      {series.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Sem dados no período.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={series} dataKey="value" nameKey="label" innerRadius={50} outerRadius={80} paddingAngle={2}>
              {series.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd /home/dev/projetos/client && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/reports/charts/PlatformDonut.jsx
git -c safe.directory=/home/dev/projetos commit -m "feat(reports-ui): reusable PlatformDonut chart"
```

---

### Task 6: Frontend — `ClientTab` composition + `ReportsPage` wiring

**Files:**
- Create: `client/src/components/reports/ClientTab.jsx`
- Modify: `client/src/pages/ReportsPage.jsx`

- [ ] **Step 1: Create `ClientTab`**

Create `client/src/components/reports/ClientTab.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { reportsApi } from '@/services/reports';
import KpiCard from './KpiCard';
import ClientSelector from './ClientSelector';
import PlatformDonut from './charts/PlatformDonut';
import RejectionBreakdownChart from './charts/RejectionBreakdownChart';
import PublishedPostsTable from './PublishedPostsTable';
import ResponsibilityTable from './ResponsibilityTable';

const PLATFORM_LABELS = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube' };
const POST_TYPE_LABELS = { reel: 'Reel', image: 'Imagem', feed: 'Feed', carousel: 'Carrossel', carrossel: 'Carrossel', story: 'Story', tiktok_video: 'Vídeo TikTok', tiktok_photo: 'Foto TikTok', yt_shorts: 'YT Shorts', video: 'Vídeo', outro: 'Outro' };

function fmtPct(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${Math.round(n * 100)}%`;
}

export default function ClientTab({ filters }) {
  const [clientId, setClientId] = useState('');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [list, setList] = useState([]);
  const [firstApproval, setFirstApproval] = useState(null);
  const [rejections, setRejections] = useState(null);
  const [cycleTime, setCycleTime] = useState(null);
  const [responsibility, setResponsibility] = useState([]);

  useEffect(() => {
    if (!clientId || !filters.start || !filters.end) return;
    setLoading(true);
    const params = { start: filters.start, end: filters.end };
    Promise.all([
      reportsApi.clientSummary(clientId, params),
      reportsApi.publishedList(clientId, params),
      reportsApi.clientFirstApprovalRate(clientId, params),
      reportsApi.clientRejectionVolume(clientId, params),
      reportsApi.clientAvgCycleTime(clientId, params),
      reportsApi.clientResponsibilityHistory(clientId, params),
    ]).then(([s, l, fa, rej, ct, resp]) => {
      setSummary(s); setList(l); setFirstApproval(fa); setRejections(rej); setCycleTime(ct); setResponsibility(resp);
    }).catch(() => {
      toast.error('Erro ao carregar relatório do cliente');
    }).finally(() => setLoading(false));
  }, [clientId, filters.start, filters.end]);

  const csvHref = clientId && filters.start && filters.end
    ? reportsApi.publishedListCsvUrl(clientId, { start: filters.start, end: filters.end })
    : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end p-3 rounded-lg border border-border bg-card">
        <ClientSelector value={clientId} onChange={setClientId} />
      </div>

      {!clientId && (
        <p className="text-sm text-muted-foreground py-12 text-center">Selecione um cliente pra começar.</p>
      )}

      {clientId && loading && (
        <p className="text-sm text-muted-foreground py-12 text-center">Carregando…</p>
      )}

      {clientId && !loading && (
        <>
          <div className="flex flex-wrap gap-3">
            <KpiCard label="Total publicado" value={summary?.totalPublished ?? 0} />
            <KpiCard label="% aprov. 1ª" value={fmtPct(firstApproval?.rate)} />
            <KpiCard label="Reprovações" value={rejections?.total ?? 0} />
            <KpiCard label="Ciclo médio (dias)" value={cycleTime?.avgDaysStartToPublish ?? '—'} subtitle={cycleTime?.medianDays !== undefined ? `Mediana: ${cycleTime.medianDays}` : null} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PlatformDonut title="Por plataforma" data={summary?.byPlatform} labelMap={PLATFORM_LABELS} />
            <PlatformDonut title="Por tipo de post" data={summary?.byPostType} labelMap={POST_TYPE_LABELS} />
          </div>

          <PublishedPostsTable rows={list} csvHref={csvHref} />

          <ResponsibilityTable rows={responsibility} />

          <RejectionBreakdownChart title="Reprovações por categoria" data={rejections?.byCategory || []} labelKey="category" valueKey="count" />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire into `ReportsPage`**

Open `client/src/pages/ReportsPage.jsx`. Add import:

```jsx
import ClientTab from '@/components/reports/ClientTab';
```

Replace the placeholder:

```jsx
{activeTab === 'client' && <p className="text-muted-foreground text-sm py-12 text-center">Em construção (Fase 3).</p>}
```

With:

```jsx
{activeTab === 'client' && <ClientTab filters={filters} />}
```

- [ ] **Step 3: Build**

```bash
cd /home/dev/projetos/client && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add client/src/components/reports/ClientTab.jsx client/src/pages/ReportsPage.jsx
git -c safe.directory=/home/dev/projetos commit -m "feat(reports-ui): ClientTab with summary, published posts table, responsibility and rejection breakdown"
```

---

### Task 7: Manual verification in production

**Files:** none (manual gate).

- [ ] **Step 1: Push and wait for Railway deploy**

```bash
git push origin master
```

- [ ] **Step 2: Visit `/relatorios` → aba Cliente**

Log in as a management user. Select a client from the dropdown. Confirm:
- Four KPI cards populate.
- Two donuts (platform + type).
- Published posts table shows rows with designer/editor columns and a working "Exportar CSV" link.
- Responsibility table lists producers with phase labels.
- Rejection breakdown bar shows categories.

- [ ] **Step 3: Download the CSV**

Click "Exportar CSV". Open the file — confirm the header row is `data_publicacao,titulo,plataforma,tipo,link,designer,editor_video,aprovacao_primeira` and a handful of rows correspond to what the table shows.

- [ ] **Step 4: Account_manager scoping**

Log in as an account_manager. Confirm they see the Client tab; selecting a client assigned to them renders data; selecting a client NOT assigned to them returns 403 in the Network tab.

- [ ] **Step 5: Producer and client role 403**

Quick Network-tab check (or log in as those roles) — any request to `/api/reports/client/*` returns 403. The "Relatórios" menu stays hidden for `client`.

No commit — gate before closing the phase.

---

## Self-Review (done)

- **Spec coverage (Fase 3 items in `docs/superpowers/specs/2026-04-16-production-metrics-reports-design.md`):**
  - Summary (`totalPublished` + `byPlatform` + `byPostType`) → Task 1 `clientSummary`, Task 6 KPIs + donuts.
  - Published list with producersByPhase and firstApproval → Task 1 `publishedList`, Task 4 `PublishedPostsTable`.
  - First approval rate → Task 1 `clientFirstApprovalRate`, Task 6 KPI.
  - Rejection volume by category → Task 1 `clientRejectionVolume`, Task 6 `RejectionBreakdownChart`.
  - Avg cycle time with byPostType → Task 1 `clientAvgCycleTime`, Task 6 KPI.
  - Responsibility history → Task 1 `clientResponsibilityHistory`, Task 4 `ResponsibilityTable`.
  - CSV export → Task 1 `publishedListToCsv`, Task 2 `/published-list.csv` route, Task 4 download button.
  - Scoping (account_manager, producer, client) → `reportsAuth('client')` from Phase 1 + `ensureClientAllowed` in Task 2 controller.
- **Placeholder scan:** none.
- **Type consistency:** service function names match across Tasks 1, 2, 3 and the consumer components. Payload shapes used in supertest stubs mirror what the frontend consumes.
- **Scope:** only Client. Phases 1 and 2 stay unchanged.
