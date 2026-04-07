# Deliveries Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the table-based Deliveries page with a tabbed interface featuring a Kanban pipeline as the primary view, list toggle, and detail modal.

**Architecture:** The page uses 5 tabs (Pipeline, Agendamento, Instagram, Aprovacao, Correcao). Pipeline tab has Kanban/List toggle. Kanban uses @hello-pangea/dnd for drag-drop between status columns. Card click opens a full-screen modal. Agendamento/Instagram/Aprovacao/Correcao tabs reuse existing components.

**Tech Stack:** React 19, @hello-pangea/dnd, @tanstack/react-table, Tailwind CSS v4, Shadcn/ui Tabs

**Spec:** `docs/superpowers/specs/2026-04-07-ui-redesign-design.md` — Sub-project 2

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `client/src/components/deliveries/DeliveryCard.jsx` | Create | Reusable card for kanban and grid views |
| `client/src/components/deliveries/KanbanBoard.jsx` | Create | Horizontal kanban with drag-drop columns |
| `client/src/components/deliveries/DeliveryDetailModal.jsx` | Create | Full detail modal (80-90% viewport) |
| `client/src/components/deliveries/DeliveryListTable.jsx` | Create | TanStack React Table for list view |
| `client/src/pages/DeliveriesPage.jsx` | Rewrite | Tabbed container orchestrating all views |

---

### Task 1: Create DeliveryCard component

**Files:**
- Create: `client/src/components/deliveries/DeliveryCard.jsx`

- [ ] **Step 1: Create the component file**

```jsx
import { PIPELINE_STATUSES, PIPELINE_STATUS_COLORS, CONTENT_TYPE_LABELS } from '@/lib/constants';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getMediaProxyUrl } from '@/lib/utils';

export default function DeliveryCard({ delivery, showClient = false, onClick }) {
  const initials = (name) => name?.split(' ').map((n) => n[0]).join('').slice(0, 2) || '?';
  const thumbnail = delivery.media_urls?.[0];
  const proxyUrl = thumbnail ? getMediaProxyUrl(thumbnail) : null;

  return (
    <div
      onClick={() => onClick?.(delivery)}
      className="bg-card border border-border rounded-xl overflow-hidden cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md group"
    >
      {/* Thumbnail */}
      {proxyUrl ? (
        <div className="aspect-video w-full overflow-hidden bg-muted">
          <img src={proxyUrl} alt="" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="aspect-video w-full bg-muted flex items-center justify-center">
          <span className="text-muted-foreground text-xs">Sem mídia</span>
        </div>
      )}

      {/* Content */}
      <div className="p-3 space-y-2">
        <p className="text-sm font-medium line-clamp-2 group-hover:text-primary transition-colors">
          {delivery.title}
        </p>

        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className={PIPELINE_STATUS_COLORS[delivery.content_type] || ''}>
            {CONTENT_TYPE_LABELS[delivery.content_type] || delivery.content_type}
          </Badge>
          {delivery.created_at && (
            <span className="text-xs text-muted-foreground">
              {new Date(delivery.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
            </span>
          )}
        </div>

        {/* Responsible */}
        {delivery.user_name && (
          <div className="flex items-center gap-2">
            <Avatar className="h-5 w-5">
              <AvatarImage src={delivery.user_avatar_url} />
              <AvatarFallback className="text-[8px] bg-muted">{initials(delivery.user_name)}</AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground truncate">{delivery.user_name}</span>
          </div>
        )}

        {/* Client name (optional) */}
        {showClient && delivery.client_name && (
          <span className="text-xs text-muted-foreground">{delivery.client_name}</span>
        )}
      </div>
    </div>
  );
}
```

Check if `getMediaProxyUrl` exists in `client/src/lib/utils.js`. If it doesn't exist, the thumbnail logic should just use the raw URL: replace `getMediaProxyUrl(thumbnail)` with just `thumbnail`. Read `client/src/lib/utils.js` first to check.

- [ ] **Step 2: Commit**

```bash
cd /home/dev/projetos && git add client/src/components/deliveries/DeliveryCard.jsx && git commit -m "feat: create DeliveryCard component for kanban and grid views"
```

---

### Task 2: Create KanbanBoard component

**Files:**
- Create: `client/src/components/deliveries/KanbanBoard.jsx`

- [ ] **Step 1: Create the kanban board**

```jsx
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { PIPELINE_STATUSES, PIPELINE_STATUS_COLORS, PIPELINE_ORDER } from '@/lib/constants';
import DeliveryCard from './DeliveryCard';

export default function KanbanBoard({ deliveries, onStatusChange, onCardClick }) {
  // Group deliveries by status
  const columns = {};
  PIPELINE_ORDER.forEach((status) => {
    columns[status] = deliveries.filter((d) => d.status === status);
  });

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const newStatus = destination.droppableId;
    const delivery = deliveries.find((d) => String(d.id) === draggableId);
    if (delivery && delivery.status !== newStatus) {
      onStatusChange(delivery.id, newStatus);
    }
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 'calc(100vh - 220px)' }}>
        {PIPELINE_ORDER.map((status) => (
          <Droppable key={status} droppableId={status}>
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={`flex-shrink-0 w-[280px] rounded-xl border border-border p-2 transition-colors ${
                  snapshot.isDraggingOver ? 'bg-primary/5 border-primary/30' : 'bg-muted/50'
                }`}
              >
                {/* Column header */}
                <div className="flex items-center gap-2 px-2 py-1.5 mb-2">
                  <div className={`w-2 h-2 rounded-full ${PIPELINE_STATUS_COLORS[status]?.split(' ')[0]?.replace('bg-', 'bg-') || 'bg-muted'}`} />
                  <span className="text-xs font-semibold text-foreground">{PIPELINE_STATUSES[status]}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{columns[status].length}</span>
                </div>

                {/* Cards */}
                <div className="space-y-2 min-h-[100px]">
                  {columns[status].map((delivery, index) => (
                    <Draggable key={String(delivery.id)} draggableId={String(delivery.id)} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={snapshot.isDragging ? 'opacity-80 rotate-1' : ''}
                        >
                          <DeliveryCard delivery={delivery} onClick={onCardClick} />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                  {columns[status].length === 0 && (
                    <div className="border border-dashed border-border rounded-lg p-4 text-center">
                      <p className="text-xs text-muted-foreground">Arraste entregas aqui</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Droppable>
        ))}
      </div>
    </DragDropContext>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/dev/projetos && git add client/src/components/deliveries/KanbanBoard.jsx && git commit -m "feat: create KanbanBoard with drag-drop columns"
```

---

### Task 3: Create DeliveryDetailModal component

**Files:**
- Create: `client/src/components/deliveries/DeliveryDetailModal.jsx`

- [ ] **Step 1: Create the modal**

```jsx
import { useEffect } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  PIPELINE_STATUSES, PIPELINE_STATUS_COLORS, CONTENT_TYPE_LABELS, DIFFICULTY_LABELS,
} from '@/lib/constants';
import { getMediaProxyUrl } from '@/lib/utils';

export default function DeliveryDetailModal({ delivery, onClose, onEdit }) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!delivery) return null;

  const initials = (name) => name?.split(' ').map((n) => n[0]).join('').slice(0, 2) || '?';
  const mediaUrls = Array.isArray(delivery.media_urls) ? delivery.media_urls : [];

  // NOTE: if getMediaProxyUrl doesn't exist in utils.js, just use the raw URL
  const getUrl = (url) => {
    try { return getMediaProxyUrl(url); } catch { return url; }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Content */}
      <div
        className="relative bg-card border border-border rounded-2xl w-[90vw] max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-border">
          <div className="flex-1 min-w-0 space-y-2">
            <h2 className="text-xl font-bold font-display truncate">{delivery.title}</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className={PIPELINE_STATUS_COLORS[delivery.status] || ''}>
                {PIPELINE_STATUSES[delivery.status] || delivery.status}
              </Badge>
              <Badge variant="outline">
                {CONTENT_TYPE_LABELS[delivery.content_type] || delivery.content_type}
              </Badge>
              {delivery.difficulty && (
                <Badge variant="outline">{DIFFICULTY_LABELS[delivery.difficulty] || delivery.difficulty}</Badge>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
            <X size={18} />
          </Button>
        </div>

        {/* Body - scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Media preview */}
          {mediaUrls.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {mediaUrls.map((url, i) => (
                <div key={i} className="aspect-square rounded-lg overflow-hidden bg-muted">
                  <img src={getUrl(url)} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-4">
            {delivery.user_name && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Responsável</p>
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={delivery.user_avatar_url} />
                    <AvatarFallback className="text-[8px] bg-muted">{initials(delivery.user_name)}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{delivery.user_name}</span>
                </div>
              </div>
            )}
            {delivery.client_name && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Cliente</p>
                <span className="text-sm">{delivery.client_name}</span>
              </div>
            )}
            {delivery.month && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Mês</p>
                <span className="text-sm">{new Date(delivery.month).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span>
              </div>
            )}
            {delivery.created_at && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Criado em</p>
                <span className="text-sm">{new Date(delivery.created_at).toLocaleDateString('pt-BR')}</span>
              </div>
            )}
          </div>

          {/* ClickUp link */}
          {delivery.clickup_task_id && (
            <a
              href={`https://app.clickup.com/t/${delivery.clickup_task_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <ExternalLink size={14} />
              Ver no ClickUp ({delivery.clickup_task_id})
            </a>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          {onEdit && (
            <Button variant="outline" onClick={() => onEdit(delivery)}>
              Editar
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </div>
  );
}
```

Check if `getMediaProxyUrl` exists in utils.js. If not, replace `getMediaProxyUrl(url)` with just `url` and remove the import.

- [ ] **Step 2: Commit**

```bash
cd /home/dev/projetos && git add client/src/components/deliveries/DeliveryDetailModal.jsx && git commit -m "feat: create DeliveryDetailModal component"
```

---

### Task 4: Create DeliveryListTable component

**Files:**
- Create: `client/src/components/deliveries/DeliveryListTable.jsx`

- [ ] **Step 1: Create the table component**

```jsx
import {
  useReactTable, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, flexRender,
} from '@tanstack/react-table';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  PIPELINE_STATUSES, PIPELINE_STATUS_COLORS, CONTENT_TYPE_LABELS,
} from '@/lib/constants';
import { ExternalLink, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';

const initials = (name) => name?.split(' ').map((n) => n[0]).join('').slice(0, 2) || '?';

const columns = [
  {
    accessorKey: 'title',
    header: 'Título',
    cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
  },
  {
    accessorKey: 'user_name',
    header: 'Responsável',
    cell: ({ row }) => {
      const d = row.original;
      return d.user_name ? (
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarImage src={d.user_avatar_url} />
            <AvatarFallback className="text-[8px] bg-muted">{initials(d.user_name)}</AvatarFallback>
          </Avatar>
          <span className="text-sm">{d.user_name}</span>
        </div>
      ) : '—';
    },
  },
  {
    accessorKey: 'content_type',
    header: 'Formato',
    cell: ({ row }) => (
      <Badge variant="secondary">
        {CONTENT_TYPE_LABELS[row.original.content_type] || row.original.content_type}
      </Badge>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant="secondary" className={PIPELINE_STATUS_COLORS[row.original.status] || ''}>
        {PIPELINE_STATUSES[row.original.status] || row.original.status}
      </Badge>
    ),
  },
  {
    accessorKey: 'clickup_task_id',
    header: 'ClickUp',
    cell: ({ row }) => {
      const id = row.original.clickup_task_id;
      return id ? (
        <a href={`https://app.clickup.com/t/${id}`} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}>
          {id} <ExternalLink size={12} />
        </a>
      ) : <span className="text-muted-foreground">—</span>;
    },
  },
];

export default function DeliveryListTable({ deliveries, onRowClick, onEdit, canManage }) {
  const [sorting, setSorting] = useState([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const allColumns = canManage ? [
    ...columns,
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onEdit?.(row.original); }}>
          <Pencil size={16} />
        </Button>
      ),
    },
  ] : columns;

  const table = useReactTable({
    data: deliveries,
    columns: allColumns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  return (
    <div>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => (
                <TableHead key={header.id} onClick={header.column.getToggleSortingHandler()} className="cursor-pointer select-none">
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id} onClick={() => onRowClick?.(row.original)} className="cursor-pointer">
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {table.getRowModel().rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={allColumns.length} className="text-center text-muted-foreground py-8">
                Nenhuma entrega encontrada
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Pagination */}
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between px-2 py-3">
          <span className="text-xs text-muted-foreground">
            Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
              <ChevronLeft size={16} />
            </Button>
            <Button variant="outline" size="icon" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/dev/projetos && git add client/src/components/deliveries/DeliveryListTable.jsx && git commit -m "feat: create DeliveryListTable with TanStack React Table"
```

---

### Task 5: Rewrite DeliveriesPage with tabs

**Files:**
- Rewrite: `client/src/pages/DeliveriesPage.jsx`

- [ ] **Step 1: Rewrite the page**

The new page has:
- 5 tabs using Shadcn Tabs: Pipeline, Agendamento, Instagram, Aprovacao, Correcao
- Pipeline tab has Kanban/List toggle
- Filters (month, format) stay at the top
- "Nova Entrega" button + form view stays (existing create/edit functionality)
- Integrates KanbanBoard, DeliveryListTable, DeliveryDetailModal
- Reuses ApprovalTab, CorrectionTab, AgendamentoTab

Key architectural decisions:
- The page still manages its own deliveries state (useState + fetchDeliveries)
- The `clientId` prop needed by ApprovalTab/CorrectionTab/AgendamentoTab: read from URL params if within client profile, or from the first client in the list. Actually - check how the current DeliveriesPage is accessed. It's at `/deliveries` (global) not within a client context. The tabs that need clientId (ApprovalTab, CorrectionTab, AgendamentoTab) need ALL clients, not a single client.
- For the global Deliveries page: the Agendamento tab should show posts across all clients, the Aprovacao and Correcao tabs should use the ApprovalsPage-style global approach (listSmPending, listSmRejected).
- Status change via drag: call `api.put('/deliveries/:id', { status: newStatus })` with optimistic update.

Read the current DeliveriesPage.jsx first to understand the existing form logic, then rewrite. Keep the existing form view (view === 'form') mostly intact but update its styling to use semantic classes.

The component should look like:

```jsx
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import api from '@/services/api';
import useAuthStore from '@/stores/authStore';
import { isManagement } from '@/lib/roles';
import {
  CONTENT_TYPE_LABELS, PIPELINE_STATUSES, PIPELINE_STATUS_COLORS, PIPELINE_ORDER,
} from '@/lib/constants';
import useServerEvent from '@/hooks/useServerEvent';
import PageLoading from '@/components/common/PageLoading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import KanbanBoard from '@/components/deliveries/KanbanBoard';
import DeliveryListTable from '@/components/deliveries/DeliveryListTable';
import DeliveryDetailModal from '@/components/deliveries/DeliveryDetailModal';
import ApprovalTab from '@/components/approvals/ApprovalTab';
import CorrectionTab from '@/components/approvals/CorrectionTab';
import AgendamentoTab from '@/components/instagram/AgendamentoTab';
import { ArrowLeft, Plus, LayoutGrid, List } from 'lucide-react';
```

The structure:
- `view === 'list'`: shows the tabbed interface
- `view === 'form'`: shows the create/edit form (keep existing form logic)
- State: deliveries, users, clients, loading, view, editId, form, filters, activeTab, pipelineView ('kanban'|'list'), selectedDelivery (for modal)

The Pipeline tab renders either KanbanBoard or DeliveryListTable based on pipelineView toggle.

The Agendamento tab: for the global page, needs to show ALL scheduled posts. Use `listScheduledPosts({})` without clientId filter, or render AgendamentoTab only if a `clientId` is available. Since this is the global Deliveries page, create a simple agendamento view that filters deliveries by `agendamento`/`agendado` status with a toggle filter.

Actually, looking at this more carefully: the Agendamento tab should show deliveries with status `agendamento` or `agendado`, not Instagram scheduled posts. The Instagram tab shows the Instagram posts. So:

- **Pipeline tab**: Kanban with all statuses / List table
- **Agendamento tab**: Grid of DeliveryCards filtered to status `agendamento` + `agendado`, with toggle "Agendados" / "Aprovados" 
- **Instagram tab**: AgendamentoTab component (Instagram scheduled posts) — but this needs a clientId. For the global page, show a client selector or a message to select a client first.
- **Aprovacao tab**: Global approval view using the same pattern as ApprovalsPage (listSmPending)
- **Correcao tab**: Global correction view using listSmRejected

For Instagram/Aprovacao/Correcao tabs that need clientId: show a client filter dropdown at the top of those tabs. When no client is selected, show a prompt to select one.

Write the full component. Keep the form view from the existing code (with native-select classes already applied from Task 8 of Theme System plan).

- [ ] **Step 2: Verify build**

```bash
cd /home/dev/projetos/client && npx vite build --mode development 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
cd /home/dev/projetos && git add client/src/pages/DeliveriesPage.jsx && git commit -m "feat: rewrite DeliveriesPage with kanban, tabs, and detail modal"
```

---

### Task 6: Integration test and fixes

- [ ] **Step 1: Start dev server and verify**

```bash
cd /home/dev/projetos && npm run dev
```

Navigate to `/deliveries` and verify:
1. Pipeline tab shows kanban columns
2. Cards are draggable
3. List toggle works
4. Card click opens modal
5. Tabs switch correctly
6. Form view (New/Edit) still works
7. Filters work

- [ ] **Step 2: Fix any issues found**

- [ ] **Step 3: Final commit**

```bash
cd /home/dev/projetos && git add -A && git commit -m "fix: deliveries page integration fixes"
```
