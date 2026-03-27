# Design: SSE Real-Time Events (Replace All Polling)

**Date:** 2026-03-26
**Goal:** Replace all client-side polling (setInterval) with Server-Sent Events for instant updates.

---

## Architecture

### EventBus (Server)

Singleton `EventEmitter` that any server module can import to broadcast changes.

**File:** `server/src/utils/event-bus.js`

```js
const { EventEmitter } = require('events');
const eventBus = new EventEmitter();
eventBus.setMaxListeners(100); // support many SSE connections
module.exports = eventBus;
```

### SSE Endpoint

**Route:** `GET /api/events/stream` (requires `authenticate`)
**File:** `server/src/modules/events/events.routes.js`

Behavior:
- Sets headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- Listens to EventBus for all events, writes to response as SSE format
- Sends heartbeat comment (`: heartbeat\n\n`) every 30s to keep connection alive
- Cleans up listener on `req.on('close')`

### Client Hook

**File:** `client/src/hooks/useSSE.js`

- Creates `EventSource` connection to `/api/events/stream` with JWT in query param
- Parses incoming events and calls TanStack Query `queryClient.invalidateQueries()` for the relevant query key
- Auto-reconnects on disconnect (EventSource does this natively)
- Mounted once in App.jsx (or layout) — all pages benefit

---

## Event Catalog

| Event | Emitted By | Trigger | Client Action |
|-------|-----------|---------|---------------|
| `delivery:created` | clickup.service (autoCreateDelivery) | New ClickUp task synced | Invalidate `deliveries`, `ranking` |
| `delivery:updated` | clickup.service (handleStatusChange, handleTaskUpdated), deliveries CRUD | Status/title/content_type changed | Invalidate `deliveries`, `ranking`, `clientProfile` |
| `delivery:deleted` | clickup.service (handleTaskDeleted) | ClickUp task deleted → cancelado | Invalidate `deliveries`, `ranking` |
| `post:updated` | instagram-publish.service (executeScheduledPost) | Post published or failed | Invalidate `scheduledPosts`, `clientProfile` |
| `goals:updated` | goals CRUD | Goals created/updated/deleted | Invalidate `goals` |
| `ranking:updated` | After delivery status changes to publicacao | Ranking data changed | Invalidate `ranking` |

### Event Payload Format

```json
{
  "type": "delivery:updated",
  "payload": {
    "id": "uuid",
    "client_id": "uuid",
    "user_id": "uuid",
    "status": "design"
  },
  "timestamp": "2026-03-26T12:00:00.000Z"
}
```

Payloads are minimal — just enough for the client to know WHAT changed. The client re-fetches via its existing API calls (TanStack Query invalidation).

---

## Integration Points (Where to emit)

### 1. ClickUp Webhook Service (`clickup.service.js`)

- `handleStatusChange` → `eventBus.emit('delivery:updated', { id, status })`
- `handleTaskCreated` / `autoCreateDelivery` → `eventBus.emit('delivery:created', { id })`
- `handleTaskUpdated` → `eventBus.emit('delivery:updated', { id })`
- `handleTaskDeleted` → `eventBus.emit('delivery:deleted', { id })`
- After status → `publicacao` → `eventBus.emit('ranking:updated', { month })`

### 2. Instagram Publish Service (`instagram-publish.service.js`)

- After successful publish → `eventBus.emit('post:updated', { id, status: 'published' })`
- After failure → `eventBus.emit('post:updated', { id, status: 'failed' })`

### 3. Deliveries CRUD (`deliveries.controller.js`)

- After create/update → `eventBus.emit('delivery:updated', { id })`

### 4. Goals CRUD (`goals.controller.js`)

- After create/update/delete → `eventBus.emit('goals:updated', { month })`

---

## Client-Side Changes

### 1. Remove Polling

- `DashboardPage.jsx`: Remove `setInterval(fetchDashboard, 30_000)`
- `ClientProfilePage.jsx`: Remove `setInterval(fetchProfile, 30_000)`

### 2. Migrate to TanStack Query Keys

Current pages use raw `useState` + `useEffect` + `api.get()`. For SSE invalidation to work cleanly, the data-fetching should use TanStack Query's `useQuery` with named keys so `invalidateQueries(['deliveries'])` triggers a refetch.

Pages to migrate:
- `DashboardPage.jsx` — multiple queries (deliveries, ranking, goals, users, clients, boost)
- `ClientProfilePage.jsx` — client profile query

### 3. useSSE Hook

```js
// Pseudocode
function useSSE() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const token = useAuthStore.getState().accessToken;
    const es = new EventSource(`/api/events/stream?token=${token}`);
    es.onmessage = (e) => {
      const { type } = JSON.parse(e.data);
      // Map event types to query keys
      const invalidationMap = {
        'delivery:created': ['deliveries', 'ranking'],
        'delivery:updated': ['deliveries', 'ranking', 'clientProfile'],
        'delivery:deleted': ['deliveries', 'ranking'],
        'post:updated': ['scheduledPosts', 'clientProfile'],
        'goals:updated': ['goals'],
        'ranking:updated': ['ranking'],
      };
      for (const key of invalidationMap[type] || []) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    };
    return () => es.close();
  }, []);
}
```

### 4. Auth for SSE

`EventSource` doesn't support custom headers. Options:
- **Query param token**: `?token=<jwt>` — simple, works. JWT is short-lived (15min) anyway.
- Server middleware extracts token from query param for SSE route only.

---

## Heartbeat & Reconnection

- Server sends `: heartbeat\n\n` every 30s (SSE comment, ignored by EventSource)
- `EventSource` auto-reconnects on disconnect with exponential backoff (browser-native)
- No custom reconnection logic needed on client

---

## Scaling Note

Current: single Railway instance → in-process EventEmitter is sufficient.
Future: if multi-instance needed, swap EventEmitter for Redis pub/sub (subscribe in SSE handler, publish from modules). The event catalog and client code stay identical.

---

## Files Summary

| File | Action |
|------|--------|
| `server/src/utils/event-bus.js` | NEW — EventEmitter singleton |
| `server/src/modules/events/events.routes.js` | NEW — SSE endpoint |
| `server/src/modules/webhooks/clickup.service.js` | EDIT — emit events |
| `server/src/modules/instagram/instagram-publish.service.js` | EDIT — emit events |
| `server/src/modules/deliveries/deliveries.controller.js` | EDIT — emit events |
| `server/src/modules/goals/goals.controller.js` | EDIT — emit events |
| `server/src/app.js` | EDIT — mount events routes |
| `client/src/hooks/useSSE.js` | NEW — SSE hook |
| `client/src/pages/DashboardPage.jsx` | EDIT — remove polling, use TanStack Query |
| `client/src/pages/ClientProfilePage.jsx` | EDIT — remove polling, use TanStack Query |
| `client/src/App.jsx` | EDIT — mount useSSE |
