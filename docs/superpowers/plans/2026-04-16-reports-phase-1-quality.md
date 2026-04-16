# Reports Phase 1 — Quality (Qualidade) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Phase 1 of the Reports system — the Quality (C) tab of the new `/relatorios` page — with eight per-producer metrics computed from `delivery_phases` and `approval_items`, a new `rejection_category` field that the public approval UI captures, and a role-scoped API plus a shell that later phases (Capacity, Client) plug into.

**Architecture:** A new `reports` backend module exposes one `GET` endpoint per metric under `/api/reports/quality/*`. Queries use the existing Knex tables — no materialized views. A new `reportsAuth(feature)` middleware rewrites query params for `producer` callers so they only see their own data, and 403s roles that should not access the feature. On the frontend, a new `ReportsPage` hosts tabs and a shared filter bar; this plan wires the Quality tab. Charts use `recharts` (already installed).

**Tech Stack:** Node.js / Express / Knex (Postgres) / Jest + supertest / React (Vite) / recharts / tailwind.

---

## File Structure

| File | Role |
|---|---|
| `server/src/database/migrations/030_approval_rejection_category.js` (NEW) | Adds `approval_items.rejection_category`. |
| `server/src/modules/approvals/approvals.validation.js` (MODIFY) | `clientRespondSchema` accepts `rejection_category`. |
| `server/src/modules/approvals/approvals.service.js` (MODIFY) | Persist `rejection_category` when present. |
| `client/src/pages/PublicApprovalPage.jsx` (MODIFY) | Required category dropdown above the reason textarea. |
| `server/src/modules/reports/reports.auth.js` (NEW) | `reportsAuth(feature)` middleware. |
| `server/src/modules/reports/reports.service.js` (NEW) | Eight quality functions + private helpers. |
| `server/src/modules/reports/reports.service.test.js` (NEW) | Unit tests per function. |
| `server/src/modules/reports/reports.controller.js` (NEW) | Thin controller with Joi query validation. |
| `server/src/modules/reports/reports.routes.js` (NEW) | Quality routes, all gated by `authenticate` + `reportsAuth('quality')`. |
| `server/src/modules/reports/reports.routes.test.js` (NEW) | Supertest integration tests for each endpoint (happy path + 403). |
| `server/src/app.js` (MODIFY) | Mount the new router at `/api/reports`. |
| `client/src/services/reports.js` (NEW) | Thin axios wrappers for the quality endpoints. |
| `client/src/pages/ReportsPage.jsx` (NEW) | Shell with tab switcher + filter bar + renders `QualityTab`. |
| `client/src/components/reports/FilterBar.jsx` (NEW) | Period + client + producer filter. |
| `client/src/components/reports/KpiCard.jsx` (NEW) | Reusable number + label card. |
| `client/src/components/reports/QualityTab.jsx` (NEW) | Composes all Quality widgets. |
| `client/src/components/reports/ProducerRankingTable.jsx` (NEW) | Ranking table widget. |
| `client/src/components/reports/charts/VolumeTimeSeriesChart.jsx` (NEW) | recharts LineChart. |
| `client/src/components/reports/charts/RejectionBreakdownChart.jsx` (NEW) | recharts Pie/Bar used three times. |
| `client/src/components/layout/Sidebar.jsx` (MODIFY) | Add "Relatórios" item. |
| `client/src/App.jsx` (MODIFY) | Register `/relatorios` route. |

---

## Context the engineer needs

- Spec: `docs/superpowers/specs/2026-04-16-production-metrics-reports-design.md` — sections on Fase 1 define every rule. This plan implements exactly that spec.
- Status names already changed: `em_producao_video`, `em_producao_design`, `edicao_de_video`, `design` are the production-phase keys. Fallback order is documented in the spec.
- `req.user` shape comes from `server/src/middleware/auth.js`: `{ id, name, email, role, producer_type, is_active, base_salary, auto_calc_enabled, avatar_url, whatsapp, clickup_id }`.
- Roles in the app: `dev`, `ceo`, `director`, `manager`, `account_manager`, `producer`, `client`. `dev` bypasses every check (see how existing middlewares handle it in `auth.js`).
- `clients.account_manager_id` — the spec references it for Phase 3 scoping. It already exists on the `clients` table.
- Existing test pattern: `server/src/modules/tiktok/tiktok-webhook.service.test.js` uses an in-memory db-mock + jest.mock. Follow the same shape.
- Existing frontend API client: `client/src/services/api.js` exports a pre-configured axios instance with auth + 401-refresh interceptors. Use it.

---

### Task 1: Migration — `approval_items.rejection_category`

**Files:**
- Create: `server/src/database/migrations/030_approval_rejection_category.js`

- [ ] **Step 1: Create the migration file**

```js
exports.up = function (knex) {
  return knex.schema.alterTable('approval_items', (table) => {
    table.string('rejection_category', 30).nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('approval_items', (table) => {
    table.dropColumn('rejection_category');
  });
};
```

- [ ] **Step 2: Run the migration against the Railway DB**

```bash
cd /home/dev/projetos/server && DATABASE_URL="postgresql://postgres:omnpQxZihGaOPuiYUoCfKaFbcabzRbgj@nozomi.proxy.rlwy.net:57344/railway" npx knex migrate:latest
```

Expected: `Batch NN run: 1 migrations` mentioning `030_approval_rejection_category.js`.

If DB is unreachable, skip the run and report — Railway will run it on next deploy. Verify syntax instead: `node -e "require('./server/src/database/migrations/030_approval_rejection_category.js')"` must not throw.

- [ ] **Step 3: Run the existing test suite to confirm no regression**

```bash
cd /home/dev/projetos/server && npx jest --silent
```

Expected baseline: all previously-passing tests stay green.

- [ ] **Step 4: Commit**

```bash
git add server/src/database/migrations/030_approval_rejection_category.js
git -c safe.directory=/home/dev/projetos commit -m "feat(approvals): migration for rejection_category column

Adds approval_items.rejection_category (varchar(30) nullable). The
public approval modal will require the client to pick a category
('capa' | 'edicao' | 'audio_musica' | 'texto' | 'tom_voz' |
'tecnico' | 'outro') when rejecting, feeding the new Reports
'rejection-by-category' metric."
```

---

### Task 2: Persist `rejection_category` in the approval flow

**Files:**
- Modify: `server/src/modules/approvals/approvals.validation.js`
- Modify: `server/src/modules/approvals/approvals.service.js` — `clientRespond` method, specifically the `itemUpdate` block.
- Modify: `client/src/pages/PublicApprovalPage.jsx` — rejection modal.

- [ ] **Step 1: Extend the Joi validator**

Open `server/src/modules/approvals/approvals.validation.js`. Find `clientRespondSchema` (shown below) and add a `rejection_category` field with the fixed enum.

Current:

```js
const clientRespondSchema = Joi.object({
  status: Joi.string().valid('approved', 'rejected').required(),
  rejection_reason: Joi.string().max(2000).when('status', {
    is: 'rejected',
    then: Joi.required(),
    otherwise: Joi.allow(null, '').optional(),
  }),
  rejection_target: Joi.string().valid('cover', 'video').optional(),
  media_urls: Joi.array().items(Joi.object({
    url: Joi.string().required(),
    type: Joi.string().valid('image', 'video').required(),
    order: Joi.number().integer().min(0).optional(),
  })).optional(),
});
```

Change to:

```js
const REJECTION_CATEGORIES = ['capa', 'edicao', 'audio_musica', 'texto', 'tom_voz', 'tecnico', 'outro'];

const clientRespondSchema = Joi.object({
  status: Joi.string().valid('approved', 'rejected').required(),
  rejection_reason: Joi.string().max(2000).when('status', {
    is: 'rejected',
    then: Joi.required(),
    otherwise: Joi.allow(null, '').optional(),
  }),
  rejection_target: Joi.string().valid('cover', 'video').optional(),
  rejection_category: Joi.string().valid(...REJECTION_CATEGORIES).when('status', {
    is: 'rejected',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  media_urls: Joi.array().items(Joi.object({
    url: Joi.string().required(),
    type: Joi.string().valid('image', 'video').required(),
    order: Joi.number().integer().min(0).optional(),
  })).optional(),
});

module.exports = { clientRespondSchema, REJECTION_CATEGORIES };
```

Also export `REJECTION_CATEGORIES` (the frontend will import this list through a parallel constant — see Step 4 below).

- [ ] **Step 2: Accept and forward the field in the controller**

Open `server/src/modules/approvals/approvals.controller.js`. Find the existing `clientRespond` handler that calls `service.clientRespond({ token, itemId, status, rejectionReason, rejectionTarget, mediaUrls })`. Add one key so the service receives it:

```js
const result = await service.clientRespond({
  token: req.params.token,
  itemId: req.params.itemId,
  status: value.status,
  rejectionReason: value.rejection_reason,
  rejectionTarget: value.rejection_target,
  rejectionCategory: value.rejection_category,
  mediaUrls: value.media_urls,
});
```

- [ ] **Step 3: Persist the field in the service**

Open `server/src/modules/approvals/approvals.service.js`. Find the `clientRespond` method's `itemUpdate` block. Add `rejection_category` to the destructured args and to the update object.

Change the method signature:

```js
async clientRespond({ token, itemId, status, rejectionReason, rejectionTarget, rejectionCategory, mediaUrls }) {
```

Change the `itemUpdate` object inside the method:

```js
const itemUpdate = {
  status: itemStatus,
  rejection_reason: rejectionReason || null,
  rejection_target: rejectionTarget || null,
  rejection_category: rejectionCategory || null,
  responded_at: new Date(),
  updated_at: new Date(),
};
```

- [ ] **Step 4: Add the category dropdown to the public approval modal**

Open `client/src/pages/PublicApprovalPage.jsx`. Near the top of the component, next to `const [rejectionTarget, setRejectionTarget] = useState(null);` add:

```jsx
const [rejectionCategory, setRejectionCategory] = useState('');
```

At the top of the file, after the existing imports, add the shared enum inline (the frontend does not need to import from the backend):

```jsx
const REJECTION_CATEGORY_OPTIONS = [
  { value: 'capa', label: 'Capa' },
  { value: 'edicao', label: 'Edição' },
  { value: 'audio_musica', label: 'Áudio / Música' },
  { value: 'texto', label: 'Texto' },
  { value: 'tom_voz', label: 'Tom de voz' },
  { value: 'tecnico', label: 'Técnico' },
  { value: 'outro', label: 'Outro' },
];
```

Inside the rejection modal (the `{rejectingId === item.id && (...)}` block), immediately above the `needsTarget(item)` block (i.e. above the cover/vídeo radios), add:

```jsx
<div className="mb-3">
  <p className="text-sm text-foreground mb-2 font-medium">Categoria do problema:</p>
  <select
    value={rejectionCategory}
    onChange={(e) => setRejectionCategory(e.target.value)}
    className="w-full bg-muted border border-border rounded-lg p-2 text-sm text-foreground"
  >
    <option value="">Selecione...</option>
    {REJECTION_CATEGORY_OPTIONS.map((opt) => (
      <option key={opt.value} value={opt.value}>{opt.label}</option>
    ))}
  </select>
</div>
```

Find the Confirm button's `disabled` prop. Extend it:

```jsx
disabled={!rejectionReason.trim() || submitting || !rejectionCategory || (needsTarget(item) && !rejectionTarget)}
```

Find the submit handler (`handleRejectConfirm` or similar) that builds the POST body. Add the field when set:

```js
const body = {
  status: 'rejected',
  rejection_reason: rejectionReason.trim(),
  rejection_category: rejectionCategory,
};
if (rejectionTarget) body.rejection_target = rejectionTarget;
```

Wherever `setRejectingId(null)` resets state after submit or on cancel, also `setRejectionCategory('')`.

- [ ] **Step 5: Run all tests**

```bash
cd /home/dev/projetos/server && npx jest --silent
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/approvals/approvals.validation.js server/src/modules/approvals/approvals.controller.js server/src/modules/approvals/approvals.service.js client/src/pages/PublicApprovalPage.jsx
git -c safe.directory=/home/dev/projetos commit -m "feat(approvals): client rejection requires a category

rejection_category joins the existing rejection_reason and
rejection_target as a required field when the client rejects. The
allowed values are 'capa', 'edicao', 'audio_musica', 'texto',
'tom_voz', 'tecnico' and 'outro'; the public approval modal now
shows a dropdown above the reason textarea. The value is persisted
on approval_items and will power the Reports 'rejection-by-category'
metric."
```

---

### Task 3: `reportsAuth` middleware

**Files:**
- Create: `server/src/modules/reports/reports.auth.js`
- Create: `server/src/modules/reports/reports.auth.test.js`

- [ ] **Step 1: Write the failing tests**

Create `server/src/modules/reports/reports.auth.test.js`:

```js
const { reportsAuth } = require('./reports.auth');

function mockReqRes(user, query = {}, params = {}) {
  const req = { user, query: { ...query }, params: { ...params } };
  const res = {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(p) { this.payload = p; return this; },
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('reportsAuth — quality feature', () => {
  const mw = reportsAuth('quality');

  test('management role passes through without rewriting query', () => {
    const { req, res, next } = mockReqRes({ id: 'u1', role: 'ceo' }, { producerId: 'p1' });
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.query.producerId).toBe('p1');
  });

  test('dev bypasses every check', () => {
    const { req, res, next } = mockReqRes({ id: 'u1', role: 'dev' });
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('producer gets producerId forced to their own id', () => {
    const { req, res, next } = mockReqRes({ id: 'u1', role: 'producer' }, { producerId: 'otherUser' });
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.query.producerId).toBe('u1');
  });

  test('account_manager gets 403 on quality', () => {
    const { req, res, next } = mockReqRes({ id: 'u1', role: 'account_manager' });
    mw(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  test('client gets 403 on quality', () => {
    const { req, res, next } = mockReqRes({ id: 'u1', role: 'client' });
    mw(req, res, next);
    expect(res.statusCode).toBe(403);
  });
});

describe('reportsAuth — capacity feature', () => {
  const mw = reportsAuth('capacity');

  test('producer gets forced producerId', () => {
    const { req, res, next } = mockReqRes({ id: 'u1', role: 'producer' }, { producerId: 'other' });
    mw(req, res, next);
    expect(req.query.producerId).toBe('u1');
    expect(next).toHaveBeenCalled();
  });

  test('account_manager gets 403', () => {
    const { req, res, next } = mockReqRes({ id: 'u1', role: 'account_manager' });
    mw(req, res, next);
    expect(res.statusCode).toBe(403);
  });
});

describe('reportsAuth — client feature', () => {
  const mw = reportsAuth('client');

  test('manager passes through', () => {
    const { req, res, next } = mockReqRes({ id: 'u1', role: 'manager' }, {}, { clientId: 'c1' });
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('producer gets 403', () => {
    const { req, res, next } = mockReqRes({ id: 'u1', role: 'producer' });
    mw(req, res, next);
    expect(res.statusCode).toBe(403);
  });

  test('account_manager passes through and marks the request as scoped', () => {
    const { req, res, next } = mockReqRes({ id: 'u1', role: 'account_manager' }, {}, { clientId: 'c1' });
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req._scopedAccountManagerId).toBe('u1');
  });
});
```

- [ ] **Step 2: Run the failing test**

```bash
cd /home/dev/projetos/server && npx jest src/modules/reports/reports.auth.test.js
```

Expected: fails — `Cannot find module './reports.auth'`.

- [ ] **Step 3: Implement the middleware**

Create `server/src/modules/reports/reports.auth.js`:

```js
const MANAGEMENT = ['ceo', 'director', 'manager'];

function reportsAuth(feature) {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role) return res.status(401).json({ error: 'Not authenticated' });
    if (role === 'dev') return next();
    if (MANAGEMENT.includes(role)) return next();

    if (feature === 'quality' || feature === 'capacity') {
      if (role === 'producer') {
        req.query.producerId = req.user.id;
        return next();
      }
      return res.status(403).json({ error: 'Reports: feature not available for this role' });
    }

    if (feature === 'client') {
      if (role === 'account_manager') {
        req._scopedAccountManagerId = req.user.id;
        return next();
      }
      return res.status(403).json({ error: 'Reports: client feature restricted to management and account managers' });
    }

    return res.status(403).json({ error: 'Reports: access denied' });
  };
}

module.exports = { reportsAuth };
```

- [ ] **Step 4: Run the tests**

```bash
cd /home/dev/projetos/server && npx jest src/modules/reports/reports.auth.test.js
```

Expected: all 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/reports/reports.auth.js server/src/modules/reports/reports.auth.test.js
git -c safe.directory=/home/dev/projetos commit -m "feat(reports): reportsAuth middleware with per-feature scoping

Management (ceo/director/manager) and dev pass through unchanged.
Producers querying quality or capacity have their producerId forced
to req.user.id; they get 403 on client. account_manager gets 403 on
quality/capacity but passes through on client with the scope stored
on req._scopedAccountManagerId so the controller can enforce
clients.account_manager_id ownership."
```

---

### Task 4: Reports service — Quality metrics

**Files:**
- Create: `server/src/modules/reports/reports.service.js`
- Create: `server/src/modules/reports/reports.service.test.js`

This task implements the eight Quality functions against an in-memory mock database. The functions are grouped into: simple rates (`firstApprovalRate`, `rejectionRate`), breakdowns (`rejectionByCategory`, `rejectionByPostType`, `rejectionByTarget`), and aggregates (`reworkPerTask`, `ranking`, `volumeTimeseries`).

- [ ] **Step 1: Write the failing tests**

Create `server/src/modules/reports/reports.service.test.js`:

```js
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const state = {
  users: {},
  deliveries: {},
  approval_items: [],
  delivery_phases: [],
};

jest.mock('../../config/db', () => {
  return jest.fn((table) => {
    const qb = {
      _table: table,
      _where: null,
      _whereIn: null,
      _whereBetween: null,
      _orderBy: null,
      _groupBy: null,
      _rawExpr: null,
      where(cond) { this._where = cond; return this; },
      whereIn(col, vals) { this._whereIn = { col, vals }; return this; },
      whereBetween(col, range) { this._whereBetween = { col, range }; return this; },
      andWhere(cond) { this._where = { ...(this._where || {}), ...cond }; return this; },
      select() { return this; },
      orderBy(col, dir) { this._orderBy = { col, dir }; return this; },
      groupBy(...cols) { this._groupBy = cols; return this; },
      count() { return this; },
      first() {
        if (this._table === 'users' && this._where?.id) {
          return Promise.resolve(state.users[this._where.id] || null);
        }
        return Promise.resolve(null);
      },
      then(resolve) {
        let rows;
        if (this._table === 'delivery_phases') rows = state.delivery_phases;
        else if (this._table === 'approval_items') rows = state.approval_items;
        else if (this._table === 'deliveries') rows = Object.values(state.deliveries);
        else if (this._table === 'users') rows = Object.values(state.users);
        else rows = [];

        if (this._where) {
          rows = rows.filter((r) => Object.keys(this._where).every((k) => r[k] === this._where[k]));
        }
        if (this._whereIn) {
          rows = rows.filter((r) => this._whereIn.vals.includes(r[this._whereIn.col]));
        }
        if (this._whereBetween) {
          const [lo, hi] = this._whereBetween.range;
          rows = rows.filter((r) => {
            const v = r[this._whereBetween.col];
            return v !== null && v !== undefined && v >= lo && v <= hi;
          });
        }
        if (this._orderBy) {
          const { col, dir } = this._orderBy;
          rows = [...rows].sort((a, b) => {
            const av = a[col]; const bv = b[col];
            const cmp = av > bv ? 1 : av < bv ? -1 : 0;
            return dir === 'desc' ? -cmp : cmp;
          });
        }
        return Promise.resolve(rows).then(resolve);
      },
    };
    return qb;
  });
});

const reports = require('./reports.service');

beforeEach(() => {
  state.users = {};
  state.deliveries = {};
  state.approval_items = [];
  state.delivery_phases = [];
});

function seedUser(u) { state.users[u.id] = { producer_type: 'designer', ...u }; }
function seedDelivery(d) { state.deliveries[d.id] = { content_type: 'reel', client_id: 'c1', completed_at: new Date('2026-04-15T12:00:00Z'), ...d }; }
function seedPhase(p) { state.delivery_phases.push({ exited_at: null, duration_seconds: null, ...p }); }
function seedApproval(a) { state.approval_items.push({ status: 'approved', rejection_category: null, rejection_target: null, responded_at: new Date('2026-04-15T12:00:00Z'), ...a }); }

const RANGE = { start: new Date('2026-04-01T00:00:00Z'), end: new Date('2026-04-30T23:59:59Z') };

describe('firstApprovalRate', () => {
  test('counts deliveries with a single approved item and no rejections', async () => {
    seedUser({ id: 'u1', name: 'João' });
    seedDelivery({ id: 'd1' });
    seedDelivery({ id: 'd2' });
    seedPhase({ delivery_id: 'd1', user_id: 'u1', phase: 'em_producao_design', entered_at: new Date('2026-04-10'), exited_at: new Date('2026-04-10T02:00:00Z') });
    seedPhase({ delivery_id: 'd2', user_id: 'u1', phase: 'em_producao_design', entered_at: new Date('2026-04-12'), exited_at: new Date('2026-04-12T02:00:00Z') });
    seedApproval({ id: 'a1', delivery_id: 'd1', status: 'approved' });
    seedApproval({ id: 'a2', delivery_id: 'd2', status: 'rejected' });
    seedApproval({ id: 'a3', delivery_id: 'd2', status: 'approved' });
    const out = await reports.firstApprovalRate(RANGE);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ producerId: 'u1', producerName: 'João', total: 2, firstApproved: 1, rate: 0.5 });
  });
});

describe('rejectionRate', () => {
  test('ratio of rejected items to total items touched by the producer', async () => {
    seedUser({ id: 'u1', name: 'João' });
    seedDelivery({ id: 'd1' });
    seedPhase({ delivery_id: 'd1', user_id: 'u1', phase: 'em_producao_design', entered_at: new Date('2026-04-10') });
    seedApproval({ id: 'a1', delivery_id: 'd1', status: 'rejected' });
    seedApproval({ id: 'a2', delivery_id: 'd1', status: 'approved' });
    const out = await reports.rejectionRate(RANGE);
    expect(out[0]).toMatchObject({ producerId: 'u1', total: 2, rejected: 1, rate: 0.5 });
  });
});

describe('reworkPerTask', () => {
  test('average correcao phase openings per distinct delivery', async () => {
    seedUser({ id: 'u1', name: 'João' });
    seedDelivery({ id: 'd1' });
    seedDelivery({ id: 'd2' });
    seedPhase({ delivery_id: 'd1', user_id: 'u1', phase: 'em_producao_design', entered_at: new Date('2026-04-10') });
    seedPhase({ delivery_id: 'd2', user_id: 'u1', phase: 'em_producao_design', entered_at: new Date('2026-04-11') });
    seedPhase({ delivery_id: 'd1', phase: 'correcao', entered_at: new Date('2026-04-12') });
    seedPhase({ delivery_id: 'd1', phase: 'correcao', entered_at: new Date('2026-04-13') });
    const out = await reports.reworkPerTask(RANGE);
    expect(out[0]).toMatchObject({ producerId: 'u1', avgRework: 1 });
  });
});

describe('rejectionByCategory', () => {
  test('groups rejected items by category within the period', async () => {
    seedApproval({ id: 'a1', delivery_id: 'd1', status: 'rejected', rejection_category: 'capa' });
    seedApproval({ id: 'a2', delivery_id: 'd1', status: 'rejected', rejection_category: 'capa' });
    seedApproval({ id: 'a3', delivery_id: 'd1', status: 'rejected', rejection_category: 'texto' });
    const out = await reports.rejectionByCategory(RANGE);
    expect(out.sort((a, b) => a.category.localeCompare(b.category))).toEqual([
      { category: 'capa', count: 2 },
      { category: 'texto', count: 1 },
    ]);
  });
});

describe('rejectionByPostType', () => {
  test('groups by the delivery content_type and returns total + rejected + rate', async () => {
    seedDelivery({ id: 'd1', content_type: 'reel' });
    seedDelivery({ id: 'd2', content_type: 'reel' });
    seedDelivery({ id: 'd3', content_type: 'carrossel' });
    seedApproval({ id: 'a1', delivery_id: 'd1', status: 'rejected' });
    seedApproval({ id: 'a2', delivery_id: 'd2', status: 'approved' });
    seedApproval({ id: 'a3', delivery_id: 'd3', status: 'rejected' });
    const out = await reports.rejectionByPostType(RANGE);
    const reel = out.find((r) => r.postType === 'reel');
    const carr = out.find((r) => r.postType === 'carrossel');
    expect(reel).toMatchObject({ total: 2, rejected: 1, rate: 0.5 });
    expect(carr).toMatchObject({ total: 1, rejected: 1, rate: 1 });
  });
});

describe('rejectionByTarget', () => {
  test('groups by rejection_target cover/video', async () => {
    seedApproval({ id: 'a1', delivery_id: 'd1', status: 'rejected', rejection_target: 'cover' });
    seedApproval({ id: 'a2', delivery_id: 'd1', status: 'rejected', rejection_target: 'video' });
    seedApproval({ id: 'a3', delivery_id: 'd1', status: 'rejected', rejection_target: 'cover' });
    const out = await reports.rejectionByTarget(RANGE);
    const cover = out.find((r) => r.target === 'cover');
    const video = out.find((r) => r.target === 'video');
    expect(cover.count).toBe(2);
    expect(video.count).toBe(1);
  });
});

describe('ranking', () => {
  test('returns producers sorted by volume desc with score = firstApprovalRate', async () => {
    seedUser({ id: 'u1', name: 'João', producer_type: 'designer' });
    seedUser({ id: 'u2', name: 'Maria', producer_type: 'video_editor' });
    seedDelivery({ id: 'd1' });
    seedDelivery({ id: 'd2' });
    seedDelivery({ id: 'd3' });
    seedPhase({ delivery_id: 'd1', user_id: 'u1', phase: 'em_producao_design', entered_at: new Date('2026-04-10') });
    seedPhase({ delivery_id: 'd2', user_id: 'u1', phase: 'em_producao_design', entered_at: new Date('2026-04-11') });
    seedPhase({ delivery_id: 'd3', user_id: 'u2', phase: 'em_producao_video', entered_at: new Date('2026-04-12') });
    seedApproval({ id: 'a1', delivery_id: 'd1', status: 'approved' });
    seedApproval({ id: 'a2', delivery_id: 'd2', status: 'rejected' });
    seedApproval({ id: 'a3', delivery_id: 'd2', status: 'approved' });
    seedApproval({ id: 'a4', delivery_id: 'd3', status: 'approved' });
    const out = await reports.ranking(RANGE);
    expect(out[0].producerId).toBe('u1');
    expect(out[0].volume).toBe(2);
    expect(out[0].firstApprovalRate).toBe(0.5);
    expect(out[1].producerId).toBe('u2');
    expect(out[1].volume).toBe(1);
  });
});

describe('volumeTimeseries', () => {
  test('groups per producer per day bucket', async () => {
    seedUser({ id: 'u1', name: 'João' });
    seedDelivery({ id: 'd1', completed_at: new Date('2026-04-10T10:00:00Z') });
    seedDelivery({ id: 'd2', completed_at: new Date('2026-04-10T15:00:00Z') });
    seedDelivery({ id: 'd3', completed_at: new Date('2026-04-11T10:00:00Z') });
    seedPhase({ delivery_id: 'd1', user_id: 'u1', phase: 'em_producao_design', entered_at: new Date('2026-04-10T09:00:00Z') });
    seedPhase({ delivery_id: 'd2', user_id: 'u1', phase: 'em_producao_design', entered_at: new Date('2026-04-10T12:00:00Z') });
    seedPhase({ delivery_id: 'd3', user_id: 'u1', phase: 'em_producao_design', entered_at: new Date('2026-04-11T09:00:00Z') });
    const out = await reports.volumeTimeseries({ ...RANGE, granularity: 'day' });
    const apr10 = out.find((r) => r.bucket === '2026-04-10');
    const apr11 = out.find((r) => r.bucket === '2026-04-11');
    expect(apr10.count).toBe(2);
    expect(apr11.count).toBe(1);
  });
});
```

- [ ] **Step 2: Run the failing test**

```bash
cd /home/dev/projetos/server && npx jest src/modules/reports/reports.service.test.js
```

Expected: fails — module not found.

- [ ] **Step 3: Implement the service**

Create `server/src/modules/reports/reports.service.js`:

```js
const db = require('../../config/db');

const PRODUCTION_PHASES = ['em_producao_video', 'em_producao_design', 'edicao_de_video', 'design'];

function rangeFilter(table, column, { start, end }) {
  if (!start || !end) return null;
  return { column: `${table}.${column}`, start: new Date(start), end: new Date(end) };
}

async function producersWithDeliveriesIn(range) {
  const phases = await db('delivery_phases').whereIn('phase', PRODUCTION_PHASES);
  const filtered = phases.filter((p) => {
    if (!p.entered_at) return false;
    const t = new Date(p.entered_at).getTime();
    return t >= new Date(range.start).getTime() && t <= new Date(range.end).getTime();
  });
  // Map producer → set of deliveryIds
  const map = new Map();
  for (const p of filtered) {
    if (!p.user_id) continue;
    if (!map.has(p.user_id)) map.set(p.user_id, new Set());
    map.get(p.user_id).add(p.delivery_id);
  }
  return map;
}

async function loadUser(id) {
  const user = await db('users').where({ id }).first();
  return user || { id, name: 'Desconhecido', producer_type: null };
}

async function firstApprovalRate(range) {
  const producerMap = await producersWithDeliveriesIn(range);
  const items = await db('approval_items');
  const results = [];

  for (const [userId, deliveryIds] of producerMap.entries()) {
    let total = 0;
    let firstApproved = 0;
    for (const deliveryId of deliveryIds) {
      const itemsForDelivery = items.filter((i) => i.delivery_id === deliveryId);
      if (itemsForDelivery.length === 0) continue;
      total += 1;
      const hasReject = itemsForDelivery.some((i) => i.status === 'rejected');
      const hasApprove = itemsForDelivery.some((i) => i.status === 'approved');
      if (hasApprove && !hasReject) firstApproved += 1;
    }
    if (total === 0) continue;
    const user = await loadUser(userId);
    results.push({
      producerId: userId,
      producerName: user.name,
      producerType: user.producer_type,
      total,
      firstApproved,
      rate: firstApproved / total,
    });
  }
  results.sort((a, b) => b.rate - a.rate);
  return results;
}

async function rejectionRate(range) {
  const producerMap = await producersWithDeliveriesIn(range);
  const items = await db('approval_items');
  const results = [];

  for (const [userId, deliveryIds] of producerMap.entries()) {
    let total = 0;
    let rejected = 0;
    for (const i of items) {
      if (!deliveryIds.has(i.delivery_id)) continue;
      total += 1;
      if (i.status === 'rejected') rejected += 1;
    }
    if (total === 0) continue;
    const user = await loadUser(userId);
    results.push({
      producerId: userId,
      producerName: user.name,
      producerType: user.producer_type,
      total,
      rejected,
      rate: rejected / total,
    });
  }
  results.sort((a, b) => b.rate - a.rate);
  return results;
}

async function reworkPerTask(range) {
  const producerMap = await producersWithDeliveriesIn(range);
  const phases = await db('delivery_phases');
  const results = [];

  for (const [userId, deliveryIds] of producerMap.entries()) {
    let totalRework = 0;
    for (const deliveryId of deliveryIds) {
      totalRework += phases.filter((p) => p.delivery_id === deliveryId && p.phase === 'correcao').length;
    }
    const user = await loadUser(userId);
    results.push({
      producerId: userId,
      producerName: user.name,
      producerType: user.producer_type,
      avgRework: deliveryIds.size ? totalRework / deliveryIds.size : 0,
    });
  }
  results.sort((a, b) => b.avgRework - a.avgRework);
  return results;
}

async function rejectionByCategory(range) {
  const items = await db('approval_items');
  const counts = new Map();
  for (const i of items) {
    if (i.status !== 'rejected') continue;
    const t = i.responded_at ? new Date(i.responded_at).getTime() : null;
    if (!t || t < new Date(range.start).getTime() || t > new Date(range.end).getTime()) continue;
    const key = i.rejection_category || 'outro';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].map(([category, count]) => ({ category, count }));
}

async function rejectionByPostType(range) {
  const items = await db('approval_items');
  const deliveries = await db('deliveries');
  const byDelivery = new Map(deliveries.map((d) => [d.id, d]));
  const byType = new Map();
  for (const i of items) {
    const t = i.responded_at ? new Date(i.responded_at).getTime() : null;
    if (!t || t < new Date(range.start).getTime() || t > new Date(range.end).getTime()) continue;
    const d = byDelivery.get(i.delivery_id);
    if (!d) continue;
    const postType = d.content_type || 'outro';
    if (!byType.has(postType)) byType.set(postType, { total: 0, rejected: 0 });
    const bucket = byType.get(postType);
    bucket.total += 1;
    if (i.status === 'rejected') bucket.rejected += 1;
  }
  return [...byType.entries()].map(([postType, { total, rejected }]) => ({
    postType, total, rejected, rate: total ? rejected / total : 0,
  }));
}

async function rejectionByTarget(range) {
  const items = await db('approval_items');
  const counts = new Map();
  for (const i of items) {
    if (i.status !== 'rejected') continue;
    if (!i.rejection_target) continue;
    const t = i.responded_at ? new Date(i.responded_at).getTime() : null;
    if (!t || t < new Date(range.start).getTime() || t > new Date(range.end).getTime()) continue;
    counts.set(i.rejection_target, (counts.get(i.rejection_target) || 0) + 1);
  }
  return [...counts.entries()].map(([target, count]) => ({ target, count }));
}

async function ranking(range) {
  const [rates, producerMap] = await Promise.all([
    firstApprovalRate(range),
    producersWithDeliveriesIn(range),
  ]);
  const rateByUser = new Map(rates.map((r) => [r.producerId, r]));
  const out = [];
  for (const [userId, deliveryIds] of producerMap.entries()) {
    const user = await loadUser(userId);
    const r = rateByUser.get(userId);
    out.push({
      producerId: userId,
      producerName: user.name,
      producerType: user.producer_type,
      volume: deliveryIds.size,
      firstApprovalRate: r ? r.rate : null,
      score: deliveryIds.size * (r ? r.rate : 0),
    });
  }
  out.sort((a, b) => b.volume - a.volume);
  return out;
}

function bucketKey(date, granularity) {
  const d = new Date(date);
  if (granularity === 'year') return `${d.getUTCFullYear()}`;
  if (granularity === 'month') return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  if (granularity === 'week') {
    // ISO week start: Monday. UTC-only computation.
    const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayOfWeek = (copy.getUTCDay() + 6) % 7;
    copy.setUTCDate(copy.getUTCDate() - dayOfWeek);
    return copy.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10); // day
}

async function volumeTimeseries({ start, end, granularity = 'day', producerId }) {
  const producerMap = await producersWithDeliveriesIn({ start, end });
  const deliveries = await db('deliveries');
  const byDelivery = new Map(deliveries.map((d) => [d.id, d]));
  const counts = new Map();
  for (const [userId, deliveryIds] of producerMap.entries()) {
    if (producerId && userId !== producerId) continue;
    for (const deliveryId of deliveryIds) {
      const d = byDelivery.get(deliveryId);
      if (!d) continue;
      const ref = d.completed_at || d.updated_at;
      if (!ref) continue;
      const key = `${userId}|${bucketKey(ref, granularity)}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return [...counts.entries()].map(([k, count]) => {
    const [pid, bucket] = k.split('|');
    return { producerId: pid, bucket, count };
  });
}

module.exports = {
  firstApprovalRate,
  rejectionRate,
  reworkPerTask,
  rejectionByCategory,
  rejectionByPostType,
  rejectionByTarget,
  ranking,
  volumeTimeseries,
  PRODUCTION_PHASES,
};
```

- [ ] **Step 4: Run the tests**

```bash
cd /home/dev/projetos/server && npx jest src/modules/reports/reports.service.test.js
```

Expected: all 8 tests pass.

- [ ] **Step 5: Run the full suite**

```bash
cd /home/dev/projetos/server && npx jest --silent
```

Expected: green, no regressions.

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/reports/reports.service.js server/src/modules/reports/reports.service.test.js
git -c safe.directory=/home/dev/projetos commit -m "feat(reports): quality metrics service

Eight pure functions compute per-producer Quality metrics from
delivery_phases + approval_items + deliveries, scoped by a
{start, end} range: firstApprovalRate, rejectionRate, reworkPerTask,
rejectionByCategory, rejectionByPostType, rejectionByTarget,
ranking, volumeTimeseries. Production phases em_producao_design,
em_producao_video, design and edicao_de_video are the canonical
'this producer touched the task' signal, with the queue phases
acting as fallback so older data still maps correctly. Covered by
8 unit tests exercising each metric against an in-memory db mock."
```

---

### Task 5: Reports API — controller, routes, integration tests

**Files:**
- Create: `server/src/modules/reports/reports.controller.js`
- Create: `server/src/modules/reports/reports.routes.js`
- Create: `server/src/modules/reports/reports.routes.test.js`
- Modify: `server/src/app.js` — mount router at `/api/reports`.

- [ ] **Step 1: Implement the controller**

Create `server/src/modules/reports/reports.controller.js`:

```js
const Joi = require('joi');
const service = require('./reports.service');

const querySchema = Joi.object({
  start: Joi.date().iso().required(),
  end: Joi.date().iso().required(),
  clientId: Joi.string().uuid().optional(),
  producerId: Joi.string().uuid().optional(),
  granularity: Joi.string().valid('day', 'week', 'month', 'year').optional(),
}).unknown(true);

function validate(req, res) {
  const { error, value } = querySchema.validate(req.query);
  if (error) {
    res.status(400).json({ error: error.details[0].message });
    return null;
  }
  return value;
}

function filterByProducer(rows, producerId) {
  if (!producerId) return rows;
  return rows.filter((r) => r.producerId === producerId);
}

async function firstApprovalRate(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const out = await service.firstApprovalRate(v);
    res.json(filterByProducer(out, v.producerId));
  } catch (err) { next(err); }
}

async function rejectionRate(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const out = await service.rejectionRate(v);
    res.json(filterByProducer(out, v.producerId));
  } catch (err) { next(err); }
}

async function reworkPerTask(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const out = await service.reworkPerTask(v);
    res.json(filterByProducer(out, v.producerId));
  } catch (err) { next(err); }
}

async function rejectionByCategory(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const out = await service.rejectionByCategory(v);
    res.json(out);
  } catch (err) { next(err); }
}

async function rejectionByPostType(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const out = await service.rejectionByPostType(v);
    res.json(out);
  } catch (err) { next(err); }
}

async function rejectionByTarget(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const out = await service.rejectionByTarget(v);
    res.json(out);
  } catch (err) { next(err); }
}

async function ranking(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const out = await service.ranking(v);
    res.json(filterByProducer(out, v.producerId));
  } catch (err) { next(err); }
}

async function volumeTimeseries(req, res, next) {
  try {
    const v = validate(req, res); if (!v) return;
    const out = await service.volumeTimeseries(v);
    res.json(v.producerId ? out.filter((r) => r.producerId === v.producerId) : out);
  } catch (err) { next(err); }
}

module.exports = {
  firstApprovalRate,
  rejectionRate,
  reworkPerTask,
  rejectionByCategory,
  rejectionByPostType,
  rejectionByTarget,
  ranking,
  volumeTimeseries,
};
```

- [ ] **Step 2: Implement the routes**

Create `server/src/modules/reports/reports.routes.js`:

```js
const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { reportsAuth } = require('./reports.auth');
const controller = require('./reports.controller');

const router = express.Router();

router.use(authenticate);

const qualityGuard = reportsAuth('quality');
router.get('/quality/first-approval-rate', qualityGuard, controller.firstApprovalRate);
router.get('/quality/rejection-rate', qualityGuard, controller.rejectionRate);
router.get('/quality/rework-per-task', qualityGuard, controller.reworkPerTask);
router.get('/quality/rejection-by-category', qualityGuard, controller.rejectionByCategory);
router.get('/quality/rejection-by-post-type', qualityGuard, controller.rejectionByPostType);
router.get('/quality/rejection-by-target', qualityGuard, controller.rejectionByTarget);
router.get('/quality/ranking', qualityGuard, controller.ranking);
router.get('/quality/volume-timeseries', qualityGuard, controller.volumeTimeseries);

module.exports = router;
```

- [ ] **Step 3: Mount in `app.js`**

Open `server/src/app.js`. Near the top where other routes are imported, add:

```js
const reportsRoutes = require('./modules/reports/reports.routes');
```

Near where other routes are mounted (search for `app.use('/api/approvals'`), add:

```js
app.use('/api/reports', reportsRoutes);
```

- [ ] **Step 4: Write the integration tests**

Create `server/src/modules/reports/reports.routes.test.js`:

```js
const request = require('supertest');
const express = require('express');

const userForRequest = { id: 'u1', role: 'manager' };

jest.mock('../../middleware/auth', () => ({
  authenticate: (req, _res, next) => { req.user = userForRequest; next(); },
}));

jest.mock('./reports.service', () => ({
  firstApprovalRate: jest.fn().mockResolvedValue([{ producerId: 'p1', producerName: 'x', rate: 0.5, total: 2, firstApproved: 1 }]),
  rejectionRate: jest.fn().mockResolvedValue([]),
  reworkPerTask: jest.fn().mockResolvedValue([]),
  rejectionByCategory: jest.fn().mockResolvedValue([]),
  rejectionByPostType: jest.fn().mockResolvedValue([]),
  rejectionByTarget: jest.fn().mockResolvedValue([]),
  ranking: jest.fn().mockResolvedValue([{ producerId: 'p1', volume: 2, firstApprovalRate: 0.5, score: 1 }]),
  volumeTimeseries: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/reports', require('./reports.routes'));
  return app;
}

describe('GET /api/reports/quality — happy paths', () => {
  beforeEach(() => { userForRequest.role = 'manager'; });

  test('first-approval-rate returns 200 with the service payload', async () => {
    const res = await request(buildApp())
      .get('/api/reports/quality/first-approval-rate')
      .query({ start: '2026-04-01', end: '2026-04-30' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].producerId).toBe('p1');
  });

  test('ranking returns 200', async () => {
    const res = await request(buildApp())
      .get('/api/reports/quality/ranking')
      .query({ start: '2026-04-01', end: '2026-04-30' });
    expect(res.status).toBe(200);
  });

  test('400 when start / end missing', async () => {
    const res = await request(buildApp())
      .get('/api/reports/quality/first-approval-rate');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/reports/quality — scoping', () => {
  test('producer sees only their own row in ranking', async () => {
    userForRequest.role = 'producer';
    userForRequest.id = 'p1';
    const res = await request(buildApp())
      .get('/api/reports/quality/ranking')
      .query({ start: '2026-04-01', end: '2026-04-30', producerId: 'someoneElse' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].producerId).toBe('p1');
  });

  test('account_manager gets 403 on quality', async () => {
    userForRequest.role = 'account_manager';
    const res = await request(buildApp())
      .get('/api/reports/quality/first-approval-rate')
      .query({ start: '2026-04-01', end: '2026-04-30' });
    expect(res.status).toBe(403);
  });

  test('client gets 403 on quality', async () => {
    userForRequest.role = 'client';
    const res = await request(buildApp())
      .get('/api/reports/quality/ranking')
      .query({ start: '2026-04-01', end: '2026-04-30' });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 5: Run the tests**

```bash
cd /home/dev/projetos/server && npx jest src/modules/reports
```

Expected: all Reports tests pass.

- [ ] **Step 6: Run full suite**

```bash
cd /home/dev/projetos/server && npx jest --silent
```

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add server/src/modules/reports/reports.controller.js server/src/modules/reports/reports.routes.js server/src/modules/reports/reports.routes.test.js server/src/app.js
git -c safe.directory=/home/dev/projetos commit -m "feat(reports): HTTP endpoints for Quality metrics

Eight endpoints under /api/reports/quality/* validate the query
range with Joi (400 on missing start/end), delegate to the
matching reports.service function, and respect reportsAuth scoping
— producers get their own row filtered at the controller layer,
account_manager and client get 403. Supertest covers happy paths,
validation error, producer-scoping, and the two 403 cases."
```

---

### Task 6: Frontend — page shell + filter bar + menu + service

**Files:**
- Create: `client/src/services/reports.js`
- Create: `client/src/pages/ReportsPage.jsx`
- Create: `client/src/components/reports/FilterBar.jsx`
- Create: `client/src/components/reports/KpiCard.jsx`
- Modify: `client/src/components/layout/Sidebar.jsx` — add "Relatórios" menu item.
- Modify: `client/src/App.jsx` — add `/relatorios` route.

- [ ] **Step 1: Create the API service**

Create `client/src/services/reports.js`:

```js
import api from './api';

function qs(params) {
  const cleaned = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  return cleaned;
}

export const reportsApi = {
  firstApprovalRate: (params) => api.get('/reports/quality/first-approval-rate', { params: qs(params) }).then((r) => r.data),
  rejectionRate: (params) => api.get('/reports/quality/rejection-rate', { params: qs(params) }).then((r) => r.data),
  reworkPerTask: (params) => api.get('/reports/quality/rework-per-task', { params: qs(params) }).then((r) => r.data),
  rejectionByCategory: (params) => api.get('/reports/quality/rejection-by-category', { params: qs(params) }).then((r) => r.data),
  rejectionByPostType: (params) => api.get('/reports/quality/rejection-by-post-type', { params: qs(params) }).then((r) => r.data),
  rejectionByTarget: (params) => api.get('/reports/quality/rejection-by-target', { params: qs(params) }).then((r) => r.data),
  ranking: (params) => api.get('/reports/quality/ranking', { params: qs(params) }).then((r) => r.data),
  volumeTimeseries: (params) => api.get('/reports/quality/volume-timeseries', { params: qs(params) }).then((r) => r.data),
};
```

- [ ] **Step 2: Create the `FilterBar` component**

Create `client/src/components/reports/FilterBar.jsx`:

```jsx
import { useEffect, useState } from 'react';
import api from '@/services/api';

function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export default function FilterBar({ filters, onChange }) {
  const [clients, setClients] = useState([]);
  const [producers, setProducers] = useState([]);

  useEffect(() => {
    api.get('/clients').then((r) => setClients(r.data || [])).catch(() => setClients([]));
    api.get('/users').then((r) => setProducers((r.data || []).filter((u) => u.role === 'producer'))).catch(() => setProducers([]));
  }, []);

  useEffect(() => {
    if (!filters.start || !filters.end) onChange({ ...filters, ...defaultRange() });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-wrap gap-3 items-end mb-4 p-3 rounded-lg border border-border bg-card">
      <div className="flex flex-col">
        <label className="text-xs text-muted-foreground mb-1">De</label>
        <input
          type="date"
          value={filters.start || ''}
          onChange={(e) => onChange({ ...filters, start: e.target.value })}
          className="px-2 py-1 rounded border border-border bg-background text-sm"
        />
      </div>
      <div className="flex flex-col">
        <label className="text-xs text-muted-foreground mb-1">Até</label>
        <input
          type="date"
          value={filters.end || ''}
          onChange={(e) => onChange({ ...filters, end: e.target.value })}
          className="px-2 py-1 rounded border border-border bg-background text-sm"
        />
      </div>
      <div className="flex flex-col">
        <label className="text-xs text-muted-foreground mb-1">Cliente</label>
        <select
          value={filters.clientId || ''}
          onChange={(e) => onChange({ ...filters, clientId: e.target.value || undefined })}
          className="px-2 py-1 rounded border border-border bg-background text-sm min-w-[160px]"
        >
          <option value="">Todos</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="flex flex-col">
        <label className="text-xs text-muted-foreground mb-1">Produtor</label>
        <select
          value={filters.producerId || ''}
          onChange={(e) => onChange({ ...filters, producerId: e.target.value || undefined })}
          className="px-2 py-1 rounded border border-border bg-background text-sm min-w-[160px]"
        >
          <option value="">Todos</option>
          {producers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create the `KpiCard` component**

Create `client/src/components/reports/KpiCard.jsx`:

```jsx
export default function KpiCard({ label, value, subtitle }) {
  return (
    <div className="flex flex-col p-4 rounded-lg border border-border bg-card min-w-[160px]">
      <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="text-2xl font-semibold text-foreground">{value}</span>
      {subtitle && <span className="text-xs text-muted-foreground mt-1">{subtitle}</span>}
    </div>
  );
}
```

- [ ] **Step 4: Create the page shell**

Create `client/src/pages/ReportsPage.jsx`:

```jsx
import { useState } from 'react';
import FilterBar from '@/components/reports/FilterBar';
import QualityTab from '@/components/reports/QualityTab';

const TABS = [
  { key: 'quality', label: 'Qualidade' },
  { key: 'capacity', label: 'Capacidade' },
  { key: 'client', label: 'Cliente' },
];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('quality');
  const [filters, setFilters] = useState({});

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <h1 className="text-2xl font-semibold text-foreground mb-4">Relatórios</h1>

      <div className="flex gap-1 mb-4 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              activeTab === tab.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <FilterBar filters={filters} onChange={setFilters} />

      {activeTab === 'quality' && <QualityTab filters={filters} />}
      {activeTab === 'capacity' && <p className="text-muted-foreground text-sm py-12 text-center">Em construção (Fase 2).</p>}
      {activeTab === 'client' && <p className="text-muted-foreground text-sm py-12 text-center">Em construção (Fase 3).</p>}
    </div>
  );
}
```

- [ ] **Step 5: Add the route in `App.jsx`**

Open `client/src/App.jsx`. Find the line registering `/ranking`:

```jsx
<Route path="/ranking" element={
  <ProtectedRoute roles={ALL_INTERNAL}><RankingPage /></ProtectedRoute>
} />
```

Immediately above it add:

```jsx
<Route path="/relatorios" element={
  <ProtectedRoute roles={ALL_INTERNAL}><ReportsPage /></ProtectedRoute>
} />
```

Also add the import at the top of `App.jsx` next to the other page imports:

```jsx
import ReportsPage from '@/pages/ReportsPage';
```

- [ ] **Step 6: Add the menu item**

Open `client/src/components/layout/Sidebar.jsx`. In the `navItems` object, find each of the roles that should see the page — `dev`, `ceo`, `director`, `manager`, `producer`, `account_manager` — and insert a new item immediately above the existing `/ranking` entry (or before `/settings` for account_manager, which does not have `/ranking`). The item shape:

```jsx
{ to: '/relatorios', icon: BarChart3, label: 'Relatórios' },
```

`BarChart3` is already imported (check the import list at the top; it is used for `/deliveries`). No new import needed.

For `account_manager`, add it right above the last entry so the array becomes:

```jsx
account_manager: [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/clients', icon: Package, label: 'Clientes' },
  { to: '/deliveries', icon: BarChart3, label: 'Entregas' },
  { to: '/schedule', icon: CalendarDays, label: 'Agenda' },
  { to: '/relatorios', icon: BarChart3, label: 'Relatórios' },
],
```

Do NOT add the item to `client` role.

- [ ] **Step 7: Smoke-test the frontend builds**

```bash
cd /home/dev/projetos/client && npm run build
```

Expected: build succeeds without errors.

- [ ] **Step 8: Commit**

```bash
git add client/src/services/reports.js client/src/pages/ReportsPage.jsx client/src/components/reports/FilterBar.jsx client/src/components/reports/KpiCard.jsx client/src/components/layout/Sidebar.jsx client/src/App.jsx
git -c safe.directory=/home/dev/projetos commit -m "feat(reports-ui): page shell, filter bar, menu entry

ReportsPage shows three tabs (Qualidade, Capacidade, Cliente); the
last two render a placeholder until Phases 2 and 3 ship. FilterBar
is shared across all tabs and defaults to the last 30 days. The
reports service (services/reports.js) wraps the eight Quality
endpoints. Sidebar gets a new 'Relatórios' entry for every internal
role except 'client'."
```

---

### Task 7: Frontend — Quality tab widgets

**Files:**
- Create: `client/src/components/reports/QualityTab.jsx`
- Create: `client/src/components/reports/ProducerRankingTable.jsx`
- Create: `client/src/components/reports/charts/VolumeTimeSeriesChart.jsx`
- Create: `client/src/components/reports/charts/RejectionBreakdownChart.jsx`

- [ ] **Step 1: Create the ranking table**

Create `client/src/components/reports/ProducerRankingTable.jsx`:

```jsx
const PRODUCER_TYPE_LABELS = {
  designer: 'Designer',
  video_editor: 'Editor de Vídeo',
  captation: 'Captação',
  social_media: 'Social Media',
};

function fmtPct(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${Math.round(n * 100)}%`;
}

export default function ProducerRankingTable({ rows, reworkByProducer }) {
  if (!rows || rows.length === 0) return <p className="text-sm text-muted-foreground">Sem dados no período.</p>;

  const reworkMap = new Map((reworkByProducer || []).map((r) => [r.producerId, r.avgRework]));

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left p-3">#</th>
            <th className="text-left p-3">Produtor</th>
            <th className="text-left p-3">Função</th>
            <th className="text-right p-3">Volume</th>
            <th className="text-right p-3">Aprov. 1ª</th>
            <th className="text-right p-3">Retrabalho (média)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.producerId} className="border-t border-border">
              <td className="p-3">{i + 1}</td>
              <td className="p-3 font-medium">{r.producerName}</td>
              <td className="p-3 text-muted-foreground">{PRODUCER_TYPE_LABELS[r.producerType] || '—'}</td>
              <td className="p-3 text-right">{r.volume}</td>
              <td className="p-3 text-right">{fmtPct(r.firstApprovalRate)}</td>
              <td className="p-3 text-right">{reworkMap.has(r.producerId) ? reworkMap.get(r.producerId).toFixed(2) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Create the timeseries chart**

Create `client/src/components/reports/charts/VolumeTimeSeriesChart.jsx`:

```jsx
import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#9A48EA', '#3B82F6', '#F59E0B', '#10B981', '#EF4444', '#06B6D4', '#8B5CF6'];

export default function VolumeTimeSeriesChart({ data, granularity, onGranularityChange }) {
  const [buckets, producerIds] = useMemo(() => {
    const bucketSet = new Set();
    const idSet = new Set();
    for (const r of data || []) {
      bucketSet.add(r.bucket);
      idSet.add(r.producerId);
    }
    return [[...bucketSet].sort(), [...idSet]];
  }, [data]);

  const series = useMemo(() => {
    return buckets.map((bucket) => {
      const row = { bucket };
      for (const pid of producerIds) {
        const match = (data || []).find((r) => r.bucket === bucket && r.producerId === pid);
        row[pid] = match ? match.count : 0;
      }
      return row;
    });
  }, [buckets, producerIds, data]);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-foreground">Volume por período</h3>
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
            <YAxis fontSize={11} />
            <Tooltip />
            <Legend />
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

- [ ] **Step 3: Create the breakdown chart**

Create `client/src/components/reports/charts/RejectionBreakdownChart.jsx`:

```jsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const COLORS = ['#9A48EA', '#3B82F6', '#F59E0B', '#10B981', '#EF4444', '#06B6D4', '#8B5CF6'];

export default function RejectionBreakdownChart({ title, data, labelKey, valueKey }) {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-medium text-foreground mb-3">{title}</h3>
        <p className="text-sm text-muted-foreground py-8 text-center">Sem dados no período.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-medium text-foreground mb-3">{title}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={labelKey} fontSize={11} />
          <YAxis fontSize={11} />
          <Tooltip />
          <Bar dataKey={valueKey}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 4: Create the Quality tab that composes everything**

Create `client/src/components/reports/QualityTab.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { reportsApi } from '@/services/reports';
import KpiCard from './KpiCard';
import ProducerRankingTable from './ProducerRankingTable';
import VolumeTimeSeriesChart from './charts/VolumeTimeSeriesChart';
import RejectionBreakdownChart from './charts/RejectionBreakdownChart';

function fmtPct(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${Math.round(n * 100)}%`;
}

export default function QualityTab({ filters }) {
  const [loading, setLoading] = useState(true);
  const [ranking, setRanking] = useState([]);
  const [firstApproval, setFirstApproval] = useState([]);
  const [rejectionRate, setRejectionRate] = useState([]);
  const [rework, setRework] = useState([]);
  const [byCategory, setByCategory] = useState([]);
  const [byPostType, setByPostType] = useState([]);
  const [byTarget, setByTarget] = useState([]);
  const [timeseries, setTimeseries] = useState([]);
  const [granularity, setGranularity] = useState('day');

  useEffect(() => {
    if (!filters.start || !filters.end) return;
    setLoading(true);
    const params = { start: filters.start, end: filters.end, clientId: filters.clientId, producerId: filters.producerId };
    Promise.all([
      reportsApi.ranking(params),
      reportsApi.firstApprovalRate(params),
      reportsApi.rejectionRate(params),
      reportsApi.reworkPerTask(params),
      reportsApi.rejectionByCategory(params),
      reportsApi.rejectionByPostType(params),
      reportsApi.rejectionByTarget(params),
      reportsApi.volumeTimeseries({ ...params, granularity }),
    ]).then(([rRanking, rFirst, rRej, rRew, rCat, rPt, rTar, rTs]) => {
      setRanking(rRanking);
      setFirstApproval(rFirst);
      setRejectionRate(rRej);
      setRework(rRew);
      setByCategory(rCat);
      setByPostType(rPt);
      setByTarget(rTar);
      setTimeseries(rTs);
    }).catch(() => {
      toast.error('Erro ao carregar relatórios');
    }).finally(() => setLoading(false));
  }, [filters.start, filters.end, filters.clientId, filters.producerId, granularity]);

  const totalTasks = ranking.reduce((sum, r) => sum + (r.volume || 0), 0);
  const avgFirstApproval = firstApproval.length
    ? firstApproval.reduce((sum, r) => sum + (r.rate || 0), 0) / firstApproval.length
    : null;
  const avgRejection = rejectionRate.length
    ? rejectionRate.reduce((sum, r) => sum + (r.rate || 0), 0) / rejectionRate.length
    : null;
  const avgRework = rework.length
    ? rework.reduce((sum, r) => sum + (r.avgRework || 0), 0) / rework.length
    : null;

  if (loading) return <p className="text-sm text-muted-foreground py-12 text-center">Carregando…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <KpiCard label="Total tasks" value={totalTasks} />
        <KpiCard label="% aprov. 1ª (média)" value={fmtPct(avgFirstApproval)} />
        <KpiCard label="% reprovação (média)" value={fmtPct(avgRejection)} />
        <KpiCard label="Retrabalho médio" value={avgRework !== null ? avgRework.toFixed(2) : '—'} />
      </div>

      <ProducerRankingTable rows={ranking} reworkByProducer={rework} />

      <VolumeTimeSeriesChart data={timeseries} granularity={granularity} onGranularityChange={setGranularity} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RejectionBreakdownChart title="Reprovações por categoria" data={byCategory} labelKey="category" valueKey="count" />
        <RejectionBreakdownChart title="Reprovações por tipo de post" data={byPostType} labelKey="postType" valueKey="rejected" />
      </div>

      <RejectionBreakdownChart title="Reprovações por alvo (capa / vídeo)" data={byTarget} labelKey="target" valueKey="count" />
    </div>
  );
}
```

- [ ] **Step 5: Smoke-test the build**

```bash
cd /home/dev/projetos/client && npm run build
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/reports/QualityTab.jsx client/src/components/reports/ProducerRankingTable.jsx client/src/components/reports/charts/VolumeTimeSeriesChart.jsx client/src/components/reports/charts/RejectionBreakdownChart.jsx
git -c safe.directory=/home/dev/projetos commit -m "feat(reports-ui): Quality tab with KPIs, ranking, timeseries and breakdowns

QualityTab composes four KpiCards (total tasks, first-approval %,
rejection %, avg rework), a ProducerRankingTable ordered by volume,
a VolumeTimeSeriesChart with day/week/month/year toggle, and three
RejectionBreakdownCharts (by category, by post type, by cover/video
target). All powered by the eight /api/reports/quality endpoints.
recharts is already a dependency."
```

---

### Task 8: Manual verification in production

**Files:** none (prod smoke test).

- [ ] **Step 1: Deploy**

Push commits and wait for Railway to redeploy. Both `server` and `client` services redeploy automatically on master push.

- [ ] **Step 2: Verify rejection category persists**

In the public approval page for any pending batch, reject an item. The dropdown should require a category selection. After submitting, query the DB:

```bash
DATABASE_URL="postgresql://postgres:omnpQxZihGaOPuiYUoCfKaFbcabzRbgj@nozomi.proxy.rlwy.net:57344/railway" node -e "
const knex = require('/home/dev/projetos/server/node_modules/knex')({ client: 'pg', connection: process.env.DATABASE_URL });
(async () => {
  const rows = await knex('approval_items').whereNotNull('rejection_category').orderBy('responded_at', 'desc').limit(3).select('id','rejection_category','rejection_target','responded_at');
  console.log(JSON.stringify(rows, null, 2));
  await knex.destroy();
})();
"
```

Expected: the most recent reject row has `rejection_category` populated.

- [ ] **Step 3: Visit `/relatorios` in the TasksLudus frontend**

Log in as a management user. Open Relatórios → Qualidade. The page should render the KPI row, the ranking, the volume chart, and the three breakdown charts with real data. Try switching day/week/month/year on the timeseries.

- [ ] **Step 4: Verify producer-scoped view**

Log in as a producer. Open Relatórios → Qualidade. Confirm only their own row appears in the ranking; the KPIs reflect only their data.

- [ ] **Step 5: Verify 403**

As an account_manager, confirm the API call `/api/reports/quality/ranking` returns 403 in the Network tab (the UI shows the error toast).

No commit — this is a manual gate before closing the phase.

---

## Self-Review (done)

- **Spec coverage (every Fase 1 item in `docs/superpowers/specs/2026-04-16-production-metrics-reports-design.md`):**
  - Migration + dropdown + persistence → Tasks 1, 2.
  - `reportsAuth` middleware → Task 3.
  - Eight quality service functions + unit tests → Task 4.
  - Controller + routes + integration tests + app.js mount → Task 5.
  - Frontend shell, filter bar, menu, route, KpiCard → Task 6.
  - Quality tab composing all widgets → Task 7.
  - Production verification → Task 8.
- **Placeholder scan:** no "TBD", no "similar to", no "handle edge cases" without showing how — every code step contains the code an engineer would paste.
- **Type consistency:** service function names match between `reports.service.js` (Task 4), `reports.controller.js` (Task 5), and `client/src/services/reports.js` (Task 6). The `{ producerId, producerName, producerType, volume, firstApprovalRate, rate, total, rejected, avgRework, category, postType, target, bucket, count, score }` property names match between service tests, controller output, and the frontend renderers.
- **Scope:** Fase 1 only. Capacity (Fase 2) and Client (Fase 3) are explicitly placeholders on the page and will be separate plans.
