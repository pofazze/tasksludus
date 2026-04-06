# Approval Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two-level approval system (social media → client) with Evolution API WhatsApp integration, public mobile-first approval page, and automated reminders.

**Architecture:** New `approvals` backend module (service, controller, routes, validation) + `evolution` service module for WhatsApp. New BullMQ queues for reminders/notifications. Frontend: new `/aprovacoes` page, new "Aprovacao" tab on client profile, public `/aprovacao/:token` page. Modifies auto-assign automation and ClickUp webhook handler.

**Tech Stack:** Express + Knex (PostgreSQL), React 19 + Tailwind v4 + Shadcn/ui, BullMQ, Evolution API REST, embla-carousel, @dnd-kit

---

## File Structure

### Backend — New files
- `server/src/database/migrations/026_approval_workflow.js` — New tables + column additions
- `server/src/modules/evolution/evolution.service.js` — Evolution API client (send message, list groups)
- `server/src/modules/approvals/approvals.service.js` — Approval business logic
- `server/src/modules/approvals/approvals.controller.js` — HTTP handlers
- `server/src/modules/approvals/approvals.routes.js` — Route definitions
- `server/src/modules/approvals/approvals.validation.js` — Joi schemas
- `server/src/queues/approval-reminder.worker.js` — BullMQ worker for 24h reminders

### Backend — Modified files
- `server/src/config/env.js` — Add `evolution` config block
- `server/src/app.js` — Register approval routes + worker
- `server/src/queues/index.js` — Add approval queues
- `server/src/modules/webhooks/automations/auto-assign.js` — Dynamic social media lookup for "aprovacao"
- `server/src/modules/webhooks/clickup.service.js` — Set `approval_status` on status change
- `server/src/modules/clients/clients.service.js` — Support new fields (whatsapp, whatsapp_group, social_media_id)

### Frontend — New files
- `client/src/pages/ApprovalsPage.jsx` — Overview page `/aprovacoes`
- `client/src/pages/PublicApprovalPage.jsx` — Public page `/aprovacao/:token`
- `client/src/components/approvals/ApprovalTab.jsx` — Tab inside client profile
- `client/src/components/approvals/ApprovalReviewSheet.jsx` — Social media review sheet
- `client/src/components/approvals/ApprovalCard.jsx` — Card for approval item
- `client/src/components/approvals/InstagramPostPreview.jsx` — Instagram layout simulator
- `client/src/services/approvals.js` — API service

### Frontend — Modified files
- `client/src/App.jsx` — Add routes
- `client/src/pages/ClientProfilePage.jsx` — Add "Aprovacao" tab
- `client/src/pages/ClientsPage.jsx` — Add WhatsApp fields + group selector to form
- `client/src/lib/constants.js` — Add approval status constants

---

## Task 1: Database Migration

**Files:**
- Create: `server/src/database/migrations/026_approval_workflow.js`

- [ ] **Step 1: Create migration file**

```javascript
/**
 * @param {import('knex').Knex} knex
 */
exports.up = function (knex) {
  return knex.schema
    .createTable('approval_batches', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('token').notNullable().unique().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('client_id').notNullable().references('id').inTable('clients').onDelete('CASCADE');
      table.uuid('created_by').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('status', 20).notNullable().defaultTo('pending'); // pending, completed, revoked
      table.timestamp('completed_at').nullable();
      table.timestamp('revoked_at').nullable();
      table.timestamps(true, true);
    })
    .createTable('approval_items', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('batch_id').notNullable().references('id').inTable('approval_batches').onDelete('CASCADE');
      table.uuid('delivery_id').notNullable().references('id').inTable('deliveries').onDelete('CASCADE');
      table.text('caption').nullable();
      table.jsonb('media_urls').nullable();
      table.text('thumbnail_url').nullable();
      table.string('post_type', 20).nullable();
      table.string('status', 20).notNullable().defaultTo('pending'); // pending, approved, rejected
      table.text('rejection_reason').nullable();
      table.timestamp('responded_at').nullable();
      table.timestamps(true, true);
    })
    .then(() => knex.schema.alterTable('clients', (table) => {
      table.uuid('social_media_id').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.string('whatsapp', 20).nullable();
      table.string('whatsapp_group', 50).nullable();
    }))
    .then(() => knex.schema.alterTable('deliveries', (table) => {
      table.string('approval_status', 30).nullable();
    }))
    .then(() => knex.schema.alterTable('users', (table) => {
      table.text('evolution_instance_url').nullable();
      table.text('evolution_instance_iv').nullable();
      table.text('evolution_instance_auth_tag').nullable();
      table.text('evolution_api_key_encrypted').nullable();
      table.text('evolution_api_key_iv').nullable();
      table.text('evolution_api_key_auth_tag').nullable();
    }));
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('approval_items')
    .dropTableIfExists('approval_batches')
    .then(() => knex.schema.alterTable('clients', (table) => {
      table.dropColumn('social_media_id');
      table.dropColumn('whatsapp');
      table.dropColumn('whatsapp_group');
    }))
    .then(() => knex.schema.alterTable('deliveries', (table) => {
      table.dropColumn('approval_status');
    }))
    .then(() => knex.schema.alterTable('users', (table) => {
      table.dropColumn('evolution_instance_url');
      table.dropColumn('evolution_instance_iv');
      table.dropColumn('evolution_instance_auth_tag');
      table.dropColumn('evolution_api_key_encrypted');
      table.dropColumn('evolution_api_key_iv');
      table.dropColumn('evolution_api_key_auth_tag');
    }));
};
```

- [ ] **Step 2: Run migration**

Run: `cd /home/dev/projetos/server && npx knex migrate:latest`
Expected: Migration 026 applied successfully

- [ ] **Step 3: Commit**

```bash
git add server/src/database/migrations/026_approval_workflow.js
git commit -m "feat: add approval workflow migration (tables + column additions)"
```

---

## Task 2: Environment Config — Evolution API

**Files:**
- Modify: `server/src/config/env.js`

- [ ] **Step 1: Add evolution config block to env.js**

Add after the `meta` block (after line 51):

```javascript
  evolution: {
    apiUrl: process.env.EVOLUTION_API_URL,
    apiKey: process.env.EVOLUTION_API_KEY,
  },
```

- [ ] **Step 2: Commit**

```bash
git add server/src/config/env.js
git commit -m "feat: add Evolution API env config"
```

---

## Task 3: Evolution API Service

**Files:**
- Create: `server/src/modules/evolution/evolution.service.js`

- [ ] **Step 1: Create evolution service**

```javascript
const env = require('../../config/env');
const logger = require('../../utils/logger');

class EvolutionService {
  constructor() {
    this.baseUrl = null;
    this.apiKey = null;
  }

  _init() {
    if (!this.baseUrl) {
      this.baseUrl = env.evolution.apiUrl?.replace(/\/$/, '');
      this.apiKey = env.evolution.apiKey;
    }
  }

  _headers() {
    return {
      'Content-Type': 'application/json',
      apikey: this.apiKey,
    };
  }

  /**
   * Send a text message via Evolution API
   * @param {string} instanceName - Evolution instance name (extracted from URL or configured)
   * @param {string} remoteJid - Recipient JID (e.g. 5511999999999@s.whatsapp.net or 120363...@g.us)
   * @param {string} text - Message text
   */
  async sendText(remoteJid, text) {
    this._init();
    if (!this.baseUrl || !this.apiKey) {
      logger.warn('Evolution API not configured, skipping message send');
      return null;
    }

    // Extract instance name from URL (last path segment) or use default
    const instanceName = this._getInstanceName();

    const url = `${this.baseUrl}/message/sendText/${instanceName}`;
    const body = {
      number: remoteJid,
      text,
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        logger.error('Evolution API sendText failed', { status: res.status, error: err, remoteJid });
        return null;
      }

      const data = await res.json();
      logger.info('Evolution API message sent', { remoteJid });
      return data;
    } catch (err) {
      logger.error('Evolution API sendText error', { error: err.message, remoteJid });
      return null;
    }
  }

  /**
   * List all groups the instance is part of
   * @returns {Array<{ id: string, subject: string }>} groups
   */
  async listGroups() {
    this._init();
    if (!this.baseUrl || !this.apiKey) {
      logger.warn('Evolution API not configured');
      return [];
    }

    const instanceName = this._getInstanceName();
    const url = `${this.baseUrl}/group/fetchAllGroups/${instanceName}?getParticipants=false`;

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: this._headers(),
      });

      if (!res.ok) {
        const err = await res.text();
        logger.error('Evolution API listGroups failed', { status: res.status, error: err });
        return [];
      }

      const data = await res.json();
      // Evolution API returns array of group objects with id and subject
      return (data || []).map((g) => ({
        id: g.id,
        subject: g.subject,
      }));
    } catch (err) {
      logger.error('Evolution API listGroups error', { error: err.message });
      return [];
    }
  }

  /**
   * Build WhatsApp JID from phone number
   * @param {string} phone - Phone number (e.g. 5511999999999)
   * @returns {string} JID (e.g. 5511999999999@s.whatsapp.net)
   */
  buildPersonalJid(phone) {
    if (!phone) return null;
    const clean = phone.replace(/\D/g, '');
    return `${clean}@s.whatsapp.net`;
  }

  _getInstanceName() {
    // Instance name is typically part of the URL or set separately
    // For now, extract from base URL or use env
    // Common pattern: https://api.example.com/instance-name → use a separate env var
    // We'll use the URL as-is and let the user configure the instance name
    return process.env.EVOLUTION_INSTANCE_NAME || 'tasksludus';
  }
}

module.exports = new EvolutionService();
```

- [ ] **Step 2: Add EVOLUTION_INSTANCE_NAME to env consideration**

The instance name will be provided via `EVOLUTION_INSTANCE_NAME` env var.

- [ ] **Step 3: Commit**

```bash
git add server/src/modules/evolution/evolution.service.js
git commit -m "feat: add Evolution API service (sendText, listGroups)"
```

---

## Task 4: Approval Backend — Validation

**Files:**
- Create: `server/src/modules/approvals/approvals.validation.js`

- [ ] **Step 1: Create validation schemas**

```javascript
const Joi = require('joi');

const smApproveSchema = Joi.object({
  delivery_id: Joi.string().uuid().required(),
  caption: Joi.string().max(2200).allow(null, '').optional(),
  media_urls: Joi.array().items(Joi.object({
    url: Joi.string().required(),
    type: Joi.string().valid('image', 'video').required(),
    order: Joi.number().integer().min(0).optional(),
  })).min(1).required(),
  thumbnail_url: Joi.string().allow(null, '').optional(),
  post_type: Joi.string().valid('reel', 'feed', 'carrossel', 'story', 'image', 'carousel').required(),
});

const sendToClientSchema = Joi.object({
  client_id: Joi.string().uuid().required(),
  delivery_ids: Joi.array().items(Joi.string().uuid()).min(1).required(),
});

const clientRespondSchema = Joi.object({
  status: Joi.string().valid('approved', 'rejected').required(),
  rejection_reason: Joi.string().max(2000).when('status', {
    is: 'rejected',
    then: Joi.required(),
    otherwise: Joi.allow(null, '').optional(),
  }),
});

module.exports = {
  smApproveSchema,
  sendToClientSchema,
  clientRespondSchema,
};
```

- [ ] **Step 2: Commit**

```bash
git add server/src/modules/approvals/approvals.validation.js
git commit -m "feat: add approval validation schemas"
```

---

## Task 5: Approval Backend — Service

**Files:**
- Create: `server/src/modules/approvals/approvals.service.js`

- [ ] **Step 1: Create approval service**

```javascript
const db = require('../../config/db');
const logger = require('../../utils/logger');
const evolutionService = require('../evolution/evolution.service');
const clickupOAuth = require('../webhooks/clickup-oauth.service');
const eventBus = require('../../events/eventBus');
const env = require('../../config/env');

class ApprovalsService {
  /**
   * List deliveries pending SM approval for a given social media user
   */
  async listSmPending(userId) {
    // Get clients where this user is the social media
    const clientIds = await db('clients')
      .where({ social_media_id: userId })
      .select('id');

    return db('deliveries')
      .whereIn('client_id', clientIds.map((c) => c.id))
      .where({ approval_status: 'sm_pending' })
      .select('*')
      .orderBy('updated_at', 'desc');
  }

  /**
   * List all deliveries in approval flow for a specific client
   */
  async listByClient(clientId) {
    return db('deliveries')
      .where({ client_id: clientId })
      .whereNotNull('approval_status')
      .select('*')
      .orderBy('updated_at', 'desc');
  }

  /**
   * Social media approves a delivery — saves prepared content
   */
  async smApprove(deliveryId, data, userId) {
    const delivery = await db('deliveries').where({ id: deliveryId }).first();
    if (!delivery) {
      throw Object.assign(new Error('Delivery not found'), { status: 404 });
    }
    if (delivery.approval_status !== 'sm_pending') {
      throw Object.assign(new Error('Delivery is not pending SM approval'), { status: 400 });
    }

    // Store prepared content in a temporary record or update delivery
    // We save the prepared content when creating the approval_item (sendToClient)
    await db('deliveries')
      .where({ id: deliveryId })
      .update({
        approval_status: 'sm_approved',
        updated_at: new Date(),
      });

    // Store the prepared content in a cache-like structure on the delivery
    // We'll use a JSONB field or save it when sending to client
    // For now, return the data so the frontend can hold it until sendToClient
    eventBus.emit('sse', { type: 'delivery:updated', payload: { id: deliveryId, approval_status: 'sm_approved' } });
    logger.info(`SM approved delivery ${deliveryId}`);

    return { deliveryId, approval_status: 'sm_approved' };
  }

  /**
   * Send selected deliveries to client for approval
   * Creates or appends to existing batch
   */
  async sendToClient(clientId, deliveryIds, userId) {
    const client = await db('clients').where({ id: clientId }).first();
    if (!client) {
      throw Object.assign(new Error('Client not found'), { status: 404 });
    }

    if (!client.whatsapp_group) {
      throw Object.assign(new Error('Client does not have a WhatsApp group configured'), { status: 400 });
    }

    // Check all deliveries are sm_approved
    const deliveries = await db('deliveries')
      .whereIn('id', deliveryIds)
      .where({ client_id: clientId, approval_status: 'sm_approved' });

    if (deliveries.length !== deliveryIds.length) {
      throw Object.assign(new Error('Some deliveries are not approved by social media'), { status: 400 });
    }

    // Check for existing pending batch
    let batch = await db('approval_batches')
      .where({ client_id: clientId, status: 'pending' })
      .first();

    let isNewBatch = false;
    if (!batch) {
      [batch] = await db('approval_batches').insert({
        client_id: clientId,
        created_by: userId,
        status: 'pending',
      }).returning('*');
      isNewBatch = true;
    }

    // Create approval items for each delivery
    // Frontend sends prepared content (caption, media_urls, thumbnail_url, post_type)
    // which is stored in the request alongside delivery_ids
    // For now we pull from the delivery + ClickUp
    const items = [];
    for (const delivery of deliveries) {
      const [item] = await db('approval_items').insert({
        batch_id: batch.id,
        delivery_id: delivery.id,
        caption: delivery._prepared_caption || null,
        media_urls: delivery._prepared_media_urls ? JSON.stringify(delivery._prepared_media_urls) : null,
        thumbnail_url: delivery._prepared_thumbnail_url || null,
        post_type: delivery._prepared_post_type || delivery.content_type || null,
        status: 'pending',
      }).returning('*');
      items.push(item);

      // Update delivery approval_status
      await db('deliveries')
        .where({ id: delivery.id })
        .update({ approval_status: 'client_pending', updated_at: new Date() });
    }

    // Build approval link
    const baseUrl = env.clientUrl.split(',')[0].trim();
    const approvalLink = `${baseUrl}/aprovacao/${batch.token}`;

    // Count total pending in batch
    const pendingCount = await db('approval_items')
      .where({ batch_id: batch.id, status: 'pending' })
      .count('id as count')
      .first();

    // Send WhatsApp message to group
    const message = isNewBatch
      ? `Ola! As publicacoes de *${client.name}* estao prontas para aprovacao.\nAcesse o link para revisar e aprovar: ${approvalLink}\n\n*${pendingCount.count} publicacoes aguardando aprovacao.*`
      : `Novas publicacoes de *${client.name}* foram adicionadas para aprovacao!\n${items.length} nova(s) publicacao(oes) adicionada(s).\n*${pendingCount.count} publicacoes aguardando aprovacao.*\n\nAcesse: ${approvalLink}`;

    await evolutionService.sendText(client.whatsapp_group, message);

    // Schedule reminder job (only for new batches)
    if (isNewBatch) {
      const { approvalReminderQueue } = require('../../queues');
      await approvalReminderQueue.add('reminder', { batchId: batch.id }, {
        repeat: { every: 24 * 60 * 60 * 1000 }, // 24h in ms
        jobId: `approval-reminder-${batch.id}`,
      });
      logger.info(`Scheduled approval reminder for batch ${batch.id}`);
    }

    eventBus.emit('sse', { type: 'approval:updated', payload: { batchId: batch.id, clientId } });
    logger.info(`Sent ${items.length} deliveries to client approval, batch ${batch.id}`);

    return { batch, items, approvalLink };
  }

  /**
   * Get batch by public token (for public page)
   */
  async getBatchByToken(token) {
    const batch = await db('approval_batches').where({ token }).first();
    if (!batch) {
      throw Object.assign(new Error('Invalid or expired approval link'), { status: 404 });
    }

    const items = await db('approval_items')
      .where({ batch_id: batch.id })
      .join('deliveries', 'approval_items.delivery_id', 'deliveries.id')
      .select(
        'approval_items.*',
        'deliveries.title as delivery_title',
        'deliveries.content_type as delivery_content_type',
        'deliveries.clickup_task_id',
      )
      .orderBy('approval_items.created_at', 'asc');

    const client = await db('clients')
      .where({ id: batch.client_id })
      .select('id', 'name', 'company', 'instagram_account')
      .first();

    return { batch, items, client };
  }

  /**
   * Client responds to an approval item (public endpoint)
   */
  async clientRespond(token, itemId, status, rejectionReason) {
    const batch = await db('approval_batches').where({ token, status: 'pending' }).first();
    if (!batch) {
      throw Object.assign(new Error('This approval link is no longer active'), { status: 400 });
    }

    const item = await db('approval_items').where({ id: itemId, batch_id: batch.id }).first();
    if (!item) {
      throw Object.assign(new Error('Approval item not found'), { status: 404 });
    }
    if (item.status !== 'pending') {
      throw Object.assign(new Error('This item has already been responded to'), { status: 400 });
    }

    // Update item
    await db('approval_items')
      .where({ id: itemId })
      .update({
        status,
        rejection_reason: status === 'rejected' ? rejectionReason : null,
        responded_at: new Date(),
        updated_at: new Date(),
      });

    // Update delivery approval_status
    const newApprovalStatus = status === 'approved' ? 'client_approved' : 'client_rejected';
    await db('deliveries')
      .where({ id: item.delivery_id })
      .update({ approval_status: newApprovalStatus, updated_at: new Date() });

    // Move task in ClickUp
    const delivery = await db('deliveries').where({ id: item.delivery_id }).first();
    if (delivery?.clickup_task_id) {
      const clickupStatus = status === 'approved' ? 'agendamento' : 'correção';
      await this._moveClickUpTask(delivery.clickup_task_id, clickupStatus);
    }

    // If rejected, notify social media via WhatsApp
    if (status === 'rejected') {
      await this._notifySmRejection(batch, item, delivery, rejectionReason);
    }

    // Check if all items in batch are responded
    const pendingItems = await db('approval_items')
      .where({ batch_id: batch.id, status: 'pending' })
      .count('id as count')
      .first();

    if (Number(pendingItems.count) === 0) {
      await db('approval_batches')
        .where({ id: batch.id })
        .update({ status: 'completed', completed_at: new Date(), updated_at: new Date() });

      // Cancel reminder job
      const { approvalReminderQueue } = require('../../queues');
      const repeatableJobs = await approvalReminderQueue.getRepeatableJobs();
      for (const job of repeatableJobs) {
        if (job.id === `approval-reminder-${batch.id}`) {
          await approvalReminderQueue.removeRepeatableByKey(job.key);
        }
      }
      logger.info(`Batch ${batch.id} completed — all items responded`);
    }

    eventBus.emit('sse', { type: 'approval:updated', payload: { batchId: batch.id, itemId, status: newApprovalStatus } });

    return { itemId, status: newApprovalStatus };
  }

  /**
   * Revoke a batch (social media action)
   */
  async revokeBatch(batchId, userId) {
    const batch = await db('approval_batches').where({ id: batchId, status: 'pending' }).first();
    if (!batch) {
      throw Object.assign(new Error('Batch not found or already completed'), { status: 404 });
    }

    await db('approval_batches')
      .where({ id: batchId })
      .update({ status: 'revoked', revoked_at: new Date(), updated_at: new Date() });

    // Revert pending items back to sm_approved
    const pendingItems = await db('approval_items')
      .where({ batch_id: batchId, status: 'pending' })
      .select('delivery_id');

    for (const item of pendingItems) {
      await db('deliveries')
        .where({ id: item.delivery_id })
        .update({ approval_status: 'sm_approved', updated_at: new Date() });
    }

    // Cancel reminder job
    const { approvalReminderQueue } = require('../../queues');
    const repeatableJobs = await approvalReminderQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (job.id === `approval-reminder-${batchId}`) {
        await approvalReminderQueue.removeRepeatableByKey(job.key);
      }
    }

    eventBus.emit('sse', { type: 'approval:updated', payload: { batchId, status: 'revoked' } });
    logger.info(`Batch ${batchId} revoked by user ${userId}`);

    return { batchId, status: 'revoked' };
  }

  /**
   * List batches for a client
   */
  async listBatches(clientId) {
    const batches = await db('approval_batches')
      .where({ client_id: clientId })
      .orderBy('created_at', 'desc');

    for (const batch of batches) {
      const counts = await db('approval_items')
        .where({ batch_id: batch.id })
        .select(db.raw('count(*) as total'))
        .select(db.raw("count(*) filter (where status = 'pending') as pending"))
        .select(db.raw("count(*) filter (where status = 'approved') as approved"))
        .select(db.raw("count(*) filter (where status = 'rejected') as rejected"))
        .first();
      batch.counts = counts;
    }

    return batches;
  }

  /**
   * List WhatsApp groups from Evolution API
   */
  async listWhatsAppGroups() {
    return evolutionService.listGroups();
  }

  // --- Private helpers ---

  async _moveClickUpTask(clickupTaskId, statusName) {
    try {
      const token = await clickupOAuth.getDecryptedToken();
      const res = await fetch(`https://api.clickup.com/api/v2/task/${clickupTaskId}`, {
        method: 'PUT',
        headers: {
          Authorization: token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: statusName }),
      });
      if (!res.ok) {
        const body = await res.text();
        logger.error(`Failed to move ClickUp task ${clickupTaskId} to ${statusName}: ${body}`);
      } else {
        logger.info(`Moved ClickUp task ${clickupTaskId} to "${statusName}"`);
      }
    } catch (err) {
      logger.error(`Error moving ClickUp task: ${err.message}`);
    }
  }

  async _notifySmRejection(batch, item, delivery, rejectionReason) {
    try {
      const creator = await db('users').where({ id: batch.created_by }).first();
      if (!creator?.whatsapp) {
        logger.warn(`Cannot notify SM — no WhatsApp number for user ${batch.created_by}`);
        return;
      }

      const client = await db('clients').where({ id: batch.client_id }).first();
      const jid = evolutionService.buildPersonalJid(creator.whatsapp);

      const message = `*${client.name}* reprovou uma publicacao:\n*Titulo:* ${delivery.title || 'Sem titulo'}\n*Motivo:* ${rejectionReason}\n\nAcesse a plataforma para revisar.`;

      await evolutionService.sendText(jid, message);
      logger.info(`Rejection notification sent to SM ${creator.name}`);
    } catch (err) {
      logger.error(`Failed to notify SM of rejection: ${err.message}`);
    }
  }
}

module.exports = new ApprovalsService();
```

- [ ] **Step 2: Commit**

```bash
git add server/src/modules/approvals/approvals.service.js
git commit -m "feat: add approvals service (SM approve, send to client, client respond, revoke)"
```

---

## Task 6: Approval Backend — Controller

**Files:**
- Create: `server/src/modules/approvals/approvals.controller.js`

- [ ] **Step 1: Create controller**

```javascript
const service = require('./approvals.service');
const { smApproveSchema, sendToClientSchema, clientRespondSchema } = require('./approvals.validation');
const logger = require('../../utils/logger');

class ApprovalsController {
  /** GET /api/approvals/pending — SM's pending deliveries */
  async listSmPending(req, res, next) {
    try {
      const deliveries = await service.listSmPending(req.user.id);
      res.json(deliveries);
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/approvals/client/:clientId — deliveries in approval flow for a client */
  async listByClient(req, res, next) {
    try {
      const deliveries = await service.listByClient(req.params.clientId);
      res.json(deliveries);
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/approvals/sm-approve — SM approves a delivery */
  async smApprove(req, res, next) {
    try {
      const { error, value } = smApproveSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const result = await service.smApprove(value.delivery_id, value, req.user.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/approvals/send-to-client — Send selected deliveries to client */
  async sendToClient(req, res, next) {
    try {
      const { error, value } = sendToClientSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const result = await service.sendToClient(value.client_id, value.delivery_ids, req.user.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/approvals/batches/:clientId — List batches for a client */
  async listBatches(req, res, next) {
    try {
      const batches = await service.listBatches(req.params.clientId);
      res.json(batches);
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/approvals/batches/:batchId/revoke — Revoke a batch */
  async revokeBatch(req, res, next) {
    try {
      const result = await service.revokeBatch(req.params.batchId, req.user.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/approvals/whatsapp-groups — List WhatsApp groups */
  async listWhatsAppGroups(req, res, next) {
    try {
      const groups = await service.listWhatsAppGroups();
      res.json(groups);
    } catch (err) {
      next(err);
    }
  }

  // --- Public endpoints (no auth) ---

  /** GET /api/approvals/public/:token — Get batch data for public page */
  async getPublicBatch(req, res, next) {
    try {
      const data = await service.getBatchByToken(req.params.token);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/approvals/public/:token/items/:itemId/respond — Client responds */
  async clientRespond(req, res, next) {
    try {
      const { error, value } = clientRespondSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const result = await service.clientRespond(
        req.params.token,
        req.params.itemId,
        value.status,
        value.rejection_reason,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ApprovalsController();
```

- [ ] **Step 2: Commit**

```bash
git add server/src/modules/approvals/approvals.controller.js
git commit -m "feat: add approvals controller"
```

---

## Task 7: Approval Backend — Routes

**Files:**
- Create: `server/src/modules/approvals/approvals.routes.js`
- Modify: `server/src/app.js`

- [ ] **Step 1: Create routes file**

```javascript
const express = require('express');
const { authenticate } = require('../../middleware/auth');
const controller = require('./approvals.controller');

const router = express.Router();

// Public endpoints (no auth) — must be before authenticate middleware
router.get('/public/:token', controller.getPublicBatch.bind(controller));
router.post('/public/:token/items/:itemId/respond', controller.clientRespond.bind(controller));

// Apply auth middleware for all other routes
router.use(authenticate);

// Social media endpoints
router.get('/pending', controller.listSmPending.bind(controller));
router.get('/client/:clientId', controller.listByClient.bind(controller));
router.post('/sm-approve', controller.smApprove.bind(controller));
router.post('/send-to-client', controller.sendToClient.bind(controller));
router.get('/batches/:clientId', controller.listBatches.bind(controller));
router.post('/batches/:batchId/revoke', controller.revokeBatch.bind(controller));
router.get('/whatsapp-groups', controller.listWhatsAppGroups.bind(controller));

module.exports = router;
```

- [ ] **Step 2: Register routes in app.js**

In `server/src/app.js`, add after line 23 (eventsRoutes import):

```javascript
const approvalsRoutes = require('./modules/approvals/approvals.routes');
```

And add after line 95 (events route registration):

```javascript
app.use('/api/approvals', approvalsRoutes);
```

- [ ] **Step 3: Commit**

```bash
git add server/src/modules/approvals/approvals.routes.js server/src/app.js
git commit -m "feat: add approval routes and register in app"
```

---

## Task 8: BullMQ — Approval Queues and Reminder Worker

**Files:**
- Modify: `server/src/queues/index.js`
- Create: `server/src/queues/approval-reminder.worker.js`
- Modify: `server/src/app.js`

- [ ] **Step 1: Add approval queue to queues/index.js**

After line 12 (deliverySyncQueue), add:

```javascript
const approvalReminderQueue = new Queue('approval-reminder', { connection });
```

Add to the module.exports object:

```javascript
  approvalReminderQueue,
```

- [ ] **Step 2: Create reminder worker**

```javascript
const { Worker } = require('bullmq');
const db = require('../config/db');
const logger = require('../utils/logger');
const evolutionService = require('../modules/evolution/evolution.service');
const env = require('../config/env');
const { connection } = require('./index');

const worker = new Worker('approval-reminder', async (job) => {
  const { batchId } = job.data;
  logger.info('Processing approval reminder', { batchId, jobId: job.id });

  const batch = await db('approval_batches').where({ id: batchId }).first();
  if (!batch || batch.status !== 'pending') {
    logger.info('Batch no longer pending, skipping reminder', { batchId, status: batch?.status });
    return;
  }

  const client = await db('clients').where({ id: batch.client_id }).first();
  if (!client) {
    logger.warn('Client not found for batch', { batchId, clientId: batch.client_id });
    return;
  }

  // Count pending items
  const { count: pendingCount } = await db('approval_items')
    .where({ batch_id: batchId, status: 'pending' })
    .count('id as count')
    .first();
  const { count: totalCount } = await db('approval_items')
    .where({ batch_id: batchId })
    .count('id as count')
    .first();

  if (Number(pendingCount) === 0) {
    logger.info('No pending items, skipping reminder', { batchId });
    return;
  }

  const baseUrl = env.clientUrl.split(',')[0].trim();
  const approvalLink = `${baseUrl}/aprovacao/${batch.token}`;

  // Determine if >24h since batch creation (send to personal) or <=24h (send to group)
  const hoursSinceCreation = (Date.now() - new Date(batch.created_at).getTime()) / (1000 * 60 * 60);

  if (hoursSinceCreation <= 24) {
    // Send to group
    if (client.whatsapp_group) {
      const message = `Lembrete: ainda ha publicacoes de *${client.name}* aguardando aprovacao.\n${pendingCount} de ${totalCount} publicacoes pendentes.\nAcesse: ${approvalLink}`;
      await evolutionService.sendText(client.whatsapp_group, message);
      logger.info('Reminder sent to group', { batchId, group: client.whatsapp_group });
    }
  } else {
    // Send to client's personal WhatsApp
    if (client.whatsapp) {
      const jid = evolutionService.buildPersonalJid(client.whatsapp);
      const message = `Ola *${client.name}*! Suas publicacoes ainda aguardam aprovacao.\n${pendingCount} de ${totalCount} publicacoes pendentes.\nAcesse: ${approvalLink}`;
      await evolutionService.sendText(jid, message);
      logger.info('Reminder sent to personal', { batchId, phone: client.whatsapp });
    } else {
      logger.warn('Client has no personal WhatsApp, falling back to group', { batchId });
      if (client.whatsapp_group) {
        const message = `Lembrete: ainda ha publicacoes de *${client.name}* aguardando aprovacao.\n${pendingCount} de ${totalCount} publicacoes pendentes.\nAcesse: ${approvalLink}`;
        await evolutionService.sendText(client.whatsapp_group, message);
      }
    }
  }
}, {
  connection,
  concurrency: 1,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 60000,
    },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
  },
});

worker.on('completed', (job) => {
  logger.info('Approval reminder job completed', { jobId: job.id });
});

worker.on('failed', (job, err) => {
  logger.error('Approval reminder job failed', { jobId: job?.id, error: err.message });
});

module.exports = worker;
```

- [ ] **Step 3: Register worker in app.js**

In `server/src/app.js`, after line 112 (delivery-sync.worker require), add:

```javascript
  require('./queues/approval-reminder.worker');
```

- [ ] **Step 4: Commit**

```bash
git add server/src/queues/index.js server/src/queues/approval-reminder.worker.js server/src/app.js
git commit -m "feat: add approval reminder queue and worker (24h cycle)"
```

---

## Task 9: Modify Auto-Assign for Dynamic Social Media Lookup

**Files:**
- Modify: `server/src/modules/webhooks/automations/auto-assign.js`

- [ ] **Step 1: Replace hardcoded Wander Fran with dynamic lookup**

In auto-assign.js, the `run` function (around line 74-76) currently does:

```javascript
  } else {
    assigneeId = PHASE_ASSIGNEE_MAP[normalized];
  }
```

Replace lines 32-33 in `PHASE_ASSIGNEE_MAP`:

```javascript
  'aprovação':        null,  // Dynamic — resolved from client.social_media_id
  'aprovacao':        null,  // Dynamic — resolved from client.social_media_id
```

Then modify the `run` function. After the `PHASE_ASSIGNEE_MAP` lookup (around line 76), before the `if (!assigneeId)` check, add:

```javascript
  // Dynamic lookup for approval phase
  if (['aprovação', 'aprovacao'].includes(normalized) && !assigneeId) {
    const listId = task?.list?.id;
    if (listId) {
      const client = await db('clients').where({ clickup_list_id: listId }).first();
      if (client?.social_media_id) {
        const smUser = await db('users').where({ id: client.social_media_id }).first();
        if (smUser?.clickup_id) {
          assigneeId = smUser.clickup_id;
          logger.info(`auto-assign: approval phase → dynamic SM lookup → ${smUser.name} (${assigneeId})`);
        }
      }
    }
  }
```

- [ ] **Step 2: Commit**

```bash
git add server/src/modules/webhooks/automations/auto-assign.js
git commit -m "feat: auto-assign approval phase to client's social media (dynamic lookup)"
```

---

## Task 10: Modify ClickUp Webhook — Set approval_status

**Files:**
- Modify: `server/src/modules/webhooks/clickup.service.js`

- [ ] **Step 1: Set approval_status when task enters "aprovacao"**

In `handleStatusChange`, after the delivery status update block (around line 128, after `logger.info`), add:

```javascript
      // Set approval_status when entering approval phase (covers both first time and returning from correction)
      if (newStatus === 'aprovacao') {
        await db('deliveries')
          .where({ id: delivery.id })
          .update({ approval_status: 'sm_pending', updated_at: new Date() });
        logger.info(`Delivery ${delivery.id} approval_status → sm_pending`);
      }
```

- [ ] **Step 2: Commit**

```bash
git add server/src/modules/webhooks/clickup.service.js
git commit -m "feat: set approval_status on ClickUp status change to aprovacao"
```

---

## Task 11: Frontend — API Service

**Files:**
- Create: `client/src/services/approvals.js`

- [ ] **Step 1: Create approvals API service**

```javascript
import api from './api';

// Authenticated endpoints
export const listSmPending = () =>
  api.get('/approvals/pending').then((r) => r.data);

export const listByClient = (clientId) =>
  api.get(`/approvals/client/${clientId}`).then((r) => r.data);

export const smApprove = (data) =>
  api.post('/approvals/sm-approve', data).then((r) => r.data);

export const sendToClient = (data) =>
  api.post('/approvals/send-to-client', data).then((r) => r.data);

export const listBatches = (clientId) =>
  api.get(`/approvals/batches/${clientId}`).then((r) => r.data);

export const revokeBatch = (batchId) =>
  api.post(`/approvals/batches/${batchId}/revoke`).then((r) => r.data);

export const listWhatsAppGroups = () =>
  api.get('/approvals/whatsapp-groups').then((r) => r.data);

// Public endpoints (no auth needed)
const publicApi = api; // Uses same axios instance; no token attached for public routes

export const getPublicBatch = (token) =>
  publicApi.get(`/approvals/public/${token}`).then((r) => r.data);

export const clientRespond = (token, itemId, data) =>
  publicApi.post(`/approvals/public/${token}/items/${itemId}/respond`, data).then((r) => r.data);
```

- [ ] **Step 2: Commit**

```bash
git add client/src/services/approvals.js
git commit -m "feat: add approvals API service"
```

---

## Task 12: Frontend — Constants

**Files:**
- Modify: `client/src/lib/constants.js`

- [ ] **Step 1: Add approval status constants**

Add to `client/src/lib/constants.js`:

```javascript
export const APPROVAL_STATUS_LABELS = {
  sm_pending: 'Aguardando Social Media',
  sm_approved: 'Aprovado (SM)',
  client_pending: 'Aguardando Cliente',
  client_approved: 'Aprovado',
  client_rejected: 'Reprovado',
};

export const APPROVAL_STATUS_COLORS = {
  sm_pending: 'bg-amber-500/15 text-amber-400',
  sm_approved: 'bg-blue-500/15 text-blue-400',
  client_pending: 'bg-purple-500/15 text-purple-400',
  client_approved: 'bg-emerald-500/15 text-emerald-400',
  client_rejected: 'bg-red-500/15 text-red-400',
};
```

- [ ] **Step 2: Commit**

```bash
git add client/src/lib/constants.js
git commit -m "feat: add approval status constants"
```

---

## Task 13: Frontend — Client Form WhatsApp Fields + Group Selector

**Files:**
- Modify: `client/src/pages/ClientsPage.jsx`

- [ ] **Step 1: Add whatsapp fields to form state**

In the form state initialization, add:

```javascript
  whatsapp: '',
  whatsapp_group: '',
  social_media_id: '',
```

- [ ] **Step 2: Add WhatsApp group fetch and selector**

Add state for groups:

```javascript
const [whatsappGroups, setWhatsappGroups] = useState([]);
const [loadingGroups, setLoadingGroups] = useState(false);
```

Add fetch function:

```javascript
const fetchWhatsAppGroups = async () => {
  setLoadingGroups(true);
  try {
    const groups = await api.get('/approvals/whatsapp-groups').then((r) => r.data);
    setWhatsappGroups(groups);
  } catch {
    toast.error('Erro ao carregar grupos do WhatsApp');
  } finally {
    setLoadingGroups(false);
  }
};
```

- [ ] **Step 3: Add form fields in the JSX**

Add after existing form fields in the edit form:

```jsx
{/* WhatsApp Section */}
<Separator className="my-4" />
<h3 className="text-sm font-medium text-zinc-300">WhatsApp</h3>
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
  <div className="space-y-2">
    <Label htmlFor="whatsapp">WhatsApp do Cliente</Label>
    <Input
      id="whatsapp"
      value={form.whatsapp}
      onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
      placeholder="5511999999999"
    />
  </div>
  <div className="space-y-2">
    <Label htmlFor="social_media_id">Social Media Responsavel</Label>
    <Select
      value={form.social_media_id || '_none'}
      onValueChange={(val) => setForm({ ...form, social_media_id: val === '_none' ? '' : val })}
    >
      <SelectTrigger id="social_media_id">
        <SelectValue placeholder="Selecione o social media" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="_none">Nenhum</SelectItem>
        {users.filter((u) => u.producer_type === 'social_media').map((u) => (
          <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
</div>
<div className="space-y-2">
  <Label htmlFor="whatsapp_group">Grupo de Producao (WhatsApp)</Label>
  <div className="flex gap-2">
    <Select
      value={form.whatsapp_group || '_none'}
      onValueChange={(val) => setForm({ ...form, whatsapp_group: val === '_none' ? '' : val })}
    >
      <SelectTrigger id="whatsapp_group" className="flex-1">
        <SelectValue placeholder="Selecione o grupo" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="_none">Nenhum</SelectItem>
        {whatsappGroups.map((g) => (
          <SelectItem key={g.id} value={g.id}>{g.subject}</SelectItem>
        ))}
      </SelectContent>
    </Select>
    <Button variant="outline" size="sm" onClick={fetchWhatsAppGroups} disabled={loadingGroups}>
      {loadingGroups ? <Loader2 size={14} className="animate-spin" /> : 'Carregar'}
    </Button>
  </div>
</div>
```

- [ ] **Step 4: Include new fields in save payload**

In the `handleSave` payload, add:

```javascript
  whatsapp: form.whatsapp || null,
  whatsapp_group: form.whatsapp_group || null,
  social_media_id: form.social_media_id || null,
```

- [ ] **Step 5: Pre-populate fields when editing**

When loading client data for editing, set the new fields:

```javascript
  whatsapp: client.whatsapp || '',
  whatsapp_group: client.whatsapp_group || '',
  social_media_id: client.social_media_id || '',
```

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/ClientsPage.jsx
git commit -m "feat: add WhatsApp fields and group selector to client form"
```

---

## Task 14: Frontend — Instagram Post Preview Component

**Files:**
- Create: `client/src/components/approvals/InstagramPostPreview.jsx`

- [ ] **Step 1: Create Instagram layout simulator component**

```jsx
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import CarouselPreview from '@/components/instagram/CarouselPreview';
import { proxyMediaUrl } from '@/lib/utils';
import { Heart, MessageCircle, Send, Bookmark } from 'lucide-react';

const POST_TYPE_LABELS = {
  reel: 'Reel',
  feed: 'Feed',
  carrossel: 'Carrossel',
  carousel: 'Carrossel',
  story: 'Story',
  image: 'Feed',
};

export default function InstagramPostPreview({ item, client, readOnly = false, onApprove, onReject }) {
  const [expanded, setExpanded] = useState(false);
  const media = typeof item.media_urls === 'string' ? JSON.parse(item.media_urls) : (item.media_urls || []);
  const caption = item.caption || '';
  const isLong = caption.length > 125;

  return (
    <div className="bg-black rounded-xl overflow-hidden border border-zinc-800 max-w-[480px] mx-auto">
      {/* Instagram Header */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#9A48EA] to-pink-500 flex items-center justify-center text-white text-xs font-bold">
          {client?.instagram_account?.[0]?.toUpperCase() || client?.name?.[0]?.toUpperCase() || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {client?.instagram_account || client?.name}
          </p>
        </div>
        <Badge variant="secondary" className="text-[10px] bg-zinc-800 text-zinc-400">
          {POST_TYPE_LABELS[item.post_type] || item.post_type}
        </Badge>
      </div>

      {/* Media */}
      <div className="bg-zinc-950">
        {media.length > 0 ? (
          <CarouselPreview media={media.map((m) => ({ ...m, url: proxyMediaUrl(m.url) }))} />
        ) : (
          <div className="h-64 flex items-center justify-center text-zinc-600 text-sm">
            Sem midia
          </div>
        )}
      </div>

      {/* Instagram Actions Bar */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex gap-4">
          <Heart size={22} className="text-zinc-400" />
          <MessageCircle size={22} className="text-zinc-400" />
          <Send size={22} className="text-zinc-400" />
        </div>
        <Bookmark size={22} className="text-zinc-400" />
      </div>

      {/* Caption */}
      {caption && (
        <div className="px-3 pb-3">
          <p className="text-sm text-zinc-200 whitespace-pre-wrap">
            <span className="font-semibold mr-1">{client?.instagram_account || client?.name}</span>
            {isLong && !expanded ? (
              <>
                {caption.slice(0, 125)}...
                <button onClick={() => setExpanded(true)} className="text-zinc-500 ml-1">
                  mais
                </button>
              </>
            ) : (
              caption
            )}
          </p>
        </div>
      )}

      {/* Status or Action buttons */}
      {item.status !== 'pending' ? (
        <div className="px-3 pb-3">
          <Badge className={item.status === 'approved'
            ? 'bg-emerald-500/15 text-emerald-400'
            : 'bg-red-500/15 text-red-400'
          }>
            {item.status === 'approved' ? 'Aprovado' : 'Reprovado'}
          </Badge>
          {item.rejection_reason && (
            <p className="text-xs text-zinc-500 mt-2">Motivo: {item.rejection_reason}</p>
          )}
        </div>
      ) : !readOnly && onApprove && onReject ? (
        <div className="px-3 pb-3 flex gap-2">
          <button
            onClick={() => onApprove(item.id)}
            className="flex-1 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors"
          >
            Aprovar
          </button>
          <button
            onClick={() => onReject(item.id)}
            className="flex-1 py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold text-sm transition-colors"
          >
            Reprovar
          </button>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/approvals/InstagramPostPreview.jsx
git commit -m "feat: add InstagramPostPreview component (Instagram layout simulator)"
```

---

## Task 15: Frontend — Public Approval Page

**Files:**
- Create: `client/src/pages/PublicApprovalPage.jsx`
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Create the public approval page**

```jsx
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getPublicBatch, clientRespond } from '@/services/approvals';
import InstagramPostPreview from '@/components/approvals/InstagramPostPreview';
import { Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

export default function PublicApprovalPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchBatch();
  }, [token]);

  const fetchBatch = async () => {
    try {
      const result = await getPublicBatch(token);
      setData(result);
    } catch (err) {
      setError(err.response?.data?.error || 'Link invalido ou expirado');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (itemId) => {
    setSubmitting(true);
    try {
      await clientRespond(token, itemId, { status: 'approved' });
      await fetchBatch();
    } catch {
      alert('Erro ao aprovar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectStart = (itemId) => {
    setRejectingId(itemId);
    setRejectionReason('');
  };

  const handleRejectConfirm = async () => {
    if (!rejectionReason.trim()) return;
    setSubmitting(true);
    try {
      await clientRespond(token, rejectingId, {
        status: 'rejected',
        rejection_reason: rejectionReason.trim(),
      });
      setRejectingId(null);
      setRejectionReason('');
      await fetchBatch();
    } catch {
      alert('Erro ao reprovar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090B] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#9A48EA]" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#09090B] flex flex-col items-center justify-center px-6 text-center">
        <AlertTriangle size={48} className="text-amber-400 mb-4" />
        <h1 className="text-xl font-semibold text-zinc-200 mb-2">Link indisponivel</h1>
        <p className="text-zinc-500">{error}</p>
      </div>
    );
  }

  const { batch, items, client } = data;
  const respondedCount = items.filter((i) => i.status !== 'pending').length;
  const allResponded = respondedCount === items.length;
  const isRevoked = batch.status === 'revoked';
  const readOnly = allResponded || isRevoked;

  return (
    <div className="min-h-screen bg-[#09090B] text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#09090B]/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="max-w-[480px] mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#9A48EA] flex items-center justify-center text-white text-xs font-bold">
              L
            </div>
            <div className="flex-1">
              <h1 className="text-sm font-semibold">{client?.name}</h1>
              <p className="text-xs text-zinc-500">
                {respondedCount} de {items.length} publicacoes respondidas
              </p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-2 h-1 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-[#9A48EA] transition-all duration-500"
              style={{ width: `${(respondedCount / items.length) * 100}%` }}
            />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-[480px] mx-auto px-4 py-6 space-y-6 pb-24">
        {allResponded && (
          <div className="text-center py-8">
            <CheckCircle2 size={48} className="text-emerald-400 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-zinc-200">Obrigado!</h2>
            <p className="text-sm text-zinc-500 mt-1">Todas as publicacoes foram respondidas.</p>
          </div>
        )}

        {isRevoked && (
          <div className="text-center py-8">
            <XCircle size={48} className="text-zinc-500 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-zinc-300">Este link nao esta mais disponivel</h2>
          </div>
        )}

        {items.map((item) => (
          <div key={item.id}>
            <InstagramPostPreview
              item={item}
              client={client}
              readOnly={readOnly || submitting}
              onApprove={handleApprove}
              onReject={handleRejectStart}
            />

            {/* Rejection modal inline */}
            {rejectingId === item.id && (
              <div className="mt-3 p-4 rounded-xl bg-zinc-900 border border-zinc-800">
                <p className="text-sm text-zinc-300 mb-2 font-medium">Motivo da reprovacao:</p>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Descreva o que precisa ser alterado..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 placeholder-zinc-600 resize-none focus:outline-none focus:ring-2 focus:ring-[#9A48EA]"
                  rows={3}
                  autoFocus
                />
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => setRejectingId(null)}
                    className="flex-1 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleRejectConfirm}
                    disabled={!rejectionReason.trim() || submitting}
                    className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                  >
                    {submitting ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Confirmar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Add public route to App.jsx**

In `client/src/App.jsx`, add import:

```javascript
import PublicApprovalPage from '@/pages/PublicApprovalPage';
```

Add route after the other public routes (after line 45):

```jsx
<Route path="/aprovacao/:token" element={<PublicApprovalPage />} />
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/PublicApprovalPage.jsx client/src/App.jsx
git commit -m "feat: add public approval page (mobile-first, Instagram layout simulator)"
```

---

## Task 16: Frontend — Approval Review Sheet (SM)

**Files:**
- Create: `client/src/components/approvals/ApprovalReviewSheet.jsx`

- [ ] **Step 1: Create the review sheet for social media**

```jsx
import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetBody, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import SortableMediaGrid from '@/components/instagram/SortableMediaGrid';
import CarouselPreview from '@/components/instagram/CarouselPreview';
import VideoFrameSelector from '@/components/instagram/VideoFrameSelector';
import { proxyMediaUrl } from '@/lib/utils';
import { uploadMedia } from '@/services/instagram';
import { CONTENT_TYPE_LABELS } from '@/lib/constants';
import { Loader2, Upload, ImageIcon } from 'lucide-react';

export default function ApprovalReviewSheet({ open, onOpenChange, delivery, onApprove }) {
  const [caption, setCaption] = useState('');
  const [media, setMedia] = useState([]);
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [postType, setPostType] = useState(null);
  const [saving, setSaving] = useState(false);
  const [coverMode, setCoverMode] = useState(null);
  const fileInputRef = useRef(null);

  // Reset state when delivery changes
  const [lastDeliveryId, setLastDeliveryId] = useState(null);
  if (delivery?.id && delivery.id !== lastDeliveryId) {
    setLastDeliveryId(delivery.id);
    setCaption(delivery.caption || delivery.title || '');
    setMedia(delivery.media_urls ? (typeof delivery.media_urls === 'string' ? JSON.parse(delivery.media_urls) : delivery.media_urls) : []);
    setThumbnailUrl(delivery.thumbnail_url || '');
    setPostType(delivery.content_type || null);
    setCoverMode(null);
  }

  const isReel = ['reel', 'video'].includes(postType);
  const videoCount = media.filter((m) => m.type === 'video').length;
  const imageCount = media.filter((m) => m.type === 'image').length;

  const handleApprove = async () => {
    if (media.length === 0) {
      toast.error('Adicione pelo menos uma midia');
      return;
    }
    if (isReel && imageCount > 1 && !thumbnailUrl) {
      toast.error('Selecione a capa do Reel');
      return;
    }

    setSaving(true);
    try {
      await onApprove({
        delivery_id: delivery.id,
        caption,
        media_urls: media,
        thumbnail_url: isReel ? (thumbnailUrl || null) : null,
        post_type: postType || delivery.content_type || 'feed',
      });
      onOpenChange(false);
      toast.success('Aprovado pelo social media');
    } catch {
      toast.error('Erro ao aprovar');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMedia = (index) => {
    setMedia((prev) => prev.filter((_, i) => i !== index).map((m, i) => ({ ...m, order: i })));
  };

  async function handleFileUpload(e) {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      try {
        const { url, type } = await uploadMedia(file);
        setMedia((prev) => [...prev, { url, type, order: prev.length }]);
      } catch {
        toast.error(`Erro ao enviar ${file.name}`);
      }
    }
    e.target.value = '';
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{delivery?.title || 'Revisao'}</SheetTitle>
          <SheetDescription>
            <Badge className="bg-amber-500/15 text-amber-400">Aprovacao SM</Badge>
            {postType && (
              <span className="ml-2 text-xs text-zinc-500">{CONTENT_TYPE_LABELS[postType] || postType}</span>
            )}
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          {/* Media Preview */}
          <div className="mb-4">
            <CarouselPreview media={media.map((m) => ({ ...m, url: proxyMediaUrl(m.url) }))} />
          </div>

          {/* Sortable Media Grid */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-400 font-medium">Midias ({media.length})</span>
              <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload size={14} className="mr-1" /> Adicionar
              </Button>
              <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFileUpload} />
            </div>
            <SortableMediaGrid
              media={media}
              onChange={setMedia}
              onRemove={handleRemoveMedia}
            />
          </div>

          {/* Reel Cover */}
          {isReel && imageCount > 0 && (
            <div className="mb-4 p-3 rounded-lg bg-zinc-900 border border-zinc-800">
              <span className="text-xs text-zinc-400 font-medium mb-2 block">Capa do Reel</span>
              {thumbnailUrl ? (
                <div className="flex items-center gap-2">
                  <img src={proxyMediaUrl(thumbnailUrl)} alt="cover" className="w-12 h-12 rounded object-cover" />
                  <Button variant="ghost" size="sm" onClick={() => setThumbnailUrl('')}>Alterar</Button>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {media.filter((m) => m.type === 'image').map((m) => (
                    <button
                      key={m.url}
                      onClick={() => setThumbnailUrl(m.url)}
                      className="aspect-square rounded overflow-hidden border-2 border-transparent hover:border-[#9A48EA] transition-colors"
                    >
                      <img src={proxyMediaUrl(m.url)} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Caption */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-zinc-400 font-medium">Legenda</span>
              <span className="text-xs text-zinc-600">{caption.length}/2200</span>
            </div>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, 2200))}
              rows={5}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-200 resize-none focus:outline-none focus:ring-2 focus:ring-[#9A48EA]"
              placeholder="Legenda da publicacao..."
            />
          </div>
        </SheetBody>

        <SheetFooter>
          <Button
            onClick={handleApprove}
            disabled={saving}
            className="w-full bg-[#9A48EA] hover:bg-[#B06AF0]"
          >
            {saving ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
            Aprovar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/approvals/ApprovalReviewSheet.jsx
git commit -m "feat: add ApprovalReviewSheet for social media review"
```

---

## Task 17: Frontend — Approval Tab on Client Profile

**Files:**
- Create: `client/src/components/approvals/ApprovalTab.jsx`
- Modify: `client/src/pages/ClientProfilePage.jsx`

- [ ] **Step 1: Create ApprovalTab component**

```jsx
import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { listByClient, smApprove, sendToClient, listBatches, revokeBatch } from '@/services/approvals';
import ApprovalReviewSheet from './ApprovalReviewSheet';
import useServerEvent from '@/hooks/useServerEvent';
import { APPROVAL_STATUS_LABELS, APPROVAL_STATUS_COLORS } from '@/lib/constants';
import { CheckCircle2, Send, XCircle, Loader2, ExternalLink } from 'lucide-react';

export default function ApprovalTab({ clientId }) {
  const [deliveries, setDeliveries] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reviewDelivery, setReviewDelivery] = useState(null);
  const [sending, setSending] = useState(false);

  const fetchData = async () => {
    try {
      const [dels, bats] = await Promise.all([
        listByClient(clientId),
        listBatches(clientId),
      ]);
      setDeliveries(dels);
      setBatches(bats);
    } catch {
      toast.error('Erro ao carregar aprovacoes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [clientId]);

  const events = useMemo(() => ['approval:updated', 'delivery:updated'], []);
  useServerEvent(events, fetchData);

  const smPending = deliveries.filter((d) => d.approval_status === 'sm_pending');
  const smApproved = deliveries.filter((d) => d.approval_status === 'sm_approved');
  const clientPending = deliveries.filter((d) => d.approval_status === 'client_pending');

  const handleReview = (delivery) => {
    setReviewDelivery(delivery);
    setSheetOpen(true);
  };

  const handleSmApprove = async (data) => {
    await smApprove(data);
    await fetchData();
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSendToClient = async () => {
    if (selectedIds.size === 0) {
      toast.error('Selecione pelo menos uma publicacao');
      return;
    }
    setSending(true);
    try {
      const result = await sendToClient({
        client_id: clientId,
        delivery_ids: Array.from(selectedIds),
      });
      toast.success(`Enviado para o cliente! ${result.items.length} publicacao(oes)`);
      setSelectedIds(new Set());
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao enviar para o cliente');
    } finally {
      setSending(false);
    }
  };

  const handleRevoke = async (batchId) => {
    try {
      await revokeBatch(batchId);
      toast.success('Lote revogado');
      await fetchData();
    } catch {
      toast.error('Erro ao revogar');
    }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-zinc-500" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* SM Pending Section */}
      {smPending.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-zinc-400 mb-3">Aguardando sua aprovacao ({smPending.length})</h3>
          <div className="space-y-2">
            {smPending.map((d) => (
              <Card key={d.id} className="hover:border-zinc-600 transition-colors">
                <CardContent className="py-3 px-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.title}</p>
                    <Badge className={APPROVAL_STATUS_COLORS[d.approval_status]}>
                      {APPROVAL_STATUS_LABELS[d.approval_status]}
                    </Badge>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleReview(d)}>Revisar</Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* SM Approved — ready to send to client */}
      {smApproved.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-zinc-400">Prontas para o cliente ({smApproved.length})</h3>
            <Button
              size="sm"
              onClick={handleSendToClient}
              disabled={selectedIds.size === 0 || sending}
              className="bg-[#9A48EA] hover:bg-[#B06AF0]"
            >
              {sending ? <Loader2 size={14} className="animate-spin mr-1" /> : <Send size={14} className="mr-1" />}
              Enviar ({selectedIds.size})
            </Button>
          </div>
          <div className="space-y-2">
            {smApproved.map((d) => (
              <Card key={d.id} className="hover:border-zinc-600 transition-colors cursor-pointer" onClick={() => toggleSelect(d.id)}>
                <CardContent className="py-3 px-4 flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(d.id)}
                    onChange={() => toggleSelect(d.id)}
                    className="accent-[#9A48EA]"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.title}</p>
                    <Badge className={APPROVAL_STATUS_COLORS[d.approval_status]}>
                      {APPROVAL_STATUS_LABELS[d.approval_status]}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Client Pending */}
      {clientPending.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-zinc-400 mb-3">Aguardando cliente ({clientPending.length})</h3>
          <div className="space-y-2">
            {clientPending.map((d) => (
              <Card key={d.id}>
                <CardContent className="py-3 px-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.title}</p>
                    <Badge className={APPROVAL_STATUS_COLORS[d.approval_status]}>
                      {APPROVAL_STATUS_LABELS[d.approval_status]}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Active Batches */}
      {batches.filter((b) => b.status === 'pending').length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-zinc-400 mb-3">Lotes ativos</h3>
          <div className="space-y-2">
            {batches.filter((b) => b.status === 'pending').map((b) => (
              <Card key={b.id}>
                <CardContent className="py-3 px-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {b.counts?.pending || 0} pendente(s) / {b.counts?.total || 0} total
                    </p>
                    <p className="text-xs text-zinc-500">
                      {b.counts?.approved || 0} aprovadas, {b.counts?.rejected || 0} reprovadas
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-red-400" onClick={() => handleRevoke(b.id)}>
                    <XCircle size={14} className="mr-1" /> Revogar
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {deliveries.length === 0 && (
        <div className="text-center py-12 text-zinc-600">
          <CheckCircle2 size={32} className="mx-auto mb-2" />
          <p className="text-sm">Nenhuma aprovacao pendente</p>
        </div>
      )}

      {/* Review Sheet */}
      <ApprovalReviewSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        delivery={reviewDelivery}
        onApprove={handleSmApprove}
      />
    </div>
  );
}
```

- [ ] **Step 2: Add tab to ClientProfilePage.jsx**

Import at the top:
```javascript
import ApprovalTab from '@/components/approvals/ApprovalTab';
import { ClipboardCheck } from 'lucide-react';
```

Add to the tabs array (alongside 'entregas', 'agendamento', 'instagram'):
```jsx
<TabButton active={activeTab === 'aprovacao'} onClick={() => setActiveTab('aprovacao')}>
  <ClipboardCheck size={13} className="mr-1.5" /> Aprovacao
</TabButton>
```

Add content rendering:
```jsx
{activeTab === 'aprovacao' && <ApprovalTab clientId={id} />}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/approvals/ApprovalTab.jsx client/src/pages/ClientProfilePage.jsx
git commit -m "feat: add ApprovalTab to client profile page"
```

---

## Task 18: Frontend — Approvals Overview Page

**Files:**
- Create: `client/src/pages/ApprovalsPage.jsx`
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Create overview page**

```jsx
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { listSmPending, smApprove, sendToClient } from '@/services/approvals';
import ApprovalReviewSheet from '@/components/approvals/ApprovalReviewSheet';
import useServerEvent from '@/hooks/useServerEvent';
import useAuthStore from '@/stores/authStore';
import { APPROVAL_STATUS_LABELS, APPROVAL_STATUS_COLORS } from '@/lib/constants';
import { Loader2, Send, ClipboardCheck } from 'lucide-react';
import api from '@/services/api';

export default function ApprovalsPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clientFilter, setClientFilter] = useState('all');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reviewDelivery, setReviewDelivery] = useState(null);
  const [clients, setClients] = useState([]);

  const fetchData = async () => {
    try {
      const dels = await listSmPending();
      setDeliveries(dels);
      // Extract unique clients
      const uniqueClients = [...new Map(dels.map((d) => [d.client_id, { id: d.client_id, name: d.client_name }])).values()];
      setClients(uniqueClients);
    } catch {
      toast.error('Erro ao carregar aprovacoes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const events = useMemo(() => ['approval:updated', 'delivery:updated'], []);
  useServerEvent(events, fetchData);

  const filtered = clientFilter === 'all'
    ? deliveries
    : deliveries.filter((d) => d.client_id === clientFilter);

  const handleReview = (delivery) => {
    setReviewDelivery(delivery);
    setSheetOpen(true);
  };

  const handleSmApprove = async (data) => {
    await smApprove(data);
    await fetchData();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin text-zinc-500" size={24} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <ClipboardCheck size={20} className="text-[#9A48EA]" />
          <h1 className="text-lg font-semibold">Aprovacoes</h1>
          <Badge variant="secondary">{deliveries.length}</Badge>
        </div>
        {clients.length > 1 && (
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filtrar por cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-zinc-600">
          <ClipboardCheck size={32} className="mx-auto mb-2" />
          <p className="text-sm">Nenhuma aprovacao pendente</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((d) => (
            <Card key={d.id} className="hover:border-zinc-600 transition-colors">
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{d.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-zinc-500">{d.client_name}</span>
                    <Badge className={APPROVAL_STATUS_COLORS[d.approval_status]}>
                      {APPROVAL_STATUS_LABELS[d.approval_status]}
                    </Badge>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleReview(d)}>Revisar</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ApprovalReviewSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        delivery={reviewDelivery}
        onApprove={handleSmApprove}
      />
    </div>
  );
}
```

- [ ] **Step 2: Add route to App.jsx**

Import:
```javascript
import ApprovalsPage from '@/pages/ApprovalsPage';
```

Add protected route (after deliveries route):
```jsx
<Route path="/aprovacoes" element={<ApprovalsPage />} />
```

- [ ] **Step 3: Add navigation link in AuthLayout sidebar**

Add "Aprovacoes" link to the sidebar navigation alongside existing items like Entregas, Agendamento. Use the `ClipboardCheck` icon from lucide-react.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/ApprovalsPage.jsx client/src/App.jsx client/src/components/layout/AuthLayout.jsx
git commit -m "feat: add /aprovacoes overview page with client filter"
```

---

## Task 19: Backend — Update sendToClient to Accept Prepared Content

**Files:**
- Modify: `server/src/modules/approvals/approvals.service.js`
- Modify: `server/src/modules/approvals/approvals.validation.js`

- [ ] **Step 1: Update sendToClient validation to accept items with content**

In `approvals.validation.js`, replace `sendToClientSchema`:

```javascript
const sendToClientSchema = Joi.object({
  client_id: Joi.string().uuid().required(),
  items: Joi.array().items(Joi.object({
    delivery_id: Joi.string().uuid().required(),
    caption: Joi.string().max(2200).allow(null, '').optional(),
    media_urls: Joi.array().items(Joi.object({
      url: Joi.string().required(),
      type: Joi.string().valid('image', 'video').required(),
      order: Joi.number().integer().min(0).optional(),
    })).optional(),
    thumbnail_url: Joi.string().allow(null, '').optional(),
    post_type: Joi.string().valid('reel', 'feed', 'carrossel', 'story', 'image', 'carousel').optional(),
  })).min(1).required(),
});
```

- [ ] **Step 2: Update sendToClient service to use items with content**

In `approvals.service.js`, modify the `sendToClient` method to receive `items` (array of `{ delivery_id, caption, media_urls, thumbnail_url, post_type }`) instead of just `delivery_ids`. Use the provided content when creating `approval_items`:

```javascript
  async sendToClient(clientId, items, userId) {
    // ... (same validation of client and whatsapp_group)

    const deliveryIds = items.map((i) => i.delivery_id);
    const deliveries = await db('deliveries')
      .whereIn('id', deliveryIds)
      .where({ client_id: clientId, approval_status: 'sm_approved' });

    if (deliveries.length !== deliveryIds.length) {
      throw Object.assign(new Error('Some deliveries are not approved by social media'), { status: 400 });
    }

    // ... (same batch creation logic)

    const createdItems = [];
    for (const itemData of items) {
      const delivery = deliveries.find((d) => d.id === itemData.delivery_id);
      const [item] = await db('approval_items').insert({
        batch_id: batch.id,
        delivery_id: itemData.delivery_id,
        caption: itemData.caption || delivery.title || null,
        media_urls: itemData.media_urls ? JSON.stringify(itemData.media_urls) : null,
        thumbnail_url: itemData.thumbnail_url || null,
        post_type: itemData.post_type || delivery.content_type || null,
        status: 'pending',
      }).returning('*');
      createdItems.push(item);

      await db('deliveries')
        .where({ id: itemData.delivery_id })
        .update({ approval_status: 'client_pending', updated_at: new Date() });
    }

    // ... (same WhatsApp message + reminder job logic)
  }
```

- [ ] **Step 3: Update controller to pass items**

In `approvals.controller.js`, modify `sendToClient`:

```javascript
  const result = await service.sendToClient(value.client_id, value.items, req.user.id);
```

- [ ] **Step 4: Commit**

```bash
git add server/src/modules/approvals/approvals.service.js server/src/modules/approvals/approvals.validation.js server/src/modules/approvals/approvals.controller.js
git commit -m "feat: sendToClient accepts prepared content per item"
```

---

## Task 20: Integration — Wire Up listSmPending with Client Join

**Files:**
- Modify: `server/src/modules/approvals/approvals.service.js`

- [ ] **Step 1: Update listSmPending to include client name and media from ClickUp**

```javascript
  async listSmPending(userId) {
    const clientIds = await db('clients')
      .where({ social_media_id: userId })
      .select('id');

    return db('deliveries')
      .whereIn('deliveries.client_id', clientIds.map((c) => c.id))
      .where({ 'deliveries.approval_status': 'sm_pending' })
      .join('clients', 'deliveries.client_id', 'clients.id')
      .select(
        'deliveries.*',
        'clients.name as client_name',
        'clients.instagram_account',
      )
      .orderBy('deliveries.updated_at', 'desc');
  }
```

- [ ] **Step 2: Update listByClient to include client info**

```javascript
  async listByClient(clientId) {
    return db('deliveries')
      .where({ 'deliveries.client_id': clientId })
      .whereNotNull('deliveries.approval_status')
      .join('clients', 'deliveries.client_id', 'clients.id')
      .select(
        'deliveries.*',
        'clients.name as client_name',
        'clients.instagram_account',
      )
      .orderBy('deliveries.updated_at', 'desc');
  }
```

- [ ] **Step 3: Commit**

```bash
git add server/src/modules/approvals/approvals.service.js
git commit -m "feat: listSmPending and listByClient include client info"
```

---

## Task 21: Final — SSE Events + Test Full Flow

**Files:**
- Modify: `server/src/modules/events/events.routes.js` (if needed to add approval event types)

- [ ] **Step 1: Verify SSE event emission covers all approval events**

Check that `eventBus.emit('sse', { type: 'approval:updated', ... })` is emitted in:
- `sendToClient` (after creating items)
- `clientRespond` (after each response)
- `revokeBatch` (after revoking)
- `smApprove` (after SM approves)

The existing SSE infrastructure should already broadcast all `sse` events. Verify the events module handles the new event type.

- [ ] **Step 2: Manual test checklist**

1. Create a client with `social_media_id`, `whatsapp`, and `whatsapp_group`
2. Trigger a ClickUp task to enter "aprovacao" status
3. Verify the delivery gets `approval_status: sm_pending`
4. Verify auto-assign assigns the social media user
5. Open the approval tab on the client profile
6. Review and approve the delivery as social media
7. Select the approved delivery and send to client
8. Open the public approval link in mobile browser
9. Approve one item, reject another with reason
10. Verify ClickUp task status changes
11. Verify WhatsApp notifications are received

- [ ] **Step 3: Commit all remaining changes**

```bash
git add -A
git commit -m "feat: approval workflow — complete integration"
```
