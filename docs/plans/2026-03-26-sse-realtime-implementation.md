# SSE Real-Time Events — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all client-side polling with Server-Sent Events for instant real-time updates.

**Architecture:** EventEmitter singleton on server emits events when data changes. SSE endpoint streams events to authenticated clients. Client hook dispatches DOM CustomEvents that pages listen to and re-fetch data. No TanStack Query migration needed — reuses existing fetch functions.

**Tech Stack:** Node EventEmitter, native SSE (text/event-stream), EventSource API, custom DOM events.

---

## Task 1: Create EventBus singleton

**Files:**
- Create: `server/src/utils/event-bus.js`

**What:** A global EventEmitter that any server module imports to broadcast data changes.

```js
const { EventEmitter } = require('events');

const eventBus = new EventEmitter();
eventBus.setMaxListeners(100);

module.exports = eventBus;
```

That's the entire file. Simple singleton.

---

## Task 2: Create SSE endpoint

**Files:**
- Create: `server/src/modules/events/events.routes.js`
- Modify: `server/src/app.js:22` (add import) and `server/src/app.js:78` (mount route)

**What:** `GET /api/events/stream` — keeps connection open, streams events from EventBus to client.

**Auth:** `EventSource` can't send headers. Read JWT from `?token=` query param. Verify inline (don't reuse `authenticate` middleware — it reads from `Authorization` header).

### events.routes.js

```js
const { Router } = require('express');
const jwt = require('jsonwebtoken');
const db = require('../../config/db');
const env = require('../../config/env');
const eventBus = require('../../utils/event-bus');
const logger = require('../../utils/logger');

const router = Router();

router.get('/stream', async (req, res) => {
  // Auth: verify JWT from query param (EventSource can't send headers)
  const token = req.query.token;
  if (!token) return res.status(401).json({ error: 'Token required' });

  let user;
  try {
    const payload = jwt.verify(token, env.jwt.secret);
    if (payload.type !== 'access') return res.status(401).json({ error: 'Invalid token type' });
    user = await db('users').where({ id: payload.sub, is_active: true }).select('id', 'role').first();
    if (!user) return res.status(401).json({ error: 'User not found' });
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable nginx buffering (Railway)
  });
  res.flushHeaders();

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  // Forward all eventBus events to this client
  const onEvent = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  eventBus.on('sse', onEvent);

  // Heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30_000);

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    eventBus.off('sse', onEvent);
    logger.info('SSE client disconnected', { userId: user.id });
  });

  logger.info('SSE client connected', { userId: user.id });
});

module.exports = router;
```

### app.js changes

Add import at line 22 (after `instagramRoutes`):
```js
const eventsRoutes = require('./modules/events/events.routes');
```

Add mount at line 78 (after instagram route):
```js
app.use('/api/events', eventsRoutes);
```

---

## Task 3: Emit events from ClickUp webhook handlers

**Files:**
- Modify: `server/src/modules/webhooks/clickup.service.js`

**What:** After each data-changing operation, emit an SSE event via eventBus.

Add at top of file (after existing requires):
```js
const eventBus = require('../../utils/event-bus');
```

**Emit points (add one line after each DB update):**

1. **handleStatusChange** — after `await db('deliveries').where({ id: delivery.id }).update(updates)` (~line 123):
   ```js
   eventBus.emit('sse', { type: 'delivery:updated', payload: { id: delivery.id, status: newStatus } });
   ```
   Also after status === 'publicacao', emit ranking:
   ```js
   if (newStatus === 'publicacao') {
     eventBus.emit('sse', { type: 'ranking:updated' });
   }
   ```

2. **autoCreateDelivery** — after `await db('deliveries').insert(...)` (~line 331):
   ```js
   eventBus.emit('sse', { type: 'delivery:created' });
   ```

3. **handleTaskUpdated** — after `await db('deliveries').where({ id: delivery.id }).update(updates)` (~line 213):
   ```js
   eventBus.emit('sse', { type: 'delivery:updated', payload: { id: delivery.id } });
   ```

4. **handleTaskDeleted** — after `await db('deliveries').where({ id: delivery.id }).update(...)` (~line 265):
   ```js
   eventBus.emit('sse', { type: 'delivery:deleted', payload: { id: delivery.id } });
   ```

5. **autoCreateScheduledPost** — after insert or update of scheduled_posts:
   ```js
   eventBus.emit('sse', { type: 'post:updated', payload: { clickup_task_id: clickupTaskId } });
   ```

---

## Task 4: Emit events from Instagram publish

**Files:**
- Modify: `server/src/modules/instagram/instagram-publish.service.js`

Add at top:
```js
const eventBus = require('../../utils/event-bus');
```

**Emit points:**

1. After successful publish (~line 66, after `logger.info('Post published', ...)`):
   ```js
   eventBus.emit('sse', { type: 'post:updated', payload: { id: postId, status: 'published' } });
   eventBus.emit('sse', { type: 'delivery:updated', payload: { clickup_task_id: post.clickup_task_id } });
   eventBus.emit('sse', { type: 'ranking:updated' });
   ```

2. After failure (~line 96, in catch block after `logger.error`):
   ```js
   eventBus.emit('sse', { type: 'post:updated', payload: { id: postId, status: 'failed' } });
   ```

---

## Task 5: Emit events from Deliveries CRUD

**Files:**
- Modify: `server/src/modules/deliveries/deliveries.controller.js`

Add at top:
```js
const eventBus = require('../../utils/event-bus');
```

**Emit points:**

1. After `create` (~line 32, after `const delivery = await deliveriesService.create(value)`):
   ```js
   eventBus.emit('sse', { type: 'delivery:created', payload: { id: delivery.id } });
   ```

2. After `update` (~line 43, after `const delivery = await deliveriesService.update(...)`):
   ```js
   eventBus.emit('sse', { type: 'delivery:updated', payload: { id: delivery.id } });
   ```

---

## Task 6: Emit events from Goals CRUD

**Files:**
- Modify: `server/src/modules/goals/goals.controller.js`

Add at top:
```js
const eventBus = require('../../utils/event-bus');
```

**Emit after each mutation (createTemplate, updateTemplate, deleteTemplate, createUserGoal, updateUserGoal):**
```js
eventBus.emit('sse', { type: 'goals:updated' });
```

Add one line after each successful DB operation in:
- `createTemplate` — after line 36
- `updateTemplate` — after line 49
- `deleteTemplate` — after line 57
- `createUserGoal` — after line 91
- `updateUserGoal` — after line 103

---

## Task 7: Create client SSE hook + event helper

**Files:**
- Create: `client/src/hooks/useSSE.js`
- Create: `client/src/hooks/useServerEvent.js`

### useSSE.js

Global hook — mounts once, connects to SSE endpoint, dispatches DOM CustomEvents.

```jsx
import { useEffect, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function useSSE() {
  const esRef = useRef(null);

  useEffect(() => {
    const connect = () => {
      const token = localStorage.getItem('accessToken');
      if (!token) return;

      const es = new EventSource(`${API_URL}/api/events/stream?token=${token}`);
      esRef.current = es;

      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          if (event.type === 'connected') return;
          window.dispatchEvent(new CustomEvent('sse', { detail: event }));
        } catch { /* ignore malformed */ }
      };

      es.onerror = () => {
        // EventSource auto-reconnects; close only if CLOSED state
        if (es.readyState === EventSource.CLOSED) {
          es.close();
          // Retry after 5s
          setTimeout(connect, 5000);
        }
      };
    };

    connect();
    return () => esRef.current?.close();
  }, []);
}
```

### useServerEvent.js

Per-page hook — listens for specific SSE event types and calls a callback.

```jsx
import { useEffect, useCallback } from 'react';

export default function useServerEvent(eventTypes, callback) {
  const stableCallback = useCallback(callback, []);

  useEffect(() => {
    const handler = (e) => {
      if (eventTypes.includes(e.detail?.type)) {
        stableCallback(e.detail);
      }
    };
    window.addEventListener('sse', handler);
    return () => window.removeEventListener('sse', handler);
  }, [eventTypes, stableCallback]);
}
```

---

## Task 8: Mount useSSE globally in App.jsx

**Files:**
- Modify: `client/src/App.jsx`

Add import at top:
```jsx
import useSSE from '@/hooks/useSSE';
```

Add inside `App()` function, after `const loadUser = ...`:
```jsx
useSSE();
```

This mounts the SSE connection once for the entire app.

---

## Task 9: Replace DashboardPage polling with SSE

**Files:**
- Modify: `client/src/pages/DashboardPage.jsx`

**Changes:**

1. Add import:
   ```jsx
   import useServerEvent from '@/hooks/useServerEvent';
   ```

2. Extract `fetchDashboard` out of the useEffect so it can be referenced by useServerEvent. Keep the initial fetch in useEffect but remove setInterval:

   Replace lines 44-83:
   ```jsx
   const fetchDashboard = async () => {
     try {
       const month = currentMonth();
       const requests = [
         api.get('/deliveries', { params: { month } }).catch(() => ({ data: [] })),
         api.get('/ranking', { params: { month } }).catch(() => ({ data: [] })),
       ];

       if (isMgmt) {
         requests.push(
           api.get('/goals', { params: { month } }).catch(() => ({ data: [] })),
           api.get('/users').catch(() => ({ data: [] })),
           api.get('/clients').catch(() => ({ data: [] })),
           api.get('/boost', { params: { month } }).catch(() => ({ data: [] })),
         );
       }

       const results = await Promise.all(requests);
       setDeliveries(results[0].data);
       setRanking(results[1].data);
       if (results[2]) setGoals(results[2].data);
       if (results[3]) setUsersList(results[3].data);
       if (results[4]) setClients(results[4].data);
       if (results[5]) setCalculations(results[5].data);
     } catch {
       if (loading) toast.error('Erro ao carregar dashboard');
     } finally {
       setLoading(false);
     }
   };

   useEffect(() => {
     fetchDashboard();
   }, []);

   // Re-fetch when server pushes relevant events
   useServerEvent(
     ['delivery:created', 'delivery:updated', 'delivery:deleted', 'post:updated', 'ranking:updated', 'goals:updated'],
     fetchDashboard
   );
   ```

---

## Task 10: Replace ClientProfilePage polling with SSE

**Files:**
- Modify: `client/src/pages/ClientProfilePage.jsx`

**Changes:**

1. Add import:
   ```jsx
   import useServerEvent from '@/hooks/useServerEvent';
   ```

2. Extract `fetchProfile` and remove setInterval. Replace lines 87-107:
   ```jsx
   const fetchProfile = async () => {
     try {
       const { data } = await api.get(`/clients/${id}/profile`);
       setProfile(data);
     } catch {
       if (loading) {
         toast.error('Erro ao carregar perfil do cliente');
         navigate('/clients');
       }
     } finally {
       setLoading(false);
     }
   };

   useEffect(() => {
     fetchProfile();
   }, [id]);

   // Re-fetch when server pushes relevant events
   useServerEvent(
     ['delivery:created', 'delivery:updated', 'delivery:deleted', 'post:updated'],
     fetchProfile
   );
   ```

---

## Task 11: Commit, push, deploy

```bash
git add -A
git commit -m "feat: replace all polling with SSE real-time events

- EventBus singleton emits events on data changes
- SSE endpoint streams events to authenticated clients
- ClickUp webhooks, Instagram publish, CRUD operations all emit events
- Dashboard and ClientProfile update instantly instead of 30s polling"
```

Push and deploy server + client to Railway.

---

## Verification

1. Open browser DevTools → Network → filter EventStream. Confirm `/api/events/stream` connection stays open.
2. Move a task in ClickUp → Dashboard should update within ~1s (vs 30s before).
3. Delete a task in ClickUp → Delivery disappears from list immediately.
4. Publish an Instagram post → Status updates in real-time.
5. Confirm no `setInterval` remains in DashboardPage or ClientProfilePage.
