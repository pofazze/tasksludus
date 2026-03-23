const crypto = require('crypto');
const db = require('../../config/db');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const autoAssign = require('./automations/auto-assign');

const PUBLISHABLE_FORMATS = new Set([
  'reel', 'feed', 'story', 'carrossel', 'video',
  'foto_com_frase', 'video_com_frase',
]);

class ClickUpWebhookService {
  /**
   * Verify webhook signature from ClickUp
   */
  verifySignature(rawBody, signature) {
    if (!env.clickup.webhookSecret) {
      logger.warn('CLICKUP_WEBHOOK_SECRET not configured — skipping verification');
      return true;
    }
    const hmac = crypto
      .createHmac('sha256', env.clickup.webhookSecret)
      .update(rawBody)
      .digest('hex');
    return hmac === signature;
  }

  /**
   * Log webhook event to DB
   */
  async logEvent(eventType, webhookId, payload, status = 'received') {
    const [event] = await db('webhook_events')
      .insert({
        source: 'clickup',
        event_type: eventType,
        webhook_id: webhookId,
        payload: JSON.stringify(payload),
        status,
      })
      .returning('*');
    return event;
  }

  /**
   * Mark event as processed
   */
  async markProcessed(eventId, error = null) {
    await db('webhook_events')
      .where({ id: eventId })
      .update({
        status: error ? 'failed' : 'processed',
        error: error || null,
        processed_at: new Date(),
      });
  }

  /**
   * Process incoming webhook event
   */
  async processEvent(event) {
    const eventType = event.event;
    const taskId = event.task_id;
    const historyItems = event.history_items || [];

    logger.info(`ClickUp webhook: ${eventType} for task ${taskId}`);

    const dbEvent = await this.logEvent(eventType, event.webhook_id, event);

    try {
      switch (eventType) {
        case 'taskStatusUpdated':
          await this.handleStatusChange(taskId, historyItems, event);
          break;
        case 'taskCreated':
          await this.handleTaskCreated(taskId, event);
          break;
        case 'taskUpdated':
          await this.handleTaskUpdated(taskId, historyItems, event);
          break;
        case 'taskAssigneeUpdated':
          await this.handleAssigneeChange(taskId, historyItems, event);
          break;
        case 'taskDeleted':
          await this.handleTaskDeleted(taskId, event);
          break;
        default:
          logger.info(`Unhandled ClickUp event: ${eventType}`);
      }

      await this.markProcessed(dbEvent.id);
    } catch (err) {
      logger.error(`Error processing ClickUp event ${eventType}: ${err.message}`);
      await this.markProcessed(dbEvent.id, err.message);
    }
  }

  /**
   * Handle task status change — update delivery status + track phase + run automations
   */
  async handleStatusChange(clickupTaskId, historyItems, event) {
    const statusItem = historyItems.find((h) => h.field === 'status');
    if (!statusItem) return;

    const rawStatusName = statusItem.after?.status;
    const newStatus = this.mapClickUpStatus(rawStatusName);
    if (!newStatus) return;

    // Fetch task once, reuse for everything
    const task = await this.fetchTask(clickupTaskId);

    const delivery = await db('deliveries')
      .where({ clickup_task_id: clickupTaskId })
      .first();

    if (delivery) {
      const updates = { status: newStatus, updated_at: new Date() };
      if (newStatus === 'publicacao') {
        updates.completed_at = new Date();
      }
      await db('deliveries')
        .where({ id: delivery.id })
        .update(updates);
      logger.info(`Delivery ${delivery.id} status → ${newStatus}`);
    } else {
      logger.info(`No delivery found for ClickUp task ${clickupTaskId} — will auto-create`);
      await this.autoCreateDelivery(clickupTaskId, event, task);
    }

    // Track phase transition
    await this.trackPhaseTransition(clickupTaskId, newStatus, task);

    // Run auto-assign (pass pre-fetched task to avoid extra API call)
    try {
      const result = await autoAssign.run(clickupTaskId, rawStatusName, task);
      if (result.executed) {
        logger.info(`auto-assign: SUCCESS — ${result.action}`);
      } else {
        logger.info(`auto-assign: skipped — ${result.reason || result.error}`);
      }
    } catch (err) {
      logger.error(`auto-assign: ERROR — ${err.message}`);
    }

    // Auto-create Instagram draft when task moves to "agendamento"
    if (newStatus === 'agendamento') {
      await this.autoCreateScheduledPost(clickupTaskId, delivery, task);
    }

    // "publicação" is now set BY TasksLudus after publishing — ignore webhook to prevent loop
    // (no auto-publish trigger here)
  }

  /**
   * Handle new task created in ClickUp — auto-assign + track phase + auto-create delivery
   */
  async handleTaskCreated(clickupTaskId, event) {
    const existing = await db('deliveries')
      .where({ clickup_task_id: clickupTaskId })
      .first();
    if (existing) return;

    // Fetch task once, reuse for everything
    const task = await this.fetchTask(clickupTaskId);
    if (!task) return;

    // Auto-assign first so the task gets an assignee before we create the delivery
    try {
      const statusName = task.status?.status;
      const result = await autoAssign.run(clickupTaskId, statusName, task);
      if (result.executed) {
        logger.info(`auto-assign (taskCreated): SUCCESS — ${result.action}`);
      } else {
        logger.info(`auto-assign (taskCreated): skipped — ${result.reason || result.error}`);
      }
    } catch (err) {
      logger.error(`auto-assign (taskCreated): ERROR — ${err.message}`);
    }

    await this.autoCreateDelivery(clickupTaskId, event, task);

    // Track initial phase
    const initialPhase = this.mapClickUpStatus(task.status?.status) || 'planejamento';
    const assigneeId = task.assignees?.[0]?.id ? String(task.assignees[0].id) : null;
    await this.openPhase(clickupTaskId, initialPhase, assigneeId);
  }

  /**
   * Handle task update (title, custom fields, etc.)
   */
  async handleTaskUpdated(clickupTaskId, historyItems, _event) {
    const delivery = await db('deliveries')
      .where({ clickup_task_id: clickupTaskId })
      .first();
    if (!delivery) return;

    const updates = {};
    for (const item of historyItems) {
      if (item.field === 'name' && item.after) {
        updates.title = item.after;
      }
      if (item.field === 'content_type' && item.after) {
        updates.content_type = this.mapContentType(item.after);
      }
    }

    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date();
      await db('deliveries').where({ id: delivery.id }).update(updates);
      logger.info(`Delivery ${delivery.id} updated from ClickUp`);
    }
  }

  /**
   * Handle assignee change — update delivery + update current phase tracking
   */
  async handleAssigneeChange(clickupTaskId, historyItems, _event) {
    const delivery = await db('deliveries')
      .where({ clickup_task_id: clickupTaskId })
      .first();

    const assigneeItem = historyItems.find((h) => h.field === 'assignee');
    if (!assigneeItem?.after) return;

    const clickupUserId = String(assigneeItem.after.id);
    const user = await db('users').where({ clickup_id: clickupUserId }).first();

    // Don't update delivery.user_id — it should stay with the original
    // creator/owner. The auto-assign changes ClickUp assignees per phase,
    // but the delivery "belongs" to whoever first created the content.
    if (delivery && user) {
      logger.info(`Delivery ${delivery.id}: ClickUp assignee → ${user.name} (user_id unchanged)`);
    }

    // Update current open phase with new assignee
    const currentPhase = await db('delivery_phases')
      .where({ clickup_task_id: clickupTaskId })
      .whereNull('exited_at')
      .first();

    if (currentPhase) {
      await db('delivery_phases')
        .where({ id: currentPhase.id })
        .update({
          assignee_clickup_id: clickupUserId,
          user_id: user?.id || null,
          updated_at: new Date(),
        });
      logger.info(`Phase ${currentPhase.phase}: assignee → ${clickupUserId}`);
    }
  }

  /**
   * Handle task deletion
   */
  async handleTaskDeleted(clickupTaskId, _event) {
    // Don't delete, just log. Deliveries are important records.
    logger.info(`ClickUp task ${clickupTaskId} deleted — delivery preserved`);
  }

  /**
   * Auto-create a delivery from a ClickUp task
   */
  async autoCreateDelivery(clickupTaskId, event, existingTask) {
    try {
      // Use pre-fetched task or fetch from ClickUp API
      const task = existingTask || await this.fetchTask(clickupTaskId);
      if (!task) return;

      // Find assignee user
      let userId = null;
      if (task.assignees?.length > 0) {
        const clickupUserId = String(task.assignees[0].id);
        const user = await db('users').where({ clickup_id: clickupUserId }).first();
        userId = user?.id;
      }

      // Fallback: if no assignee but task is in Dr. Wander Fran list, use phase mapping
      if (!userId && task.list?.id === autoAssign.DR_WANDER_LIST_ID) {
        const statusName = task.status?.status?.toLowerCase().trim();
        const mappedClickupId = autoAssign.PHASE_ASSIGNEE_MAP[statusName];
        if (mappedClickupId) {
          const user = await db('users').where({ clickup_id: mappedClickupId }).first();
          userId = user?.id;
          if (userId) {
            logger.info(`autoCreateDelivery: used phase mapping for assignee (${statusName} → ${mappedClickupId})`);
          }
        }
      }

      // Find client from list name
      let clientId = null;
      if (task.list?.name) {
        const client = await db('clients')
          .whereRaw('LOWER(name) = ?', [task.list.name.toLowerCase()])
          .first();
        clientId = client?.id;
      }

      if (!userId || !clientId) {
        logger.warn(`Cannot auto-create delivery for task ${clickupTaskId}: missing ${!userId ? 'user' : ''} ${!clientId ? 'client' : ''} mapping`);
        return;
      }

      // Extract content_type from Formato custom field
      let contentType = 'video';
      const formatoField = task.custom_fields?.find((cf) => cf.name === 'Formato');
      if (formatoField?.value != null && formatoField.type_config?.options) {
        const option = formatoField.type_config.options[formatoField.value];
        if (option) {
          contentType = this.mapContentType(option.name);
        }
      }

      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

      await db('deliveries').insert({
        clickup_task_id: clickupTaskId,
        title: task.name,
        user_id: userId,
        client_id: clientId,
        content_type: contentType,
        status: this.mapClickUpStatus(task.status?.status) || 'planejamento',
        month,
      });

      logger.info(`Auto-created delivery for ClickUp task ${clickupTaskId}: "${task.name}"`);
    } catch (err) {
      logger.error(`Failed to auto-create delivery for ${clickupTaskId}: ${err.message}`);
    }
  }

  // ─── Instagram Auto-Draft ────────────────────────────────────

  /**
   * Auto-create a scheduled_post when a task moves to "agendamento".
   * Filters non-publishable formats and extracts the "entrega" date for scheduling.
   */
  async autoCreateScheduledPost(clickupTaskId, delivery, task) {
    try {
      // Check if a scheduled_post already exists for this task
      const existing = await db('scheduled_posts')
        .where({ clickup_task_id: clickupTaskId })
        .first();
      if (existing) {
        logger.info(`Scheduled post already exists for task ${clickupTaskId}`);
        return;
      }

      if (!delivery) {
        logger.warn(`Cannot auto-create scheduled post: no delivery for task ${clickupTaskId}`);
        return;
      }

      // Filter non-publishable formats (PDF, Mockup, Banner, etc.)
      if (!PUBLISHABLE_FORMATS.has(delivery.content_type)) {
        logger.info(`Skipping auto-draft: format "${delivery.content_type}" not publishable`);
        return;
      }

      // Check client has Instagram connected
      const igToken = await db('client_instagram_tokens')
        .where({ client_id: delivery.client_id, is_active: true })
        .first();
      if (!igToken) {
        logger.info(`Client ${delivery.client_id} has no Instagram connected — skipping auto-draft`);
        return;
      }

      // Fetch task with attachments
      const taskWithAttachments = task || await this.fetchTask(clickupTaskId);
      if (!taskWithAttachments) return;

      // Extract "entrega" custom field (date/time) for scheduling
      const entregaField = taskWithAttachments.custom_fields?.find(
        (cf) => cf.name?.toLowerCase() === 'entrega'
      );
      const scheduledAt = entregaField?.value ? new Date(Number(entregaField.value)) : null;

      // Extract media URLs from attachments
      const attachments = taskWithAttachments.attachments || [];
      const mediaUrls = attachments
        .filter((a) => a.url && (a.mimetype?.startsWith('image/') || a.mimetype?.startsWith('video/')))
        .map((a, i) => ({
          url: a.url,
          type: a.mimetype?.startsWith('video/') ? 'video' : 'image',
          order: i,
        }));

      // Map delivery content_type to post_type
      const postTypeMap = {
        reel: 'reel',
        carrossel: 'carousel',
        feed: 'image',
        story: 'story',
        video: 'video',
        foto_com_frase: 'image',
        video_com_frase: 'video',
      };
      const postType = postTypeMap[delivery.content_type] || 'image';

      // Determine status: scheduled (future date) or draft (no date / past date)
      const isFutureDate = scheduledAt && scheduledAt > new Date();
      const postStatus = isFutureDate ? 'scheduled' : 'draft';

      const [post] = await db('scheduled_posts').insert({
        client_id: delivery.client_id,
        delivery_id: delivery.id,
        clickup_task_id: clickupTaskId,
        caption: taskWithAttachments.name || '',
        post_type: postType,
        media_urls: JSON.stringify(mediaUrls),
        status: postStatus,
        scheduled_at: isFutureDate ? scheduledAt : null,
      }).returning('*');

      // If scheduled, enqueue in BullMQ for automatic publish at the right time
      if (isFutureDate) {
        const { schedulePost } = require('../../queues');
        await schedulePost(post.id, scheduledAt);
        logger.info(`Auto-scheduled Instagram post for task ${clickupTaskId} at ${scheduledAt.toISOString()} (${postType}, ${mediaUrls.length} media)`);
      } else {
        logger.info(`Auto-created Instagram draft for task ${clickupTaskId} (${postType}, ${mediaUrls.length} media, no entrega date)`);
      }
    } catch (err) {
      logger.error(`Failed to auto-create scheduled post for ${clickupTaskId}: ${err.message}`);
    }
  }

  // ─── Phase Tracking ───────────────────────────────────────────

  /**
   * Close current open phase and open a new one
   */
  async trackPhaseTransition(clickupTaskId, newPhase, task) {
    try {
      const now = new Date();

      // Close current open phase
      const currentPhase = await db('delivery_phases')
        .where({ clickup_task_id: clickupTaskId })
        .whereNull('exited_at')
        .first();

      if (currentPhase) {
        const enteredAt = new Date(currentPhase.entered_at);
        const durationSeconds = Math.round((now - enteredAt) / 1000);
        await db('delivery_phases')
          .where({ id: currentPhase.id })
          .update({ exited_at: now, duration_seconds: durationSeconds, updated_at: now });
        logger.info(`Phase closed: ${currentPhase.phase} (${durationSeconds}s)`);
      }

      // Open new phase
      const assigneeId = task?.assignees?.[0]?.id ? String(task.assignees[0].id) : null;
      await this.openPhase(clickupTaskId, newPhase, assigneeId);
    } catch (err) {
      logger.error(`Phase tracking error: ${err.message}`);
    }
  }

  /**
   * Open a new phase record
   */
  async openPhase(clickupTaskId, phase, assigneeClickupId) {
    try {
      // Find delivery_id if it exists
      const delivery = await db('deliveries')
        .where({ clickup_task_id: clickupTaskId })
        .first();

      // Find user_id from clickup_id
      let userId = null;
      if (assigneeClickupId) {
        const user = await db('users').where({ clickup_id: assigneeClickupId }).first();
        userId = user?.id || null;
      }

      await db('delivery_phases').insert({
        delivery_id: delivery?.id || null,
        clickup_task_id: clickupTaskId,
        phase,
        assignee_clickup_id: assigneeClickupId,
        user_id: userId,
        entered_at: new Date(),
      });

      logger.info(`Phase opened: ${phase} (assignee: ${assigneeClickupId || 'none'})`);
    } catch (err) {
      logger.error(`Open phase error: ${err.message}`);
    }
  }

  /**
   * Get all distinct assignees who worked on a task
   */
  async getAllTaskAssignees(clickupTaskId) {
    const phases = await db('delivery_phases')
      .where({ clickup_task_id: clickupTaskId })
      .whereNotNull('assignee_clickup_id')
      .distinct('assignee_clickup_id');
    return phases.map((p) => p.assignee_clickup_id);
  }

  // ─── ClickUp API ────────────────────────────────────────────

  /**
   * Fetch task details from ClickUp API
   */
  async fetchTask(taskId) {
    try {
      const res = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
        headers: { Authorization: env.clickup.apiToken },
      });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  }

  /**
   * Map ClickUp status name to our pipeline status
   */
  mapClickUpStatus(statusName) {
    if (!statusName) return null;
    const normalized = statusName.toLowerCase().trim();
    const map = {
      'triagem': 'triagem',
      'planejamento': 'planejamento',
      'captação': 'captacao',
      'captacao': 'captacao',
      'edição de vídeo': 'edicao_de_video',
      'edicao de video': 'edicao_de_video',
      'estruturação': 'estruturacao',
      'estruturacao': 'estruturacao',
      'design': 'design',
      'aprovação': 'aprovacao',
      'aprovacao': 'aprovacao',
      'agendamento': 'agendamento',
      'publicação': 'publicacao',
      'publicacao': 'publicacao',
    };
    return map[normalized] || null;
  }

  /**
   * Map ClickUp Formato option name to our content_type key
   */
  mapContentType(formatName) {
    if (!formatName) return 'video';
    const normalized = formatName.toLowerCase().trim();
    const map = {
      'reel': 'reel',
      'feed': 'feed',
      'story': 'story',
      'cortes': 'cortes',
      'banner': 'banner',
      'caixinha': 'caixinha',
      'carrossel': 'carrossel',
      'corte': 'corte',
      'foto com frase': 'foto_com_frase',
      'análise': 'analise',
      'analise': 'analise',
      'video com frase': 'video_com_frase',
      'vídeo com frase': 'video_com_frase',
      'pdf': 'pdf',
      'vídeo': 'video',
      'video': 'video',
      'mockup': 'mockup',
      'apresentação': 'apresentacao',
      'apresentacao': 'apresentacao',
    };
    return map[normalized] || 'video';
  }

  /**
   * Register webhook with ClickUp API
   */
  async registerWebhook(endpointUrl) {
    const teamId = '9011736576'; // Wander Fran workspace

    // First check existing webhooks
    const existingRes = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/webhook`, {
      headers: { Authorization: env.clickup.apiToken },
    });
    const existing = await existingRes.json();

    // Delete old webhooks pointing to our endpoint
    for (const wh of existing.webhooks || []) {
      if (wh.endpoint === endpointUrl) {
        await fetch(`https://api.clickup.com/api/v2/webhook/${wh.id}`, {
          method: 'DELETE',
          headers: { Authorization: env.clickup.apiToken },
        });
        logger.info(`Deleted old webhook ${wh.id}`);
      }
    }

    // Register new webhook for all events
    const res = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/webhook`, {
      method: 'POST',
      headers: {
        Authorization: env.clickup.apiToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        endpoint: endpointUrl,
        events: [
          'taskCreated',
          'taskUpdated',
          'taskDeleted',
          'taskStatusUpdated',
          'taskAssigneeUpdated',
          'taskDueDateUpdated',
          'taskTagUpdated',
          'taskMoved',
          'taskCommentPosted',
          'taskTimeTrackedUpdated',
        ],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.err || 'Failed to register webhook');
    }

    // Save secret for verification
    if (data.webhook?.secret) {
      logger.info(`Webhook registered. Secret: ${data.webhook.secret}`);
      logger.info('Set CLICKUP_WEBHOOK_SECRET in .env to this value for signature verification.');
    }

    return data;
  }

  /**
   * List registered webhooks
   */
  async listWebhooks() {
    const teamId = '9011736576';
    const res = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/webhook`, {
      headers: { Authorization: env.clickup.apiToken },
    });
    return res.json();
  }
}

module.exports = new ClickUpWebhookService();
