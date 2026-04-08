const crypto = require('crypto');
const db = require('../../config/db');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const autoAssign = require('./automations/auto-assign');
const clickupOAuth = require('./clickup-oauth.service');
const eventBus = require('../../utils/event-bus');

const PUBLISHABLE_FORMATS = new Set([
  'reel', 'feed', 'story', 'carrossel',
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
      eventBus.emit('sse', { type: 'delivery:updated', payload: { id: delivery.id, status: newStatus } });
      if (newStatus === 'publicacao') {
        eventBus.emit('sse', { type: 'ranking:updated' });
      }
      logger.info(`Delivery ${delivery.id} status → ${newStatus}`);

      // Set approval_status when entering approval phase (covers first time and returning from correction)
      if (newStatus === 'aprovacao') {
        await db('deliveries')
          .where({ id: delivery.id })
          .update({ approval_status: 'sm_pending', updated_at: new Date() });
        logger.info(`Delivery ${delivery.id} approval_status → sm_pending`);
      }

      // Clear approval_status when task leaves aprovação or correção
      if (newStatus !== 'aprovacao' && newStatus !== 'correcao' && delivery.approval_status) {
        await db('deliveries')
          .where({ id: delivery.id })
          .update({ approval_status: null, updated_at: new Date() });
        logger.info(`Delivery ${delivery.id} approval_status cleared (moved to ${newStatus})`);
      }
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
      const freshDelivery = delivery || await db('deliveries')
        .where({ clickup_task_id: clickupTaskId })
        .first();
      await this.autoCreateScheduledPost(clickupTaskId, freshDelivery, task);
    } else if (newStatus !== 'agendado') {
      // Task moved AWAY from agendamento/agendado — clean up draft/scheduled post
      await this.cleanupScheduledPost(clickupTaskId);
    }
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
   * Handle task update (title, custom fields, attachments)
   */
  async handleTaskUpdated(clickupTaskId, historyItems, _event) {
    const delivery = await db('deliveries')
      .where({ clickup_task_id: clickupTaskId })
      .first();
    if (!delivery) return;

    const updates = {};
    let hasAttachmentChange = false;

    for (const item of historyItems) {
      if (item.field === 'name' && item.after) {
        updates.title = item.after;
      }
      if (item.field === 'content_type' && item.after) {
        updates.content_type = this.mapContentType(item.after);
      }
      if (item.field === 'attachment' || item.field === 'attachments') {
        hasAttachmentChange = true;
      }
    }

    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date();
      await db('deliveries').where({ id: delivery.id }).update(updates);
      eventBus.emit('sse', { type: 'delivery:updated', payload: { id: delivery.id } });
      logger.info(`Delivery ${delivery.id} updated from ClickUp`);
    }

    // If attachments or content_type changed, refresh media in relevant places
    const needsRefresh = hasAttachmentChange || updates.content_type;
    if (needsRefresh) {
      const freshDelivery = updates.content_type
        ? { ...delivery, content_type: updates.content_type }
        : delivery;

      if (delivery.status === 'agendamento') {
        await this.refreshScheduledPostMedia(clickupTaskId, freshDelivery);
      }

      // Refresh pending approval_items when attachments change in aprovação/correção
      if (['aprovacao', 'correcao'].includes(delivery.status)) {
        await this.refreshApprovalItemMedia(clickupTaskId, freshDelivery);
      }
    }
  }

  /**
   * Clean up scheduled post when task moves away from agendamento
   */
  async cleanupScheduledPost(clickupTaskId) {
    try {
      const post = await db('scheduled_posts')
        .where({ clickup_task_id: clickupTaskId })
        .whereIn('status', ['draft', 'scheduled'])
        .first();
      if (!post) return;

      const { cancelScheduledPost } = require('../../queues');
      await cancelScheduledPost(post.id);
      await db('scheduled_posts').where({ id: post.id }).del();
      eventBus.emit('sse', { type: 'post:updated', payload: { clickup_task_id: clickupTaskId } });
      logger.info(`Scheduled post deleted: task ${clickupTaskId} moved out of agendamento`);
    } catch (err) {
      logger.error(`cleanupScheduledPost error: ${err.message}`);
    }
  }

  /**
   * Refresh media_urls on a scheduled post from ClickUp attachments
   */
  async refreshScheduledPostMedia(clickupTaskId, delivery) {
    try {
      const post = await db('scheduled_posts')
        .where({ clickup_task_id: clickupTaskId })
        .whereIn('status', ['draft', 'scheduled'])
        .first();
      if (!post) return;

      const task = await this.fetchTask(clickupTaskId);
      if (!task?.attachments) return;

      const allMedia = task.attachments
        .filter((a) => a.url && (a.mimetype?.startsWith('image/') || a.mimetype?.startsWith('video/')))
        .map((a, i) => ({
          url: a.url,
          type: a.mimetype?.startsWith('video/') ? 'video' : 'image',
          order: i,
        }));

      // Derive correct post_type from delivery (may differ from stale post.post_type)
      const postTypeMap = {
        reel: 'reel', video: 'reel', carrossel: 'carousel', feed: 'image', story: 'story',
      };
      const derivedPostType = delivery?.content_type
        ? (postTypeMap[delivery.content_type] || post.post_type)
        : post.post_type;

      // For Reels/Video: separate cover from media
      let mediaUrls = allMedia;
      let thumbnailUrl = post.thumbnail_url;
      if (['reel', 'video'].includes(derivedPostType)) {
        const videos = allMedia.filter((m) => m.type === 'video');
        const images = allMedia.filter((m) => m.type === 'image');
        if (videos.length > 0 && images.length > 0) {
          thumbnailUrl = images[0].url;
          mediaUrls = videos.map((v, i) => ({ ...v, order: i }));
        } else {
          thumbnailUrl = null;
          mediaUrls = allMedia;
        }
      }

      const updateData = {
        media_urls: JSON.stringify(mediaUrls),
        thumbnail_url: thumbnailUrl,
        updated_at: new Date(),
      };
      // Sync post_type if it drifted from delivery's content_type
      if (derivedPostType !== post.post_type) {
        updateData.post_type = derivedPostType;
        logger.info(`Syncing post_type: ${post.post_type} → ${derivedPostType}`, { clickupTaskId });
      }
      await db('scheduled_posts').where({ id: post.id }).update(updateData);
      eventBus.emit('sse', { type: 'post:updated', payload: { clickup_task_id: clickupTaskId } });
      logger.info(`Scheduled post media refreshed`, { clickupTaskId, mediaCount: mediaUrls.length });
    } catch (err) {
      logger.error(`refreshScheduledPostMedia error: ${err.message}`);
    }
  }

  /**
   * Refresh media_urls on pending approval_items from ClickUp attachments
   */
  async refreshApprovalItemMedia(clickupTaskId, delivery) {
    try {
      const task = await this.fetchTask(clickupTaskId);
      if (!task?.attachments) return;

      const allMedia = task.attachments
        .filter((a) => a.url && (a.mimetype?.startsWith('image/') || a.mimetype?.startsWith('video/')))
        .map((a, i) => ({
          url: a.url,
          type: a.mimetype?.startsWith('video/') ? 'video' : 'image',
          order: i,
        }));

      const postTypeMap = {
        reel: 'reel', video: 'reel', carrossel: 'carousel', feed: 'image', story: 'story',
      };
      const postType = delivery?.content_type
        ? (postTypeMap[delivery.content_type] || 'image')
        : null;

      let mediaUrls = allMedia;
      let thumbnailUrl = null;
      if (['reel', 'video'].includes(postType)) {
        const videos = allMedia.filter((m) => m.type === 'video');
        const images = allMedia.filter((m) => m.type === 'image');
        if (videos.length > 0 && images.length > 0) {
          thumbnailUrl = images[0].url;
          mediaUrls = videos.map((v, i) => ({ ...v, order: i }));
        }
      }

      // Update all pending approval_items for this delivery
      const updated = await db('approval_items')
        .where({ delivery_id: delivery.id, status: 'pending' })
        .update({
          media_urls: JSON.stringify(mediaUrls),
          thumbnail_url: thumbnailUrl,
          post_type: postType,
          updated_at: new Date(),
        });

      if (updated > 0) {
        eventBus.emit('sse', { type: 'approval:updated', payload: { deliveryId: delivery.id, clientId: delivery.client_id } });
        logger.info(`Refreshed ${updated} pending approval_item(s) media`, { clickupTaskId, mediaCount: mediaUrls.length });
      }
    } catch (err) {
      logger.error(`refreshApprovalItemMedia error: ${err.message}`);
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
    const delivery = await db('deliveries')
      .where({ clickup_task_id: clickupTaskId })
      .first();

    if (delivery) {
      await db('deliveries')
        .where({ id: delivery.id })
        .update({ status: 'cancelado', updated_at: new Date() });
      eventBus.emit('sse', { type: 'delivery:deleted', payload: { id: delivery.id } });
      logger.info(`Delivery ${delivery.id} marked as cancelado (ClickUp task deleted)`);
    }
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
      let contentType = null;
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
      eventBus.emit('sse', { type: 'delivery:created' });
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
      if (!delivery) {
        logger.warn(`Cannot auto-create scheduled post: no delivery for task ${clickupTaskId}`);
        return;
      }

      // Filter non-publishable formats (PDF, Mockup, Banner, etc.) — null content_type is allowed (user selects in app)
      if (delivery.content_type && !PUBLISHABLE_FORMATS.has(delivery.content_type)) {
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

      // Extract scheduling date: prefer ClickUp due_date, fallback to "entrega" custom field
      let scheduledAt = null;
      if (taskWithAttachments.due_date) {
        scheduledAt = new Date(Number(taskWithAttachments.due_date));
      } else {
        const entregaField = taskWithAttachments.custom_fields?.find(
          (cf) => cf.name?.toLowerCase() === 'entrega'
        );
        if (entregaField?.value) scheduledAt = new Date(Number(entregaField.value));
      }

      // Extract "Legenda" custom field for caption (fallback to task name)
      const legendaField = taskWithAttachments.custom_fields?.find(
        (cf) => cf.name?.toLowerCase() === 'legenda'
      );
      const caption = legendaField?.value?.trim() || taskWithAttachments.name || '';

      // Extract media URLs from attachments
      const attachments = taskWithAttachments.attachments || [];
      const allMedia = attachments
        .filter((a) => a.url && (a.mimetype?.startsWith('image/') || a.mimetype?.startsWith('video/')))
        .map((a, i) => ({
          url: a.url,
          type: a.mimetype?.startsWith('video/') ? 'video' : 'image',
          order: i,
        }));

      // Map delivery content_type to post_type
      const postTypeMap = {
        reel: 'reel',
        video: 'reel', // Instagram videos are published as reels
        carrossel: 'carousel',
        feed: 'image', // feed can be image or video — effectivePostType in publish handles mismatch
        story: 'story',
      };
      const postType = delivery.content_type ? (postTypeMap[delivery.content_type] || 'image') : null;

      // For Reels/Video: if there's a video + image, use the image as cover and only the video as media
      let mediaUrls = allMedia;
      let thumbnailUrl = null;
      if (['reel', 'video'].includes(postType)) {
        const videos = allMedia.filter((m) => m.type === 'video');
        const images = allMedia.filter((m) => m.type === 'image');
        if (videos.length > 0 && images.length > 0) {
          thumbnailUrl = images[0].url;
          mediaUrls = videos.map((v, i) => ({ ...v, order: i }));
          logger.info(`Reel auto-cover detected: using first image as cover`, { clickupTaskId });
        }
      }

      // Always create as draft — user must review and schedule manually
      const postStatus = 'draft';

      // Check if a scheduled_post already exists for this task
      const existing = await db('scheduled_posts')
        .where({ clickup_task_id: clickupTaskId })
        .first();

      if (existing) {
        // Reset published/failed posts back to draft when task returns to agendamento
        const updates = {
          caption,
          post_type: postType,
          media_urls: JSON.stringify(mediaUrls),
          thumbnail_url: thumbnailUrl,
          status: postStatus,
          scheduled_at: scheduledAt || null,
          error_message: null,
          retry_count: 0,
          ig_container_id: existing.status === 'published' ? null : existing.ig_container_id,
          ig_media_id: existing.status === 'published' ? null : existing.ig_media_id,
          ig_permalink: existing.status === 'published' ? null : existing.ig_permalink,
          published_at: existing.status === 'published' ? null : existing.published_at,
          updated_at: new Date(),
        };
        await db('scheduled_posts').where({ id: existing.id }).update(updates);
        logger.info(`Reset scheduled post for task ${clickupTaskId} to draft (${postType}, ${mediaUrls.length} media)`);

        // Cancel any existing BullMQ job
        const { cancelScheduledPost } = require('../../queues');
        await cancelScheduledPost(existing.id);

        eventBus.emit('sse', { type: 'post:updated', payload: { clickup_task_id: clickupTaskId } });
        return;
      }

      const [post] = await db('scheduled_posts').insert({
        client_id: delivery.client_id,
        delivery_id: delivery.id,
        clickup_task_id: clickupTaskId,
        caption,
        post_type: postType,
        media_urls: JSON.stringify(mediaUrls),
        thumbnail_url: thumbnailUrl,
        status: postStatus,
        scheduled_at: scheduledAt || null,
      }).returning('*');

      logger.info(`Auto-created Instagram draft for task ${clickupTaskId} (${postType}, ${mediaUrls.length} media, scheduled_at: ${scheduledAt || 'none'})`);
      eventBus.emit('sse', { type: 'post:updated', payload: { clickup_task_id: clickupTaskId } });
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
      const token = await clickupOAuth.getDecryptedToken();
      const res = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
        headers: { Authorization: token },
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
      'correção': 'correcao',
      'correcao': 'correcao',
      'agendamento': 'agendamento',
      'agendado': 'agendado',
      'publicação': 'publicacao',
      'publicacao': 'publicacao',
    };
    return map[normalized] || null;
  }

  /**
   * Map ClickUp Formato option name to our content_type key
   */
  mapContentType(formatName) {
    if (!formatName) return null;
    const normalized = formatName.toLowerCase().trim();
    const map = {
      'reel': 'reel',
      'feed': 'feed',
      'story': 'story',
      'banner': 'banner',
      'caixinha': 'caixinha',
      'carrossel': 'carrossel',
      'análise': 'analise',
      'analise': 'analise',
      'pdf': 'pdf',
      'vídeo': 'video',
      'video': 'video',
      'mockup': 'mockup',
      'apresentação': 'apresentacao',
      'apresentacao': 'apresentacao',
    };
    return map[normalized] || 'feed';
  }

  /**
   * Bulk sync all deliveries with current ClickUp task status.
   * One-time use to backfill deliveries created before webhooks were active.
   */
  async syncAllDeliveries() {
    const deliveries = await db('deliveries')
      .whereNotNull('clickup_task_id')
      .select('id', 'clickup_task_id', 'status', 'content_type', 'title', 'client_id');

    let updated = 0;
    let errors = 0;
    let postsCreated = 0;

    for (const delivery of deliveries) {
      try {
        const task = await this.fetchTask(delivery.clickup_task_id);
        if (!task) { errors++; continue; }

        const newStatus = this.mapClickUpStatus(task.status?.status);
        const updates = {};

        if (newStatus && newStatus !== delivery.status) {
          updates.status = newStatus;
          if (newStatus === 'publicacao') updates.completed_at = new Date();
        }

        if (task.name && task.name !== delivery.title) {
          updates.title = task.name;
        }

        // Sync content_type from Formato field
        const formatoField = task.custom_fields?.find((cf) => cf.name === 'Formato');
        if (formatoField?.value != null && formatoField.type_config?.options) {
          const option = formatoField.type_config.options[formatoField.value];
          if (option) {
            const mapped = this.mapContentType(option.name);
            if (mapped !== delivery.content_type) updates.content_type = mapped;
          }
        }

        if (Object.keys(updates).length > 0) {
          updates.updated_at = new Date();
          await db('deliveries').where({ id: delivery.id }).update(updates);
          updated++;
        }

        // Safety net: create or refresh scheduled post for deliveries in "agendamento"
        const effectiveStatus = newStatus || delivery.status;
        if (effectiveStatus === 'agendamento') {
          const existingPost = await db('scheduled_posts')
            .where({ clickup_task_id: delivery.clickup_task_id })
            .first();
          if (!existingPost) {
            const freshDelivery = updates.content_type
              ? { ...delivery, content_type: updates.content_type }
              : delivery;
            await this.autoCreateScheduledPost(delivery.clickup_task_id, freshDelivery, task);
            postsCreated++;
          } else if (existingPost.status === 'draft' || existingPost.status === 'scheduled') {
            // Refresh media if post has empty media (missed on initial creation)
            const mediaUrls = typeof existingPost.media_urls === 'string'
              ? JSON.parse(existingPost.media_urls) : (existingPost.media_urls || []);
            if (mediaUrls.length === 0) {
              const freshDelivery = updates.content_type
                ? { ...delivery, content_type: updates.content_type }
                : delivery;
              await this.refreshScheduledPostMedia(delivery.clickup_task_id, freshDelivery);
            }
          }
        }

        // Rate limit: 600ms between requests (ClickUp allows 100 req/min)
        await new Promise((r) => setTimeout(r, 600));
      } catch (err) {
        logger.error(`syncAllDeliveries error for delivery ${delivery.id}: ${err.message}`);
        errors++;
      }
    }

    logger.info('syncAllDeliveries complete', { total: deliveries.length, updated, errors, postsCreated });
    return { total: deliveries.length, updated, errors, postsCreated };
  }

  /**
   * Register webhook with ClickUp API
   */
  async registerWebhook(endpointUrl) {
    const teamId = '9011736576'; // Wander Fran workspace
    const token = await clickupOAuth.getDecryptedToken();

    // First check existing webhooks
    const existingRes = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/webhook`, {
      headers: { Authorization: token },
    });
    const existing = await existingRes.json();

    // Delete old webhooks pointing to our endpoint
    for (const wh of existing.webhooks || []) {
      if (wh.endpoint === endpointUrl) {
        await fetch(`https://api.clickup.com/api/v2/webhook/${wh.id}`, {
          method: 'DELETE',
          headers: { Authorization: token },
        });
        logger.info(`Deleted old webhook ${wh.id}`);
      }
    }

    // Register new webhook for all events
    const res = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/webhook`, {
      method: 'POST',
      headers: {
        Authorization: token,
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
    const token = await clickupOAuth.getDecryptedToken();
    const res = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/webhook`, {
      headers: { Authorization: token },
    });
    return res.json();
  }
}

module.exports = new ClickUpWebhookService();
