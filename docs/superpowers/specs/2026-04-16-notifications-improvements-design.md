# Notification System Improvements — Design

**Date:** 2026-04-16
**Goal:** Replace the per-item rejection ping with a richer notification flow that batches client reviews into an 8-minute window, routes rejections to the producer who actually built the rejected piece, and tells the right WhatsApp groups when a delivery publishes.

---

## Problem

Today the SM gets one ping per rejection (`_notifySmRejection`), client groups never hear about publish success, designers and editors only learn about rejections inside ClickUp, and there is no concept of "the client just finished a batch — here is what landed where." Reviewing 12 items produces 12 notifications and zero context. There is also no precise way to route a rejection back to the right producer when a reel has both a thumbnail and a video.

## Goal

1. **Window-batched SM summary** — when the client first reviews any item in a batch, start an 8-minute window. At the end of the window (or as soon as the whole batch is reviewed), send one consolidated WhatsApp message to the SM listing every approval and every rejection from that window.
2. **Rejection routing** — the same window also produces one message per responsible producer (designer / video editor) with their rejected items, and one message to the client's category group. Routing uses a new `rejection_target` (cover / video) when the post is a reel/video with a thumbnail.
3. **Publish-success notifications** — when every platform of a delivery has published, send one consolidated message to the client's WhatsApp group **and** the client's category group, listing the platforms with their permalinks.

Out of scope: the broader "post accounting / reports" overhaul. Phase history already lives in `delivery_phases` and is enough for future reports; designing those reports is its own brainstorming.

---

## Data Model Deltas

### `app_settings` — new row (no schema change)

```
key:   'category_whatsapp_groups'
value: { "health": "120363425760405482@g.us", "experts": "<jid>" }
```

The mapping is editable through the existing `PUT /api/settings/:key` (CEO-only). New categories require only a row update — no deploy.

### `approval_items` — one new column

```sql
ALTER TABLE approval_items
  ADD COLUMN rejection_target text;  -- 'cover' | 'video' | NULL
```

Populated when the client rejects a reel/video that has a thumbnail. NULL otherwise.

### `approval_batches` — two new columns

```sql
ALTER TABLE approval_batches
  ADD COLUMN review_window_started_at timestamptz,
  ADD COLUMN review_window_fired_at   timestamptz;
```

`started_at` is set by `clientRespond` the first time the client reviews any item in the batch (or after the previous window already fired). `fired_at` is set by the worker so re-runs are no-ops. A `started_at IS NOT NULL AND fired_at IS NULL` row is the open window.

### `delivery_phases` — no change

The table already records `assignee_clickup_id` per phase open/close, so producer history is queryable today. The notification layer reads it, nothing to add.

---

## Architecture

### New BullMQ queue: `approvalReviewWindowQueue`

Same shape as `approvalReminderQueue`. Single job type `approval-window-fire` with `data: { batchId }`. JobId pattern `window:{batchId}` so duplicate enqueues are deduped automatically.

### Window lifecycle

1. **First client review of a batch** (`clientRespond` in `approvals.service.js`):
   - If the batch has no open window (either never started, or previous one already fired), set `review_window_started_at = now()` and `review_window_fired_at = NULL`.
   - Enqueue `approval-window-fire` with `delay = 8 * 60 * 1000`, `jobId = window:{batchId}`.
2. **Every subsequent review** within the same batch updates the item but does not touch the window — unless every item is now non-pending.
3. **Whole-batch review** — if no `pending` items remain, fetch the delayed job by its jobId and call `job.promote()` so it runs immediately rather than waiting out the rest of the 8 minutes.
4. **Worker** (`approval-review-window.worker.js`):
   - Loads `batch` and the items reviewed during this window (i.e. items with `responded_at >= batch.review_window_started_at`).
   - If `batch.review_window_fired_at IS NOT NULL`, log "duplicate window fire, skipping" and return — idempotency.
   - Marks `review_window_fired_at = now()` before sending.
   - Calls `notifications.service.notifyBatchReviewWindow(batch, items)`.
5. **A new review after `fired_at`** — `clientRespond` notices `fired_at` is set, opens a new window: clears `fired_at`, sets `started_at = now()`, enqueues a fresh job.

The `responded_at` cutoff is what makes "second window for the same batch" produce a separate digest instead of re-listing everything.

### Notification dispatcher

New module `server/src/modules/notifications/notifications.service.js`. Three exported functions, each one occasion:

- `notifyBatchReviewWindow(batch, items)` — composes the SM digest and, if any `rejected` items, calls `notifyRejections`.
- `notifyRejections(batch, rejectedItems)` — fans out to producers and the category group.
- `notifyPublishSuccess(post)` — composes the publish digest, sends to client group and category group.

Each WhatsApp call is wrapped individually so a failed destination never blocks the others.

### Wiring

| Hook | File | Change |
|---|---|---|
| Open / promote window | `server/src/modules/approvals/approvals.service.js` `clientRespond` | After updating `approval_items`: open window if needed, promote if batch fully reviewed. **Remove** the inline `_notifySmRejection` call. |
| Publish success | `server/src/modules/instagram/instagram-publish.service.js` inside the `if (groupReady)` block (added in the previous fix) | Call `notifyPublishSuccess(post)` after delivery status updates. |
| Publish success | `server/src/modules/tiktok/tiktok-publish.service.js` equivalent block | Same call. |
| Queue + worker | `server/src/queues/index.js` and `server/src/queues/approval-review-window.worker.js` (new) | Register queue and worker. Add helper `enqueueApprovalReviewWindow(batchId)` and `promoteApprovalReviewWindow(batchId)`. |
| Worker bootstrap | `server/src/app.js` | `require('./queues/approval-review-window.worker');` inside the existing BullMQ try block. |
| UI — rejection modal | `client/src/pages/PublicApprovalPage.jsx` (or wherever the public approval UI lives) | When `post.post_type ∈ {'reel','video','tiktok_video'}` and `post.thumbnail_url` is present, a required `rejection_target` radio (Capa / Vídeo) is added next to the reason textarea. Submit body now carries the field. |
| API — accept the field | `approvals.service.js` `clientRespond` validation | Accept `rejection_target ∈ {'cover','video', undefined}`. Persist in `approval_items.rejection_target`. |

---

## Message Templates

All in pt-BR. Times in BRT (`pt-BR` locale, `America/Sao_Paulo`). Markdown WhatsApp (`*bold*`).

### SM digest (window close)

```
*Lote do cliente {clientName} revisado*

✅ Aprovados ({n}):
• {title} → {clickupUrl}
…

❌ Reprovados ({m}):
• {title} → {clickupUrl}
  Motivo: {reason}{ rejection_target ? ` (alvo: capa|vídeo)` : `` }
…
```

Sections with zero items are omitted. If both sections are zero (impossible by construction, but defensive), the message is not sent.

### Per-producer rejection digest

One message per distinct producer in the rejected set. Items grouped by `users.id` resolved from `assignee_clickup_id`.

```
*Tasks reprovadas pra você*

Cliente: {clientName}
• {title} → {clickupUrl}
  Motivo: {reason}{ ` (capa|vídeo)` if applicable }
…
```

Sent to `users.whatsapp` of the producer (via `evolution.buildPersonalJid(...)`). Missing WhatsApp → `logger.warn` and skip.

### Category-group rejection summary

One message per batch (not per producer).

```
*Reprovações no cliente {clientName}*

❌ {n} item(ns) voltaram pra correção:
• {title} → {clickupUrl}
  Motivo: {reason}
…
```

Destination resolved from `app_settings.category_whatsapp_groups[client.category]`. Missing key → `logger.warn` and skip.

### Publish success

```
✅ *Publicado*: {title}
Cliente: {clientName}
• Instagram → {ig_permalink}
• TikTok → {tiktok_permalink}
```

Lines for each platform that has a permalink. Sent to:
1. `clients.whatsapp_group` (existing column).
2. `app_settings.category_whatsapp_groups[client.category]`.

---

## Producer Routing Rules

Goal: route the rejection to the historical producer responsible for what was rejected, not whoever happens to be assigned now.

| Post type | `rejection_target` | Producer to notify |
|---|---|---|
| `reel`, `video`, `tiktok_video` (with `thumbnail_url`) | `cover` | Latest assignee of phase `design` from `delivery_phases` |
| `reel`, `video`, `tiktok_video` (with `thumbnail_url`) | `video` | Latest assignee of phase `edicao_de_video` |
| `reel`, `video`, `tiktok_video` (no thumbnail) | NULL | Latest assignee of phase `edicao_de_video` |
| `image`, `carousel`, `story`, `tiktok_photo` | NULL | Latest assignee of phase `design` |
| Any (no producer phase recorded) | — | Skip producer notification, log warn. SM digest and category group still go out. |

"Latest assignee" = the most recent `delivery_phases` row for that delivery+phase, regardless of `exited_at`. We do not consider phases that were never assigned.

---

## Error Handling

- Each send is `await sendText(...)` inside its own try/catch. Failure → `logger.error` with destination + reason, continue with the next.
- Evolution API down → all sends fail, all logged, batch + delivery state in DB is unchanged. Operator can replay manually if needed (out of scope: an automated replay).
- `category_whatsapp_groups` setting missing or category absent → log warn, skip the category-group leg, the rest fires normally.
- Producer has no `users.whatsapp` → log warn, skip, others continue.
- Worker fires twice (BullMQ retry, network blip) → `review_window_fired_at IS NOT NULL` short-circuits the second run.
- New review on a batch whose window already fired → opens a brand-new window. The old digest stays sent; the new window will produce its own digest later.

---

## Tests (Jest + supertest, repo style)

### `server/src/modules/notifications/notifications.service.test.js`

- Composes the SM digest with: only approvals; only rejections; both sections.
- Per-producer dedup: three rejected items by the same producer → one message.
- Routing: `rejection_target='cover'` resolves to design assignee; `'video'` resolves to edicao_de_video assignee; NULL on `reel` falls back to edicao_de_video; NULL on `image` falls back to design.
- Category not mapped in `app_settings` → no throw, warn logged, no group send.
- Producer with no `users.whatsapp` → no throw, warn logged.
- `notifyPublishSuccess`: one platform → message has one line; two platforms → two lines, both groups receive it.

### `server/src/queues/approval-review-window.worker.test.js`

- Job runs against a window-open batch → marks `fired_at`, calls `notifyBatchReviewWindow` once.
- Job runs against a batch already `fired_at` → no-op, no dispatcher call.
- Items considered are only those `responded_at >= started_at` (older items in the batch from a previous window are not included).

### `server/src/modules/approvals/approvals.service.test.js` (new)

- First review of a fresh batch → enqueues `window:{batchId}` and sets `started_at`.
- Last pending item reviewed → calls `promoteApprovalReviewWindow(batchId)`.
- Review on a batch with `fired_at` set → clears `fired_at`, sets new `started_at`, enqueues a fresh job.
- POST with `rejection_target: 'cover'` validates and persists; with an invalid value → 400.

### `server/src/modules/instagram/instagram-publish.service.test.js` and `tiktok-publish.service.test.js` (light additions)

- When `groupReady` is true → `notifyPublishSuccess` invoked with the published post.
- When `groupReady` is false → not invoked.

---

## Sequencing for Implementation

The plan that follows this spec should be ordered:

1. Migration for the three new columns (`approval_items.rejection_target`, `approval_batches.review_window_started_at`, `approval_batches.review_window_fired_at`).
2. Notifications service (pure compose + send) with unit tests, no callers wired yet.
3. New BullMQ queue + worker with unit tests, no callers wired yet.
4. Wire `clientRespond` to open / promote the window, remove `_notifySmRejection`. Tests for the trigger.
5. Wire `publish-success` calls in both publish services.
6. UI: rejection modal capa/vídeo; API validation accepts the field.
7. Document the `category_whatsapp_groups` settings key in the runbook section of CLAUDE.md or equivalent.

Each step is its own commit; each step has tests green before moving on.
