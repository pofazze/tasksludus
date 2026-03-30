# Dashboard Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the management dashboard to focus on team production visibility with a leaderboard-style layout showing who is producing more/less.

**Architecture:** Replace the current dashboard (KPI cards + pie/bar charts + recent deliveries + boost breakdown) with a clean 3-section layout: summary KPI cards (3), team production leaderboard (main focus), and compact pipeline overview. Data comes from existing endpoints (`/ranking`, `/goals`, `/deliveries`) — no backend changes needed.

**Tech Stack:** React 19, Tailwind v4, Shadcn/ui (Card, Badge, Avatar), Recharts removed (no charts), Zustand (authStore), SSE (useServerEvent)

**UI/UX Quality Rules (from ui-ux-pro-max):**
- NO emojis as icons — use Lucide SVG icons (Medal, Crown, Award) instead of 🥇🥈🥉
- cursor-pointer on all clickable elements
- Hover states with smooth transitions (150-300ms)
- tabular-nums on numeric values for alignment
- Progress bar uses transition-all duration-500 (transform-based, no layout shift)
- Touch targets ≥ 44px on interactive leaderboard rows
- Focus states visible for keyboard navigation
- Executive Dashboard pattern: large KPIs (max 3-4), at-a-glance, minimal detail

---

### Task 1: Strip DashboardPage to skeleton

**Files:**
- Modify: `client/src/pages/DashboardPage.jsx` (full rewrite, 543 lines → ~250 lines)

**Step 1: Replace the management view with a clean skeleton**

Replace the entire file content. Keep the same imports structure, data fetching, SSE, and producer view — but gut the management JSX completely.

```jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import api from '@/services/api';
import useAuthStore from '@/stores/authStore';
import { isManagement, isCeo } from '@/lib/roles';
import { formatCurrency } from '@/lib/utils';
import {
  PIPELINE_STATUSES,
  PIPELINE_STATUS_COLORS,
  PIPELINE_ORDER,
  PRODUCER_TYPE_LABELS,
  CONTENT_TYPE_LABELS,
} from '@/lib/constants';
import useServerEvent from '@/hooks/useServerEvent';
import PageLoading from '@/components/common/PageLoading';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Package, CheckCircle2, Clock, Trophy, TrendingUp,
  ArrowRight, Medal, Crown, Award,
} from 'lucide-react';

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [deliveries, setDeliveries] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [goals, setGoals] = useState([]);
  const [usersList, setUsersList] = useState([]);

  const isMgmt = isManagement(user?.role);

  const currentMonth = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  };

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
        );
      }

      const results = await Promise.all(requests);
      setDeliveries(results[0].data);
      setRanking(results[1].data);
      if (results[2]) setGoals(results[2].data);
      if (results[3]) setUsersList(results[3].data);
    } catch {
      if (loading) toast.error('Erro ao carregar dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDashboard(); }, []);

  useServerEvent(
    ['delivery:created', 'delivery:updated', 'delivery:deleted', 'post:updated', 'ranking:updated', 'goals:updated'],
    fetchDashboard
  );

  if (loading) return <PageLoading />;

  const activeDeliveries = deliveries.filter((d) => d.status !== 'cancelado');
  const totalPublished = activeDeliveries.filter((d) => d.status === 'publicacao' || d.status === 'completed').length;
  const totalInPipeline = activeDeliveries.filter((d) => d.status !== 'publicacao' && d.status !== 'completed').length;

  // --- Management View ---
  if (isMgmt) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
        <p className="text-muted-foreground">Skeleton — implementar KPIs, leaderboard e pipeline</p>
      </div>
    );
  }

  // --- Producer View (keep existing) ---
  const myDeliveries = deliveries.filter((d) => d.user_id === user?.id);
  const myPublished = myDeliveries.filter((d) => d.status === 'publicacao' || d.status === 'completed').length;
  const myInPipeline = myDeliveries.filter((d) => d.status !== 'publicacao' && d.status !== 'completed').length;
  const myRank = ranking.find((r) => r.user_id === user?.id);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {/* Personal KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/deliveries')}>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-lg p-2.5 bg-purple-500/15">
              <Package size={22} className="text-purple-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Minhas Entregas</p>
              <p className="text-2xl font-bold">{myDeliveries.length}</p>
            </div>
            <ArrowRight size={16} className="text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-lg p-2.5 bg-emerald-500/15">
              <CheckCircle2 size={22} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Publicadas</p>
              <p className="text-2xl font-bold">{myPublished}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-lg p-2.5 bg-blue-500/15">
              <Clock size={22} className="text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Em Produção</p>
              <p className="text-2xl font-bold">{myInPipeline}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/ranking')}>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-lg p-2.5 bg-yellow-500/15">
              <Trophy size={22} className="text-yellow-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Meu Ranking</p>
              <p className="text-2xl font-bold">{myRank ? `#${myRank.rank}` : '—'}</p>
              {myRank && <p className="text-xs text-muted-foreground">{myRank.multiplier}x multiplicador</p>}
            </div>
            <ArrowRight size={16} className="text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      {/* Personal pipeline */}
      <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Meu Pipeline</h2>
      <div className="flex gap-1 mb-6 overflow-x-auto">
        {PIPELINE_ORDER.map((status) => {
          const count = myDeliveries.filter((d) => d.status === status).length;
          return (
            <div
              key={status}
              className={`flex flex-col items-center px-3 py-2 rounded-lg text-xs whitespace-nowrap ${
                count > 0 ? PIPELINE_STATUS_COLORS[status] : 'bg-zinc-800/30 text-zinc-600'
              }`}
            >
              <span className="font-bold text-lg">{count}</span>
              <span>{PIPELINE_STATUSES[status]}</span>
            </div>
          );
        })}
      </div>

      {/* Recent deliveries */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-base font-semibold">Minhas Entregas Recentes</h3>
            <button onClick={() => navigate('/deliveries')} className="text-sm text-[#9A48EA] hover:underline flex items-center gap-1">
              Ver todas <ArrowRight size={12} />
            </button>
          </div>
          {myDeliveries.slice(0, 10).map((d) => (
            <div key={d.id} className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{d.title}</p>
                <p className="text-xs text-muted-foreground">{CONTENT_TYPE_LABELS[d.content_type] || d.content_type}</p>
              </div>
              <Badge variant="secondary" className={PIPELINE_STATUS_COLORS[d.status] || 'bg-zinc-800/50 text-zinc-300'}>
                {PIPELINE_STATUSES[d.status] || d.status}
              </Badge>
            </div>
          ))}
          {myDeliveries.length === 0 && (
            <p className="text-center text-muted-foreground py-4">Nenhuma entrega este mês</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 2: Verify the app still renders**

Run: `cd client && npx vite build --mode development 2>&1 | head -20`
Expected: Build succeeds without errors.

**Step 3: Commit skeleton**

```bash
git add client/src/pages/DashboardPage.jsx
git commit -m "refactor: strip dashboard management view to skeleton for redesign"
```

---

### Task 2: Build KPI summary cards (management view)

**Files:**
- Modify: `client/src/pages/DashboardPage.jsx` (replace the skeleton management return)

**Step 1: Replace the management skeleton JSX**

Find the management view return block (the `if (isMgmt)` block) and replace it with:

```jsx
  if (isMgmt) {
    const publishedPct = activeDeliveries.length > 0
      ? Math.round((totalPublished / activeDeliveries.length) * 100)
      : 0;

    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/deliveries')}>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="rounded-lg p-2.5 bg-purple-500/15">
                <Package size={22} className="text-[#9A48EA]" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Entregas do Mês</p>
                <p className="text-2xl font-bold">{activeDeliveries.length}</p>
              </div>
              <ArrowRight size={16} className="text-muted-foreground" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="rounded-lg p-2.5 bg-emerald-500/15">
                <CheckCircle2 size={22} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Publicadas</p>
                <p className="text-2xl font-bold">{totalPublished}</p>
                <p className="text-xs text-muted-foreground">{publishedPct}% do total</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="rounded-lg p-2.5 bg-blue-500/15">
                <Clock size={22} className="text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Em Produção</p>
                <p className="text-2xl font-bold">{totalInPipeline}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* LEADERBOARD PLACEHOLDER */}
        <p className="text-muted-foreground mb-8">Leaderboard placeholder</p>

        {/* PIPELINE PLACEHOLDER */}
        <p className="text-muted-foreground">Pipeline placeholder</p>
      </div>
    );
  }
```

**Step 2: Verify it renders**

Run: `cd client && npx vite build --mode development 2>&1 | head -20`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add client/src/pages/DashboardPage.jsx
git commit -m "feat: add KPI summary cards to management dashboard"
```

---

### Task 3: Build the team production leaderboard

**Files:**
- Modify: `client/src/pages/DashboardPage.jsx` (replace leaderboard placeholder)

This is the core of the redesign. The leaderboard combines data from ranking + goals + deliveries.

**Step 1: Add leaderboard data computation**

Add this computed data block right after `const publishedPct = ...` (inside the `if (isMgmt)` block, before the return):

```jsx
    // Build leaderboard: merge ranking + goals + delivery breakdown
    const leaderboard = ranking.map((entry) => {
      const userGoal = goals.find((g) => g.user_id === entry.user_id || g.user_id === entry.id);
      const userDeliveries = deliveries.filter((d) => d.user_id === (entry.user_id || entry.id));
      const published = userDeliveries.filter((d) => d.status === 'publicacao' || d.status === 'completed').length;
      const inProduction = userDeliveries.filter((d) => d.status !== 'publicacao' && d.status !== 'completed' && d.status !== 'cancelado').length;
      const target = userGoal?.monthly_target || 0;
      const pct = target > 0 ? Math.round((entry.total_deliveries / target) * 100) : null;

      return {
        ...entry,
        published,
        inProduction,
        target,
        pct,
      };
    });
```

**Step 2: Replace leaderboard placeholder with JSX**

Replace `{/* LEADERBOARD PLACEHOLDER */}` and the `<p>` placeholder with:

```jsx
        {/* Team Production Leaderboard */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Produção do Time
            </h2>
            <button
              onClick={() => navigate('/ranking')}
              className="text-sm text-[#9A48EA] hover:underline flex items-center gap-1"
            >
              Ver ranking <ArrowRight size={12} />
            </button>
          </div>

          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {leaderboard.length === 0 && (
                <p className="text-center text-muted-foreground py-8">Nenhum dado de produção este mês</p>
              )}
              {leaderboard.map((entry, idx) => {
                const positionIcon = idx === 0
                  ? <Crown size={20} className="text-yellow-400" />
                  : idx === 1
                    ? <Medal size={20} className="text-zinc-400" />
                    : idx === 2
                      ? <Award size={20} className="text-amber-600" />
                      : null;

                const barColor = entry.pct === null
                  ? 'bg-zinc-700'
                  : entry.pct >= 100
                    ? 'bg-[#9A48EA]'
                    : entry.pct >= 80
                      ? 'bg-emerald-500'
                      : entry.pct >= 50
                        ? 'bg-amber-500'
                        : 'bg-red-500';

                const barWidth = entry.pct !== null
                  ? `${Math.min(entry.pct, 100)}%`
                  : `${entry.total_deliveries > 0 ? Math.min(entry.total_deliveries * 5, 100) : 0}%`;

                return (
                  <div
                    key={entry.user_id || entry.id}
                    className="flex items-center gap-4 px-4 py-4 cursor-pointer transition-colors duration-150 hover:bg-muted/30"
                  >
                    {/* Position */}
                    <div className="w-8 flex items-center justify-center shrink-0">
                      {positionIcon || (
                        <span className="text-sm font-bold text-muted-foreground tabular-nums">{idx + 1}</span>
                      )}
                    </div>

                    {/* Avatar */}
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarImage src={entry.avatar_url} />
                      <AvatarFallback className="text-xs">
                        {entry.name?.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>

                    {/* Name + Type + Progress Bar */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium truncate">{entry.name}</span>
                        {entry.producer_type && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-zinc-800 text-zinc-400 shrink-0">
                            {PRODUCER_TYPE_LABELS[entry.producer_type] || entry.producer_type}
                          </Badge>
                        )}
                      </div>
                      {/* Progress bar */}
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden mb-1">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                          style={{ width: barWidth }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {entry.published} pub · {entry.inProduction} prod
                        {entry.target > 0 && (
                          <span> · Meta: {entry.target} ({entry.pct}%)</span>
                        )}
                      </p>
                    </div>

                    {/* Right side: total + multiplier */}
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold tabular-nums">{entry.total_deliveries}</p>
                      <p className="text-xs text-muted-foreground">entregas</p>
                    </div>

                    {entry.multiplier && (
                      <Badge variant="secondary" className="bg-purple-500/15 text-purple-400 shrink-0">
                        {entry.multiplier}x
                      </Badge>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
```

**Step 3: Verify it builds**

Run: `cd client && npx vite build --mode development 2>&1 | head -20`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add client/src/pages/DashboardPage.jsx
git commit -m "feat: add team production leaderboard to dashboard"
```

---

### Task 4: Add compact pipeline overview

**Files:**
- Modify: `client/src/pages/DashboardPage.jsx` (replace pipeline placeholder)

**Step 1: Replace pipeline placeholder**

Replace `{/* PIPELINE PLACEHOLDER */}` and the `<p>` placeholder with:

```jsx
        {/* Compact Pipeline Overview */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
            Pipeline
          </h2>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {PIPELINE_ORDER.map((status) => {
              const count = deliveries.filter((d) => d.status === status).length;
              return (
                <div
                  key={status}
                  onClick={() => navigate(`/deliveries?status=${status}`)}
                  className={`flex flex-col items-center px-3 py-2 rounded-lg text-xs whitespace-nowrap cursor-pointer transition-opacity hover:opacity-80 ${
                    count > 0 ? PIPELINE_STATUS_COLORS[status] : 'bg-zinc-800/30 text-zinc-600'
                  }`}
                >
                  <span className="font-bold text-base">{count}</span>
                  <span>{PIPELINE_STATUSES[status]}</span>
                </div>
              );
            })}
          </div>
        </div>
```

**Step 2: Verify it builds**

Run: `cd client && npx vite build --mode development 2>&1 | head -20`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add client/src/pages/DashboardPage.jsx
git commit -m "feat: add compact pipeline overview to dashboard"
```

---

### Task 5: Clean up unused imports and remove Recharts dependency

**Files:**
- Modify: `client/src/pages/DashboardPage.jsx` (clean imports at top)

**Step 1: Verify current imports and remove unused ones**

The final DashboardPage should only have these imports (remove BarChart, PieChart, Cell, CartesianGrid, Tooltip, ResponsiveContainer, DollarSign, BarChart3, Users, Target, CardHeader, CardTitle, and the PIE_COLORS constant):

Verify the import block at the top of DashboardPage.jsx matches exactly:

```jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import api from '@/services/api';
import useAuthStore from '@/stores/authStore';
import { isManagement, isCeo } from '@/lib/roles';
import { formatCurrency } from '@/lib/utils';
import {
  PIPELINE_STATUSES,
  PIPELINE_STATUS_COLORS,
  PIPELINE_ORDER,
  PRODUCER_TYPE_LABELS,
  CONTENT_TYPE_LABELS,
} from '@/lib/constants';
import useServerEvent from '@/hooks/useServerEvent';
import PageLoading from '@/components/common/PageLoading';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Package, CheckCircle2, Clock, Trophy, TrendingUp,
  ArrowRight, Medal, Crown, Award,
} from 'lucide-react';
```

Also remove the `PIE_COLORS` constant and the `clients`/`calculations` state variables and their setters since they are no longer used in the management view.

Remove from fetch: the `api.get('/clients')`, `api.get('/boost')` calls and their result assignments `setClients`, `setCalculations`. Keep `clients` state ONLY if needed for the `getClientName` helper — but since we removed recent deliveries, check if `getClientName` is still used. If not, remove it entirely.

Check: `isCeo` import — still needed for producer view? No, producer view doesn't use it. But check if it's used anywhere. If `isCeo` is only used in the old boost card, remove it from imports.

After cleanup, verify `formatCurrency` and `TrendingUp` — if unused, remove them too. The `Trophy` import is used in producer view. `TrendingUp` was used in the old goals KPI card — remove if unused.

**Step 2: Verify build**

Run: `cd client && npx vite build --mode development 2>&1 | head -20`
Expected: Build succeeds with no warnings about unused imports.

**Step 3: Commit**

```bash
git add client/src/pages/DashboardPage.jsx
git commit -m "chore: clean up unused imports and state from dashboard redesign"
```

---

### Task 6: Visual QA and polish

**Files:**
- Modify: `client/src/pages/DashboardPage.jsx` (minor adjustments only if needed)

**Step 1: Start the dev server and visually verify**

Run: `cd client && npx vite --port 4567`

Open browser and check:
1. Management view shows 3 KPI cards in a row
2. Leaderboard shows all team members ordered by total deliveries
3. Progress bars have correct colors (red < 50%, amber 50-80%, green 80-100%, purple > 100%)
4. Medal emojis show for positions 1-3
5. Producer type badges render correctly
6. Pipeline chips show counts with correct colors
7. Pipeline chips are clickable (navigate to deliveries with filter)
8. Producer view still works unchanged
9. SSE events trigger re-fetch (create a delivery in another tab to test)
10. Page is responsive (resize browser to mobile width)

**Step 2: Fix any visual issues found**

Common fixes to watch for:
- If leaderboard items are too cramped: increase `py-4` to `py-5`
- If progress bar is too thin: increase `h-2` to `h-2.5`
- If multiplier badge overlaps on small screens: add `hidden sm:flex` or adjust layout
- If no ranking data appears: check that the `/ranking` endpoint returns data for the current month

**Step 3: Final commit**

```bash
git add client/src/pages/DashboardPage.jsx
git commit -m "feat: complete dashboard redesign with team production leaderboard"
```

---

## Summary of Changes

| Before | After |
|--------|-------|
| 4 KPI cards (entregas, equipe, metas, boost) | 3 KPI cards (entregas, publicadas, em produção) |
| Bar chart "Carga de Trabalho" | Leaderboard de Produção do Time |
| Pie chart "Entregas por Formato" | Removed |
| "Entregas Recentes" list | Removed |
| "Top Ranking do Mês" card | Integrated into leaderboard |
| "Boost do Mês" breakdown (CEO) | Removed |
| Recharts dependency used | Recharts not imported |
| ~543 lines | ~250 lines |

## No Backend Changes Required

All data comes from existing endpoints:
- `GET /ranking?month=X` → name, avatar, producer_type, total_deliveries, multiplier, rank
- `GET /goals?month=X` → monthly_target per user_id
- `GET /deliveries?month=X` → status breakdown per user_id for published/in-production counts
