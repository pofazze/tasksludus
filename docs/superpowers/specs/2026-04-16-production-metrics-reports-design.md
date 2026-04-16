# Production Metrics & Reports — Design

**Date:** 2026-04-16
**Goal:** Build an internal "Relatórios" page with three focused views — Quality, Capacity, Client — that turn raw `delivery_phases`, `approval_items`, and `deliveries` into actionable metrics. Historical responsibility (not current assignee) drives every count, using the recently renamed `em_producao_*` phases as the source of truth for real production time.

---

## Problem

The existing ranking only counts `deliveries.user_id` (original creator) and publishes one leaderboard. Managers cannot see who actually produced what, where rework is concentrated, how fast a client's pipeline runs, or who is overloaded. There is no per-client view of what shipped, no category of rejection, and no way to show account management the responsibility history.

## Goal

Three reports, rolled out in order of priority:

1. **Quality (C)** — per-producer rejection rate, first-approval rate, rework, rejection categories, comparisons across producers, volume trends.
2. **Capacity (D)** — real production time (from `em_producao_*` phases), active task load, overdue tasks, phase distribution, weekly heatmap, time trend.
3. **Client (E)** — what shipped per client per period, platform/type breakdowns, first-approval health, rejection volume, cycle time, responsibility history, CSV export.

Out of scope: performance/bonus calculation overhaul (that depends on these measurements being accurate first), external analytics (engagement, reach), client-facing portal access.

---

## Data Model Delta

### `approval_items.rejection_category` — new column

```sql
ALTER TABLE approval_items
  ADD COLUMN rejection_category varchar(30);  -- nullable
```

Application-level enum (no CHECK constraint — validation lives in Joi):

```
capa | edicao | audio_musica | texto | tom_voz | tecnico | outro
```

The public approval modal gains a required dropdown above the reason textarea; the reason text remains free-form for detail.

### No other schema changes

Every other metric is derivable from existing tables:

- `delivery_phases (user_id, phase, entered_at, exited_at, duration_seconds)`
- `approval_items (status, rejection_reason, rejection_category, rejection_target, responded_at)`
- `deliveries (status, content_type, client_id, started_at, completed_at, due_date)`
- `scheduled_posts (platform, status, ig_permalink, tiktok_permalink, published_at)`
- `users (role, producer_type, clickup_id, whatsapp)`
- `clients (name, category, account_manager_id)`

### Indexes to consider

If query latency shows up in practice, add:
- `CREATE INDEX delivery_phases_user_phase_entered_idx ON delivery_phases (user_id, phase, entered_at)`
- `CREATE INDEX approval_items_category_idx ON approval_items (rejection_category)`
- `CREATE INDEX deliveries_client_completed_idx ON deliveries (client_id, completed_at)`

Do not add up front — benchmark first.

---

## Architecture

### Backend module layout

```
server/src/modules/reports/
  reports.service.js      — stateless query functions
  reports.controller.js   — thin handlers + query-param validation
  reports.routes.js       — three groups, each gated by scoping middleware
  reports.auth.js         — `reportsAuth({ feature, scope })` helper
```

### API surface

Pattern: `GET /api/reports/<feature>/<metric>?start=&end=&clientId=&producerId=&granularity=`

Features: `quality`, `capacity`, `client`. Each metric is its own endpoint — simple to cache and test.

### Scoping rules

| Role | Quality | Capacity | Client |
|---|---|---|---|
| ceo / director / manager | all producers, all clients | all producers, all clients | all clients |
| producer | forced `producerId = req.user.id` | forced `producerId = req.user.id` | 403 |
| account_manager | 403 | 403 | only clients where `clients.account_manager_id = req.user.id` |
| client | 403 | 403 | 403 |

Enforced by `reportsAuth(feature)` middleware that either rewrites `req.query.producerId` / validates `req.params.clientId` or returns 403.

### Frontend

```
client/src/pages/ReportsPage.jsx           — shell + filter bar + tab switcher
client/src/components/reports/
  QualityTab.jsx                           — Fase 1
  CapacityTab.jsx                          — Fase 2
  ClientTab.jsx                            — Fase 3
  FilterBar.jsx                            — shared period/client/producer filter
  KpiCard.jsx                              — shared card (number + label + delta)
  ProducerRankingTable.jsx                 — shared
  ClientSelector.jsx                       — shared
  charts/VolumeTimeSeriesChart.jsx
  charts/RejectionBreakdownChart.jsx
  charts/PhaseDistributionChart.jsx
  charts/WorkTimeSeriesChart.jsx
  charts/WeeklyHeatmap.jsx
  charts/PlatformDonut.jsx
  tables/PublishedPostsTable.jsx
  tables/ResponsibilityTable.jsx
  tables/TaskListCard.jsx
```

Chart library: `recharts` (add to `client/package.json` if not already present).

Navigation: new item "Relatórios" (icon `BarChart3` from lucide) in the existing sidebar, visible only to roles with access to at least one tab.

---

## Phased Rollout

Each phase ships independently and adds value on its own.

### Fase 1 — Quality (C)

**Prerequisites delivered in this phase:**
- Migration for `rejection_category`.
- Joi validation + client modal dropdown.
- `reportsAuth` middleware.
- `reports.service.js` scaffolding with the eight quality methods.
- `ReportsPage` shell, `FilterBar`, menu entry, Quality tab wired.

**Endpoints:**

| Metric | Endpoint | Response shape (simplified) |
|---|---|---|
| First-approval rate | `GET /quality/first-approval-rate` | `[{ producerId, producerName, total, firstApproved, rate }]` |
| Rejection rate | `GET /quality/rejection-rate` | `[{ producerId, producerName, total, rejected, rate }]` |
| Rework per task | `GET /quality/rework-per-task` | `[{ producerId, producerName, avgRework }]` |
| Rejection by category | `GET /quality/rejection-by-category` | `[{ category, count }]` + optional `?producerId` |
| Rejection by post_type | `GET /quality/rejection-by-post-type` | `[{ postType, total, rejected, rate }]` |
| Rejection by target | `GET /quality/rejection-by-target` | `[{ target, count }]` (cover / video) |
| Ranking | `GET /quality/ranking` | `[{ producerId, producerName, producerType, score, volume, firstApprovalRate }]` |
| Volume timeseries | `GET /quality/volume-timeseries?granularity=day|week|month|year` | `[{ bucket, producerId, count }]` |

**Calculation rules — precise definitions:**

- **"Producer touched a task"** — `delivery_phases` row where `user_id = X` AND `phase IN ('em_producao_video','em_producao_design','edicao_de_video','design')`. The `em_producao_*` phases are preferred (most recent / most specific); the queue phases act as fallback for older data.
- **"First-approval"** — for the delivery, the approval flow has exactly one approval_item and that item has `status='approved'` with no prior `status='rejected'` items.
- **"Rejection"** — each `approval_items.status='rejected'` row counts. A delivery can have multiple rejections.
- **"Rework"** — `COUNT(*) FROM delivery_phases WHERE delivery_id = X AND phase = 'correcao'`. Average per producer: `SUM(correcao_rows_for_their_deliveries) / COUNT(DISTINCT delivery)`.
- **"Volume for period bucket"** — one count per (bucket, producerId) where the producer had at least one production phase row for a delivery whose `completed_at` (or fallback `updated_at`) falls in the bucket.

**UI layout:**

```
[KPI row] Total tasks • First-approval rate • Rejection rate • Avg rework
[Ranking table] Name | Role | Volume | First-approval rate | Rework
[Line chart] Volume timeseries (one line per producer, with day/week/month/year toggle)
[Pie] Rejections by category
[Bar] Rejections by post type
[Bar] Rejections by target (cover / video)
```

Producer sees only their own row + their own KPIs; management sees everything.

### Fase 2 — Capacity (D)

Adds the Capacity tab to the existing shell. No schema changes. Every calculation uses `em_producao_video` and `em_producao_design` phases as the clock.

**Endpoints:**

| Metric | Endpoint | Response shape |
|---|---|---|
| Active tasks | `GET /capacity/active-tasks` | `[{ producerId, producerName, phase, count, tasks: [{ title, clickupUrl }] }]` |
| Avg phase duration | `GET /capacity/avg-phase-duration` | `[{ producerId, producerName, phase, avgSeconds, medianSeconds, sampleSize }]` |
| Total hours | `GET /capacity/total-hours` | `[{ producerId, producerName, productionSeconds }]` |
| Overdue | `GET /capacity/overdue` | `[{ producerId, producerName, count, tasks: [{ title, dueDate, phase, clickupUrl }] }]` |
| Phase distribution | `GET /capacity/phase-distribution` | `[{ producerId, phase, count }]` |
| Weekly heatmap | `GET /capacity/weekly-heatmap?producerId=` | `[{ dayOfWeek: 0..6, hour: 0..23, seconds }]` |
| Avg work timeseries | `GET /capacity/avg-work-timeseries?granularity=day|week|month|year` | `[{ bucket, producerId, avgSeconds }]` |

**Calculation rules:**

- **"Production time"** — `SUM(duration_seconds)` over phases `em_producao_video` and `em_producao_design` only. Other phases are queue/waiting and do not count.
- **"Active task"** — `delivery_phases.exited_at IS NULL` AND `delivery_phases.user_id = X`. Report groups by phase.
- **"Overdue"** — `deliveries.due_date < now()` AND `deliveries.status != 'publicado'`. Responsible producer = most recent open phase's assignee; fallback to the most recently-closed phase if no phase is open.
- **"Median"** — `percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_seconds)` per producer+phase.
- **"Heatmap"** — a phase that crosses hour/day boundaries must be sliced. Seed idea: iterate over each 1-hour window the phase intersects, add the intersected seconds to the corresponding `(dayOfWeek, hour)` bucket. Computed in Postgres with `generate_series` or in Node — pick whichever reads cleanest once it's written.

**UI layout:**

```
[KPI row] Total hours (period) • Active tasks • Overdue • Avg hours/day
[Ranking table] Name | Role | Hours | Active | Overdue
[Stacked bar] Phase distribution per producer
[Line chart] Work timeseries (per producer, day/week/month/year toggle)
[Heatmap] Weekly 7×24 — producer selector
[Collapsible lists] Active now • Overdue — each with ClickUp links
```

Producer sees only their own data; management sees the full ranking.

### Fase 3 — Client (E)

Adds the Client tab. A client must be selected before any chart renders.

**Endpoints:**

| Metric | Endpoint | Response |
|---|---|---|
| Summary | `GET /client/:clientId/summary` | `{ totalPublished, byPlatform: {instagram, tiktok, youtube}, byPostType: {reel, carousel, image, story} }` |
| Published list | `GET /client/:clientId/published-list` | `[{ deliveryId, title, publishedAt, platform, permalink, postType, producersByPhase, firstApproval }]` |
| First-approval rate | `GET /client/:clientId/first-approval-rate` | `{ total, firstApproved, rate }` |
| Rejection volume | `GET /client/:clientId/rejection-volume` | `{ total, byCategory: [{category, count}] }` |
| Avg cycle time | `GET /client/:clientId/avg-cycle-time` | `{ avgDaysStartToPublish, medianDays, byPostType: [{postType, avgDays}] }` |
| Responsibility history | `GET /client/:clientId/responsibility-history` | `[{ producerId, producerName, producerType, taskCount, phases: string[] }]` |
| CSV export | `GET /client/:clientId/published-list.csv` | `text/csv` stream |

**Calculation rules:**

- **"Published"** — `scheduled_posts.status='published' AND scheduled_posts.client_id=X AND published_at` in period.
- **"Cycle time"** — `delivery.completed_at - delivery.started_at` in days. Fallback: `MIN(delivery_phases.entered_at)` to `MAX(delivery_phases.exited_at)` per delivery.
- **"Producers by phase"** (in the list row) — JOIN `delivery_phases` returning one user per relevant phase: `captacao`, `design`, `em_producao_design`, `edicao_de_video`, `em_producao_video`. The row's `producersByPhase` is a dict keyed by phase with a name string.
- **"Responsibility history"** — all distinct `(producerId, phase)` pairs across the selected client's deliveries in the period, aggregated to `taskCount`.

**UI layout:**

```
[Client selector — required]
[KPI row] Total published • First-approval rate • Rejection count • Avg cycle time (days)
[Donuts] By platform • By type
[Table] Published posts in period — Date | Title | Platform | Type | Link | Designer | Editor | First-approval
        [Export CSV]
[Table] Responsibility — Producer | Role | Tasks | Phases touched
[Bar] Rejection by category
```

Account_manager sees only their own clients (`clients.account_manager_id = req.user.id`); management sees everything.

---

## Error Handling

- Query param validation via Joi; invalid → 400 with the specific field name.
- Auth scoping failure → 403 with a readable reason.
- Postgres error → 500, log with context (endpoint + params), frontend shows a retry banner.
- Empty-result states (zero rows) render a friendly "sem dados no período" instead of an empty chart.
- Feature flag / visibility: the "Relatórios" menu item hides entirely when `req.user` has no access to any tab (client role).

## Testing

Each phase carries its own tests.

**Backend unit tests** (`reports.service.test.js` per feature, using the existing in-memory db-mock pattern from `tiktok-webhook.service.test.js`):
- Fase 1: at least one test per metric (8 tests). Seed fixtures with two producers and two deliveries; assert the computed rate / ranking / timeseries matches a hand-computed answer.
- Fase 2: at least one test per metric (7 tests). Include a heatmap test with a phase that crosses midnight to exercise the slicing logic.
- Fase 3: at least one test per metric (7 tests) + one that checks 403 when account_manager queries a client that is not theirs.

**Integration (supertest):**
- Happy path + 403 for each endpoint.
- CSV download returns `text/csv` with the expected header row.

**Frontend smoke:**
- `ReportsPage` renders each tab without throwing.
- `FilterBar` submits the expected query string.
- Producer role hides the ranking rows that are not their own.

---

## Sequencing for Implementation

The forthcoming implementation plan should decompose into:

**Plan 1 (Fase 1):**
1. Migration `approval_items.rejection_category` + UI dropdown + Joi validation.
2. `reports.service.js` scaffolding with the eight Quality functions + unit tests.
3. `reportsAuth` middleware + routes + controller + integration tests.
4. `ReportsPage` shell + `FilterBar` + menu entry.
5. `QualityTab.jsx` with all cards and charts.
6. Wire the page to production and smoke-test with real data.

**Plan 2 (Fase 2)** and **Plan 3 (Fase 3)** follow the same shape, reusing everything that Plan 1 shipped.

Each plan is independently executable through subagent-driven-development.
