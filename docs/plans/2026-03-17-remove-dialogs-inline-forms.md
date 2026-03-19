# Remove All Dialogs — Inline Page Forms

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace every Dialog/popup with inline page sections. Popups only for toast notifications (Sonner).

**Architecture:** Each page uses a `view` state to switch between "list" and "form/detail" views. The form/detail renders inline in the same page area, replacing the table. A "Voltar" button returns to list view.

**Tech Stack:** React state-driven view switching, same Shadcn Card/Input/Label components, Tailwind dark theme.

**Pattern:**
```jsx
const [view, setView] = useState('list'); // 'list' | 'form' | 'detail'

return view === 'list' ? (
  <ListSection onAdd={() => setView('form')} onDetail={...} />
) : view === 'form' ? (
  <FormSection onCancel={() => setView('list')} onSave={...} />
) : (
  <DetailSection onBack={() => setView('list')} />
);
```

---

## Task 1: UsersPage — 3 dialogs → inline views

**Files:** `client/src/pages/UsersPage.jsx`

**Current dialogs:** Edit User, User Detail, Invite/Create User

**Step 1:** Remove Dialog imports. Add `ArrowLeft` from lucide-react.

**Step 2:** Replace `editUser`, `detailUser`, `inviteOpen` states with a single view state:
```js
const [view, setView] = useState('list'); // 'list' | 'edit' | 'detail' | 'invite'
const [selectedUser, setSelectedUser] = useState(null);
```

**Step 3:** Replace the `openEdit(u)` function:
```js
const openEdit = (u) => {
  setSelectedUser(u);
  setForm({ name: u.name, base_salary: u.base_salary ?? '', whatsapp: u.whatsapp || '' });
  setView('edit');
};
```

**Step 4:** Replace `openDetail(u)` to set view + fetch data:
```js
const openDetail = async (u) => {
  setSelectedUser(u);
  setView('detail');
  setDetailLoading(true);
  // ... same fetch logic ...
};
```

**Step 5:** Replace the return JSX. Structure:
```jsx
{view === 'list' && (
  <>
    <header with title + "Adicionar Membro" button (onClick → setView('invite'))>
    <Card with table (same as current)>
      {/* Eye button → openDetail(u), Pencil → openEdit(u) */}
    </Card>
  </>
)}

{view === 'edit' && (
  <>
    <header with ArrowLeft "Voltar" + title "Editar — {selectedUser.name}">
    <Card with form fields (same as current dialog body)>
    <footer with Cancelar + Salvar buttons>
  </>
)}

{view === 'detail' && (
  <>
    <header with ArrowLeft "Voltar" + avatar + name + role>
    {/* Same 3 summary cards, calculation details, workload, deliveries list */}
  </>
)}

{view === 'invite' && (
  <>
    <header with ArrowLeft "Voltar" + title "Adicionar Membro">
    <Card with invite form fields (same as current dialog body)>
    <footer with Cancelar + Criar buttons>
  </>
)}
```

**Step 6:** In save/invite handlers, after success call `setView('list')` instead of closing dialog.

**Step 7:** Remove all `<Dialog>` JSX blocks.

**Step 8:** Commit:
```
git add client/src/pages/UsersPage.jsx
git commit -m "refactor: replace UsersPage dialogs with inline views"
```

---

## Task 2: ClientsPage — 2 dialogs → inline views

**Files:** `client/src/pages/ClientsPage.jsx`

**Current dialogs:** Create/Edit Client, Instagram Detail

**Step 1:** Remove Dialog imports. Add `ArrowLeft`.

**Step 2:** Replace dialog states with:
```js
const [view, setView] = useState('list'); // 'list' | 'form' | 'instagram'
```

**Step 3:** Replace return JSX:
```jsx
{view === 'list' && (
  <>
    <header + "+ Novo Cliente" button>
    <Card with client table>
      {/* Edit → setForm + setView('form'), Instagram → setView('instagram') */}
    </Card>
  </>
)}

{view === 'form' && (
  <>
    <header with "Voltar" + "Editar Cliente" or "Novo Cliente">
    <Card with form (name, company, instagram_handle, contact_email, status select)>
    <footer Cancelar + Salvar>
  </>
)}

{view === 'instagram' && (
  <>
    <header with "Voltar" + client name + Instagram icon>
    {/* Same metrics cards + posts grid, full width */}
  </>
)}
```

**Step 4:** Update save handler → `setView('list')`.

**Step 5:** Remove `<Dialog>` blocks.

**Step 6:** Commit:
```
git add client/src/pages/ClientsPage.jsx
git commit -m "refactor: replace ClientsPage dialogs with inline views"
```

---

## Task 3: DeliveriesPage — 1 dialog → inline view

**Files:** `client/src/pages/DeliveriesPage.jsx`

**Current dialogs:** Create/Edit Delivery

**Step 1:** Remove Dialog imports. Add `ArrowLeft`.

**Step 2:** Replace `dialogOpen` with `view` state:
```js
const [view, setView] = useState('list'); // 'list' | 'form'
```

**Step 3:** Replace return JSX:
```jsx
{view === 'list' && (
  <>
    <header + "+ Nova Entrega" button>
    <filters row (month, status, type)>
    <Card with deliveries table>
      {/* Edit button → setForm + setView('form') */}
    </Card>
  </>
)}

{view === 'form' && (
  <>
    <header with "Voltar" + "Editar Entrega" or "Nova Entrega">
    <Card with form (all current fields in 2-col grid)>
    <footer Cancelar + Salvar>
  </>
)}
```

**Step 4:** Update save handler → `setView('list')` + fetchData.

**Step 5:** Remove `<Dialog>` block.

**Step 6:** Commit:
```
git add client/src/pages/DeliveriesPage.jsx
git commit -m "refactor: replace DeliveriesPage dialog with inline form"
```

---

## Task 4: GoalsPage — 2 dialogs → inline views

**Files:** `client/src/pages/GoalsPage.jsx`

**Current dialogs:** Template CRUD, Goal CRUD

**Step 1:** Remove Dialog imports. Add `ArrowLeft`.

**Step 2:** Replace `tplDialog`/`goalDialog` with:
```js
const [view, setView] = useState('list'); // 'list' | 'template-form' | 'goal-form'
```

**Step 3:** The page already has Tabs (Templates | Metas). Each tab stays. Forms replace the tab content:
```jsx
{view === 'list' && (
  <Tabs ...>
    <TabsContent "templates"> ... table + "Novo Template" button ... </TabsContent>
    <TabsContent "goals"> ... table + "Nova Meta" button ... </TabsContent>
  </Tabs>
)}

{view === 'template-form' && (
  <>
    <header with "Voltar" + "Editar Template" or "Novo Template">
    <Card with template form (role, producer_type, target, cap, curve editor)>
    <footer Cancelar + Salvar>
  </>
)}

{view === 'goal-form' && (
  <>
    <header with "Voltar" + "Editar Meta" or "Nova Meta">
    <Card with goal form (user, month, target, cap, template select)>
    <footer Cancelar + Salvar>
  </>
)}
```

**Step 4:** Update save handlers → `setView('list')`.

**Step 5:** Remove `<Dialog>` blocks.

**Step 6:** Commit:
```
git add client/src/pages/GoalsPage.jsx
git commit -m "refactor: replace GoalsPage dialogs with inline forms"
```

---

## Task 5: CalculationsPage — 1 dialog → inline view

**Files:** `client/src/pages/CalculationsPage.jsx`

**Current dialogs:** Adjust Bonus

**Step 1:** Remove Dialog imports. Add `ArrowLeft`.

**Step 2:** Replace `adjustDialog`/`adjustCalc` with view state:
```js
const [view, setView] = useState('list'); // 'list' | 'adjust'
```

**Step 3:** Replace return JSX:
```jsx
{view === 'list' && (
  <>
    <header + month filter + action buttons>
    <summary cards>
    <Card with calculations table>
      {/* "Ajustar" button → setAdjustCalc + setView('adjust') */}
    </Card>
  </>
)}

{view === 'adjust' && (
  <>
    <header with "Voltar" + "Ajustar Bônus — {name}">
    <Card with adjustment details + input (same fields as current dialog)>
    <footer Cancelar + Salvar>
  </>
)}
```

**Step 4:** Update handleAdjust → `setView('list')`.

**Step 5:** Remove `<Dialog>` block.

**Step 6:** Commit:
```
git add client/src/pages/CalculationsPage.jsx
git commit -m "refactor: replace CalculationsPage dialog with inline form"
```

---

## Task 6: Cleanup

**Step 1:** Check if Dialog component is still imported anywhere:
```bash
grep -r "from.*dialog" client/src/pages/
```

**Step 2:** If no pages import Dialog, optionally remove `client/src/components/ui/dialog.jsx`.

**Step 3:** Run `npm run build` — verify zero errors.

**Step 4:** Final commit:
```
git add -A
git commit -m "chore: remove unused dialog component"
```

---

## Inline Form Design Pattern (Consistent Across All Pages)

```jsx
{/* Header with back button */}
<div className="flex items-center gap-3 mb-6">
  <Button variant="ghost" size="icon" onClick={() => setView('list')}>
    <ArrowLeft size={18} />
  </Button>
  <h1 className="text-2xl font-bold font-display">{title}</h1>
</div>

{/* Form card */}
<Card className="max-w-2xl">
  <CardContent className="pt-6 space-y-4">
    {/* form fields */}
  </CardContent>
</Card>

{/* Action buttons */}
<div className="flex gap-2 mt-4 max-w-2xl">
  <Button variant="outline" onClick={() => setView('list')}>Cancelar</Button>
  <Button onClick={handleSave}>Salvar</Button>
</div>
```

## Verification

1. `npm run build` — zero errors
2. Navigate every page — no popups appear
3. Create/edit/detail flows work via inline views
4. Toast notifications (Sonner) still work for feedback
5. "Voltar" button always returns to list view
