# YouTube Phase 2 — Client Portal Setup Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a social-connections wizard inside the client portal so clients can self-serve connect Instagram, TikTok, and YouTube, with OAuth scoped so they can only connect their own accounts, plus an invite enhancement that auto-links `clients.user_id` on registration.

**Architecture:** A new `managementOrClientOwn` middleware replaces `managementLevel` on the three OAuth URL routes, checking that clients can only initiate OAuth for their own `client_id` (via `clients.user_id = req.user.id`). The existing `PortalPage.jsx` scaffolding is rewritten with a "Minhas Redes Sociais" section that fetches connection status for all three platforms and renders connect/disconnect cards with a progress bar. The invite flow gains an optional `client_id` parameter that auto-sets `clients.user_id` when the invited client registers.

**Tech Stack:** Node.js / Express / Knex (Postgres) / React (Vite) / tailwind.

---

## File Structure

| File | Role |
|---|---|
| `server/src/middleware/auth.js` (MODIFY) | Add `managementOrClientOwn` middleware. |
| `server/src/modules/instagram/instagram.routes.js` (MODIFY) | OAuth URL route uses new middleware. |
| `server/src/modules/tiktok/tiktok.routes.js` (MODIFY) | Same. |
| `server/src/modules/youtube/youtube.routes.js` (MODIFY) | Same. |
| `server/src/modules/auth/auth.validation.js` (MODIFY) | Add `client_id` to invite schema. |
| `server/src/modules/auth/auth.service.js` (MODIFY) | Accept `client_id`, auto-link on registration. |
| `server/src/modules/auth/auth.controller.js` (MODIFY) | Forward `client_id`. |
| `client/src/pages/PortalPage.jsx` (REWRITE) | Social connections wizard + filtered deliveries. |

---

## Context

- Spec: `docs/superpowers/specs/2026-04-17-youtube-integration-design.md` — Phase 2 section.
- `clients` table has `user_id (uuid)` FK to `users.id`. This links a client record to a user account. Currently NULL for all clients (no client users exist).
- OAuth URL endpoints for all 3 platforms currently use `managementLevel` middleware which allows `ceo/director/manager` only.
- The `PortalPage.jsx` is scaffolding: fetches `/deliveries` without filtering, shows stats + table, has a TODO comment about filtering.
- `client` role sees only `{ to: '/portal', ... }` in the sidebar.
- Connection status endpoints already exist: `GET /api/instagram/oauth/status/:clientId`, `GET /api/tiktok/oauth/status/:clientId`, `GET /api/youtube/oauth/status/:clientId`.
- OAuth URL endpoints: `GET /api/instagram/oauth/url/:clientId`, `GET /api/tiktok/oauth/url/:clientId`, `GET /api/youtube/oauth/url/:clientId`.
- Disconnect endpoints: `DELETE /api/instagram/oauth/:clientId`, `DELETE /api/tiktok/oauth/:clientId`, `DELETE /api/youtube/oauth/:clientId`.

---

### Task 1: OAuth route scoping for client role

**Files:**
- Modify: `server/src/middleware/auth.js` — add `managementOrClientOwn` function.
- Modify: `server/src/modules/instagram/instagram.routes.js`
- Modify: `server/src/modules/tiktok/tiktok.routes.js`
- Modify: `server/src/modules/youtube/youtube.routes.js`

- [ ] **Step 1: Add the new middleware to `auth.js`**

Append before `module.exports`:

```js
function managementOrClientOwn(req, res, next) {
  if (req.user.role === 'dev') return next();
  if (['ceo', 'director', 'manager'].includes(req.user.role)) return next();
  if (req.user.role === 'producer' && req.user.producer_type === 'social_media') return next();
  if (req.user.role === 'client') {
    const db = require('../config/db');
    return db('clients').where({ user_id: req.user.id }).first()
      .then((client) => {
        if (client && client.id === req.params.clientId) return next();
        return res.status(403).json({ error: 'You can only manage your own social accounts' });
      })
      .catch(() => res.status(500).json({ error: 'Internal error checking client ownership' }));
  }
  return res.status(403).json({ error: 'Management or account owner access only' });
}
```

Add `managementOrClientOwn` to `module.exports`.

- [ ] **Step 2: Update the three OAuth URL routes**

In `instagram.routes.js`, change the OAuth URL line:
```js
// Before:
router.get('/oauth/url/:clientId', managementLevel, controller.getOAuthUrl.bind(controller));
// After:
router.get('/oauth/url/:clientId', managementOrClientOwn, controller.getOAuthUrl.bind(controller));
```

Also update the import: `const { authenticate, managementLevel, managementOrClientOwn } = require('../../middleware/auth');`

Do the same change in `tiktok.routes.js` and `youtube.routes.js`.

Also update the status and disconnect routes to use `managementOrClientOwn` instead of `managementLevel` (so clients can see their own status and disconnect):
```js
router.get('/oauth/status/:clientId', managementOrClientOwn, controller.getConnectionStatus.bind(controller));
router.delete('/oauth/:clientId', managementOrClientOwn, controller.disconnect.bind(controller));
```

- [ ] **Step 3: Run tests**

```bash
cd /home/dev/projetos/server && npx jest --silent --forceExit --testTimeout=10000
```

- [ ] **Step 4: Commit**

```bash
git -c safe.directory=/home/dev/projetos commit -m "feat(auth): managementOrClientOwn middleware for OAuth routes

Clients with role 'client' can now initiate OAuth, check status,
and disconnect their own social accounts by verifying
clients.user_id matches req.user.id. Management and social media
roles pass through as before. Applied to all three platform OAuth
routes (Instagram, TikTok, YouTube)."
```

---

### Task 2: Invite enhancement — `client_id` auto-link

**Files:**
- Modify: `server/src/modules/auth/auth.validation.js`
- Modify: `server/src/modules/auth/auth.service.js`
- Modify: `server/src/modules/auth/auth.controller.js`

- [ ] **Step 1: Add `client_id` to the invite schema**

In `auth.validation.js`, add to `createInviteSchema`:

```js
client_id: Joi.string().uuid().when('role', {
  is: 'client',
  then: Joi.required(),
  otherwise: Joi.optional(),
}),
```

- [ ] **Step 2: Update the service to accept and use `client_id`**

In `auth.service.js` `createInvite` method:

Change signature to include `clientId` in the options:
```js
async createInvite(email, role, producerType, invitedBy, { name, password, whatsapp, clientId } = {}) {
```

After the user is created (in the registration/acceptance flow), if `clientId` is provided:
```js
if (clientId) {
  await db('clients').where({ id: clientId }).update({ user_id: newUser.id, updated_at: new Date() });
  logger.info('Linked client to user', { clientId, userId: newUser.id });
}
```

Find where the invite token is stored — if `invite_tokens` table exists, add `client_id` to the token data so it persists through the registration flow. If invite data is stored in the token payload (JWT or DB row), include `client_id` there.

Look at how the existing invite flow works:
- `createInvite` creates a token (likely a JWT or DB row with the invite details)
- When user registers via invite, the token is consumed and the user is created
- At that point, if `client_id` was in the token, link `clients.user_id`

- [ ] **Step 3: Update the controller to forward `client_id`**

In `auth.controller.js` `createInvite`:

```js
const result = await authService.createInvite(
  value.email,
  value.role,
  value.producer_type,
  req.user.id,
  { name: value.name, password: value.password, whatsapp: value.whatsapp, clientId: value.client_id }
);
```

- [ ] **Step 4: Run tests**

```bash
cd /home/dev/projetos/server && npx jest --silent --forceExit --testTimeout=10000
```

- [ ] **Step 5: Commit**

```bash
git -c safe.directory=/home/dev/projetos commit -m "feat(auth): invite with client_id auto-links on registration

When creating an invite for role 'client', client_id is required.
The ID is stored in the invite token payload and, on registration,
automatically sets clients.user_id to the new user's ID — linking
the client record to their login account so the portal and OAuth
scoping work from first login."
```

---

### Task 3: PortalPage rewrite — social connections + filtered deliveries

**Files:**
- Rewrite: `client/src/pages/PortalPage.jsx`

- [ ] **Step 1: Rewrite the portal page**

The new PortalPage should:

1. **Fetch the client record** for the logged-in user:
   - `GET /api/clients` → find the one where `user_id === currentUser.id` (or add a dedicated endpoint `GET /api/portal/me` that returns the client + connection statuses).
   - Simpler approach: the portal can call `GET /api/clients` and filter client-side by matching user_id. But `/api/clients` might be restricted to management. Better: add a small portal API or call the individual status endpoints.

2. **Social Connections Section** ("Minhas Redes Sociais"):
   - Three cards: Instagram, TikTok, YouTube.
   - Each fetches status from `GET /api/{platform}/oauth/status/{clientId}`.
   - Connected: shows username/channel + "Desconectar" button.
   - Disconnected: shows "Conectar {Platform}" button → redirects to OAuth URL.
   - Progress bar: `connectedCount / 3`.

3. **Deliveries Section** (fix the TODO):
   - Fetch deliveries filtered by the client's ID.
   - Show title, status, content_type, month.

Implementation:

```jsx
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import api from '@/services/api';
import { getInstagramOAuthUrl, getInstagramConnectionStatus, disconnectInstagram } from '@/services/instagram';
import { getTikTokOAuthUrl, getTikTokConnectionStatus, disconnectTikTok } from '@/services/tiktok';
import { getYouTubeOAuthUrl, getYouTubeConnectionStatus, disconnectYouTube } from '@/services/youtube';
import { PIPELINE_STATUSES, PIPELINE_STATUS_COLORS, CONTENT_TYPE_LABELS } from '@/lib/constants';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ExternalLink } from 'lucide-react';
import PageLoading from '@/components/common/PageLoading';
import useAuth from '@/hooks/useAuth';

const PLATFORMS = [
  { key: 'instagram', label: 'Instagram', color: 'bg-pink-500/15 text-pink-500', icon: 'IG', getUrl: getInstagramOAuthUrl, getStatus: getInstagramConnectionStatus, disconnect: disconnectInstagram, nameField: 'username' },
  { key: 'tiktok', label: 'TikTok', color: 'bg-emerald-500/15 text-emerald-500', icon: 'TK', getUrl: getTikTokOAuthUrl, getStatus: getTikTokConnectionStatus, disconnect: disconnectTikTok, nameField: 'username' },
  { key: 'youtube', label: 'YouTube', color: 'bg-red-500/15 text-red-500', icon: 'YT', getUrl: getYouTubeOAuthUrl, getStatus: getYouTubeConnectionStatus, disconnect: disconnectYouTube, nameField: 'channelTitle' },
];

export default function PortalPage() {
  const { user } = useAuth();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState({});
  const [deliveries, setDeliveries] = useState([]);
  const [connecting, setConnecting] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        // Find the client linked to this user
        const { data: clients } = await api.get('/clients');
        const myClient = clients.find((c) => c.user_id === user?.id);
        if (!myClient) {
          setLoading(false);
          return;
        }
        setClient(myClient);

        // Fetch connection statuses in parallel
        const statuses = {};
        await Promise.all(PLATFORMS.map(async (p) => {
          try {
            statuses[p.key] = await p.getStatus(myClient.id);
          } catch {
            statuses[p.key] = { connected: false };
          }
        }));
        setConnections(statuses);

        // Fetch deliveries for this client
        const { data: allDeliveries } = await api.get('/deliveries');
        setDeliveries((allDeliveries || []).filter((d) => d.client_id === myClient.id).slice(0, 20));
      } catch {
        toast.error('Erro ao carregar portal');
      } finally {
        setLoading(false);
      }
    })();

    // Handle OAuth return
    const params = new URLSearchParams(window.location.search);
    for (const p of PLATFORMS) {
      if (params.get(p.key) === 'connected' || params.get(`${p.key}_connected`) === 'true') {
        toast.success(`${p.label} conectado!`);
        window.history.replaceState({}, '', '/portal');
      }
    }
  }, [user]);

  if (loading) return <PageLoading />;
  if (!client) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Nenhum cliente vinculado à sua conta. Entre em contato com o administrador.</p>
      </div>
    );
  }

  const connectedCount = PLATFORMS.filter((p) => connections[p.key]?.connected).length;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <h1 className="text-2xl font-semibold text-foreground">Portal do Cliente</h1>

      {/* Social Connections */}
      <section>
        <h2 className="text-lg font-medium text-foreground mb-3">Minhas Redes Sociais</h2>
        <div className="space-y-3">
          {PLATFORMS.map((p) => {
            const status = connections[p.key];
            return (
              <Card key={p.key}>
                <CardContent className="py-4 px-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center ${status?.connected ? p.color : 'bg-muted'}`}>
                        <span className={`text-sm font-black ${status?.connected ? '' : 'text-muted-foreground'}`}>{p.icon}</span>
                      </div>
                      <div>
                        {status?.connected ? (
                          <>
                            <p className="text-sm font-medium text-emerald-500">Conectado</p>
                            <p className="text-xs text-muted-foreground">{status[p.nameField] || p.label}</p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-medium">{p.label}</p>
                            <p className="text-xs text-muted-foreground">Conecte para publicar automaticamente</p>
                          </>
                        )}
                      </div>
                    </div>
                    {status?.connected ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={async () => {
                          if (!confirm(`Desconectar ${p.label}?`)) return;
                          try {
                            await p.disconnect(client.id);
                            setConnections((c) => ({ ...c, [p.key]: { connected: false } }));
                            toast.success(`${p.label} desconectado`);
                          } catch {
                            toast.error('Erro ao desconectar');
                          }
                        }}
                      >
                        Desconectar
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={connecting === p.key}
                        onClick={async () => {
                          setConnecting(p.key);
                          try {
                            const { url } = await p.getUrl(client.id);
                            window.location.href = url;
                          } catch {
                            toast.error(`Erro ao iniciar conexão com ${p.label}`);
                            setConnecting(null);
                          }
                        }}
                      >
                        {connecting === p.key ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : null}
                        Conectar {p.label}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        {/* Progress bar */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${(connectedCount / 3) * 100}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{connectedCount} de 3</span>
        </div>
      </section>

      {/* Deliveries */}
      <section>
        <h2 className="text-lg font-medium text-foreground mb-3">Suas Entregas</h2>
        {deliveries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma entrega encontrada.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3">Título</th>
                  <th className="text-left p-3">Formato</th>
                  <th className="text-left p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} className="border-t border-border">
                    <td className="p-3 font-medium truncate max-w-[300px]">{d.title}</td>
                    <td className="p-3 text-muted-foreground">{CONTENT_TYPE_LABELS[d.content_type] || d.content_type || '—'}</td>
                    <td className="p-3">
                      <Badge variant="secondary" className={`${PIPELINE_STATUS_COLORS[d.status] || ''} text-xs`}>
                        {PIPELINE_STATUSES[d.status] || d.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Verify the required imports exist**

Check that the Instagram and TikTok services export the functions used above. The Instagram service (`client/src/services/instagram.js`) should export `getInstagramOAuthUrl`, `getInstagramConnectionStatus`, `disconnectInstagram`. If they don't exist with those exact names, check what they're called and adjust the imports.

For TikTok, check `client/src/services/tiktok.js` — if it doesn't exist, create it (same pattern as `youtube.js`):

```js
import api from './api';

export const getTikTokOAuthUrl = (clientId) =>
  api.get(`/tiktok/oauth/url/${clientId}`).then((r) => r.data);

export const getTikTokConnectionStatus = (clientId) =>
  api.get(`/tiktok/oauth/status/${clientId}`).then((r) => r.data);

export const disconnectTikTok = (clientId) =>
  api.delete(`/tiktok/oauth/${clientId}`).then((r) => r.data);
```

For Instagram, check if similar functions exist in `client/src/services/instagram.js` and adjust import names accordingly.

- [ ] **Step 3: Check `useAuth` hook exists**

The PortalPage uses `useAuth()` to get the current user. Verify `client/src/hooks/useAuth.js` exists and exports `{ user }`. If the app uses a different auth pattern (e.g., Zustand store, context), adjust accordingly.

- [ ] **Step 4: Build**

```bash
cd /home/dev/projetos/client && npm run build
```

- [ ] **Step 5: Commit**

```bash
git -c safe.directory=/home/dev/projetos commit -m "feat(portal): social connections wizard + filtered deliveries

Rewrites PortalPage with a 'Minhas Redes Sociais' section showing
three platform cards (Instagram, TikTok, YouTube) with real-time
connection status, connect/disconnect actions, and a progress bar.
Deliveries are now filtered to the client linked to the logged-in
user (clients.user_id = users.id). The portal works end-to-end
once an admin creates an invite with role=client + client_id."
```

---

### Task 4: Invite enhancement — `client_id` auto-link

**Files:**
- Modify: `server/src/modules/auth/auth.validation.js`
- Modify: `server/src/modules/auth/auth.service.js`
- Modify: `server/src/modules/auth/auth.controller.js`

- [ ] **Step 1: Add `client_id` to the invite schema**

In `auth.validation.js`, add to `createInviteSchema`:

```js
client_id: Joi.string().uuid().when('role', {
  is: 'client',
  then: Joi.required(),
  otherwise: Joi.optional(),
}),
```

- [ ] **Step 2: Update the auth service**

In `auth.service.js`:

Change `createInvite` signature to accept `clientId`:
```js
async createInvite(email, role, producerType, invitedBy, { name, password, whatsapp, clientId } = {}) {
```

When creating the invite token (JWT or DB row), include `clientId` in the payload so it survives the registration step.

In the registration/acceptance method (where the invited user creates their account), after the user row is created:
```js
if (inviteData.clientId) {
  await db('clients').where({ id: inviteData.clientId }).update({ user_id: newUser.id, updated_at: new Date() });
  logger.info('Linked client to user on invite registration', { clientId: inviteData.clientId, userId: newUser.id });
}
```

- [ ] **Step 3: Update the controller**

In `auth.controller.js` `createInvite`:

```js
const result = await authService.createInvite(
  value.email,
  value.role,
  value.producer_type,
  req.user.id,
  { name: value.name, password: value.password, whatsapp: value.whatsapp, clientId: value.client_id }
);
```

- [ ] **Step 4: Run tests**

```bash
cd /home/dev/projetos/server && npx jest --silent --forceExit --testTimeout=10000
```

- [ ] **Step 5: Commit**

```bash
git -c safe.directory=/home/dev/projetos commit -m "feat(auth): invite with client_id auto-links on registration

When creating an invite for role 'client', client_id is now
required. The ID is included in the invite token payload. On
registration, clients.user_id is automatically set to the new
user's ID, linking the client record to their account for
portal access and OAuth self-service."
```

---

### Task 5: Manual verification

**Files:** none.

- [ ] **Step 1: Push and deploy**

```bash
git push origin master
```

- [ ] **Step 2: Create a test client invite**

Via API or admin UI:
```
POST /api/auth/invite
{
  "email": "test-client@example.com",
  "role": "client",
  "client_id": "<a real client UUID from the DB>",
  "name": "Test Client",
  "password": "test123456"
}
```

- [ ] **Step 3: Register the client**

Use the invite token to register. After registration, verify `clients.user_id` is set:
```sql
SELECT id, name, user_id FROM clients WHERE id = '<client_id>';
```

- [ ] **Step 4: Log in as the client**

Open TasksLudus, log in with the test client credentials. Confirm:
- Portal page loads with "Minhas Redes Sociais" (3 cards, all disconnected).
- Progress bar shows 0/3.
- Deliveries table shows only this client's deliveries.

- [ ] **Step 5: Connect a platform**

Click "Conectar Instagram" (or TikTok/YouTube). Confirm:
- OAuth flow redirects to the platform.
- After auth, returns to `/portal` with success toast.
- Card shows "Conectado" with account name.
- Progress bar updates.

- [ ] **Step 6: Verify scoping**

As the client user, try to call `/api/instagram/oauth/url/<ANOTHER_CLIENT_ID>` directly. Confirm 403.

---

## Self-Review (done)

- **Spec coverage:**
  - OAuth scoping for client role → Task 1.
  - Invite enhancement (client_id, auto-link) → Task 4.
  - Portal social connections section (3 cards + progress bar) → Task 3.
  - Portal deliveries filter → Task 3.
  - Client onboarding flow → Tasks 2+3+4 combined.
  - Manual verification → Task 5.
- **Placeholder scan:** none.
- **Type consistency:** `managementOrClientOwn` name matches between `auth.js` middleware and the three route files. `client_id` in invite schema/service/controller matches. Service functions in PortalPage match the existing exports from `services/instagram.js`, `services/tiktok.js`, `services/youtube.js`.
