# Social Media Producer Access — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give producers with `social_media` type access to Clients, Client Profile, Schedule Calendar, and Instagram publishing (create/delete scheduled posts).

**Architecture:** 3 small changes: (1) add a `managementOrSocialMedia` middleware on the backend for instagram scheduled-post routes, (2) add Clientes + Agenda to the producer sidebar when producer_type is social_media, (3) show create/edit/delete actions in ClientProfilePage and ScheduleCalendarPage for social_media producers. No new tables, endpoints, or components needed.

**Tech Stack:** Express middleware (server), React sidebar + page components (client)

---

### Task 1: Add `managementOrSocialMedia` middleware

**Files:**
- Modify: `server/src/middleware/auth.js`

**Step 1: Add the new middleware function after `managementLevel` (line 74)**

```javascript
// CEO, Director, Manager, or Social Media producer
function managementOrSocialMedia(req, res, next) {
  if (['ceo', 'director', 'manager'].includes(req.user.role)) {
    return next();
  }
  if (req.user.role === 'producer' && req.user.producer_type === 'social_media') {
    return next();
  }
  return res.status(403).json({ error: 'Management or Social Media access only' });
}
```

**Step 2: Export it**

In the `module.exports` block, add `managementOrSocialMedia`:

```javascript
module.exports = {
  authenticate,
  authorize,
  ceoOnly,
  adminLevel,
  managementLevel,
  managementOrSocialMedia,
};
```

**Step 3: Commit**

```bash
git add server/src/middleware/auth.js
git commit -m "feat: add managementOrSocialMedia middleware"
```

---

### Task 2: Apply middleware to Instagram scheduled-post routes

**Files:**
- Modify: `server/src/modules/instagram/instagram.routes.js`

**Step 1: Update the import**

Change:
```javascript
const { authenticate, managementLevel } = require('../../middleware/auth');
```
To:
```javascript
const { authenticate, managementLevel, managementOrSocialMedia } = require('../../middleware/auth');
```

**Step 2: Change the two routes that block social_media**

Change line 24:
```javascript
router.post('/scheduled', managementLevel, controller.createScheduledPost.bind(controller));
```
To:
```javascript
router.post('/scheduled', managementOrSocialMedia, controller.createScheduledPost.bind(controller));
```

Change line 26:
```javascript
router.delete('/scheduled/:id', managementLevel, controller.deleteScheduledPost.bind(controller));
```
To:
```javascript
router.delete('/scheduled/:id', managementOrSocialMedia, controller.deleteScheduledPost.bind(controller));
```

**Step 3: Commit**

```bash
git add server/src/modules/instagram/instagram.routes.js
git commit -m "feat: allow social_media producers to create/delete scheduled posts"
```

---

### Task 3: Add Clientes + Agenda to social_media producer sidebar

**Files:**
- Modify: `client/src/components/layout/Sidebar.jsx`

**Step 1: Update the producer nav items to be dynamic based on producer_type**

Currently line 50-56:
```javascript
  producer: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/deliveries', icon: BarChart3, label: 'Entregas' },
    { to: '/simulator', icon: TrendingUp, label: 'Simulador' },
    { to: '/comofunciona', icon: Rocket, label: 'Como funciona' },
    { to: '/ranking', icon: Trophy, label: 'Ranking' },
  ],
```

Replace the entire `producer` entry with a function approach. Change line 67 from:
```javascript
  const items = navItems[user?.role] || [];
```
To:
```javascript
  let items = navItems[user?.role] || [];
  // Social media producers get additional nav items
  if (user?.role === 'producer' && user?.producer_type === 'social_media') {
    items = [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/clients', icon: Package, label: 'Clientes' },
      { to: '/deliveries', icon: BarChart3, label: 'Entregas' },
      { to: '/schedule', icon: CalendarDays, label: 'Agenda' },
      { to: '/simulator', icon: TrendingUp, label: 'Simulador' },
      { to: '/comofunciona', icon: Rocket, label: 'Como funciona' },
      { to: '/ranking', icon: Trophy, label: 'Ranking' },
    ];
  }
```

**Step 2: Verify build**

Run: `cd client && npx vite build --mode development 2>&1 | tail -5`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add client/src/components/layout/Sidebar.jsx
git commit -m "feat: add Clientes and Agenda nav items for social_media producers"
```

---

### Task 4: Allow social_media producers to manage posts in ClientProfilePage

**Files:**
- Modify: `client/src/pages/ClientProfilePage.jsx`

The ClientProfilePage currently uses `isManagement(user?.role)` to show/hide create/edit/delete actions on the Agendamento tab and Instagram tab. We need to also allow social_media producers to see those actions.

**Step 1: Find where `isManagement` controls action visibility**

Search for `isManagement` in `ClientProfilePage.jsx` and for each occurrence, change:

```javascript
isManagement(user?.role)
```
To:
```javascript
(isManagement(user?.role) || user?.producer_type === 'social_media')
```

If this pattern repeats many times, create a helper at the top of the component:
```javascript
const canManagePosts = isManagement(user?.role) || user?.producer_type === 'social_media';
```

Then replace all `isManagement(user?.role)` checks that control post/instagram actions with `canManagePosts`.

**Note:** Do NOT change `isManagement` checks that control client editing (name, company, etc.) — social_media should only manage posts, not edit client details.

**Step 2: Verify build**

Run: `cd client && npx vite build --mode development 2>&1 | tail -5`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add client/src/pages/ClientProfilePage.jsx
git commit -m "feat: allow social_media producers to manage posts in client profile"
```

---

### Task 5: Allow social_media producers to manage posts in ScheduleCalendarPage

**Files:**
- Modify: `client/src/pages/ScheduleCalendarPage.jsx`

Same pattern as Task 4. The ScheduleCalendarPage uses `isManagement(user?.role)` to show/hide the "Novo Post" button, edit, publish-now, and delete actions.

**Step 1: Add helper and replace management checks**

At the top of the component (after getting `user` from store):
```javascript
const canManagePosts = isManagement(user?.role) || user?.producer_type === 'social_media';
```

Replace `isManagement(user?.role)` with `canManagePosts` for:
- "Novo Post" button visibility
- Edit post action
- Publish now action
- Delete post action

**Step 2: Verify build**

Run: `cd client && npx vite build --mode development 2>&1 | tail -5`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add client/src/pages/ScheduleCalendarPage.jsx
git commit -m "feat: allow social_media producers to manage posts in schedule calendar"
```

---

## Summary of Changes

| File | Change | Scope |
|------|--------|-------|
| `server/src/middleware/auth.js` | Add `managementOrSocialMedia` middleware | Backend |
| `server/src/modules/instagram/instagram.routes.js` | Use new middleware on POST/DELETE scheduled | Backend |
| `client/src/components/layout/Sidebar.jsx` | Add Clientes + Agenda for social_media | Frontend |
| `client/src/pages/ClientProfilePage.jsx` | Show post actions for social_media | Frontend |
| `client/src/pages/ScheduleCalendarPage.jsx` | Show post actions for social_media | Frontend |

## No Changes Needed

- **Routes (App.jsx):** `/clients`, `/clients/:id` have no role guard. `/schedule` uses `ALL_INTERNAL` which includes `producer`. Already accessible.
- **Backend GET endpoints:** All use `authenticate` only, no role restriction. Already accessible.
- **Backend PUT scheduled posts:** Uses `authenticate` only. Already accessible.
- **Backend publish-now:** Uses `authenticate` only. Already accessible.
