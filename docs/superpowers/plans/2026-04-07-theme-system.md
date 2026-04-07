# Theme System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch TasksLudus from dark-first to light-first with dark mode support, keeping #9A48EA purple as primary color.

**Architecture:** Swap CSS variables in `:root` to light palette, move dark palette to `.dark` class. Use `next-themes` (already installed) with `ThemeProvider` wrapping the app. Replace all hardcoded hex colors with semantic Tailwind classes that respond to dark: variant. Add theme toggle in Settings.

**Tech Stack:** Tailwind CSS v4, next-themes, CSS custom properties, Shadcn/ui components

**Spec:** `docs/superpowers/specs/2026-04-07-ui-redesign-design.md` — Sub-project 1

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `client/src/index.css` | Modify | Swap :root to light, add .dark with dark values, update scrollbar/sonner/selection/range |
| `client/src/App.jsx` | Modify | Wrap with ThemeProvider from next-themes |
| `client/src/lib/constants.js` | Modify | Dual-mode status colors using dark: variant |
| `client/src/components/layout/Sidebar.jsx` | Modify | Light-first sidebar with dark: variants |
| `client/src/components/layout/AuthLayout.jsx` | Modify | Light-first layout shell with dark: variants |
| `client/src/pages/LoginPage.jsx` | Modify | Light-first login with dark: variants |
| `client/src/pages/SettingsPage.jsx` | Modify | Add Appearance tab with theme toggle |
| `client/src/pages/DeliveriesPage.jsx` | Modify | Replace hardcoded bg-[#111114] selects |
| `client/src/pages/DashboardPage.jsx` | Modify | Replace hardcoded dark colors |
| `client/src/pages/ClientsPage.jsx` | Modify | Replace hardcoded dark colors |
| `client/src/pages/RankingPage.jsx` | Modify | Replace hardcoded bg-[#111114] select |
| `client/src/pages/GoalsPage.jsx` | Modify | Replace hardcoded bg-[#111114] selects |
| `client/src/pages/CalculationsPage.jsx` | Modify | Replace hardcoded bg-[#111114] select |
| `client/src/pages/BoostPage.jsx` | Modify | Replace all hardcoded hex colors |
| `client/src/pages/PrivacyPolicyPage.jsx` | Modify | Replace hardcoded hex colors |
| `client/src/pages/PublicApprovalPage.jsx` | Modify | Replace hardcoded hex colors |
| `client/src/components/ui/date-time-picker.jsx` | Modify | Replace hardcoded hex colors |
| `client/src/components/instagram/PostReviewSheet.jsx` | Modify | Replace hardcoded hex colors |
| `client/src/components/instagram/ScheduledPostForm.jsx` | Modify | Replace hardcoded hex colors |
| `client/src/components/approvals/ApprovalReviewSheet.jsx` | Modify | Replace hardcoded hex colors |

---

### Task 1: Install new dependencies

**Files:**
- Modify: `client/package.json`

- [ ] **Step 1: Install echarts, echarts-for-react, @hello-pangea/dnd, @tanstack/react-table**

```bash
cd /home/dev/projetos/client && npm install echarts echarts-for-react @hello-pangea/dnd @tanstack/react-table
```

These are needed for later sub-projects but installing now avoids re-running npm install later.

- [ ] **Step 2: Verify installation**

```bash
cd /home/dev/projetos/client && node -e "require('echarts'); require('@hello-pangea/dnd'); require('@tanstack/react-table'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
cd /home/dev/projetos && git add client/package.json client/package-lock.json && git commit -m "chore: install echarts, @hello-pangea/dnd, @tanstack/react-table"
```

---

### Task 2: Update CSS variables — light-first with dark mode

**Files:**
- Modify: `client/src/index.css`

- [ ] **Step 1: Replace entire index.css with light-first theme**

Replace the full content of `client/src/index.css` with:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

/* ── Light Theme (default) ─────────────────────────────────── */

:root {
    --background: #FAFAFA;
    --foreground: #09090B;
    --card: #FFFFFF;
    --card-foreground: #09090B;
    --popover: #FFFFFF;
    --popover-foreground: #09090B;
    --primary: #9A48EA;
    --primary-foreground: #FFFFFF;
    --secondary: #F4F4F5;
    --secondary-foreground: #09090B;
    --muted: #F4F4F5;
    --muted-foreground: #71717A;
    --accent: #F4F4F5;
    --accent-foreground: #09090B;
    --destructive: #EF4444;
    --border: #E4E4E7;
    --input: #E4E4E7;
    --ring: #9A48EA;
    --chart-1: #9A48EA;
    --chart-2: #6366F1;
    --chart-3: #3B82F6;
    --chart-4: #22C55E;
    --chart-5: #F59E0B;
    --radius: 0.5rem;
    --sidebar: #FFFFFF;
    --sidebar-foreground: #64748B;
    --sidebar-primary: #9A48EA;
    --sidebar-primary-foreground: #FFFFFF;
    --sidebar-accent: #F4F4F5;
    --sidebar-accent-foreground: #09090B;
    --sidebar-border: #E4E4E7;
    --sidebar-ring: #9A48EA;

    /* Extended palette */
    --ludus-purple: #9A48EA;
    --ludus-purple-dim: rgba(154, 72, 234, 0.08);
    --surface-1: #F4F4F5;
    --surface-2: #E4E4E7;
    --surface-3: #D4D4D8;
}

/* ── Dark Theme ────────────────────────────────────────────── */

.dark {
    --background: #09090B;
    --foreground: #FAFAFA;
    --card: #18181B;
    --card-foreground: #FAFAFA;
    --popover: #151518;
    --popover-foreground: #FAFAFA;
    --primary: #9A48EA;
    --primary-foreground: #FFFFFF;
    --secondary: #1C1C22;
    --secondary-foreground: #FAFAFA;
    --muted: #1C1C22;
    --muted-foreground: #71717A;
    --accent: #1C1C22;
    --accent-foreground: #FAFAFA;
    --destructive: #EF4444;
    --border: #27272A;
    --input: #27272A;
    --ring: #9A48EA;
    --sidebar: #0C0C0F;
    --sidebar-foreground: #A1A1AA;
    --sidebar-primary: #9A48EA;
    --sidebar-primary-foreground: #FFFFFF;
    --sidebar-accent: #9A48EA;
    --sidebar-accent-foreground: #FFFFFF;
    --sidebar-border: #1E1E23;
    --sidebar-ring: #9A48EA;

    /* Extended palette */
    --ludus-purple: #9A48EA;
    --ludus-purple-dim: rgba(154, 72, 234, 0.12);
    --surface-1: #111114;
    --surface-2: #1A1A1F;
    --surface-3: #222228;
}

@theme inline {
    --font-sans: 'DM Sans', sans-serif;
    --font-display: 'Sora', sans-serif;
    --color-sidebar-ring: var(--sidebar-ring);
    --color-sidebar-border: var(--sidebar-border);
    --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
    --color-sidebar-accent: var(--sidebar-accent);
    --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
    --color-sidebar-primary: var(--sidebar-primary);
    --color-sidebar-foreground: var(--sidebar-foreground);
    --color-sidebar: var(--sidebar);
    --color-chart-5: var(--chart-5);
    --color-chart-4: var(--chart-4);
    --color-chart-3: var(--chart-3);
    --color-chart-2: var(--chart-2);
    --color-chart-1: var(--chart-1);
    --color-ring: var(--ring);
    --color-input: var(--input);
    --color-border: var(--border);
    --color-destructive: var(--destructive);
    --color-accent-foreground: var(--accent-foreground);
    --color-accent: var(--accent);
    --color-muted-foreground: var(--muted-foreground);
    --color-muted: var(--muted);
    --color-secondary-foreground: var(--secondary-foreground);
    --color-secondary: var(--secondary);
    --color-primary-foreground: var(--primary-foreground);
    --color-primary: var(--primary);
    --color-popover-foreground: var(--popover-foreground);
    --color-popover: var(--popover);
    --color-card-foreground: var(--card-foreground);
    --color-card: var(--card);
    --color-foreground: var(--foreground);
    --color-background: var(--background);
    --color-ludus: var(--ludus-purple);
    --color-ludus-dim: var(--ludus-purple-dim);
    --color-surface-1: var(--surface-1);
    --color-surface-2: var(--surface-2);
    --color-surface-3: var(--surface-3);
    --radius-sm: calc(var(--radius) * 0.6);
    --radius-md: calc(var(--radius) * 0.8);
    --radius-lg: var(--radius);
    --radius-xl: calc(var(--radius) * 1.4);
    --radius-2xl: calc(var(--radius) * 1.8);
    --radius-3xl: calc(var(--radius) * 2.2);
    --radius-4xl: calc(var(--radius) * 2.6);
}

@layer base {
    * {
        @apply border-border outline-ring/50;
        font-feature-settings: 'tnum' var(--tnum, );
    }
    .tabular-nums {
        --tnum: 'tnum';
    }
    body {
        @apply bg-background text-foreground antialiased;
    }
    html {
        @apply font-sans;
    }
}

/* ── Typography ──────────────────────────────────────────────── */

.font-display {
    font-family: 'Sora', sans-serif;
}

/* ── Scrollbar Styling ───────────────────────────────────────── */

::-webkit-scrollbar {
    width: 6px;
    height: 6px;
}
::-webkit-scrollbar-track {
    background: transparent;
}
::-webkit-scrollbar-thumb {
    background: #D4D4D8;
    border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
    background: #A1A1AA;
}

.dark ::-webkit-scrollbar-thumb {
    background: #27272A;
}
.dark ::-webkit-scrollbar-thumb:hover {
    background: #3F3F46;
}

/* ── Sonner Toast Override ──────────────────────────────────── */

[data-sonner-toaster] [data-sonner-toast] {
    --normal-bg: #FFFFFF;
    --normal-border: #E4E4E7;
    --normal-text: #09090B;
}

.dark [data-sonner-toaster] [data-sonner-toast] {
    --normal-bg: #1C1C22;
    --normal-border: #27272A;
    --normal-text: #FAFAFA;
}

/* ── Focus Ring ──────────────────────────────────────────────── */

:focus-visible {
    outline: 2px solid #9A48EA;
    outline-offset: 2px;
}

/* ── Selection ───────────────────────────────────────────────── */

::selection {
    background: rgba(154, 72, 234, 0.2);
    color: #09090B;
}

.dark ::selection {
    background: rgba(154, 72, 234, 0.3);
    color: #FAFAFA;
}

/* ── Range Slider ────────────────────────────────────────────── */

input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #FFFFFF;
    cursor: pointer;
    box-shadow: 0 0 0 3px #FAFAFA, 0 0 0 5px #9A48EA;
    transition: box-shadow 0.15s;
}
input[type="range"]::-webkit-slider-thumb:hover {
    box-shadow: 0 0 0 3px #FAFAFA, 0 0 0 5px #C084FC, 0 0 12px rgba(154, 72, 234, 0.4);
}
input[type="range"]::-moz-range-thumb {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #FFFFFF;
    cursor: pointer;
    border: none;
    box-shadow: 0 0 0 3px #FAFAFA, 0 0 0 5px #9A48EA;
}

.dark input[type="range"]::-webkit-slider-thumb {
    background: #FAFAFA;
    box-shadow: 0 0 0 3px #09090B, 0 0 0 5px #9A48EA;
}
.dark input[type="range"]::-webkit-slider-thumb:hover {
    box-shadow: 0 0 0 3px #09090B, 0 0 0 5px #C084FC, 0 0 12px rgba(154, 72, 234, 0.4);
}
.dark input[type="range"]::-moz-range-thumb {
    background: #FAFAFA;
    box-shadow: 0 0 0 3px #09090B, 0 0 0 5px #9A48EA;
}

/* ── Native select styling ──────────────────────────────────── */

.native-select {
    @apply flex h-8 w-full items-center rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none;
    @apply focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50;
    @apply dark:bg-input/30 dark:hover:bg-input/50;
}
```

- [ ] **Step 2: Verify the CSS compiles**

```bash
cd /home/dev/projetos/client && npx vite build --mode development 2>&1 | head -20
```

Expected: No CSS compilation errors.

- [ ] **Step 3: Commit**

```bash
cd /home/dev/projetos && git add client/src/index.css && git commit -m "feat: switch to light-first theme with dark mode support"
```

---

### Task 3: Wrap App with ThemeProvider

**Files:**
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Add ThemeProvider import and wrap BrowserRouter**

At the top of `client/src/App.jsx`, add import:

```javascript
import { ThemeProvider } from 'next-themes';
```

Then wrap the `<BrowserRouter>` inside `<ThemeProvider>`:

```jsx
return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <BrowserRouter>
        {/* ... existing Routes ... */}
        <Toaster richColors position="top-right" />
      </BrowserRouter>
    </ThemeProvider>
);
```

Key props:
- `attribute="class"`: Adds/removes `.dark` class on `<html>` — matches our `@custom-variant dark` in CSS.
- `defaultTheme="light"`: Light-first.
- `enableSystem`: Respects OS preference if user picks "system".

- [ ] **Step 2: Verify app still renders**

```bash
cd /home/dev/projetos/client && npx vite build --mode development 2>&1 | tail -5
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /home/dev/projetos && git add client/src/App.jsx && git commit -m "feat: wrap app with next-themes ThemeProvider (light-first)"
```

---

### Task 4: Update status colors for dual-mode

**Files:**
- Modify: `client/src/lib/constants.js`

- [ ] **Step 1: Replace PIPELINE_STATUS_COLORS with dual-mode values**

Replace the `PIPELINE_STATUS_COLORS` object in `client/src/lib/constants.js`:

```javascript
// Status colors — light/dark dual mode
export const PIPELINE_STATUS_COLORS = {
  triagem: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400',
  planejamento: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-500/15 dark:text-zinc-400',
  captacao: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400',
  edicao_de_video: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400',
  estruturacao: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400',
  design: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  aprovacao: 'bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-400',
  correcao: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  agendamento: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  agendado: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400',
  publicacao: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
};
```

- [ ] **Step 2: Replace APPROVAL_STATUS_COLORS with dual-mode values**

Replace the `APPROVAL_STATUS_COLORS` object:

```javascript
export const APPROVAL_STATUS_COLORS = {
  sm_pending: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  sm_approved: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  client_pending: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400',
  client_approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  client_rejected: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
};
```

- [ ] **Step 3: Commit**

```bash
cd /home/dev/projetos && git add client/src/lib/constants.js && git commit -m "feat: update status colors for light/dark dual mode"
```

---

### Task 5: Update Sidebar for light-first

**Files:**
- Modify: `client/src/components/layout/Sidebar.jsx`

- [ ] **Step 1: Replace hardcoded dark colors with semantic classes**

Replace the entire `return` block in `Sidebar.jsx`. Every hardcoded hex color becomes a semantic Tailwind class with `dark:` variant:

```jsx
return (
    <aside className="w-56 h-full bg-white dark:bg-[#0C0C0F] border-r border-border flex flex-col">
      {/* Brand */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-white font-display text-xs font-bold">T</span>
          </div>
          <span className="font-display font-semibold text-sm text-foreground tracking-tight">
            TasksLudus
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] transition-all duration-150 ${
                isActive
                  ? 'bg-purple-50 text-purple-700 font-medium dark:bg-[#9A48EA]/12 dark:text-[#C084FC]'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-[#71717A] dark:hover:text-[#A1A1AA] dark:hover:bg-white/[0.04]'
              }`
            }
          >
            <Icon size={16} strokeWidth={1.8} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      <div className="border-t border-border px-3 py-3">
        <div className="flex items-center gap-2.5">
          <Avatar className="h-7 w-7 ring-1 ring-black/5 dark:ring-white/10">
            <AvatarImage src={user?.avatar_url} />
            <AvatarFallback className="text-[10px] bg-slate-100 text-slate-500 dark:bg-[#1C1C22] dark:text-[#A1A1AA]">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground truncate">{user?.name}</p>
            <p className="text-[10px] text-muted-foreground truncate capitalize">{user?.role}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            title="Sair"
            className="h-7 w-7 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:text-[#EF4444] dark:hover:bg-[#EF4444]/10"
          >
            <LogOut size={14} />
          </Button>
        </div>
      </div>
    </aside>
);
```

- [ ] **Step 2: Commit**

```bash
cd /home/dev/projetos && git add client/src/components/layout/Sidebar.jsx && git commit -m "feat: update sidebar for light-first with dark mode"
```

---

### Task 6: Update AuthLayout for light-first

**Files:**
- Modify: `client/src/components/layout/AuthLayout.jsx`

- [ ] **Step 1: Replace hardcoded dark colors**

Replace all hardcoded hex colors in `AuthLayout.jsx`:

1. Mobile drawer SheetContent: `className="p-0 bg-white dark:bg-[#0C0C0F] border-r border-border"` 
2. Mobile header border: `border-b border-border` (remove `border-zinc-800/50`)
3. Mobile header brand bg: `bg-primary` (remove `bg-[#9A48EA]`)
4. Mobile header text: `text-foreground` (remove `text-white`)
5. Bottom nav: `bg-white/95 dark:bg-[#0C0C0F]/95 border-t border-border` (remove `border-zinc-800/50 bg-[#0C0C0F]/95`)
6. Bottom nav inactive text: `text-slate-400 dark:text-zinc-500` (remove `text-zinc-500`)
7. Bottom nav active text: `text-primary` (remove `text-[#9A48EA]`)

- [ ] **Step 2: Commit**

```bash
cd /home/dev/projetos && git add client/src/components/layout/AuthLayout.jsx && git commit -m "feat: update AuthLayout for light-first with dark mode"
```

---

### Task 7: Update LoginPage for light-first

**Files:**
- Modify: `client/src/pages/LoginPage.jsx`

- [ ] **Step 1: Replace hardcoded colors**

Key changes:
1. Ambient glow: `bg-primary/[0.04] dark:bg-primary/[0.06]`
2. Brand icon: `bg-primary` (already uses `bg-[#9A48EA]`, switch to semantic)
3. Form card: `bg-card border border-border` (replace `bg-surface-1 border border-border`)
4. Error box: `text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-500/10 dark:border-red-500/20`
5. Labels: `text-muted-foreground` (replace `text-[#A1A1AA]`)
6. Eye button: `text-muted-foreground hover:text-foreground` (replace hardcoded hex)
7. Submit button: `bg-primary hover:bg-primary/90 text-white` (replace `bg-[#9A48EA] hover:bg-[#8B3CD9]`)

- [ ] **Step 2: Commit**

```bash
cd /home/dev/projetos && git add client/src/pages/LoginPage.jsx && git commit -m "feat: update LoginPage for light-first with dark mode"
```

---

### Task 8: Replace hardcoded colors in DeliveriesPage

**Files:**
- Modify: `client/src/pages/DeliveriesPage.jsx`

- [ ] **Step 1: Replace all `bg-[#111114]` selects with native-select class**

In `client/src/pages/DeliveriesPage.jsx`, every native `<select>` and `<input type="month">` that has `className="...bg-[#111114] text-foreground"` should be replaced with:

```
className="native-select"
```

This uses the utility class defined in Task 2's CSS. There are 8 occurrences in DeliveriesPage (3 filter inputs + 5 form selects).

Also replace the pipeline status buttons container:
- `bg-zinc-800/50 text-zinc-500` → `bg-muted text-muted-foreground`
- `ring-purple-500` → `ring-primary`

- [ ] **Step 2: Commit**

```bash
cd /home/dev/projetos && git add client/src/pages/DeliveriesPage.jsx && git commit -m "feat: update DeliveriesPage for light/dark mode"
```

---

### Task 9: Replace hardcoded colors in DashboardPage

**Files:**
- Modify: `client/src/pages/DashboardPage.jsx`

- [ ] **Step 1: Replace hardcoded dark colors**

Key replacements:
1. Progress bar track: `bg-zinc-800` → `bg-muted dark:bg-zinc-800`
2. Purple progress: `bg-[#9A48EA]` → `bg-primary`
3. Pipeline inactive: `bg-zinc-800/30 text-zinc-600` → `bg-muted text-muted-foreground`
4. Workload/format icon bg: `bg-zinc-800` → `bg-muted`
5. Format bar colors remain (they use named Tailwind colors like `bg-blue-500` which work in both modes)
6. Count text: `text-zinc-300` → `text-foreground`
7. Dividers: `divide-zinc-800/50` → `divide-border`
8. Link color: `text-[#9A48EA]` → `text-primary`
9. Purple bg/15: `bg-purple-500/15` → `bg-purple-100 dark:bg-purple-500/15`

- [ ] **Step 2: Commit**

```bash
cd /home/dev/projetos && git add client/src/pages/DashboardPage.jsx && git commit -m "feat: update DashboardPage for light/dark mode"
```

---

### Task 10: Replace hardcoded colors in ClientsPage

**Files:**
- Modify: `client/src/pages/ClientsPage.jsx`

- [ ] **Step 1: Replace hardcoded dark colors**

Key replacements:
1. Avatar bg: `bg-[#9A48EA]/15 text-[#9A48EA]` → `bg-purple-100 text-purple-700 dark:bg-[#9A48EA]/15 dark:text-[#9A48EA]`
2. Inactive badge: `bg-zinc-500/15 text-zinc-400` → `bg-zinc-100 text-zinc-500 dark:bg-zinc-500/15 dark:text-zinc-400`
3. Status filter border: `border-zinc-800` → `border-border`
4. Active filter: `bg-zinc-800 text-zinc-100` → `bg-slate-200 text-slate-900 dark:bg-zinc-800 dark:text-zinc-100`
5. Inactive filter: `text-zinc-500 hover:text-zinc-300` → `text-slate-500 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300`
6. Card hover ring: `hover:ring-zinc-700` → `hover:ring-border`
7. Section separator: `border-zinc-800/50` → `border-border`
8. Instagram text: `text-zinc-600` → `text-muted-foreground`
9. Automation badge active: `bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25` → `bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:hover:bg-emerald-500/25`
10. Automation badge inactive: `bg-zinc-800/50 text-zinc-600 hover:bg-zinc-700/50` → `bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-zinc-800/50 dark:text-zinc-600 dark:hover:bg-zinc-700/50`
11. Empty state icon: `text-zinc-700` → `text-muted-foreground`
12. Form selects: Replace `bg-[#111114]` with `native-select` class (social_media_id and whatsapp_group selects)

- [ ] **Step 2: Commit**

```bash
cd /home/dev/projetos && git add client/src/pages/ClientsPage.jsx && git commit -m "feat: update ClientsPage for light/dark mode"
```

---

### Task 11: Replace hardcoded colors in remaining pages

**Files:**
- Modify: `client/src/pages/RankingPage.jsx`
- Modify: `client/src/pages/GoalsPage.jsx`
- Modify: `client/src/pages/CalculationsPage.jsx`
- Modify: `client/src/pages/SettingsPage.jsx`

- [ ] **Step 1: RankingPage — replace bg-[#111114] select**

Replace the month select's `className` from `"border rounded-md px-3 py-2 text-sm bg-[#111114] text-foreground"` to `"native-select"`.

- [ ] **Step 2: GoalsPage — replace all bg-[#111114] selects**

There are 6 occurrences of `bg-[#111114]` in GoalsPage. Replace each with `native-select`.

- [ ] **Step 3: CalculationsPage — replace bg-[#111114] select**

Replace the select's className from `"border rounded-md px-3 py-2 text-sm bg-[#111114] text-foreground"` to `"native-select"`.

- [ ] **Step 4: SettingsPage — replace bg-[#111114] selects and hardcoded colors**

Replace the 2 `bg-[#111114]` selects (role and producer_type) with `native-select`.
Replace `bg-zinc-800/50` with `bg-muted`.

- [ ] **Step 5: Commit**

```bash
cd /home/dev/projetos && git add client/src/pages/RankingPage.jsx client/src/pages/GoalsPage.jsx client/src/pages/CalculationsPage.jsx client/src/pages/SettingsPage.jsx && git commit -m "feat: update Ranking, Goals, Calculations, Settings pages for light/dark mode"
```

---

### Task 12: Update BoostPage for light-first

**Files:**
- Modify: `client/src/pages/BoostPage.jsx`

- [ ] **Step 1: Replace all hardcoded hex colors**

BoostPage has the most hardcoded colors. Key replacements:

1. All `bg-[#141418]` → `bg-muted dark:bg-[#141418]`
2. All `border-[#1E1E23]` → `border-border`
3. All `border-[#2A2A32]` → `border-border`
4. All `text-[#E4E4E7]` → `text-foreground`
5. All `text-[#A1A1AA]` → `text-muted-foreground`
6. All `text-[#71717A]` → `text-muted-foreground`
7. All `text-[#52525B]` → `text-muted-foreground/70` or `text-slate-400 dark:text-[#52525B]`
8. All `text-[#3F3F46]` → `text-muted-foreground`
9. All `bg-[#1E1E23]` → `bg-muted dark:bg-[#1E1E23]`
10. Input: `bg-[#141418] border border-[#2A2A32]` → `bg-muted border border-border`

Semantic color references (`bg-[#9A48EA]`, `bg-[#22C55E]`, `bg-[#EF4444]`, `bg-[#F97316]`) should use Tailwind named colors: `bg-primary`, `bg-emerald-500`, `bg-red-500`, `bg-orange-500`.

- [ ] **Step 2: Commit**

```bash
cd /home/dev/projetos && git add client/src/pages/BoostPage.jsx && git commit -m "feat: update BoostPage for light/dark mode"
```

---

### Task 13: Update PrivacyPolicyPage and PublicApprovalPage

**Files:**
- Modify: `client/src/pages/PrivacyPolicyPage.jsx`
- Modify: `client/src/pages/PublicApprovalPage.jsx`

- [ ] **Step 1: PrivacyPolicyPage — replace all hardcoded colors**

1. `bg-[#0C0C0F]` → `bg-background`
2. `text-[#E4E4E7]` → `text-foreground`
3. `text-[#A1A1AA]` → `text-muted-foreground`
4. `text-[#71717A]` → `text-muted-foreground`
5. `text-[#52525B]` → `text-muted-foreground/70`
6. `border-[#1E1E23]` → `border-border`
7. `text-[#9A48EA]` → `text-primary`

- [ ] **Step 2: PublicApprovalPage — replace hardcoded colors**

1. `bg-[#09090B]` → `bg-background`
2. `text-white` → `text-foreground`
3. `bg-[#09090B]/95` → `bg-background/95`
4. `border-zinc-800` → `border-border`

- [ ] **Step 3: Commit**

```bash
cd /home/dev/projetos && git add client/src/pages/PrivacyPolicyPage.jsx client/src/pages/PublicApprovalPage.jsx && git commit -m "feat: update Privacy and PublicApproval pages for light/dark mode"
```

---

### Task 14: Update components for light-first

**Files:**
- Modify: `client/src/components/ui/date-time-picker.jsx`
- Modify: `client/src/components/instagram/PostReviewSheet.jsx`
- Modify: `client/src/components/instagram/ScheduledPostForm.jsx`
- Modify: `client/src/components/approvals/ApprovalReviewSheet.jsx`

- [ ] **Step 1: date-time-picker.jsx — replace hardcoded colors**

1. `hover:border-zinc-600 focus-visible:border-[#9A48EA]` → `hover:border-slate-400 focus-visible:border-primary dark:hover:border-zinc-600`
2. `focus-visible:ring-[#9A48EA]/50` → `focus-visible:ring-primary/50`
3. Time selects: `border-zinc-700 bg-zinc-800 text-zinc-200 focus:border-[#9A48EA]` → `border-border bg-muted text-foreground focus:border-primary`

- [ ] **Step 2: PostReviewSheet.jsx — replace hardcoded colors**

1. `hover:border-[#9A48EA]` → `hover:border-primary`
2. `border-zinc-700 bg-transparent text-zinc-300 placeholder:text-zinc-600 focus:border-[#9A48EA]` → `border-border bg-transparent text-foreground placeholder:text-muted-foreground focus:border-primary`
3. `focus:ring-[#9A48EA]/50` → `focus:ring-primary/50`

- [ ] **Step 3: ScheduledPostForm.jsx — replace hardcoded colors**

Same pattern as PostReviewSheet:
1. `border-zinc-700` → `border-border`
2. `text-zinc-200` → `text-foreground`
3. `focus:border-[#9A48EA]` → `focus:border-primary`
4. `focus:ring-[#9A48EA]/50` → `focus:ring-primary/50`

- [ ] **Step 4: ApprovalReviewSheet.jsx — replace hardcoded colors**

1. `hover:border-[#9A48EA]` → `hover:border-primary`

- [ ] **Step 5: Commit**

```bash
cd /home/dev/projetos && git add client/src/components/ui/date-time-picker.jsx client/src/components/instagram/PostReviewSheet.jsx client/src/components/instagram/ScheduledPostForm.jsx client/src/components/approvals/ApprovalReviewSheet.jsx && git commit -m "feat: update UI components for light/dark mode"
```

---

### Task 15: Add theme toggle to SettingsPage

**Files:**
- Modify: `client/src/pages/SettingsPage.jsx`

- [ ] **Step 1: Add Appearance tab with theme toggle**

Import `useTheme` from next-themes:

```javascript
import { useTheme } from 'next-themes';
```

Add at the top of the component:

```javascript
const { theme, setTheme } = useTheme();
```

Add a new tab "Aparencia" as the first tab:

```jsx
<TabsTrigger value="appearance">Aparência</TabsTrigger>
```

Add the TabsContent:

```jsx
<TabsContent value="appearance">
  <div className="space-y-4 max-w-lg">
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tema</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-3">
          {[
            { value: 'light', label: 'Claro' },
            { value: 'dark', label: 'Escuro' },
            { value: 'system', label: 'Sistema' },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={`flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                theme === opt.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  </div>
</TabsContent>
```

Change `defaultValue` of `<Tabs>` from `"general"` to `"appearance"`.

- [ ] **Step 2: Commit**

```bash
cd /home/dev/projetos && git add client/src/pages/SettingsPage.jsx && git commit -m "feat: add theme toggle (light/dark/system) to Settings"
```

---

### Task 16: Visual verification

- [ ] **Step 1: Start the dev server**

```bash
cd /home/dev/projetos && npm run dev
```

- [ ] **Step 2: Take screenshots in light and dark mode**

Use Playwright to screenshot both modes and verify visually:

```bash
node -e "
const { chromium } = require('/usr/local/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox','--disable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:5175/login');
  await p.waitForTimeout(2000);
  await p.screenshot({ path: '/tmp/light-login.png', fullPage: true });
  console.log('Light login screenshot saved');
  await b.close();
})();
"
```

- [ ] **Step 3: Verify no hardcoded hex colors remain**

```bash
cd /home/dev/projetos/client/src && grep -rn 'bg-\[#\(0C0C0F\|111114\|1C1C22\|1E1E23\|09090B\|141418\|2A2A32\)\]' --include='*.jsx' --include='*.js' | grep -v node_modules
```

Expected: No results (all replaced with semantic classes).

- [ ] **Step 4: Final commit if any fixes needed**

```bash
cd /home/dev/projetos && git add -A && git commit -m "fix: cleanup remaining hardcoded dark-mode colors"
```
