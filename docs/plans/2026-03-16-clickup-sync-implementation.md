# ClickUp Full Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Import all ClickUp workspace data (members, clients, tasks) into the database via a CEO-only sync endpoint, with the existing webhook keeping things updated afterwards.

**Architecture:** New `clickup-sync.service.js` fetches ClickUp API sequentially (team members → spaces/folders/lists → tasks per list), upserts into `users`, `clients`, `deliveries` tables. Single `POST /api/clickup/sync` endpoint. Frontend button in SettingsPage ClickUp card.

**Tech Stack:** Express, Knex (Postgres), ClickUp REST API v2, existing auth middleware.

---

### Task 1: Add `clickup_list_id` column to clients table

**Files:**
- Create: `server/src/database/migrations/014_clients_clickup_list_id.js`

**Step 1: Create migration**

```js
exports.up = function (knex) {
  return knex.schema.alterTable('clients', (table) => {
    table.string('clickup_list_id').nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('clients', (table) => {
    table.dropColumn('clickup_list_id');
  });
};
```

**Step 2: Run migration**

Run: `cd server && npx knex migrate:latest`
Expected: `Batch N run: 1 migrations`

**Step 3: Commit**

```bash
git add server/src/database/migrations/014_clients_clickup_list_id.js
git commit -m "feat: add clickup_list_id to clients table"
```

---

### Task 2: Create `clickup-sync.service.js`

**Files:**
- Create: `server/src/modules/webhooks/clickup-sync.service.js`
- Reference: `server/src/modules/webhooks/clickup.service.js` (reuse `mapClickUpStatus`, `mapContentType`)

**Step 1: Write the sync service**

```js
const db = require('../../config/db');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const clickupService = require('./clickup.service');

const TEAM_ID = '9011736576';
const MARKETING_SPACE_ID = '90114084559';
const API_BASE = 'https://api.clickup.com/api/v2';

class ClickUpSyncService {
  get headers() {
    return { Authorization: env.clickup.apiToken };
  }

  async fetchJson(url) {
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) {
      throw new Error(`ClickUp API ${res.status}: ${url}`);
    }
    return res.json();
  }

  /**
   * Full sync: members → clients → deliveries
   */
  async fullSync() {
    logger.info('ClickUp full sync started');
    const stats = {
      members: { created: 0, updated: 0 },
      clients: { created: 0, updated: 0 },
      deliveries: { created: 0, updated: 0, total: 0 },
    };

    // 1) Sync team members → users
    await this.syncMembers(stats);

    // 2) Sync spaces/folders/lists → clients
    const lists = await this.syncClients(stats);

    // 3) Sync tasks from each list → deliveries
    for (const list of lists) {
      await this.syncTasks(list.id, list.clientId, stats);
    }

    logger.info('ClickUp full sync complete', stats);
    return stats;
  }

  /**
   * Sync workspace members → users table
   */
  async syncMembers(stats) {
    const data = await this.fetchJson(`${API_BASE}/team/${TEAM_ID}`);
    const members = data.team?.members || [];

    for (const member of members) {
      const cu = member.user;
      const clickupId = String(cu.id);

      // Try match by clickup_id first, then email
      let user = await db('users').where({ clickup_id: clickupId }).first();
      if (!user) {
        user = await db('users').where({ email: cu.email }).first();
      }

      if (user) {
        // Update clickup_id and avatar if missing
        const updates = {};
        if (!user.clickup_id) updates.clickup_id = clickupId;
        if (!user.avatar_url && cu.profilePicture) updates.avatar_url = cu.profilePicture;
        if (Object.keys(updates).length > 0) {
          updates.updated_at = new Date();
          await db('users').where({ id: user.id }).update(updates);
          stats.members.updated++;
        }
      } else {
        // Create new user (no password — needs invite to set one)
        await db('users').insert({
          name: cu.username,
          email: cu.email,
          clickup_id: clickupId,
          avatar_url: cu.profilePicture || null,
          role: cu.role === 1 ? 'ceo' : cu.role === 2 ? 'director' : 'producer',
          is_active: true,
          auto_calc_enabled: true,
        });
        stats.members.created++;
        logger.info(`Created user from ClickUp: ${cu.username} (${cu.email})`);
      }
    }
  }

  /**
   * Sync Marketing space folders/lists → clients table
   * Returns list of { id, name, clientId } for task sync
   */
  async syncClients(stats) {
    const foldersData = await this.fetchJson(`${API_BASE}/space/${MARKETING_SPACE_ID}/folder`);
    const folders = foldersData.folders || [];
    const syncedLists = [];

    for (const folder of folders) {
      for (const list of folder.lists || []) {
        // Skip "Todas as Tasks" global list
        if (list.name.toLowerCase().includes('todas as tasks')) continue;

        const listId = String(list.id);
        const clientName = list.name;
        const company = folder.name; // "Ludus Health" or "Ludus Experts"

        // Match client by clickup_list_id first, then by name (case-insensitive)
        let client = await db('clients').where({ clickup_list_id: listId }).first();
        if (!client) {
          client = await db('clients')
            .whereRaw('LOWER(name) = ?', [clientName.toLowerCase()])
            .first();
        }

        if (client) {
          const updates = {};
          if (!client.clickup_list_id) updates.clickup_list_id = listId;
          if (!client.company && company) updates.company = company;
          if (Object.keys(updates).length > 0) {
            updates.updated_at = new Date();
            await db('clients').where({ id: client.id }).update(updates);
            stats.clients.updated++;
          }
          syncedLists.push({ id: listId, name: clientName, clientId: client.id });
        } else {
          const [newClient] = await db('clients')
            .insert({
              name: clientName,
              company,
              clickup_list_id: listId,
              is_active: true,
            })
            .returning('*');
          stats.clients.created++;
          syncedLists.push({ id: listId, name: clientName, clientId: newClient.id });
          logger.info(`Created client from ClickUp: ${clientName} (${company})`);
        }
      }
    }

    // Also check folderless lists in the space
    const folderlessData = await this.fetchJson(`${API_BASE}/space/${MARKETING_SPACE_ID}/list`);
    // Skip folderless lists (they are global views, not clients)

    return syncedLists;
  }

  /**
   * Sync all tasks from a ClickUp list → deliveries table
   */
  async syncTasks(listId, clientId, stats) {
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const data = await this.fetchJson(
        `${API_BASE}/list/${listId}/task?page=${page}&subtasks=true&include_closed=true`
      );
      const tasks = data.tasks || [];

      for (const task of tasks) {
        await this.syncSingleTask(task, clientId, stats);
      }

      stats.deliveries.total += tasks.length;
      hasMore = !data.last_page && tasks.length > 0;
      page++;
    }
  }

  /**
   * Sync a single ClickUp task → delivery record
   */
  async syncSingleTask(task, clientId, stats) {
    const clickupTaskId = task.id;

    // Find assignee (first assignee)
    let userId = null;
    if (task.assignees?.length > 0) {
      const clickupUserId = String(task.assignees[0].id);
      const user = await db('users').where({ clickup_id: clickupUserId }).first();
      userId = user?.id || null;
    }

    // Extract content_type from Formato custom field
    let contentType = 'video';
    const formatoField = task.custom_fields?.find((cf) => cf.name === 'Formato');
    if (formatoField?.value != null && formatoField.type_config?.options) {
      const option = formatoField.type_config.options[formatoField.value];
      if (option) {
        contentType = clickupService.mapContentType(option.name);
      }
    }

    // Map status
    const status = clickupService.mapClickUpStatus(task.status?.status) || 'planejamento';

    // Extract month from Entrega date field or date_created
    const entregaField = task.custom_fields?.find((cf) => cf.name?.includes('Entrega'));
    let month;
    if (entregaField?.value) {
      const d = new Date(Number(entregaField.value));
      month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    } else if (task.date_created) {
      const d = new Date(Number(task.date_created));
      month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    } else {
      const now = new Date();
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    }

    // Completed at
    const completedAt = (status === 'publicacao') ? new Date() : null;

    // Started at from date_created
    const startedAt = task.date_created ? new Date(Number(task.date_created)) : null;

    // Check if delivery exists
    const existing = await db('deliveries').where({ clickup_task_id: clickupTaskId }).first();

    if (existing) {
      // Update with latest data from ClickUp
      const updates = {
        title: task.name,
        status,
        content_type: contentType,
        updated_at: new Date(),
      };
      if (userId) updates.user_id = userId;
      if (completedAt && !existing.completed_at) updates.completed_at = completedAt;

      await db('deliveries').where({ id: existing.id }).update(updates);
      stats.deliveries.updated++;
    } else {
      // Create new delivery
      if (!userId) {
        logger.warn(`Skipping task ${clickupTaskId} "${task.name}": no assignee mapped`);
        return;
      }

      await db('deliveries').insert({
        clickup_task_id: clickupTaskId,
        title: task.name,
        user_id: userId,
        client_id: clientId,
        content_type: contentType,
        status,
        month,
        started_at: startedAt,
        completed_at: completedAt,
      });
      stats.deliveries.created++;
    }
  }
}

module.exports = new ClickUpSyncService();
```

**Step 2: Verify syntax**

Run: `cd server && node -e "require('./src/modules/webhooks/clickup-sync.service')"`
Expected: No errors

**Step 3: Commit**

```bash
git add server/src/modules/webhooks/clickup-sync.service.js
git commit -m "feat: add ClickUp full sync service"
```

---

### Task 3: Add sync endpoint to webhooks routes/controller

**Files:**
- Modify: `server/src/modules/webhooks/webhooks.controller.js`
- Modify: `server/src/modules/webhooks/webhooks.routes.js`

**Step 1: Add controller method**

At the top of `webhooks.controller.js`, add the require:
```js
const clickupSyncService = require('./clickup-sync.service');
```

Then add this method to the controller object (before `module.exports`):

```js
async sync(req, res, next) {
  try {
    const stats = await clickupSyncService.fullSync();
    res.json(stats);
  } catch (err) {
    next(err);
  }
},
```

**Step 2: Add route**

In `webhooks.routes.js`, add before `module.exports`:

```js
router.post('/clickup/sync', authenticate, ceoOnly, controller.sync);
```

**Step 3: Verify server starts**

Run: `cd server && node -e "require('./src/app');" && echo OK` (Ctrl+C after it starts)
Expected: "Server running on port 4400"

**Step 4: Commit**

```bash
git add server/src/modules/webhooks/webhooks.controller.js server/src/modules/webhooks/webhooks.routes.js
git commit -m "feat: add POST /api/webhooks/clickup/sync endpoint"
```

---

### Task 4: Add sync button to SettingsPage

**Files:**
- Modify: `client/src/pages/SettingsPage.jsx`

**Step 1: Add state and function**

After the existing `webhookEvents` state declarations, add:
```js
const [syncing, setSyncing] = useState(false);
const [syncResult, setSyncResult] = useState(null);
```

After the `registerWebhook` function, add:
```js
const runClickUpSync = async () => {
  setSyncing(true);
  setSyncResult(null);
  try {
    const { data } = await api.post('/webhooks/clickup/sync');
    setSyncResult(data);
    toast.success(
      `Sync completo: ${data.members.created + data.members.updated} membros, ` +
      `${data.clients.created + data.clients.updated} clientes, ` +
      `${data.deliveries.created + data.deliveries.updated} entregas`
    );
  } catch (err) {
    toast.error(err.response?.data?.error || 'Erro ao sincronizar com ClickUp');
  } finally {
    setSyncing(false);
  }
};
```

**Step 2: Add sync button and results in the ClickUp card**

Find the ClickUp integration card section (where webhook management is). Before the webhook URL input section, add:

```jsx
{/* Sync Section */}
<div className="border-t pt-4 mt-4">
  <h4 className="font-medium mb-2">Importação de Dados</h4>
  <p className="text-sm text-gray-500 mb-3">
    Importa membros, clientes e tarefas do ClickUp para o banco de dados.
  </p>
  <button
    onClick={runClickUpSync}
    disabled={syncing}
    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
  >
    {syncing ? 'Sincronizando...' : 'Sincronizar ClickUp'}
  </button>

  {syncResult && (
    <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm space-y-1">
      <p>Membros: {syncResult.members.created} criados, {syncResult.members.updated} atualizados</p>
      <p>Clientes: {syncResult.clients.created} criados, {syncResult.clients.updated} atualizados</p>
      <p>Entregas: {syncResult.deliveries.created} criadas, {syncResult.deliveries.updated} atualizadas ({syncResult.deliveries.total} total no ClickUp)</p>
    </div>
  )}
</div>
```

**Step 3: Build check**

Run: `cd client && npm run build`
Expected: No errors

**Step 4: Commit**

```bash
git add client/src/pages/SettingsPage.jsx
git commit -m "feat: add ClickUp sync button to Settings page"
```

---

### Task 5: Run sync and verify, then deploy

**Step 1: Run the migration locally**

Run: `cd server && npx knex migrate:latest`

**Step 2: Start server locally and test sync**

Run: `cd server && npm run dev` (in separate terminal)

Then in another terminal:
```bash
curl -X POST http://localhost:4400/api/webhooks/clickup/sync \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json"
```

Expected: JSON with `{ members: {...}, clients: {...}, deliveries: {...} }`

**Step 3: Verify data in database**

```bash
cd server && node -e "
  const db = require('./src/config/db');
  Promise.all([
    db('users').count('* as c').first(),
    db('clients').count('* as c').first(),
    db('deliveries').count('* as c').first(),
  ]).then(([u,c,d]) => {
    console.log('Users:', u.c, 'Clients:', c.c, 'Deliveries:', d.c);
    process.exit();
  });
"
```

Expected: Users > 1, Clients > 0, Deliveries > 0

**Step 4: Commit all and push**

```bash
git add -A
git commit -m "feat: ClickUp full sync — import members, clients, tasks"
git push origin master
```

**Step 5: Deploy to Railway**

```bash
# Deploy server
railway service link server && railway up
# Deploy client
railway service link client && railway up
```

**Step 6: Run sync on production**

Open https://tasksludus.up.railway.app → Settings → Integrações → ClickUp → "Sincronizar ClickUp"

---

## Verification Checklist

1. Migration 014 runs successfully
2. `POST /api/webhooks/clickup/sync` returns stats with created members/clients/deliveries
3. Users table has ClickUp team members with `clickup_id` set
4. Clients table has lists from Marketing space with `clickup_list_id` set
5. Deliveries table has tasks with `clickup_task_id`, correct status, assignee, client
6. SettingsPage shows sync button and results
7. Build passes (`npm run build`)
8. Production deploy works
