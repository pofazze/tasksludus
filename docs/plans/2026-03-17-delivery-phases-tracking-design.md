# Delivery Phases Tracking — Design

## Goal
Track every phase a delivery goes through: who was responsible, when they entered/exited, and how long each phase took. On publicação, assign all past responsibles in ClickUp.

## New Table: `delivery_phases`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | PK |
| delivery_id | UUID | FK → deliveries (nullable, set when delivery exists) |
| clickup_task_id | TEXT | ClickUp task ID (always set) |
| phase | TEXT | Pipeline phase name (normalized) |
| assignee_clickup_id | TEXT | ClickUp user ID of the assignee |
| user_id | UUID | FK → users (nullable) |
| entered_at | TIMESTAMP | When task entered this phase |
| exited_at | TIMESTAMP | When task left this phase (null = current) |
| duration_seconds | INT | Computed on exit (exited_at - entered_at) |

Indexes: (delivery_id), (clickup_task_id), (clickup_task_id, phase)

## Tracking Flow

1. **taskCreated** → insert first phase record (entered_at = now)
2. **taskStatusUpdated** → close current phase (exited_at, duration) + open new phase
3. **taskAssigneeUpdated** → update assignee on current open phase

## Publicação Behavior

When task reaches `publicação`:
1. Query all distinct `assignee_clickup_id` from `delivery_phases` for this task
2. Add ALL of them as assignees in ClickUp (not just the phase assignee)
3. Still record the publicação phase normally for tracking

## Metrics Enabled

- Total time: creation → publicação
- Time per phase
- Who worked on each phase
- Bottleneck identification
- Per-person performance
