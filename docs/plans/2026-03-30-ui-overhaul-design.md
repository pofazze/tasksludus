# UI/UX Overhaul — Design Document

**Date:** 2026-03-30
**Goal:** Transform TasksLudus from basic/functional to premium clean dark UI with redesigned scheduling flow, Instagram grid, and app-wide consistency.

## Visual Identity — Clean Dark Minimal

### Principles
- Generous spacing, clean contrast, no glow/blur/gradients
- Clarity above decoration
- Consistent tokens across all pages

### Design Tokens

| Token | Value | Usage |
|---|---|---|
| `--bg-deep` | `#09090B` | Body background |
| `--bg-surface` | `#111113` | Sidebar, sections |
| `--bg-elevated` | `#18181B` | Cards, modals |
| `--border` | `#27272A` | Borders (zinc-800) |
| `--text-primary` | `#FAFAFA` | Primary text |
| `--text-secondary` | `#A1A1AA` | Secondary text (zinc-400) |
| `--text-muted` | `#71717A` | Labels, captions (zinc-500) |
| `--accent` | `#9A48EA` | Primary actions |
| `--accent-hover` | `#B06AF0` | Accent hover |
| `--destructive` | `#EF4444` | Delete, errors |
| `--success` | `#22C55E` | Published, success |

### Effects
- Zero blur, zero glow, zero gradients
- Cards: `bg-zinc-900 border border-zinc-800 rounded-xl`
- Hover: `hover:bg-zinc-800/50` with `transition-all duration-150 ease-out`
- Spacing system: 4/8/12/16/24/32/48
- Border-radius: 12px (cards), 8px (inputs/buttons), 6px (badges)
- Shadow: `0 1px 2px rgba(0,0,0,0.4)` only for elevated modals

### Typography
- Body: Inter (Tailwind default)
- Numbers: `font-feature-settings: 'tnum'` (tabular figures)
- Scale: 11px (caption) → 13px (body-sm) → 14px (body) → 16px (title) → 20px (heading) → 28px (display)

---

## Scheduling Flow — Dual-Mode

### Mode 1: Quick Create (Sheet/Drawer)
- Trigger: "Novo Post" button on calendar or day click
- Opens right-side sheet (~480px wide)
- Compact form: client, type, media drop zone, caption, date/time
- Buttons: "Salvar Rascunho" | "Agendar"
- Purpose: rapid creation of multiple posts

### Mode 2: Full Review (Dedicated Page)
- Route: `/schedule/:id`
- Trigger: clicking existing post (calendar or AgendamentoTab)
- Two-column layout:
  - Left: Instagram-style preview with carousel (embla-carousel-react)
  - Right: Full form (caption, media with drag-drop reorder, date/time, reel cover, status)
- Live preview updates as user edits
- Buttons: "Salvar" | "Publicar Agora" | "Agendar" | "Excluir"

### Datepicker
- Library: `react-day-picker` via shadcn Calendar component
- Calendar popover + custom time picker (hour/minute selects)
- Replaces native `<input type="datetime-local" />`
- Locale: pt-BR

### Carousel Preview
- Thumbnails: 160x160px grid
- Drag-and-drop reorder: `@dnd-kit/core` + `@dnd-kit/sortable`
- Hover reveals remove button
- Order indicators (1, 2, 3...)
- Click to expand full preview

---

## Instagram Tab Redesign (ClientProfilePage)

### Current: Basic table with metrics
### Proposed: Visual grid feed

- 3-column grid with 1:1 aspect ratio (Instagram feed style)
- Hover overlay: impressions, reach, engagement metrics
- Click opens detail panel with full caption + metrics
- Type badge corner overlay (Reel, Carousel, Story)
- Scheduled posts appear with "Agendado" overlay + date
- Summary metrics bar: Posts, Alcance, Engajamento rate

---

## App-Wide UI Improvements

1. **Cards:** Consistent `bg-zinc-900 border-zinc-800 rounded-xl p-5`
2. **Tables:** Hover rows, sticky headers, generous row spacing
3. **Buttons hierarchy:** Primary (accent), Secondary (zinc-800), Ghost (transparent), Destructive (red)
4. **Inputs:** Visible labels, border-zinc-700, focus ring accent
5. **Empty states:** Lucide icons + guide text + CTA
6. **Loading:** Skeleton screens for >300ms loads
7. **Status badges:** Consistent palette — draft(zinc), scheduled(amber), publishing(blue), published(green), failed(red)
8. **Toasts:** Sonner with token-consistent colors

---

## New Dependencies

| Library | Purpose | Size |
|---|---|---|
| `react-day-picker` | Calendar/datepicker in shadcn | ~8kb |
| `@dnd-kit/core` + `@dnd-kit/sortable` | Media drag-drop reorder | ~15kb |
| `date-fns` | Date formatting/manipulation (pt-BR) | tree-shakeable |
| `embla-carousel-react` | Carousel preview for posts | ~6kb |

Total additional: ~30kb gzipped.

---

## Pages Affected

| Page | Changes |
|---|---|
| `index.css` | Design tokens, global styles |
| `ScheduleCalendarPage.jsx` | Quick create sheet, improved calendar cells |
| `PostReviewView.jsx` → new `PostReviewPage.jsx` | Full-page two-column review with live preview |
| `ScheduledPostForm.jsx` | Replace with Sheet-based quick create form |
| `AgendamentoTab.jsx` | Visual cards instead of list, link to review page |
| `ClientProfilePage.jsx` | Instagram tab grid, consistent card styles |
| All pages | Token consistency, spacing, typography |

## UX Rules Applied
- react-day-picker for consistent datepicker (no browser-dependent datetime-local)
- Drag-drop media reorder (eliminates clunky arrow buttons)
- Progressive disclosure: quick create for speed, full page for detail
- Visual carousel preview before publishing
- Instagram-style grid for published posts
- Skeleton loading states
- Consistent design tokens throughout
