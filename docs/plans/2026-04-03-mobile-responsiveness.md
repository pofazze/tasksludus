# Mobile Responsiveness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make sidebar, clients page, client profile page, and scheduling/posting pages fully usable on mobile devices (360-430px).

**Architecture:** Mobile-first approach using Tailwind responsive classes (`md:` breakpoint at 768px). Sidebar becomes a slide-out drawer on mobile via Sheet component. Tables collapse into card views. Calendar adapts cell sizes. No new dependencies needed — reuse existing Sheet component for mobile nav.

**Tech Stack:** React 19, Tailwind v4, Shadcn/ui Sheet component, Lucide icons

---

### Task 1: AuthLayout — Mobile sidebar toggle + responsive padding

**Files:**
- Modify: `client/src/components/layout/AuthLayout.jsx`

**Step 1: Add mobile hamburger button and sidebar state**

Replace entire file content with:

```jsx
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import Sidebar from './Sidebar';

export default function AuthLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-56 p-0 bg-[#0C0C0F] border-r border-[#1E1E23]">
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/50 md:hidden">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMobileOpen(true)}>
            <Menu size={18} />
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[#9A48EA] flex items-center justify-center">
              <span className="text-white font-display text-[10px] font-bold">T</span>
            </div>
            <span className="font-display font-semibold text-sm text-white tracking-tight">TasksLudus</span>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

**Step 2: Verify it compiles**

Run: `cd client && npx vite build --mode development 2>&1 | tail -5`

**Step 3: Commit**

```bash
git add client/src/components/layout/AuthLayout.jsx
git commit -m "feat: responsive AuthLayout — mobile hamburger + sidebar drawer"
```

---

### Task 2: Sidebar — Accept onNavigate prop for mobile drawer close

**Files:**
- Modify: `client/src/components/layout/Sidebar.jsx`

**Step 1: Add onNavigate prop and wire to NavLink clicks**

Changes needed:
1. Accept `onNavigate` prop
2. Add `onClick={onNavigate}` to each NavLink
3. Remove `h-screen` so it works inside Sheet (Sheet provides its own height)

```jsx
// Change function signature:
export default function Sidebar({ onNavigate }) {

// Change aside className — remove h-screen, add h-full:
<aside className="w-56 h-full bg-[#0C0C0F] border-r border-[#1E1E23] flex flex-col">

// Add onClick to NavLink:
<NavLink
  key={to}
  to={to}
  onClick={onNavigate}
  className={...}
>

// Also add onNavigate to logout:
const handleLogout = () => {
  logout();
  onNavigate?.();
  navigate('/login');
};
```

**Step 2: Verify it compiles**

Run: `cd client && npx vite build --mode development 2>&1 | tail -5`

**Step 3: Commit**

```bash
git add client/src/components/layout/Sidebar.jsx
git commit -m "feat: Sidebar accepts onNavigate prop for mobile drawer close"
```

---

### Task 3: ClientsPage — Responsive search bar, grid, and form

**Files:**
- Modify: `client/src/pages/ClientsPage.jsx`

**Step 1: Make search + filter bar stack on mobile**

Line 186 — change `flex items-center gap-3` to stack:

```jsx
// OLD:
<div className="flex items-center gap-3 mb-5">
  <div className="relative flex-1 max-w-sm">

// NEW:
<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-5">
  <div className="relative flex-1 sm:max-w-sm">
```

**Step 2: Make filter buttons scroll horizontally on mobile**

Line 196 — add overflow-x-auto:

```jsx
// OLD:
<div className="flex items-center gap-1 rounded-lg border border-zinc-800 p-0.5">

// NEW:
<div className="flex items-center gap-1 rounded-lg border border-zinc-800 p-0.5 overflow-x-auto shrink-0">
```

**Step 3: Make form layout responsive**

Line 360 — 3-column form grid:

```jsx
// OLD:
<div className="grid grid-cols-3 gap-6">
  <div className="col-span-2 space-y-6">
  ...
  <div className="space-y-6">  // sidebar col

// NEW:
<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
  <div className="md:col-span-2 space-y-6">
  ...
  <div className="space-y-6">  // sidebar col (stacks below on mobile)
```

Line 365 — inner 2-column grid in form:

```jsx
// OLD:
<div className="grid grid-cols-2 gap-4">

// NEW:
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
```

Line 427 — integrações 2-column:

```jsx
// OLD:
<div className="grid grid-cols-2 gap-4">

// NEW:
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
```

**Step 4: Make form header buttons wrap on mobile**

Line 345-357 — form header:

```jsx
// OLD:
<div className="flex items-center justify-between mb-8">

// NEW:
<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-8">
```

**Step 5: Make edit/cancel buttons visible on mobile (no hover)**

Line 261 — card actions:

```jsx
// OLD:
<div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">

// NEW:
<div className="flex items-center gap-0.5 shrink-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
```

**Step 6: Commit**

```bash
git add client/src/pages/ClientsPage.jsx
git commit -m "feat: ClientsPage responsive — mobile search, form, card actions"
```

---

### Task 4: ClientProfilePage — Responsive header, metrics, kanban, tabs, table, Instagram grid

**Files:**
- Modify: `client/src/pages/ClientProfilePage.jsx`

**Step 1: Make header info stack on mobile**

Line 367 — avatar + info row:

```jsx
// OLD:
<div className="flex items-start gap-4">

// NEW:
<div className="flex items-start gap-3 md:gap-4">
```

Line 384 — company + instagram inline info:

```jsx
// OLD:
<div className="flex items-center gap-3 mt-1">

// NEW:
<div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1">
```

**Step 2: Make metrics row more compact on mobile**

Line 404:

```jsx
// OLD:
<div className="flex flex-wrap gap-x-6 gap-y-2 mt-5 px-1">

// NEW:
<div className="flex flex-wrap gap-x-4 sm:gap-x-6 gap-y-2 mt-4 sm:mt-5 px-1 text-xs sm:text-sm">
```

**Step 3: Make kanban pipeline header responsive**

Line 444 — pipeline header with month filters:

```jsx
// OLD:
<div className="flex items-center justify-between mb-3">

// NEW:
<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
```

**Step 4: Make tabs scrollable on mobile**

Line 529 — tab bar:

```jsx
// OLD:
<div className="flex gap-0.5 mb-5 rounded-lg bg-zinc-900 p-1 border border-zinc-800 w-fit">

// NEW:
<div className="flex gap-0.5 mb-5 rounded-lg bg-zinc-900 p-1 border border-zinc-800 w-full sm:w-fit overflow-x-auto">
```

**Step 5: Make delivery table scroll horizontally on mobile**

Line 590-591 — wrap table in overflow container:

```jsx
// OLD:
<Card>
  <CardContent className="p-0">
    <Table>

// NEW:
<Card>
  <CardContent className="p-0 overflow-x-auto">
    <Table className="min-w-[600px]">
```

**Step 6: Make Instagram metrics grid responsive**

Line 746:

```jsx
// OLD:
<div className="grid grid-cols-4 gap-3 mb-4">

// NEW:
<div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
```

**Step 7: Make Instagram posts grid responsive**

Line 765:

```jsx
// OLD:
<div className="grid grid-cols-3 gap-1.5">

// NEW:
<div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
```

**Step 8: Make Instagram connection card responsive**

Line 659:

```jsx
// OLD:
<div className="flex items-center justify-between">

// NEW:
<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
```

**Step 9: Make delivery detail header responsive**

Line 231:

```jsx
// OLD:
<h1 className="text-2xl font-bold font-display truncate">{d.title}</h1>

// NEW:
<h1 className="text-xl md:text-2xl font-bold font-display truncate">{d.title}</h1>
```

**Step 10: Commit**

```bash
git add client/src/pages/ClientProfilePage.jsx
git commit -m "feat: ClientProfilePage responsive — metrics, kanban, tabs, table, IG grid"
```

---

### Task 5: ScheduleCalendarPage — Responsive calendar grid and day detail

**Files:**
- Modify: `client/src/pages/ScheduleCalendarPage.jsx`

**Step 1: Make header stack on mobile**

Line 199:

```jsx
// OLD:
<div className="flex items-center justify-between mb-6">

// NEW:
<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
```

**Step 2: Make controls bar wrap on mobile**

Line 212:

```jsx
// OLD:
<div className="flex items-center justify-between mb-4">

// NEW:
<div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
```

**Step 3: Make calendar cells smaller on mobile**

Line 262 — cell min-height:

```jsx
// OLD:
className={`relative min-h-[100px] p-1.5 border-b border-r...

// NEW:
className={`relative min-h-[70px] sm:min-h-[100px] p-1 sm:p-1.5 border-b border-r...
```

**Step 4: Abbreviate day headers on mobile**

Line 56 — add short day names:

```jsx
// ADD after DAY_NAMES:
const DAY_NAMES_SHORT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
```

Line 241-246 — use short names on mobile:

```jsx
// OLD:
<div className="grid grid-cols-7 border-b border-zinc-800">
  {DAY_NAMES.map((d) => (
    <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">
      {d}
    </div>
  ))}
</div>

// NEW:
<div className="grid grid-cols-7 border-b border-zinc-800">
  {DAY_NAMES.map((d, i) => (
    <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">
      <span className="hidden sm:inline">{d}</span>
      <span className="sm:hidden">{DAY_NAMES_SHORT[i]}</span>
    </div>
  ))}
</div>
```

**Step 5: Show fewer post chips on mobile**

Line 274 — reduce max visible:

```jsx
// OLD:
{dayPosts.slice(0, 3).map((p) => {

// NEW — show count dot on mobile, chips on desktop:
{dayPosts.slice(0, 3).map((p) => {
  const TypeIcon = TYPE_ICONS[p.post_type] || Image;
  return (
    <div
      key={p.id}
      onClick={(e) => { e.stopPropagation(); navigate(`/schedule/${p.id}`); }}
      className={`flex items-center gap-1 px-1 py-0.5 rounded text-[10px] truncate cursor-pointer hover:brightness-125 ${STATUS_STYLES[p.status] || 'bg-zinc-800'}`}
    >
      <TypeIcon size={9} className="shrink-0" />
      <span className="truncate hidden sm:inline">{p.client_name || 'Post'}</span>
    </div>
  );
})}
```

**Step 6: Make day detail action buttons wrap on mobile**

Line 362 — action buttons:

```jsx
// OLD:
<div className="flex gap-1 shrink-0">

// NEW:
<div className="flex gap-1 shrink-0 flex-wrap">
```

**Step 7: Commit**

```bash
git add client/src/pages/ScheduleCalendarPage.jsx
git commit -m "feat: ScheduleCalendarPage responsive — compact cells, short day names"
```

---

### Task 6: AgendamentoTab — Minor mobile tweaks

**Files:**
- Modify: `client/src/components/instagram/AgendamentoTab.jsx`

**Step 1: Make tab labels hide text on small mobile, show icon + count only**

Line 104 — tab bar already uses `flex-1` which is fine. Just ensure text doesn't overflow:

```jsx
// OLD:
<div className="flex gap-1 p-1 rounded-lg bg-zinc-900 border border-zinc-800">

// NEW:
<div className="flex gap-1 p-1 rounded-lg bg-zinc-900 border border-zinc-800 overflow-x-auto">
```

**Step 2: Make PostCard action button visible always (no hover needed on mobile)**

The PostCard already shows the button always (not hover-gated), so no change needed here.

**Step 3: Commit**

```bash
git add client/src/components/instagram/AgendamentoTab.jsx
git commit -m "feat: AgendamentoTab responsive — scrollable tabs"
```

---

### Task 7: Sheet component — Ensure mobile-friendly defaults

**Files:**
- Modify: `client/src/components/ui/sheet.jsx` (check if left side is supported)

**Step 1: Verify Sheet supports `side="left"`**

Read the Sheet component and check if it handles `side="left"` for the mobile drawer. If not, add support.

The Sheet component likely already supports this since it's from Shadcn. Verify and only modify if needed.

**Step 2: Commit if changed**

```bash
git add client/src/components/ui/sheet.jsx
git commit -m "fix: Sheet component supports left side for mobile nav drawer"
```

---

### Task 8: Final verification

**Step 1: Build check**

Run: `cd client && npx vite build`
Expected: Build succeeds with no errors.

**Step 2: Visual test**

Open Chrome DevTools → toggle device toolbar → test at 375px (iPhone SE) and 390px (iPhone 12):
- [ ] Sidebar hidden, hamburger visible
- [ ] Hamburger opens drawer, navigation works, drawer closes on nav
- [ ] ClientsPage: search + filter stack vertically, cards fill width, form stacks
- [ ] ClientProfilePage: metrics wrap, kanban scrolls, table scrolls, tabs fit, IG grid 2-col
- [ ] ScheduleCalendarPage: calendar readable, short day names, compact cells
- [ ] AgendamentoTab: tabs scroll, PostCards readable

**Step 3: Final commit**

```bash
git commit -m "feat: mobile responsiveness for sidebar, clients, profile, scheduling"
```
