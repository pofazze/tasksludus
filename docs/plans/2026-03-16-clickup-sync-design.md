# ClickUp Full Sync — Design

**Goal:** One-time full import of ClickUp workspace data (members, clients, tasks) into the database, with the existing webhook keeping everything in sync afterwards.

**Architecture:** New `clickup-sync.service.js` fetches all data from ClickUp API in sequence (members → spaces/folders/lists → tasks per list), upserts into existing tables. Exposed via a CEO-only endpoint, triggered from SettingsPage.

**Tech Stack:** Express endpoint, Knex upserts, ClickUp REST API v2, existing auth middleware.

---

## Data Mapping

### Members → Users
- ClickUp API: `GET /team/{teamId}`
- Match: `clickup_id` first, then `email`
- If no match and role=3 (Member): create as `producer`, password null
- Fields: name, email, clickup_id, avatar_url
- Does NOT overwrite: role, producer_type, base_salary, whatsapp (preserves local edits)

### Spaces/Folders/Lists → Clients
- ClickUp API: `GET /team/{teamId}/space` → `GET /space/{id}/folder` → `GET /folder/{id}/list`
- Each list = one client (match by name, case-insensitive)
- Folder name → `company` field ("Ludus Health", "Ludus Experts")
- Store `clickup_list_id` on client for future reference (needs migration)

### Tasks → Deliveries
- ClickUp API: `GET /list/{listId}/task?page=N` (paginated, 100 per page)
- Match: `clickup_task_id`
- Assignee → user_id (via clickup_id lookup)
- List → client_id (via list name lookup)
- Custom field "Formato" → content_type
- Task status → pipeline status (normalized)
- date_created → started_at
- Custom field "Entrega" → month
- Status "publicação" → completed_at = now

## Endpoint

`POST /api/clickup/sync` — CEO-only, authenticated.

Returns: `{ members: { created, updated }, clients: { created, updated }, deliveries: { created, updated, total } }`

## Frontend

Button "Sincronizar ClickUp" in SettingsPage > Integrações > ClickUp card. Shows loading spinner, then toast with results.

## What it does NOT do
- Create goals or calculations
- Sync comments or time tracking
- Delete records removed from ClickUp
