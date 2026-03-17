# Webhook Auto-Assign Test — Design

## Goal
Proof-of-concept: when a task in ClickUp changes status, automatically assign the person responsible for that phase. **Test scope: only Dr. Wander Fran list.**

## Trigger
- ClickUp webhook event: `taskStatusUpdated`
- Filter: only tasks in list `901113351972` (Dr. Wander Fran)

## Phase → Assignee Mapping

| Phase | Assignee | ClickUp ID |
|-------|----------|------------|
| planejamento | Aléxia Sâmella | 284598101 |
| captação | Filipe Sabino | 284598399 |
| edição de vídeo | Victor Costa | 152562683 |
| estruturação | Aléxia Sâmella | 284598101 |
| design | Pedro Torres | 284596872 |
| aprovação | Wander Fran | 61001382 |
| agendamento | Aléxia Sâmella | 284598101 |
| publicação | Aléxia Sâmella | 284598101 |

## Flow
1. ClickUp sends `taskStatusUpdated` → `POST /api/webhooks/clickup`
2. Server verifies signature, logs event
3. Check if task belongs to list `901113351972`
4. If yes → look up assignee for the new status
5. Call `PUT /api/v2/task/{taskId}` on ClickUp API to replace assignees
6. Log automation result in `webhook_events`

## Protection
- Only list `901113351972` triggers automation
- All other lists processed normally (existing behavior)
- If status not in mapping, no action taken

## Implementation
- New file: `server/src/modules/webhooks/automations/auto-assign.js`
- Modify: `clickup.service.js` → call automation after processing `taskStatusUpdated`
