const crypto = require('crypto');
const db = require('../../config/db');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const autoAssign = require('./automations/auto-assign');

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
   * Handle task status change — update delivery status + run automations
   */
  async handleStatusChange(clickupTaskId, historyItems, event) {
    const statusItem = historyItems.find((h) => h.field === 'status');
    if (!statusItem) return;

    const rawStatusName = statusItem.after?.status;
    const newStatus = this.mapClickUpStatus(rawStatusName);
    if (!newStatus) return;

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
      await this.autoCreateDelivery(clickupTaskId, event);
    }

    // Run auto-assign automation
    try {
      const result = await autoAssign.run(clickupTaskId, rawStatusName);
      if (result.executed) {
        logger.info(`Automation executed: ${result.action}`);
      } else {
        logger.debug(`Automation skipped: ${result.reason || result.error}`);
      }
    } catch (err) {
      logger.error(`Auto-assign automation error: ${err.message}`);
    }
  }

  /**
   * Handle new task created in ClickUp — auto-create delivery
   */
  async handleTaskCreated(clickupTaskId, event) {
    const existing = await db('deliveries')
      .where({ clickup_task_id: clickupTaskId })
      .first();
    if (existing) return;

    await this.autoCreateDelivery(clickupTaskId, event);
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
   * Handle assignee change
   */
  async handleAssigneeChange(clickupTaskId, historyItems, _event) {
    const delivery = await db('deliveries')
      .where({ clickup_task_id: clickupTaskId })
      .first();
    if (!delivery) return;

    const assigneeItem = historyItems.find((h) => h.field === 'assignee');
    if (!assigneeItem?.after) return;

    // Try to find user by clickup_id
    const clickupUserId = String(assigneeItem.after.id);
    const user = await db('users').where({ clickup_id: clickupUserId }).first();

    if (user) {
      await db('deliveries')
        .where({ id: delivery.id })
        .update({ user_id: user.id, updated_at: new Date() });
      logger.info(`Delivery ${delivery.id} assigned to ${user.name}`);
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
  async autoCreateDelivery(clickupTaskId, event) {
    try {
      // Fetch full task from ClickUp API
      const task = await this.fetchTask(clickupTaskId);
      if (!task) return;

      // Find assignee user
      let userId = null;
      if (task.assignees?.length > 0) {
        const clickupUserId = String(task.assignees[0].id);
        const user = await db('users').where({ clickup_id: clickupUserId }).first();
        userId = user?.id;
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
        logger.warn(`Cannot auto-create delivery for task ${clickupTaskId}: missing user or client mapping`);
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
