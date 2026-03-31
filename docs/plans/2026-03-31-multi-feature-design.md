# Multi-Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rename caption to Legenda, enforce formato, categorize clients by Health/Experts, create dev role, and create dev user account.

**Architecture:** UI label changes + validation enforcement in PostReviewSheet, new DB column `category` on clients table with UI grouping, new `dev` role that bypasses all auth checks while restricting Goals/Boost/Cargos to dev-only.

**Tech Stack:** React 19, Tailwind v4, Shadcn/ui, Express 4, Knex 3.x (Postgres), bcrypt

---

### Task 1: Rename "Caption" to "Legenda" in PostReviewView

**Files:**
- Modify: `client/src/components/instagram/PostReviewView.jsx:220`

**Step 1: Change the label**

In `PostReviewView.jsx`, line 220, change:
```jsx
<Label className="text-sm font-semibold">Caption</Label>
```
to:
```jsx
<Label className="text-sm font-semibold">Legenda</Label>
```

**Step 2: Commit**
```bash
git add client/src/components/instagram/PostReviewView.jsx
git commit -m "fix: rename Caption label to Legenda in PostReviewView"
```

---

### Task 2: Make Formato required for all actions in PostReviewSheet

**Files:**
- Modify: `client/src/components/instagram/PostReviewSheet.jsx`

**Step 1: Add format guard to handleSaveDraft**

In `PostReviewSheet.jsx`, at the beginning of `handleSaveDraft()` (line 103-104), add a format check:

```javascript
async function handleSaveDraft() {
    if (!hasFormat) {
      return toast.error('Selecione o formato do post');
    }
    setSaving(true);
```

**Step 2: Disable "Salvar Rascunho" button when no format**

In the SheetFooter (line 433-441), add `!hasFormat` to the disabled condition:

Change:
```jsx
<Button
  variant="outline"
  size="sm"
  onClick={handleSaveDraft}
  disabled={saving}
>
```
to:
```jsx
<Button
  variant="outline"
  size="sm"
  onClick={handleSaveDraft}
  disabled={saving || !hasFormat}
>
```

**Step 3: Commit**
```bash
git add client/src/components/instagram/PostReviewSheet.jsx
git commit -m "feat: require formato selection for all post actions"
```

---

### Task 3: Add `category` column to clients table

**Files:**
- Create: `server/src/database/migrations/021_clients_category.js`

**Step 1: Create migration**

```javascript
/**
 * @param {import('knex').Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.alterTable('clients', (table) => {
    table.string('category').nullable(); // 'health' or 'experts'
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('clients', (table) => {
    table.dropColumn('category');
  });
};
```

**Step 2: Create data migration to populate existing clients**

Create: `server/src/database/migrations/022_populate_clients_category.js`

```javascript
// ClickUp list ID → category mapping from workspace data
const HEALTH_LISTS = ['901113287382', '901113287385', '901113287468', '901113287473', '901113351972'];
const EXPERTS_LISTS = ['901113286851', '901113287367', '901113287397', '901113287408'];

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
  for (const listId of HEALTH_LISTS) {
    await knex('clients').where('clickup_list_id', listId).update({ category: 'health' });
  }
  for (const listId of EXPERTS_LISTS) {
    await knex('clients').where('clickup_list_id', listId).update({ category: 'experts' });
  }
};

exports.down = async function (knex) {
  await knex('clients').update({ category: null });
};
```

**Step 3: Run migrations**
```bash
cd server && npx knex migrate:latest
```
Expected: both migrations applied successfully.

**Step 4: Commit**
```bash
git add server/src/database/migrations/021_clients_category.js server/src/database/migrations/022_populate_clients_category.js
git commit -m "feat: add category column to clients (health/experts)"
```

---

### Task 4: Update server validation and service for client category

**Files:**
- Modify: `server/src/modules/clients/clients.validation.js`

**Step 1: Add category to both schemas**

In `clients.validation.js`, add to `createClientSchema`:
```javascript
category: Joi.string().valid('health', 'experts').allow(null, '').optional(),
```

Add the same line to `updateClientSchema`.

**Step 2: Commit**
```bash
git add server/src/modules/clients/clients.validation.js
git commit -m "feat: accept category field in client validation schemas"
```

---

### Task 5: Update ClientsPage to show category in form and group by category

**Files:**
- Modify: `client/src/pages/ClientsPage.jsx`

**Step 1: Add category to EMPTY_FORM**

```javascript
const EMPTY_FORM = {
  name: '',
  company: '',
  instagram_account: '',
  user_id: '',
  is_active: true,
  clickup_list_id: '',
  automations_enabled: false,
  category: '',
};
```

**Step 2: Add category to openEdit form population** (line 97-105)

Add `category: c.category || ''` to the form object in `openEdit`.

**Step 3: Add category Select to the client form**

In the form view, inside the first Card's grid (after the name/company row, around line 363), add:

```jsx
<div className="space-y-2">
  <Label htmlFor="category">Divisão</Label>
  <Select
    value={form.category || '_none'}
    onValueChange={(val) => setForm({ ...form, category: val === '_none' ? '' : val })}
  >
    <SelectTrigger id="category">
      <SelectValue placeholder="Selecione a divisão" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="_none">Nenhuma</SelectItem>
      <SelectItem value="health">Ludus Health</SelectItem>
      <SelectItem value="experts">Ludus Experts</SelectItem>
    </SelectContent>
  </Select>
</div>
```

**Step 4: Group clients by category in the list view**

Replace the single grid with grouped sections. Compute grouped clients:

```javascript
const groupedClients = useMemo(() => {
  const health = filteredClients.filter((c) => c.category === 'health');
  const experts = filteredClients.filter((c) => c.category === 'experts');
  const other = filteredClients.filter((c) => !c.category || (c.category !== 'health' && c.category !== 'experts'));
  const groups = [];
  if (health.length > 0) groups.push({ label: 'Ludus Health', clients: health });
  if (experts.length > 0) groups.push({ label: 'Ludus Experts', clients: experts });
  if (other.length > 0) groups.push({ label: 'Outros', clients: other });
  return groups;
}, [filteredClients]);
```

Replace the grid section (lines 204-315) with:

```jsx
{groupedClients.length > 0 ? (
  <div className="space-y-8">
    {groupedClients.map(({ label, clients: groupClients }) => (
      <div key={label}>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">{label}</h2>
          <span className="text-xs text-zinc-600">({groupClients.length})</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {groupClients.map((c) => (
            /* existing Card component — keep identical */
          ))}
        </div>
      </div>
    ))}
  </div>
) : (
  /* existing empty state */
)}
```

Keep the existing Card JSX inside the map — just wrap it in the grouped structure.

**Step 5: Commit**
```bash
git add client/src/pages/ClientsPage.jsx
git commit -m "feat: group clients by Ludus Health / Experts on clients page"
```

---

### Task 6: Add "dev" role to server auth middleware

**Files:**
- Modify: `server/src/middleware/auth.js`

**Step 1: Add dev bypass to all role-check functions**

The simplest approach: add a `isDev` check at the top of each function.

In `authorize()`:
```javascript
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (req.user.role === 'dev') return next();
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
```

In `ceoOnly()`:
```javascript
function ceoOnly(req, res, next) {
  if (req.user.role === 'dev') return next();
  if (req.user.role !== 'ceo') {
    return res.status(403).json({ error: 'CEO access only' });
  }
  next();
}
```

In `adminLevel()`:
```javascript
function adminLevel(req, res, next) {
  if (req.user.role === 'dev') return next();
  if (!['ceo', 'director'].includes(req.user.role)) {
    return res.status(403).json({ error: 'CEO or Director access only' });
  }
  next();
}
```

In `managementLevel()`:
```javascript
function managementLevel(req, res, next) {
  if (req.user.role === 'dev') return next();
  if (!['ceo', 'director', 'manager'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Management access only' });
  }
  next();
}
```

In `managementOrSocialMedia()`:
```javascript
function managementOrSocialMedia(req, res, next) {
  if (req.user.role === 'dev') return next();
  if (['ceo', 'director', 'manager'].includes(req.user.role)) {
    return next();
  }
  if (req.user.role === 'producer' && req.user.producer_type === 'social_media') {
    return next();
  }
  return res.status(403).json({ error: 'Management or Social Media access only' });
}
```

**Step 2: Commit**
```bash
git add server/src/middleware/auth.js
git commit -m "feat: add dev role with full server-side access bypass"
```

---

### Task 7: Add "dev" role to client-side roles and constants

**Files:**
- Modify: `client/src/lib/roles.js`
- Modify: `client/src/lib/constants.js`

**Step 1: Update roles.js**

```javascript
const MANAGEMENT_ROLES = ['dev', 'ceo', 'director', 'manager'];
const ADMIN_ROLES = ['dev', 'ceo', 'director'];

export function isManagement(role) {
  return MANAGEMENT_ROLES.includes(role);
}

export function isAdmin(role) {
  return ADMIN_ROLES.includes(role);
}

export function isCeo(role) {
  return role === 'ceo' || role === 'dev';
}

export function isDev(role) {
  return role === 'dev';
}
```

**Step 2: Update constants.js ROLE_LABELS**

Add `dev: 'Dev'` to ROLE_LABELS:
```javascript
export const ROLE_LABELS = {
  dev: 'Dev',
  ceo: 'CEO',
  director: 'Diretor',
  manager: 'Gerente',
  account_manager: 'Atendimento',
  producer: 'Produtor',
  client: 'Cliente',
};
```

**Step 3: Commit**
```bash
git add client/src/lib/roles.js client/src/lib/constants.js
git commit -m "feat: add dev role to client-side role helpers and constants"
```

---

### Task 8: Update Sidebar and App.jsx for dev role + restrict Goals/Boost/Cargos

**Files:**
- Modify: `client/src/components/layout/Sidebar.jsx`
- Modify: `client/src/App.jsx`

**Step 1: Update Sidebar navItems**

Add `dev` key with ALL pages (superset of CEO). Remove Goals, Boost, Cargos from other roles:

```javascript
const navItems = {
  dev: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/users', icon: Users, label: 'Equipe' },
    { to: '/goals', icon: Target, label: 'Metas' },
    { to: '/boost', icon: Calculator, label: 'Boost' },
    { to: '/roles', icon: Wallet, label: 'Cargos' },
    { to: '/clients', icon: Package, label: 'Clientes' },
    { to: '/deliveries', icon: BarChart3, label: 'Entregas' },
    { to: '/schedule', icon: CalendarDays, label: 'Agenda' },
    { to: '/ranking', icon: Trophy, label: 'Ranking' },
    { to: '/comofunciona', icon: Rocket, label: 'Como funciona' },
    { to: '/settings', icon: Sliders, label: 'Config' },
  ],
  ceo: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/users', icon: Users, label: 'Equipe' },
    { to: '/clients', icon: Package, label: 'Clientes' },
    { to: '/deliveries', icon: BarChart3, label: 'Entregas' },
    { to: '/schedule', icon: CalendarDays, label: 'Agenda' },
    { to: '/ranking', icon: Trophy, label: 'Ranking' },
    { to: '/comofunciona', icon: Rocket, label: 'Como funciona' },
    { to: '/settings', icon: Sliders, label: 'Config' },
  ],
  director: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/users', icon: Users, label: 'Equipe' },
    { to: '/clients', icon: Package, label: 'Clientes' },
    { to: '/deliveries', icon: BarChart3, label: 'Entregas' },
    { to: '/schedule', icon: CalendarDays, label: 'Agenda' },
    { to: '/ranking', icon: Trophy, label: 'Ranking' },
    { to: '/comofunciona', icon: Rocket, label: 'Como funciona' },
  ],
  manager: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/users', icon: Users, label: 'Equipe' },
    { to: '/clients', icon: Package, label: 'Clientes' },
    { to: '/deliveries', icon: BarChart3, label: 'Entregas' },
    { to: '/schedule', icon: CalendarDays, label: 'Agenda' },
    { to: '/ranking', icon: Trophy, label: 'Ranking' },
  ],
  account_manager: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/clients', icon: Package, label: 'Clientes' },
    { to: '/deliveries', icon: BarChart3, label: 'Entregas' },
    { to: '/schedule', icon: CalendarDays, label: 'Agenda' },
  ],
  producer: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/deliveries', icon: BarChart3, label: 'Entregas' },
    { to: '/simulator', icon: TrendingUp, label: 'Simulador' },
    { to: '/comofunciona', icon: Rocket, label: 'Como funciona' },
    { to: '/ranking', icon: Trophy, label: 'Ranking' },
  ],
  client: [
    { to: '/portal', icon: LayoutDashboard, label: 'Portal' },
  ],
};
```

**Step 2: Update App.jsx role arrays and route guards**

```javascript
const MANAGEMENT = ['dev', 'ceo', 'director', 'manager'];
const ADMIN = ['dev', 'ceo', 'director'];
const ALL_INTERNAL = ['dev', 'ceo', 'director', 'manager', 'account_manager', 'producer'];
```

Change restricted routes:
```jsx
<Route path="/goals" element={
  <ProtectedRoute roles={['dev']}><GoalsPage /></ProtectedRoute>
} />
<Route path="/boost" element={
  <ProtectedRoute roles={['dev']}><CalculationsPage /></ProtectedRoute>
} />
<Route path="/roles" element={
  <ProtectedRoute roles={['dev']}><SalariesPage /></ProtectedRoute>
} />
<Route path="/settings" element={
  <ProtectedRoute roles={['dev', 'ceo']}><SettingsPage /></ProtectedRoute>
} />
<Route path="/simulator" element={
  <ProtectedRoute roles={['dev', 'producer']}><SimulatorPage /></ProtectedRoute>
} />
```

**Step 3: Commit**
```bash
git add client/src/components/layout/Sidebar.jsx client/src/App.jsx
git commit -m "feat: restrict Goals/Boost/Cargos to dev role only, add dev to all nav"
```

---

### Task 9: Create dev user account via migration

**Files:**
- Create: `server/src/database/migrations/023_create_dev_user.js`

**Step 1: Create migration**

```javascript
const bcrypt = require('bcrypt');

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
  const existing = await knex('users').where('email', 'igor@igor.com').first();
  if (existing) return;

  const passwordHash = await bcrypt.hash('052446', 10);
  await knex('users').insert({
    name: 'Igor',
    email: 'igor@igor.com',
    password_hash: passwordHash,
    role: 'dev',
    is_active: true,
  });
};

exports.down = async function (knex) {
  await knex('users').where('email', 'igor@igor.com').del();
};
```

**Step 2: Run migration**
```bash
cd server && npx knex migrate:latest
```
Expected: migration applied, user created.

**Step 3: Commit**
```bash
git add server/src/database/migrations/023_create_dev_user.js
git commit -m "feat: create dev user igor@igor.com via migration"
```

---

## Summary of all changes

| # | What | Files |
|---|------|-------|
| 1 | Caption → Legenda | PostReviewView.jsx |
| 2 | Formato required | PostReviewSheet.jsx |
| 3 | clients.category column | 021 + 022 migrations |
| 4 | category validation | clients.validation.js |
| 5 | Clients page grouping + form | ClientsPage.jsx |
| 6 | dev role server auth | auth.js middleware |
| 7 | dev role client helpers | roles.js, constants.js |
| 8 | Sidebar + routes restriction | Sidebar.jsx, App.jsx |
| 9 | dev user account | 023 migration |

**Already working (no changes):** ClickUp "Legenda" → caption, ClickUp "Entrega" → scheduled_at (in clickup.service.js autoCreateScheduledPost).
