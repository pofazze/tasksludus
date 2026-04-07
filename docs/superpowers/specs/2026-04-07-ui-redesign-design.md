# TasksLudus UI Redesign — Design Spec

## Overview

Full frontend UI redesign of TasksLudus, split into 4 sub-projects executed sequentially. The redesign switches from dark-first to light-first with dark mode support, replaces Recharts with ECharts, rebuilds the Deliveries page with a Kanban pipeline, improves the Clients page with WhatsApp group photos and missing-info badges, and refreshes all remaining pages.

## Decisions

| Topic | Decision |
|-------|----------|
| Theme | Light-first + dark mode, purple #9A48EA |
| Charts | ECharts (replace Recharts) |
| Kanban | @hello-pangea/dnd |
| Tables | @tanstack/react-table |
| Deliveries tabs | Pipeline, Agendamento, Instagram, Aprovacao, Correcao |
| Card popup | Modal central grande (80-90% viewport) |
| Kanban card | Titulo + Responsavel (avatar) + Formato badge + Data + Thumbnail |
| Client card name | Hidden (already inside client profile), optional prop for future global page |
| Client photo | WhatsApp group photo via Evolution API, fallback to initials |
| Missing info badge | Red dot + hover tooltip listing missing fields |

## Sub-project 1: Theme System

### Goal

Switch `:root` from dark to light. Move dark theme to `.dark` class. All pages inherit the new theme automatically.

### CSS Variables — Light (`:root`)

```
--background: #FAFAFA
--foreground: #09090B
--card: #FFFFFF
--card-foreground: #09090B
--popover: #FFFFFF
--popover-foreground: #09090B
--primary: #9A48EA
--primary-foreground: #FFFFFF
--secondary: #F4F4F5
--secondary-foreground: #09090B
--muted: #F4F4F5
--muted-foreground: #71717A
--accent: #F4F4F5
--accent-foreground: #09090B
--destructive: #EF4444
--border: #E4E4E7
--input: #E4E4E7
--ring: #9A48EA
--chart-1: #9A48EA
--chart-2: #6366F1
--chart-3: #3B82F6
--chart-4: #22C55E
--chart-5: #F59E0B
--sidebar: #FFFFFF
--sidebar-foreground: #64748B
--sidebar-primary: #9A48EA
--sidebar-primary-foreground: #FFFFFF
--sidebar-accent: #F4F4F5
--sidebar-accent-foreground: #09090B
--sidebar-border: #E4E4E7
--sidebar-ring: #9A48EA
--ludus-purple: #9A48EA
--ludus-purple-dim: rgba(154, 72, 234, 0.08)
--surface-1: #F4F4F5
--surface-2: #E4E4E7
--surface-3: #D4D4D8
```

### CSS Variables — Dark (`.dark`)

Keep current `:root` values (Obsidian Studio) under `.dark` class.

### Additional CSS changes

- **Scrollbar**: Light mode gets `#D4D4D8` thumb, `#F4F4F5` track. Dark stays as-is.
- **Focus ring**: Stays `#9A48EA` in both modes.
- **Selection**: Light mode uses `rgba(154, 72, 234, 0.2)` with dark text.
- **Sonner toast**: Needs light mode override (white bg, dark text, light border).
- **Range slider**: Adapt shadow colors for light mode.
- **`@custom-variant dark`**: Already configured as `(&:is(.dark *))` — works with next-themes class strategy.

### Status colors — dual mode

Constants in `lib/constants.js` need light/dark variants:

```javascript
// Light mode: bg-orange-100 text-orange-700
// Dark mode: bg-orange-500/15 text-orange-400
// Solution: use Tailwind dark: variant in className
// Example: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400'
```

### Theme toggle

- Use `next-themes` ThemeProvider (already installed) wrapping the app.
- Add toggle in SettingsPage and optionally in Sidebar footer.
- Respect system preference by default.

### Sidebar redesign (light)

- White background with subtle right border.
- Active item: light purple background (`bg-purple-50 text-purple-700` / `dark:bg-purple-500/15 dark:text-purple-400`).
- Hover: `bg-gray-100` / `dark:bg-zinc-800`.
- Logo and section headers adapt to foreground colors.
- User profile section at bottom adapts.

### Fonts

Keep DM Sans (body) + Sora (display). No changes.

### New dependencies

- `echarts`: ^5.5
- `echarts-for-react`: ^3.0
- `@hello-pangea/dnd`: ^17.0
- `@tanstack/react-table`: ^8.20

### Dependencies to remove (after migration)

- `recharts` (replaced by ECharts)
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` (replaced by @hello-pangea/dnd)

---

## Sub-project 2: Deliveries Page Redesign

### Goal

Replace the current table-based Deliveries page with a tabbed interface featuring a Kanban pipeline as the primary view.

### Page structure

```
Header: "Entregas" + filters (month, format) + "Nova Entrega" button
├── Tabs: [Pipeline] [Agendamento] [Instagram] [Aprovacao] [Correcao]
├── Tab: Pipeline
│   ├── Toggle: [Kanban icon] [List icon]
│   ├── Kanban view (default)
│   │   └── 11 columns (PIPELINE_ORDER), each with:
│   │       ├── Header: status name + count + color indicator
│   │       └── Draggable cards
│   └── List view (table with TanStack React Table)
├── Tab: Agendamento
│   ├── Filter: "Agendados" | "Aprovados"
│   └── Cards/list of deliveries with status agendamento/agendado
├── Tab: Instagram
│   └── Scheduled posts with preview (reuses existing instagram/ components)
├── Tab: Aprovacao
│   └── Reuses ApprovalTab component
└── Tab: Correcao
    └── Reuses CorrectionTab component
```

### Kanban card component

**File**: `components/deliveries/DeliveryCard.jsx`

```
Props:
  - delivery: object (title, status, content_type, user_name, user_avatar, media_urls, created_at)
  - showClient?: boolean (default false, for future global page)
  - onClick: () => void

Layout:
  ┌─────────────────────────┐
  │ [Thumbnail area]        │  ← media_urls[0] if exists, else colored placeholder
  │ 16:9 aspect ratio       │
  ├─────────────────────────┤
  │ Title (truncate 2 lines)│
  │ [Format badge] · Date   │
  │ [Avatar] User name      │
  │ [Client name]           │  ← only if showClient=true
  └─────────────────────────┘
```

Card styling:
- `rounded-xl` border, subtle shadow
- Hover: lift effect (`hover:-translate-y-0.5 hover:shadow-md`)
- Light: white bg, dark: zinc-900 bg
- Thumbnail: `object-cover rounded-t-xl`
- Format badge uses existing `PIPELINE_STATUS_COLORS` adapted for dual theme

### Kanban board component

**File**: `components/deliveries/KanbanBoard.jsx`

- Uses `@hello-pangea/dnd` DragDropContext, Droppable, Draggable
- Columns flex horizontally with `overflow-x-auto`
- Each column: min-width 280px, max-height calc(100vh - header)
- Column header: status label + count badge + colored left border
- On drag end: call `PUT /deliveries/:id` with new status, optimistic update
- Empty column: dashed border placeholder "Arraste entregas aqui"

### Detail modal component

**File**: `components/deliveries/DeliveryDetailModal.jsx`

- Fixed overlay: `bg-black/50 backdrop-blur-sm`
- Content: `max-w-5xl w-[90vw] max-h-[90vh]` centered
- Close: X button, overlay click, Escape key
- Layout:
  - Header: title + status badge + format badge + close button
  - Body (scrollable):
    - Media preview (image carousel or video player)
    - Info grid: responsible, client, date, difficulty, urgency
    - ClickUp link (if exists)
  - Footer: action buttons (edit, change status dropdown)

### List view

- TanStack React Table with columns: Title, Responsible, Client, Format, Status, ClickUp, Actions
- Sortable columns, search filter
- Row click opens the same detail modal
- Pagination (20 per page)

### Tab: Agendamento

- Filter toggle: "Agendados" | "Aprovados"
- Shows deliveries with status `agendamento` or `agendado`
- Card layout (grid, not kanban) with same DeliveryCard component
- "Agendados" filter: status === 'agendado'
- "Aprovados" filter: deliveries that have approval status === 'client_approved'

### Tab: Instagram

- Reuses existing components from `components/instagram/`:
  - AgendamentoTab, PostReviewSheet, ScheduledPostForm, etc.
- Pulls scheduled posts data from instagram service

### Tab: Aprovacao

- Reuses existing `components/approvals/ApprovalTab.jsx`
- Shows deliveries in `aprovacao` status

### Tab: Correcao

- Reuses existing `components/approvals/CorrectionTab.jsx`
- Shows deliveries in `correcao` status

---

## Sub-project 3: Clients Page Improvements

### Goal

Add WhatsApp group photo to client cards and show red dot badges for missing information.

### Client card changes

**Avatar area**: Replace initials div with Avatar component.

```jsx
<Avatar className="w-10 h-10">
  <AvatarImage src={client.avatar_url} />
  <AvatarFallback className="bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400">
    {initials(client.name)}
  </AvatarFallback>
</Avatar>
```

### Red dot badge

Position: top-right corner of the card (absolute).

```jsx
// Logic
const missingFields = [];
if (!client.whatsapp) missingFields.push('WhatsApp');
if (!client.whatsapp_group) missingFields.push('Grupo de Producao');
if (!client.social_media_id) missingFields.push('Social Media');

// Render (inside Card, position relative)
{missingFields.length > 0 && (
  <div className="absolute -top-1 -right-1 group/dot">
    <div className="w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-background" />
    {/* Tooltip on hover */}
    <div className="hidden group-hover/dot:block absolute right-0 top-4 z-50 
                    bg-popover text-popover-foreground text-xs rounded-lg 
                    px-3 py-2 shadow-lg border whitespace-nowrap">
      <p className="font-medium mb-1">Informacao faltando:</p>
      {missingFields.map(f => <p key={f}>• {f}</p>)}
    </div>
  </div>
)}
```

### Backend: avatar_url

**Migration**: Add `avatar_url` column to `clients` table.

```javascript
// migration: add_avatar_url_to_clients
exports.up = (knex) =>
  knex.schema.alterTable('clients', (t) => {
    t.text('avatar_url').nullable();
  });
```

**Logic**: When `whatsapp_group` is set/changed on a client, the backend calls Evolution API to fetch the group profile picture:

```
GET /chat/fetchProfilePictureUrl
Body: { groupJid: "<group_id>@g.us" }
```

If successful, save the URL in `avatar_url`. If it fails (no photo, API error), set `avatar_url` to null (fallback to initials).

This runs in the `PUT /clients/:id` handler when `whatsapp_group` changes.

---

## Sub-project 4: Dashboard + Remaining Pages

### Goal

Replace manual progress bars and lists with ECharts visualizations. Apply visual refresh to all pages leveraging the new theme system.

### Dashboard — Management View

**KPI Cards (3)**: Keep current layout. Add optional ECharts sparkline (tiny area chart, 60x20px) showing daily delivery count for the last 7 days. The sparkline data comes from the existing `/deliveries` endpoint filtered by the current month — group by `created_at` date client-side. If the month has just started and there is insufficient data, show cards without sparkline (graceful degradation, no new API endpoint needed).

**Pipeline de Producao**: Replace status buttons with ECharts horizontal bar chart.
- Each bar = a pipeline status
- Bar color = status color from PIPELINE_STATUS_COLORS
- Click on bar navigates to deliveries page filtered by that status
- Tooltip shows count

**Carga de Trabalho**: Replace progress bar list with ECharts horizontal bar chart.
- Each bar = team member name
- Sorted by count descending
- Purple bars

**Entregas por Formato**: Replace progress bar list with ECharts donut chart.
- Each slice = content format
- Colors from formatColors mapping
- Center text: total count
- Legend below chart

**Producao do Time (Leaderboard)**: Keep current leaderboard list layout. Replace thin progress bar with ECharts mini stacked bar (published vs in-production) inline.

**Entregas Recentes**: Keep current list, improve spacing and badges for light theme.

### Dashboard — Producer View

Same structure, adapted:
- KPI Cards (4): Keep, add sparkline
- Meu Pipeline: ECharts horizontal bar chart
- Entregas Recentes: Keep list

### Remaining Pages

| Page | Changes |
|------|---------|
| **RankingPage** | Top 3 podium with larger cards, gold/silver/bronze styling. Full table below with TanStack React Table (sortable, searchable). |
| **GoalsPage** | ECharts gauge charts for individual goals. Bar chart comparing team members vs targets. |
| **CalculationsPage** | TanStack React Table for all data tables. Sortable columns. |
| **ScheduleCalendarPage** | Visual refresh only (theme adaptation). |
| **SettingsPage** | Add functional light/dark mode toggle using next-themes. |
| **SimulatorPage** | ECharts line chart for J-curve bonus visualization. Interactive tooltip. |
| **SalariesPage** | TanStack React Table. |
| **BoostPage** | Theme adaptation. |
| **LoginPage** | Light background, white card, purple accents. Subtle gradient or pattern. |
| **Sidebar** | White bg, subtle border, purple active state, adapted for light/dark. |
| **ApprovalsPage** | Theme adaptation, component reuse in Deliveries tabs. |
| **ClientProfilePage** | Use avatar_url for client photo. Theme adaptation. |
| **PortalPage** | Theme adaptation. |
| **PublicApprovalPage** | Light-first for external users (no dark mode toggle). |

### ECharts shared config

Create `lib/echarts-theme.js` with a custom theme matching TasksLudus design tokens:

```javascript
// Registers a custom ECharts theme 'tasksludus'
// Colors: chart-1 through chart-5
// Font: DM Sans
// Tooltip: matches card styling
// Responsive: charts resize with container
```

All ECharts instances use `ReactECharts` from `echarts-for-react` with `theme="tasksludus"`.

Dark mode: register a second theme `tasksludus-dark` with dark palette. Switch based on `next-themes` resolved theme.

---

## New files to create

| File | Purpose |
|------|---------|
| `components/deliveries/KanbanBoard.jsx` | Kanban board with drag-drop |
| `components/deliveries/DeliveryCard.jsx` | Reusable delivery card |
| `components/deliveries/DeliveryDetailModal.jsx` | Full detail modal |
| `components/deliveries/DeliveryListTable.jsx` | TanStack table for list view |
| `lib/echarts-theme.js` | ECharts theme config (light + dark) |

## Files to modify

| File | Changes |
|------|---------|
| `index.css` | Swap :root to light, .dark to dark |
| `App.jsx` | Wrap with ThemeProvider from next-themes |
| `lib/constants.js` | Dual-mode status colors |
| `pages/DeliveriesPage.jsx` | Full rewrite with tabs + kanban |
| `pages/ClientsPage.jsx` | Avatar photo + red dot badge |
| `pages/DashboardPage.jsx` | ECharts integration |
| `pages/RankingPage.jsx` | Podium + TanStack table |
| `pages/GoalsPage.jsx` | ECharts gauges |
| `pages/SimulatorPage.jsx` | ECharts line chart |
| `pages/CalculationsPage.jsx` | TanStack table |
| `pages/SalariesPage.jsx` | TanStack table |
| `pages/SettingsPage.jsx` | Theme toggle |
| `pages/LoginPage.jsx` | Light-first design |
| `components/layout/Sidebar.jsx` | Light-first redesign |
| `server/src/modules/clients/clients.service.js` | Fetch avatar_url from Evolution API |

## Execution order

1. **Sub-project 1**: Theme system — all visual foundations
2. **Sub-project 2**: Deliveries page — kanban + tabs + modal
3. **Sub-project 3**: Clients page — photo + badges
4. **Sub-project 4**: Dashboard + remaining pages — ECharts + tables + polish
