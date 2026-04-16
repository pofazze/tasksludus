# Reports Phase 2 — Capacity (Capacidade) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Phase 2 of the Reports system — the Capacity (D) tab of `/relatorios` — with seven endpoints that surface real production time (from `em_producao_video` and `em_producao_design` phases), active workload, overdue tasks, phase distribution, a weekly heatmap and a time series of average hours worked.

**Architecture:** Extends the existing `reports.service` module with seven stateless functions, each backed by a Joi-validated endpoint under `/api/reports/capacity/*` and gated by the existing `reportsAuth('capacity')` middleware (producer callers are scoped to themselves; account_manager and client get 403). A new `CapacityTab` composes the widgets using the same `FilterBar` / `KpiCard` shell introduced in Phase 1. The weekly heatmap slices phase intervals across hour/day boundaries in Node so the view is Postgres-agnostic.

**Tech Stack:** Node.js / Express / Knex (Postgres) / Jest + supertest / React (Vite) / recharts / tailwind.

---

## File Structure

| File | Role |
|---|---|
| `server/src/modules/reports/reports.service.js` (MODIFY) | Add seven Capacity functions + shared helpers. |
| `server/src/modules/reports/reports.service.test.js` (MODIFY) | Add tests for every new function, including heatmap slicing and median. |
| `server/src/modules/reports/reports.controller.js` (MODIFY) | Add seven handlers that share the existing `querySchema`. |
| `server/src/modules/reports/reports.routes.js` (MODIFY) | Register the new `/capacity/*` routes behind `reportsAuth('capacity')`. |
| `server/src/modules/reports/reports.routes.test.js` (MODIFY) | Add supertest cases for the new endpoints. |
| `client/src/services/reports.js` (MODIFY) | Add seven axios wrappers. |
| `client/src/components/reports/ProducerCapacityTable.jsx` (NEW) | Ranking by hours worked. |
| `client/src/components/reports/TaskListCard.jsx` (NEW) | Collapsible task list with ClickUp links (shared: Active / Overdue). |
| `client/src/components/reports/charts/PhaseDistributionChart.jsx` (NEW) | recharts stacked bar. |
| `client/src/components/reports/charts/WorkTimeSeriesChart.jsx` (NEW) | recharts line with day/week/month/year toggle. |
| `client/src/components/reports/charts/WeeklyHeatmap.jsx` (NEW) | 7×24 grid with producer selector. |
| `client/src/components/reports/CapacityTab.jsx` (NEW, overwrites placeholder if present) | Composition. |
| `client/src/pages/ReportsPage.jsx` (MODIFY) | Wire `CapacityTab` into the Capacity tab (currently a "Em construção" placeholder). |

No migrations. No schema changes. No new dependencies — `recharts` is already installed for Phase 1.

---

## Context the engineer needs

- Spec: `docs/superpowers/specs/2026-04-16-production-metrics-reports-design.md` — the Fase 2 section lists every metric and the precise calculation rules.
- Production phases: `em_producao_video`, `em_producao_design`. These are the only phases that count as real work time (the spec is explicit). The older queue phases (`edicao_de_video`, `design`) do NOT count for Capacity hour sums — they are ignored.
- `delivery_phases` columns used: `user_id`, `phase`, `entered_at`, `exited_at`, `duration_seconds`, `delivery_id`, `clickup_task_id`.
- `deliveries` columns used: `id`, `due_date`, `status`, `clickup_task_id`, `title`.
- Role scoping is already in `reportsAuth('capacity')` (Phase 1 work). Producers get `req.query.producerId` forced to their id; account_manager and client get 403. Management passes through.
- The existing `querySchema` in `reports.controller.js` accepts `start`, `end`, `clientId?`, `producerId?`, `granularity?` with `.unknown(true)`. It stays unchanged — Capacity uses it as-is.
- Existing in-memory db mock in `reports.service.test.js` supports `.where`, `.whereIn`, `.whereBetween`, `.orderBy`, `.first`, and a `.then` that returns filtered arrays. Capacity tests extend its fixtures but should not change the mock's shape.
- `ReportsPage.jsx` currently renders `<p>Em construção (Fase 2).</p>` for the Capacity tab. Task 6 swaps that for `<CapacityTab filters={filters} />`.

---

### Task 1: Service — Capacity functions + tests

**Files:**
- Modify: `server/src/modules/reports/reports.service.js` (append the new functions + shared helpers).
- Modify: `server/src/modules/reports/reports.service.test.js` (append test suites).

This task adds seven functions, all stateless, each accepting `range = { start, end, producerId? }`:

- `activeTasks(range)` — currently open phases per producer.
- `avgPhaseDuration(range)` — average + median seconds per (producer, phase).
- `totalHours(range)` — sum of production_seconds per producer.
- `overdue(range)` — deliveries past due_date, not published, with the responsible producer.
- `phaseDistribution(range)` — count of open phases per (producer, phase).
- `weeklyHeatmap(range)` — 7×24 seconds grid for one producer or all.
- `avgWorkTimeseries(range)` — average seconds per bucket per producer.

- [ ] **Step 1: Add the test fixtures helpers at the top of `reports.service.test.js`**

Find the existing `beforeEach` block that resets the state and add a `heatmap`-friendly seeder above it. At the top, near `seedUser` / `seedPhase` / `seedApproval`, add:

```js
function seedClosedProductionPhase({ deliveryId, userId, phase, enteredAt, exitedAt }) {
  const duration = Math.round((new Date(exitedAt).getTime() - new Date(enteredAt).getTime()) / 1000);
  state.delivery_phases.push({
    delivery_id: deliveryId,
    user_id: userId,
    phase,
    entered_at: new Date(enteredAt),
    exited_at: new Date(exitedAt),
    duration_seconds: duration,
    clickup_task_id: null,
  });
}
```

- [ ] **Step 2: Write failing tests (one describe per function)**

Append the following test suites to the end of `reports.service.test.js`:

```js
describe('activeTasks', () => {
  test('returns open phases grouped by producer and phase', async () => {
    seedUser({ id: 'u1', name: 'João' });
    seedUser({ id: 'u2', name: 'Maria' });
    seedDelivery({ id: 'd1', clickup_task_id: 't1', title: 'Post A' });
    seedDelivery({ id: 'd2', clickup_task_id: 't2', title: 'Post B' });
    seedPhase({ delivery_id: 'd1', user_id: 'u1', phase: 'em_producao_design', entered_at: new Date('2026-04-15T10:00:00Z'), exited_at: null });
    seedPhase({ delivery_id: 'd2', user_id: 'u1', phase: 'em_producao_design', entered_at: new Date('2026-04-15T11:00:00Z'), exited_at: null });
    seedPhase({ delivery_id: 'd2', user_id: 'u2', phase: 'em_producao_video', entered_at: new Date('2026-04-15T12:00:00Z'), exited_at: null });
    const out = await reports.activeTasks(RANGE);
    const u1 = out.find((r) => r.producerId === 'u1' && r.phase === 'em_producao_design');
    const u2 = out.find((r) => r.producerId === 'u2' && r.phase === 'em_producao_video');
    expect(u1.count).toBe(2);
    expect(u1.tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Post A', clickupUrl: 'https://app.clickup.com/t/t1' }),
      expect.objectContaining({ title: 'Post B', clickupUrl: 'https://app.clickup.com/t/t2' }),
    ]));
    expect(u2.count).toBe(1);
  });
});

describe('avgPhaseDuration', () => {
  test('returns mean and median seconds per (producer, phase) with sample size', async () => {
    seedUser({ id: 'u1', name: 'João' });
    seedDelivery({ id: 'd1' });
    seedClosedProductionPhase({ deliveryId: 'd1', userId: 'u1', phase: 'em_producao_design', enteredAt: '2026-04-10T10:00:00Z', exitedAt: '2026-04-10T11:00:00Z' });  // 3600
    seedClosedProductionPhase({ deliveryId: 'd1', userId: 'u1', phase: 'em_producao_design', enteredAt: '2026-04-11T10:00:00Z', exitedAt: '2026-04-11T13:00:00Z' }); // 10800
    seedClosedProductionPhase({ deliveryId: 'd1', userId: 'u1', phase: 'em_producao_design', enteredAt: '2026-04-12T10:00:00Z', exitedAt: '2026-04-12T12:00:00Z' }); // 7200
    const out = await reports.avgPhaseDuration(RANGE);
    const row = out.find((r) => r.producerId === 'u1' && r.phase === 'em_producao_design');
    expect(row.sampleSize).toBe(3);
    expect(row.avgSeconds).toBe(7200);
    expect(row.medianSeconds).toBe(7200);
  });

  test('ignores phases that are still open', async () => {
    seedUser({ id: 'u1', name: 'João' });
    seedDelivery({ id: 'd1' });
    seedClosedProductionPhase({ deliveryId: 'd1', userId: 'u1', phase: 'em_producao_design', enteredAt: '2026-04-10T10:00:00Z', exitedAt: '2026-04-10T11:00:00Z' });
    seedPhase({ delivery_id: 'd1', user_id: 'u1', phase: 'em_producao_design', entered_at: new Date('2026-04-15T10:00:00Z'), exited_at: null });
    const out = await reports.avgPhaseDuration(RANGE);
    expect(out.find((r) => r.producerId === 'u1').sampleSize).toBe(1);
  });
});

describe('totalHours', () => {
  test('sums duration_seconds across em_producao_* phases only', async () => {
    seedUser({ id: 'u1', name: 'João' });
    seedDelivery({ id: 'd1' });
    seedClosedProductionPhase({ deliveryId: 'd1', userId: 'u1', phase: 'em_producao_design', enteredAt: '2026-04-10T10:00:00Z', exitedAt: '2026-04-10T11:00:00Z' });
    seedClosedProductionPhase({ deliveryId: 'd1', userId: 'u1', phase: 'em_producao_video', enteredAt: '2026-04-11T10:00:00Z', exitedAt: '2026-04-11T12:00:00Z' });
    // Queue phase — must be excluded
    seedClosedProductionPhase({ deliveryId: 'd1', userId: 'u1', phase: 'design', enteredAt: '2026-04-09T00:00:00Z', exitedAt: '2026-04-10T00:00:00Z' });
    const out = await reports.totalHours(RANGE);
    expect(out.find((r) => r.producerId === 'u1').productionSeconds).toBe(3600 + 7200);
  });
});

describe('overdue', () => {
  test('returns deliveries past due_date that are not published, grouped by responsible producer', async () => {
    const now = new Date('2026-04-16T00:00:00Z');
    seedUser({ id: 'u1', name: 'João' });
    seedDelivery({ id: 'd1', clickup_task_id: 't1', title: 'Post A', due_date: new Date('2026-04-10T00:00:00Z'), status: 'aprovacao' });
    seedDelivery({ id: 'd2', clickup_task_id: 't2', title: 'Post B', due_date: new Date('2026-04-08T00:00:00Z'), status: 'publicado' });  // excluded
    seedPhase({ delivery_id: 'd1', user_id: 'u1', phase: 'em_producao_design', entered_at: new Date('2026-04-09T10:00:00Z'), exited_at: null });
    const out = await reports.overdue({ ...RANGE, now });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ producerId: 'u1', count: 1 });
    expect(out[0].tasks[0]).toMatchObject({ title: 'Post A', clickupUrl: 'https://app.clickup.com/t/t1' });
  });
});

describe('phaseDistribution', () => {
  test('counts open phases per producer per phase', async () => {
    seedUser({ id: 'u1', name: 'João' });
    seedDelivery({ id: 'd1' });
    seedDelivery({ id: 'd2' });
    seedDelivery({ id: 'd3' });
    seedPhase({ delivery_id: 'd1', user_id: 'u1', phase: 'em_producao_design', entered_at: new Date('2026-04-15T10:00:00Z'), exited_at: null });
    seedPhase({ delivery_id: 'd2', user_id: 'u1', phase: 'em_producao_design', entered_at: new Date('2026-04-15T11:00:00Z'), exited_at: null });
    seedPhase({ delivery_id: 'd3', user_id: 'u1', phase: 'correcao', entered_at: new Date('2026-04-15T12:00:00Z'), exited_at: null });
    const out = await reports.phaseDistribution(RANGE);
    const emProd = out.find((r) => r.producerId === 'u1' && r.phase === 'em_producao_design');
    const correcao = out.find((r) => r.producerId === 'u1' && r.phase === 'correcao');
    expect(emProd.count).toBe(2);
    expect(correcao.count).toBe(1);
  });
});

describe('weeklyHeatmap', () => {
  test('attributes phase seconds to the buckets they span when crossing hour boundaries', async () => {
    seedUser({ id: 'u1', name: 'João' });
    seedDelivery({ id: 'd1' });
    // 2026-04-13 is a Monday (getUTCDay()=1). Phase from 10:30 to 12:45 → 30min in 10h + 60min in 11h + 45min in 12h.
    seedClosedProductionPhase({ deliveryId: 'd1', userId: 'u1', phase: 'em_producao_design', enteredAt: '2026-04-13T10:30:00Z', exitedAt: '2026-04-13T12:45:00Z' });
    const out = await reports.weeklyHeatmap({ ...RANGE, producerId: 'u1' });
    const h10 = out.find((r) => r.dayOfWeek === 1 && r.hour === 10);
    const h11 = out.find((r) => r.dayOfWeek === 1 && r.hour === 11);
    const h12 = out.find((r) => r.dayOfWeek === 1 && r.hour === 12);
    expect(h10.seconds).toBe(30 * 60);
    expect(h11.seconds).toBe(60 * 60);
    expect(h12.seconds).toBe(45 * 60);
  });
});

describe('avgWorkTimeseries', () => {
  test('averages production seconds per day bucket per producer', async () => {
    seedUser({ id: 'u1', name: 'João' });
    seedDelivery({ id: 'd1' });
    seedClosedProductionPhase({ deliveryId: 'd1', userId: 'u1', phase: 'em_producao_design', enteredAt: '2026-04-10T10:00:00Z', exitedAt: '2026-04-10T12:00:00Z' });  // 2h
    seedClosedProductionPhase({ deliveryId: 'd1', userId: 'u1', phase: 'em_producao_design', enteredAt: '2026-04-10T14:00:00Z', exitedAt: '2026-04-10T15:00:00Z' });  // 1h  (avg on day 10 = 1.5h)
    seedClosedProductionPhase({ deliveryId: 'd1', userId: 'u1', phase: 'em_producao_video', enteredAt: '2026-04-11T09:00:00Z', exitedAt: '2026-04-11T10:00:00Z' });  // 1h
    const out = await reports.avgWorkTimeseries({ ...RANGE, granularity: 'day' });
    const apr10 = out.find((r) => r.producerId === 'u1' && r.bucket === '2026-04-10');
    const apr11 = out.find((r) => r.producerId === 'u1' && r.bucket === '2026-04-11');
    expect(apr10.avgSeconds).toBe(Math.round((7200 + 3600) / 2));  // (2h + 1h) / 2 sessions = 5400
    expect(apr11.avgSeconds).toBe(3600);
  });
});
```

- [ ] **Step 3: Run the failing tests**

```bash
cd /home/dev/projetos/server && npx jest src/modules/reports/reports.service.test.js --testTimeout=10000 --forceExit 2>&1 | tail -30
```

Expected: 7 new describes fail — `reports.activeTasks is not a function` and friends.

- [ ] **Step 4: Implement the functions**

Open `server/src/modules/reports/reports.service.js`. Append the following block above `module.exports`:

```js
const PRODUCTION_ONLY = ['em_producao_video', 'em_producao_design'];
const CLICKUP_URL = (taskId) => `https://app.clickup.com/t/${taskId}`;

async function activeTasks(range) {
  const phases = await db('delivery_phases');
  const deliveries = await db('deliveries');
  const byDelivery = new Map(deliveries.map((d) => [d.id, d]));
  const open = phases.filter((p) => p.exited_at === null && p.user_id);
  const grouped = new Map();
  for (const p of open) {
    const key = `${p.user_id}|${p.phase}`;
    if (!grouped.has(key)) grouped.set(key, { producerId: p.user_id, phase: p.phase, tasks: [] });
    const d = byDelivery.get(p.delivery_id);
    grouped.get(key).tasks.push({
      title: d?.title || p.delivery_id,
      clickupUrl: (p.clickup_task_id || d?.clickup_task_id) ? CLICKUP_URL(p.clickup_task_id || d.clickup_task_id) : null,
    });
  }
  const results = [];
  for (const entry of grouped.values()) {
    const user = await loadUser(entry.producerId);
    results.push({
      producerId: entry.producerId,
      producerName: user.name,
      producerType: user.producer_type,
      phase: entry.phase,
      count: entry.tasks.length,
      tasks: entry.tasks,
    });
  }
  return range.producerId ? results.filter((r) => r.producerId === range.producerId) : results;
}

function median(nums) {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

async function avgPhaseDuration(range) {
  const phases = await db('delivery_phases');
  const startMs = new Date(range.start).getTime();
  const endMs = new Date(range.end).getTime();
  const closed = phases.filter((p) => {
    if (p.exited_at === null) return false;
    if (p.duration_seconds === null || p.duration_seconds === undefined) return false;
    const t = new Date(p.exited_at).getTime();
    return t >= startMs && t <= endMs;
  });
  const grouped = new Map();
  for (const p of closed) {
    const key = `${p.user_id}|${p.phase}`;
    if (!grouped.has(key)) grouped.set(key, { producerId: p.user_id, phase: p.phase, values: [] });
    grouped.get(key).values.push(p.duration_seconds);
  }
  const results = [];
  for (const entry of grouped.values()) {
    const user = await loadUser(entry.producerId);
    const sum = entry.values.reduce((acc, n) => acc + n, 0);
    results.push({
      producerId: entry.producerId,
      producerName: user.name,
      producerType: user.producer_type,
      phase: entry.phase,
      sampleSize: entry.values.length,
      avgSeconds: Math.round(sum / entry.values.length),
      medianSeconds: median(entry.values),
    });
  }
  return range.producerId ? results.filter((r) => r.producerId === range.producerId) : results;
}

async function totalHours(range) {
  const phases = await db('delivery_phases');
  const startMs = new Date(range.start).getTime();
  const endMs = new Date(range.end).getTime();
  const production = phases.filter((p) => {
    if (!PRODUCTION_ONLY.includes(p.phase)) return false;
    if (p.exited_at === null) return false;
    if (p.duration_seconds === null || p.duration_seconds === undefined) return false;
    const t = new Date(p.exited_at).getTime();
    return t >= startMs && t <= endMs;
  });
  const perUser = new Map();
  for (const p of production) {
    perUser.set(p.user_id, (perUser.get(p.user_id) || 0) + p.duration_seconds);
  }
  const results = [];
  for (const [userId, seconds] of perUser.entries()) {
    const user = await loadUser(userId);
    results.push({
      producerId: userId,
      producerName: user.name,
      producerType: user.producer_type,
      productionSeconds: seconds,
    });
  }
  results.sort((a, b) => b.productionSeconds - a.productionSeconds);
  return range.producerId ? results.filter((r) => r.producerId === range.producerId) : results;
}

async function overdue(range) {
  const now = range.now ? new Date(range.now) : new Date();
  const deliveries = await db('deliveries');
  const phases = await db('delivery_phases');
  const byDeliveryPhases = new Map();
  for (const p of phases) {
    if (!byDeliveryPhases.has(p.delivery_id)) byDeliveryPhases.set(p.delivery_id, []);
    byDeliveryPhases.get(p.delivery_id).push(p);
  }
  const perUser = new Map();
  for (const d of deliveries) {
    if (!d.due_date) continue;
    if (d.status === 'publicado') continue;
    if (new Date(d.due_date).getTime() >= now.getTime()) continue;
    const rows = (byDeliveryPhases.get(d.id) || []).slice().sort((a, b) => new Date(b.entered_at).getTime() - new Date(a.entered_at).getTime());
    const open = rows.find((p) => p.exited_at === null);
    const candidate = open || rows[0];
    if (!candidate || !candidate.user_id) continue;
    if (!perUser.has(candidate.user_id)) perUser.set(candidate.user_id, []);
    perUser.get(candidate.user_id).push({
      title: d.title || d.id,
      dueDate: d.due_date,
      phase: candidate.phase,
      clickupUrl: d.clickup_task_id ? CLICKUP_URL(d.clickup_task_id) : null,
    });
  }
  const results = [];
  for (const [userId, tasks] of perUser.entries()) {
    const user = await loadUser(userId);
    results.push({
      producerId: userId,
      producerName: user.name,
      producerType: user.producer_type,
      count: tasks.length,
      tasks,
    });
  }
  return range.producerId ? results.filter((r) => r.producerId === range.producerId) : results;
}

async function phaseDistribution(range) {
  const phases = await db('delivery_phases');
  const open = phases.filter((p) => p.exited_at === null && p.user_id);
  const counts = new Map();
  for (const p of open) {
    const key = `${p.user_id}|${p.phase}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const results = [];
  for (const [key, count] of counts.entries()) {
    const [producerId, phase] = key.split('|');
    results.push({ producerId, phase, count });
  }
  return range.producerId ? results.filter((r) => r.producerId === range.producerId) : results;
}

async function weeklyHeatmap(range) {
  const phases = await db('delivery_phases');
  const filter = phases.filter((p) => {
    if (!PRODUCTION_ONLY.includes(p.phase)) return false;
    if (p.exited_at === null) return false;
    if (range.producerId && p.user_id !== range.producerId) return false;
    return true;
  });
  const grid = new Map();
  for (const p of filter) {
    let cursor = new Date(p.entered_at).getTime();
    const endMs = new Date(p.exited_at).getTime();
    while (cursor < endMs) {
      const d = new Date(cursor);
      const hourStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours())).getTime();
      const hourEnd = hourStart + 60 * 60 * 1000;
      const sliceEnd = Math.min(endMs, hourEnd);
      const slice = Math.round((sliceEnd - cursor) / 1000);
      const key = `${d.getUTCDay()}|${d.getUTCHours()}`;
      grid.set(key, (grid.get(key) || 0) + slice);
      cursor = sliceEnd;
    }
  }
  const results = [];
  for (const [key, seconds] of grid.entries()) {
    const [dayOfWeek, hour] = key.split('|').map(Number);
    results.push({ dayOfWeek, hour, seconds });
  }
  return results;
}

async function avgWorkTimeseries(range) {
  const phases = await db('delivery_phases');
  const startMs = new Date(range.start).getTime();
  const endMs = new Date(range.end).getTime();
  const closed = phases.filter((p) => {
    if (!PRODUCTION_ONLY.includes(p.phase)) return false;
    if (p.exited_at === null) return false;
    if (p.duration_seconds === null || p.duration_seconds === undefined) return false;
    const t = new Date(p.exited_at).getTime();
    return t >= startMs && t <= endMs;
  });
  const byKey = new Map();
  for (const p of closed) {
    if (range.producerId && p.user_id !== range.producerId) continue;
    const bucket = bucketKey(p.exited_at, range.granularity || 'day');
    const key = `${p.user_id}|${bucket}`;
    if (!byKey.has(key)) byKey.set(key, { producerId: p.user_id, bucket, sum: 0, count: 0 });
    const entry = byKey.get(key);
    entry.sum += p.duration_seconds;
    entry.count += 1;
  }
  return [...byKey.values()].map(({ producerId, bucket, sum, count }) => ({
    producerId,
    bucket,
    avgSeconds: Math.round(sum / count),
  }));
}
```

Extend the `module.exports` at the bottom of the file to also export the new names:

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
  PRODUCTION_PHASES,
};
```

- [ ] **Step 5: Run the tests**

```bash
cd /home/dev/projetos/server && npx jest src/modules/reports/reports.service.test.js --testTimeout=10000 --forceExit 2>&1 | tail -20
```

Expected: all tests pass (8 Phase 1 tests + 7 new Capacity tests = 15 total, plus the two `avgPhaseDuration` subcases = 16).

- [ ] **Step 6: Run the full suite**

```bash
cd /home/dev/projetos/server && npx jest --silent --forceExit --testTimeout=10000 2>&1 | tail -10
```

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add server/src/modules/reports/reports.service.js server/src/modules/reports/reports.service.test.js
git -c safe.directory=/home/dev/projetos commit -m "feat(reports): capacity metrics service

Seven pure functions compute per-producer Capacity metrics:
activeTasks (open phases with ClickUp links), avgPhaseDuration
(mean + median + sample size per phase), totalHours (sum of
em_producao_* durations only), overdue (deliveries past due_date
with the responsible producer resolved from the latest phase),
phaseDistribution (open phases per producer), weeklyHeatmap
(7x24 seconds grid with phase slicing across hour boundaries),
avgWorkTimeseries (avg seconds per bucket, day/week/month/year).
Covered by 7 new tests."
```

---

### Task 2: Reports API — controller handlers + routes + integration tests

**Files:**
- Modify: `server/src/modules/reports/reports.controller.js` — add seven handlers.
- Modify: `server/src/modules/reports/reports.routes.js` — register `/capacity/*` routes.
- Modify: `server/src/modules/reports/reports.routes.test.js` — add supertest cases.

- [ ] **Step 1: Add the controller handlers**

Open `server/src/modules/reports/reports.controller.js`. Append the following handlers above `module.exports`:

```js
async function activeTasks(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const out = await service.activeTasks(v);
    res.json(filterByProducer(out, v.producerId));
  } catch (err) { next(err); }
}

async function avgPhaseDuration(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const out = await service.avgPhaseDuration(v);
    res.json(filterByProducer(out, v.producerId));
  } catch (err) { next(err); }
}

async function totalHours(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const out = await service.totalHours(v);
    res.json(filterByProducer(out, v.producerId));
  } catch (err) { next(err); }
}

async function overdue(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const out = await service.overdue(v);
    res.json(filterByProducer(out, v.producerId));
  } catch (err) { next(err); }
}

async function phaseDistribution(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const out = await service.phaseDistribution(v);
    res.json(filterByProducer(out, v.producerId));
  } catch (err) { next(err); }
}

async function weeklyHeatmap(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const out = await service.weeklyHeatmap(v);
    res.json(out);
  } catch (err) { next(err); }
}

async function avgWorkTimeseries(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const out = await service.avgWorkTimeseries(v);
    res.json(v.producerId ? out.filter((r) => r.producerId === v.producerId) : out);
  } catch (err) { next(err); }
}
```

Extend `module.exports` at the bottom:

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
};
```

- [ ] **Step 2: Register the routes**

Open `server/src/modules/reports/reports.routes.js`. Below the existing `/quality/*` routes, add:

```js
const capacityGuard = reportsAuth('capacity');
router.get('/capacity/active-tasks', capacityGuard, controller.activeTasks);
router.get('/capacity/avg-phase-duration', capacityGuard, controller.avgPhaseDuration);
router.get('/capacity/total-hours', capacityGuard, controller.totalHours);
router.get('/capacity/overdue', capacityGuard, controller.overdue);
router.get('/capacity/phase-distribution', capacityGuard, controller.phaseDistribution);
router.get('/capacity/weekly-heatmap', capacityGuard, controller.weeklyHeatmap);
router.get('/capacity/avg-work-timeseries', capacityGuard, controller.avgWorkTimeseries);
```

- [ ] **Step 3: Extend the service mock in the integration test**

Open `server/src/modules/reports/reports.routes.test.js`. Find the `jest.mock('./reports.service', ...)` factory and add the seven new methods to it:

```js
jest.mock('./reports.service', () => ({
  firstApprovalRate: jest.fn().mockResolvedValue([{ producerId: 'p1', producerName: 'x', rate: 0.5, total: 2, firstApproved: 1 }]),
  rejectionRate: jest.fn().mockResolvedValue([]),
  reworkPerTask: jest.fn().mockResolvedValue([]),
  rejectionByCategory: jest.fn().mockResolvedValue([]),
  rejectionByPostType: jest.fn().mockResolvedValue([]),
  rejectionByTarget: jest.fn().mockResolvedValue([]),
  ranking: jest.fn().mockResolvedValue([{ producerId: 'p1', volume: 2, firstApprovalRate: 0.5, score: 1 }]),
  volumeTimeseries: jest.fn().mockResolvedValue([]),
  activeTasks: jest.fn().mockResolvedValue([{ producerId: 'p1', producerName: 'x', phase: 'em_producao_design', count: 2, tasks: [] }]),
  avgPhaseDuration: jest.fn().mockResolvedValue([{ producerId: 'p1', phase: 'em_producao_design', avgSeconds: 3600, medianSeconds: 3600, sampleSize: 4 }]),
  totalHours: jest.fn().mockResolvedValue([{ producerId: 'p1', productionSeconds: 7200 }]),
  overdue: jest.fn().mockResolvedValue([{ producerId: 'p1', count: 1, tasks: [] }]),
  phaseDistribution: jest.fn().mockResolvedValue([{ producerId: 'p1', phase: 'em_producao_design', count: 3 }]),
  weeklyHeatmap: jest.fn().mockResolvedValue([{ dayOfWeek: 1, hour: 10, seconds: 1800 }]),
  avgWorkTimeseries: jest.fn().mockResolvedValue([{ producerId: 'p1', bucket: '2026-04-10', avgSeconds: 5400 }]),
}));
```

- [ ] **Step 4: Add supertest cases**

Append to `server/src/modules/reports/reports.routes.test.js`:

```js
describe('GET /api/reports/capacity — happy paths', () => {
  beforeEach(() => { userForRequest.role = 'manager'; userForRequest.id = 'u1'; });

  test('active-tasks returns 200', async () => {
    const res = await request(buildApp())
      .get('/api/reports/capacity/active-tasks')
      .query({ start: '2026-04-01', end: '2026-04-30' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('total-hours returns 200 with productionSeconds', async () => {
    const res = await request(buildApp())
      .get('/api/reports/capacity/total-hours')
      .query({ start: '2026-04-01', end: '2026-04-30' });
    expect(res.status).toBe(200);
    expect(res.body[0].productionSeconds).toBe(7200);
  });

  test('weekly-heatmap returns 200 with the grid', async () => {
    const res = await request(buildApp())
      .get('/api/reports/capacity/weekly-heatmap')
      .query({ start: '2026-04-01', end: '2026-04-30' });
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ dayOfWeek: 1, hour: 10, seconds: 1800 });
  });
});

describe('GET /api/reports/capacity — scoping', () => {
  test('producer gets producerId rewritten and row filtered', async () => {
    userForRequest.role = 'producer';
    userForRequest.id = 'p1';
    const res = await request(buildApp())
      .get('/api/reports/capacity/total-hours')
      .query({ start: '2026-04-01', end: '2026-04-30', producerId: 'otherUser' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].producerId).toBe('p1');
  });

  test('account_manager gets 403 on capacity', async () => {
    userForRequest.role = 'account_manager';
    const res = await request(buildApp())
      .get('/api/reports/capacity/total-hours')
      .query({ start: '2026-04-01', end: '2026-04-30' });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 5: Run the reports suite**

```bash
cd /home/dev/projetos/server && npx jest src/modules/reports --testTimeout=10000 --forceExit 2>&1 | tail -15
```

Expected: green. Total reports tests: 10 auth + 15 service + (6 quality routes + 5 capacity routes) = 36.

- [ ] **Step 6: Full suite**

```bash
cd /home/dev/projetos/server && npx jest --silent --forceExit --testTimeout=10000 2>&1 | tail -10
```

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add server/src/modules/reports/reports.controller.js server/src/modules/reports/reports.routes.js server/src/modules/reports/reports.routes.test.js
git -c safe.directory=/home/dev/projetos commit -m "feat(reports): HTTP endpoints for Capacity metrics

Seven endpoints under /api/reports/capacity/* validate queries
with the same Joi schema, delegate to the matching service
function, and respect reportsAuth('capacity') scoping. producer
callers get their row filtered; account_manager and client get
403. Supertest covers happy paths, producer scoping and the 403
path."
```

---

### Task 3: Frontend — service wrappers for Capacity

**Files:**
- Modify: `client/src/services/reports.js`

- [ ] **Step 1: Append seven methods to `reportsApi`**

Open `client/src/services/reports.js`. Inside the `reportsApi` object (before the closing `};`), add:

```js
  activeTasks: (params) => api.get('/reports/capacity/active-tasks', { params: qs(params) }).then((r) => r.data),
  avgPhaseDuration: (params) => api.get('/reports/capacity/avg-phase-duration', { params: qs(params) }).then((r) => r.data),
  totalHours: (params) => api.get('/reports/capacity/total-hours', { params: qs(params) }).then((r) => r.data),
  overdue: (params) => api.get('/reports/capacity/overdue', { params: qs(params) }).then((r) => r.data),
  phaseDistribution: (params) => api.get('/reports/capacity/phase-distribution', { params: qs(params) }).then((r) => r.data),
  weeklyHeatmap: (params) => api.get('/reports/capacity/weekly-heatmap', { params: qs(params) }).then((r) => r.data),
  avgWorkTimeseries: (params) => api.get('/reports/capacity/avg-work-timeseries', { params: qs(params) }).then((r) => r.data),
```

- [ ] **Step 2: Smoke-test the build**

```bash
cd /home/dev/projetos/client && npm run build
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add client/src/services/reports.js
git -c safe.directory=/home/dev/projetos commit -m "feat(reports-ui): axios wrappers for Capacity endpoints"
```

---

### Task 4: Frontend — `ProducerCapacityTable` + `TaskListCard`

**Files:**
- Create: `client/src/components/reports/ProducerCapacityTable.jsx`
- Create: `client/src/components/reports/TaskListCard.jsx`

- [ ] **Step 1: Create the capacity ranking table**

Create `client/src/components/reports/ProducerCapacityTable.jsx`:

```jsx
const PRODUCER_TYPE_LABELS = {
  designer: 'Designer',
  video_editor: 'Editor de Vídeo',
  captation: 'Captação',
  social_media: 'Social Media',
};

function fmtHours(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function ProducerCapacityTable({ hours, active, overdue }) {
  if (!hours || hours.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem dados no período.</p>;
  }

  const activeByUser = new Map();
  for (const row of (active || [])) {
    activeByUser.set(row.producerId, (activeByUser.get(row.producerId) || 0) + (row.count || 0));
  }
  const overdueByUser = new Map((overdue || []).map((r) => [r.producerId, r.count]));

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left p-3">#</th>
            <th className="text-left p-3">Produtor</th>
            <th className="text-left p-3">Função</th>
            <th className="text-right p-3">Horas produzidas</th>
            <th className="text-right p-3">Ativas agora</th>
            <th className="text-right p-3">Em atraso</th>
          </tr>
        </thead>
        <tbody>
          {hours.map((r, i) => (
            <tr key={r.producerId} className="border-t border-border">
              <td className="p-3">{i + 1}</td>
              <td className="p-3 font-medium">{r.producerName}</td>
              <td className="p-3 text-muted-foreground">{PRODUCER_TYPE_LABELS[r.producerType] || '—'}</td>
              <td className="p-3 text-right">{fmtHours(r.productionSeconds)}</td>
              <td className="p-3 text-right">{activeByUser.get(r.producerId) || 0}</td>
              <td className="p-3 text-right">{overdueByUser.get(r.producerId) || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Create the task list card**

Create `client/src/components/reports/TaskListCard.jsx`:

```jsx
import { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';

export default function TaskListCard({ title, rows }) {
  const [open, setOpen] = useState(false);
  const totalTasks = (rows || []).reduce((sum, r) => sum + (r.count || 0), 0);

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 text-left"
      >
        <span className="font-medium text-foreground">{title}</span>
        <span className="flex items-center gap-2 text-muted-foreground text-sm">
          <span>{totalTasks} task{totalTasks !== 1 ? 's' : ''}</span>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>
      {open && (
        <div className="border-t border-border p-3 space-y-3">
          {(rows || []).length === 0 && <p className="text-sm text-muted-foreground">Nada aqui.</p>}
          {(rows || []).map((r) => (
            <div key={r.producerId} className="space-y-1">
              <p className="text-sm font-medium text-foreground">{r.producerName} · {r.count}</p>
              <ul className="space-y-1">
                {(r.tasks || []).map((t, idx) => (
                  <li key={idx} className="text-xs text-muted-foreground flex items-center gap-2">
                    <span className="flex-1 truncate">{t.title}</span>
                    {t.clickupUrl && (
                      <a href={t.clickupUrl} target="_blank" rel="noreferrer" className="text-purple-400 hover:underline inline-flex items-center gap-1">
                        <ExternalLink size={12} /> ClickUp
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Build smoke**

```bash
cd /home/dev/projetos/client && npm run build
```

Expected: success.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/reports/ProducerCapacityTable.jsx client/src/components/reports/TaskListCard.jsx
git -c safe.directory=/home/dev/projetos commit -m "feat(reports-ui): ProducerCapacityTable and TaskListCard"
```

---

### Task 5: Frontend — charts (`PhaseDistributionChart`, `WorkTimeSeriesChart`, `WeeklyHeatmap`)

**Files:**
- Create: `client/src/components/reports/charts/PhaseDistributionChart.jsx`
- Create: `client/src/components/reports/charts/WorkTimeSeriesChart.jsx`
- Create: `client/src/components/reports/charts/WeeklyHeatmap.jsx`

- [ ] **Step 1: Create the stacked bar**

Create `client/src/components/reports/charts/PhaseDistributionChart.jsx`:

```jsx
import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const PHASE_COLORS = {
  em_producao_design: '#A855F7',
  em_producao_video: '#6366F1',
  correcao: '#EF4444',
  aprovacao: '#EC4899',
  agendamento: '#F59E0B',
  design: '#3B82F6',
  edicao_de_video: '#8B5CF6',
  captacao: '#06B6D4',
  estruturacao: '#EAB308',
  planejamento: '#64748B',
};

const PHASE_LABELS = {
  em_producao_design: 'Em Produção - Design',
  em_producao_video: 'Em Produção - Vídeo',
  correcao: 'Correção',
  aprovacao: 'Aprovação',
  agendamento: 'Agendamento',
  design: 'Design',
  edicao_de_video: 'Edição de Vídeo',
  captacao: 'Captação',
  estruturacao: 'Estruturação',
  planejamento: 'Planejamento',
};

export default function PhaseDistributionChart({ data, producerNameMap }) {
  const [rows, phases] = useMemo(() => {
    const byProducer = new Map();
    const phaseSet = new Set();
    for (const r of data || []) {
      phaseSet.add(r.phase);
      if (!byProducer.has(r.producerId)) {
        byProducer.set(r.producerId, { producerId: r.producerId, producerName: producerNameMap?.get(r.producerId) || r.producerId });
      }
      byProducer.get(r.producerId)[r.phase] = r.count;
    }
    return [[...byProducer.values()], [...phaseSet]];
  }, [data, producerNameMap]);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-medium text-foreground mb-3">Distribuição de fases</h3>
        <p className="text-sm text-muted-foreground py-8 text-center">Sem dados no período.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-medium text-foreground mb-3">Distribuição de fases</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="producerName" fontSize={11} />
          <YAxis fontSize={11} />
          <Tooltip />
          <Legend formatter={(value) => PHASE_LABELS[value] || value} />
          {phases.map((p) => (
            <Bar key={p} dataKey={p} stackId="a" fill={PHASE_COLORS[p] || '#9CA3AF'} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Create the work-hours line chart**

Create `client/src/components/reports/charts/WorkTimeSeriesChart.jsx`:

```jsx
import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#9A48EA', '#3B82F6', '#F59E0B', '#10B981', '#EF4444', '#06B6D4', '#8B5CF6'];

function secondsToHours(s) { return Math.round((s / 3600) * 10) / 10; }

export default function WorkTimeSeriesChart({ data, granularity, onGranularityChange, producerNameMap }) {
  const [buckets, producerIds] = useMemo(() => {
    const bucketSet = new Set();
    const idSet = new Set();
    for (const r of data || []) {
      bucketSet.add(r.bucket);
      idSet.add(r.producerId);
    }
    return [[...bucketSet].sort(), [...idSet]];
  }, [data]);

  const series = useMemo(() => buckets.map((bucket) => {
    const row = { bucket };
    for (const pid of producerIds) {
      const match = (data || []).find((r) => r.bucket === bucket && r.producerId === pid);
      row[pid] = match ? secondsToHours(match.avgSeconds) : 0;
    }
    return row;
  }), [buckets, producerIds, data]);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-foreground">Tempo médio trabalhado</h3>
        <select
          value={granularity}
          onChange={(e) => onGranularityChange(e.target.value)}
          className="px-2 py-1 rounded border border-border bg-background text-xs"
        >
          <option value="day">Dia</option>
          <option value="week">Semana</option>
          <option value="month">Mês</option>
          <option value="year">Ano</option>
        </select>
      </div>
      {series.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Sem dados no período.</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={series}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="bucket" fontSize={11} />
            <YAxis fontSize={11} unit="h" />
            <Tooltip formatter={(v) => `${v}h`} />
            <Legend formatter={(value) => producerNameMap?.get(value) || value} />
            {producerIds.map((pid, i) => (
              <Line key={pid} type="monotone" dataKey={pid} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create the 7×24 heatmap**

Create `client/src/components/reports/charts/WeeklyHeatmap.jsx`:

```jsx
import { useMemo } from 'react';

const DOW_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function shade(seconds, maxSeconds) {
  if (!seconds) return 'bg-muted';
  const ratio = Math.min(1, seconds / (maxSeconds || 1));
  if (ratio > 0.8) return 'bg-purple-500';
  if (ratio > 0.6) return 'bg-purple-400';
  if (ratio > 0.4) return 'bg-purple-300';
  if (ratio > 0.2) return 'bg-purple-200';
  return 'bg-purple-100';
}

export default function WeeklyHeatmap({ data, title }) {
  const [grid, maxSeconds] = useMemo(() => {
    const g = new Map();
    let max = 0;
    for (const r of data || []) {
      const key = `${r.dayOfWeek}|${r.hour}`;
      g.set(key, r.seconds);
      if (r.seconds > max) max = r.seconds;
    }
    return [g, max];
  }, [data]);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-medium text-foreground mb-3">{title || 'Heatmap semanal (tempo de produção)'}</h3>
      <div className="overflow-x-auto">
        <div className="inline-flex flex-col gap-[2px]">
          <div className="flex gap-[2px] pl-10">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="w-5 text-[10px] text-muted-foreground text-center">{h}</div>
            ))}
          </div>
          {Array.from({ length: 7 }, (_, dow) => (
            <div key={dow} className="flex gap-[2px] items-center">
              <div className="w-8 text-[10px] text-muted-foreground">{DOW_LABELS[dow]}</div>
              {Array.from({ length: 24 }, (_, h) => {
                const seconds = grid.get(`${dow}|${h}`) || 0;
                return (
                  <div
                    key={h}
                    className={`w-5 h-5 rounded ${shade(seconds, maxSeconds)}`}
                    title={`${DOW_LABELS[dow]} ${h}h — ${Math.round(seconds / 60)} min`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Build smoke**

```bash
cd /home/dev/projetos/client && npm run build
```

Expected: success.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/reports/charts/PhaseDistributionChart.jsx client/src/components/reports/charts/WorkTimeSeriesChart.jsx client/src/components/reports/charts/WeeklyHeatmap.jsx
git -c safe.directory=/home/dev/projetos commit -m "feat(reports-ui): capacity charts (phase distribution, work line, 7x24 heatmap)"
```

---

### Task 6: Frontend — `CapacityTab` composition + wire into `ReportsPage`

**Files:**
- Create: `client/src/components/reports/CapacityTab.jsx`
- Modify: `client/src/pages/ReportsPage.jsx`

- [ ] **Step 1: Create `CapacityTab`**

Create `client/src/components/reports/CapacityTab.jsx`:

```jsx
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { reportsApi } from '@/services/reports';
import KpiCard from './KpiCard';
import ProducerCapacityTable from './ProducerCapacityTable';
import TaskListCard from './TaskListCard';
import PhaseDistributionChart from './charts/PhaseDistributionChart';
import WorkTimeSeriesChart from './charts/WorkTimeSeriesChart';
import WeeklyHeatmap from './charts/WeeklyHeatmap';

function fmtHours(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function CapacityTab({ filters }) {
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState([]);
  const [active, setActive] = useState([]);
  const [overdueRows, setOverdueRows] = useState([]);
  const [distribution, setDistribution] = useState([]);
  const [timeseries, setTimeseries] = useState([]);
  const [heatmap, setHeatmap] = useState([]);
  const [granularity, setGranularity] = useState('day');
  const [heatmapProducerId, setHeatmapProducerId] = useState('');

  useEffect(() => {
    if (!filters.start || !filters.end) return;
    setLoading(true);
    const params = { start: filters.start, end: filters.end, clientId: filters.clientId, producerId: filters.producerId };
    Promise.all([
      reportsApi.totalHours(params),
      reportsApi.activeTasks(params),
      reportsApi.overdue(params),
      reportsApi.phaseDistribution(params),
      reportsApi.avgWorkTimeseries({ ...params, granularity }),
      reportsApi.weeklyHeatmap({ ...params, producerId: heatmapProducerId || params.producerId }),
    ]).then(([h, a, o, d, ts, hm]) => {
      setHours(h); setActive(a); setOverdueRows(o); setDistribution(d); setTimeseries(ts); setHeatmap(hm);
    }).catch(() => {
      toast.error('Erro ao carregar relatórios de capacidade');
    }).finally(() => setLoading(false));
  }, [filters.start, filters.end, filters.clientId, filters.producerId, granularity, heatmapProducerId]);

  const producerNameMap = useMemo(() => {
    const m = new Map();
    for (const r of hours) m.set(r.producerId, r.producerName);
    return m;
  }, [hours]);

  const totalSeconds = hours.reduce((sum, r) => sum + (r.productionSeconds || 0), 0);
  const activeCount = active.reduce((sum, r) => sum + (r.count || 0), 0);
  const overdueCount = overdueRows.reduce((sum, r) => sum + (r.count || 0), 0);
  const days = filters.start && filters.end
    ? Math.max(1, Math.ceil((new Date(filters.end).getTime() - new Date(filters.start).getTime()) / (24 * 60 * 60 * 1000)))
    : 1;
  const avgSecondsPerDay = Math.round(totalSeconds / days);

  if (loading) return <p className="text-sm text-muted-foreground py-12 text-center">Carregando…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <KpiCard label="Total de horas (período)" value={fmtHours(totalSeconds)} />
        <KpiCard label="Tarefas ativas" value={activeCount} />
        <KpiCard label="Em atraso" value={overdueCount} />
        <KpiCard label="Horas/dia (média)" value={fmtHours(avgSecondsPerDay)} />
      </div>

      <ProducerCapacityTable hours={hours} active={active} overdue={overdueRows} />

      <PhaseDistributionChart data={distribution} producerNameMap={producerNameMap} />

      <WorkTimeSeriesChart
        data={timeseries}
        granularity={granularity}
        onGranularityChange={setGranularity}
        producerNameMap={producerNameMap}
      />

      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground">Heatmap do produtor:</label>
        <select
          value={heatmapProducerId}
          onChange={(e) => setHeatmapProducerId(e.target.value)}
          className="px-2 py-1 rounded border border-border bg-background text-xs"
        >
          <option value="">Todos</option>
          {hours.map((r) => <option key={r.producerId} value={r.producerId}>{r.producerName}</option>)}
        </select>
      </div>

      <WeeklyHeatmap data={heatmap} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TaskListCard title="Ativas agora" rows={active} />
        <TaskListCard title="Em atraso" rows={overdueRows} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `ReportsPage`**

Open `client/src/pages/ReportsPage.jsx`. At the top, add the import:

```jsx
import CapacityTab from '@/components/reports/CapacityTab';
```

Find the line that renders the placeholder:

```jsx
{activeTab === 'capacity' && <p className="text-muted-foreground text-sm py-12 text-center">Em construção (Fase 2).</p>}
```

Replace with:

```jsx
{activeTab === 'capacity' && <CapacityTab filters={filters} />}
```

- [ ] **Step 3: Build smoke**

```bash
cd /home/dev/projetos/client && npm run build
```

Expected: success.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/reports/CapacityTab.jsx client/src/pages/ReportsPage.jsx
git -c safe.directory=/home/dev/projetos commit -m "feat(reports-ui): CapacityTab — hours, ranking, phase distribution, timeseries, heatmap, task lists"
```

---

### Task 7: Manual verification in production

**Files:** none (manual gate).

- [ ] **Step 1: Push and wait for deploy**

```bash
git push origin master
```

Wait for Railway to finish deploying `server` and `client`.

- [ ] **Step 2: Open `/relatorios` → aba "Capacidade"**

Confirm all sections render with real data:
- KPI row shows total hours, active count, overdue count, avg hours/day.
- Ranking table sorts by hours produced.
- Phase distribution chart shows stacked bars per producer.
- Timeseries toggles dia/semana/mês/ano.
- Heatmap selector switches producer.
- Task lists expand with ClickUp links.

- [ ] **Step 3: Producer role check**

Log in as a producer user. Capacity tab should show only their own row + their own heatmap + their own tasks.

- [ ] **Step 4: account_manager 403 check**

Log in as an account_manager. Open `/relatorios` → aba Capacidade. Confirm all the `/api/reports/capacity/*` requests return 403 in the Network tab (the UI may show error toasts — acceptable for this phase).

No commit — gate before closing the phase.

---

## Self-Review (done)

- **Spec coverage (Fase 2 items in `docs/superpowers/specs/2026-04-16-production-metrics-reports-design.md`):**
  - `activeTasks` → Task 1, Task 2 endpoint, rendered in `ProducerCapacityTable` + `TaskListCard` (Tasks 4 + 6).
  - `avgPhaseDuration` → Task 1, Task 2. Not yet visualized in the UI (the spec shows a stacked bar for phase distribution, not an avg-duration bar); the endpoint stays available for future admin views.
  - `totalHours` → Task 1, Task 2, powers KPI + ranking (Tasks 4 + 6).
  - `overdue` → Task 1, Task 2, `TaskListCard` (Tasks 4 + 6).
  - `phaseDistribution` → Task 1, Task 2, chart (Task 5 + 6).
  - `weeklyHeatmap` → Task 1 (slicing logic), Task 2, heatmap (Tasks 5 + 6).
  - `avgWorkTimeseries` → Task 1, Task 2, line chart (Tasks 5 + 6).
  - Scoping per role → reused from Phase 1 (`reportsAuth('capacity')`); supertest confirms 403 in Task 2.
- **Placeholder scan:** no "TBD", no "similar to", every step contains the code to paste.
- **Type consistency:** function names match between service (Task 1), controller (Task 2), `reportsApi` (Task 3), and consumer components (Tasks 4-6). Payload shapes in the test mocks (Task 2) match the shapes the components read (Tasks 4-6).
- **Scope:** only Capacity. Client (Fase 3) stays a placeholder and is covered by a separate plan.
