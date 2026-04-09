const db = require('../../config/db');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const eventBus = require('../../utils/event-bus');
const clickupOAuth = require('../webhooks/clickup-oauth.service');
const evolutionService = require('../evolution/evolution.service');

class ApprovalsService {
  // ─── SM Pending List ──────────────────────────────────────────

  /**
   * Get deliveries with approval_status 'sm_pending' for clients
   * where social_media_id = userId
   */
  async listSmPending(userId, role) {
    const query = db('deliveries')
      .join('clients', 'deliveries.client_id', 'clients.id')
      .leftJoin('scheduled_posts', 'scheduled_posts.delivery_id', 'deliveries.id')
      .leftJoin(
        db.raw(`LATERAL (SELECT * FROM approval_items ai WHERE ai.delivery_id = deliveries.id ORDER BY ai.created_at DESC LIMIT 1) AS approval_items ON true`)
      )
      .select(
        'deliveries.*',
        'clients.name as client_name',
        'clients.instagram_account',
        db.raw('COALESCE(scheduled_posts.media_urls, approval_items.media_urls) as media_urls'),
        db.raw('COALESCE(scheduled_posts.caption, approval_items.caption) as caption'),
        db.raw('COALESCE(scheduled_posts.thumbnail_url, approval_items.thumbnail_url) as thumbnail_url'),
        db.raw('COALESCE(scheduled_posts.post_type, approval_items.post_type) as post_type')
      )
      .where('deliveries.approval_status', 'sm_pending')
      .orderBy('deliveries.created_at', 'desc');

    if (!['ceo', 'dev', 'admin'].includes(role)) {
      query.where('clients.social_media_id', userId);
    }
    return query;
  }

  // ─── List By Client ───────────────────────────────────────────

  /**
   * Get all deliveries with non-null approval_status for a client
   */
  async listByClient(clientId) {
    return db('deliveries')
      .join('clients', 'deliveries.client_id', 'clients.id')
      .leftJoin('scheduled_posts', 'scheduled_posts.delivery_id', 'deliveries.id')
      .leftJoin(
        db.raw(`LATERAL (SELECT * FROM approval_items ai WHERE ai.delivery_id = deliveries.id ORDER BY ai.created_at DESC LIMIT 1) AS approval_items ON true`)
      )
      .select(
        'deliveries.*',
        'clients.name as client_name',
        'clients.instagram_account',
        db.raw('COALESCE(scheduled_posts.media_urls, approval_items.media_urls) as media_urls'),
        db.raw('COALESCE(scheduled_posts.caption, approval_items.caption) as caption'),
        db.raw('COALESCE(scheduled_posts.thumbnail_url, approval_items.thumbnail_url) as thumbnail_url'),
        db.raw('COALESCE(scheduled_posts.post_type, approval_items.post_type) as post_type')
      )
      .where('deliveries.client_id', clientId)
      .whereNotNull('deliveries.approval_status')
      .orderBy('deliveries.created_at', 'desc');
  }

  // ─── Rejected (Correção) ───────────────────────────────────────

  /**
   * Get rejected deliveries for a client, including rejection reason and media
   */
  async listRejected(clientId) {
    return db('deliveries')
      .join('clients', 'deliveries.client_id', 'clients.id')
      .join(
        db.raw(`LATERAL (SELECT * FROM approval_items ai WHERE ai.delivery_id = deliveries.id AND ai.status = 'rejected' ORDER BY ai.created_at DESC LIMIT 1) AS approval_items ON true`)
      )
      .leftJoin('scheduled_posts', 'scheduled_posts.delivery_id', 'deliveries.id')
      .select(
        'deliveries.*',
        'clients.name as client_name',
        'clients.instagram_account',
        'approval_items.rejection_reason',
        'approval_items.responded_at',
        db.raw('COALESCE(scheduled_posts.media_urls, approval_items.media_urls) as media_urls'),
        db.raw('COALESCE(scheduled_posts.caption, approval_items.caption) as caption'),
        db.raw('COALESCE(scheduled_posts.thumbnail_url, approval_items.thumbnail_url) as thumbnail_url'),
        db.raw('COALESCE(scheduled_posts.post_type, approval_items.post_type) as post_type')
      )
      .where('deliveries.client_id', clientId)
      .where('deliveries.approval_status', 'client_rejected')
      .orderBy('approval_items.responded_at', 'desc');
  }

  // ─── SM Rejected (Correção) ────────────────────────────────────

  /**
   * Get rejected deliveries for clients where social_media_id = userId
   */
  async listSmRejected(userId, role) {
    const query = db('deliveries')
      .join('clients', 'deliveries.client_id', 'clients.id')
      .join(
        db.raw(`LATERAL (SELECT * FROM approval_items ai WHERE ai.delivery_id = deliveries.id AND ai.status = 'rejected' ORDER BY ai.created_at DESC LIMIT 1) AS approval_items ON true`)
      )
      .leftJoin('scheduled_posts', 'scheduled_posts.delivery_id', 'deliveries.id')
      .select(
        'deliveries.*',
        'clients.name as client_name',
        'clients.instagram_account',
        'approval_items.rejection_reason',
        'approval_items.responded_at',
        db.raw('COALESCE(scheduled_posts.media_urls, approval_items.media_urls) as media_urls'),
        db.raw('COALESCE(scheduled_posts.caption, approval_items.caption) as caption'),
        db.raw('COALESCE(scheduled_posts.thumbnail_url, approval_items.thumbnail_url) as thumbnail_url'),
        db.raw('COALESCE(scheduled_posts.post_type, approval_items.post_type) as post_type')
      )
      .where('deliveries.approval_status', 'client_rejected')
      .orderBy('approval_items.responded_at', 'desc');

    if (!['ceo', 'dev', 'admin'].includes(role)) {
      query.where('clients.social_media_id', userId);
    }
    return query;
  }

  // ─── Delivery Media (from ClickUp) ────────────────────────────

  /**
   * Fetch fresh media from ClickUp attachments for a delivery
   */
  async getDeliveryMedia(deliveryId) {
    const delivery = await db('deliveries').where({ id: deliveryId }).first();
    if (!delivery) {
      throw Object.assign(new Error('Delivery not found'), { status: 404 });
    }
    if (!delivery.clickup_task_id) {
      return { media_urls: [], thumbnail_url: null, caption: null, post_type: null };
    }

    const clickupService = require('../webhooks/clickup.service');
    const task = await clickupService.fetchTask(delivery.clickup_task_id);
    if (!task) {
      return { media_urls: [], thumbnail_url: null, caption: null, post_type: null };
    }

    const attachments = task.attachments || [];
    const allMedia = attachments
      .filter((a) => a.url && (a.mimetype?.startsWith('image/') || a.mimetype?.startsWith('video/')))
      .map((a, i) => ({
        url: a.url,
        type: a.mimetype?.startsWith('video/') ? 'video' : 'image',
        order: i,
      }));

    const postTypeMap = {
      reel: 'reel', video: 'reel', carrossel: 'carousel', feed: 'image', story: 'story',
    };
    const postType = delivery.content_type
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

    // Extract caption from "Legenda" custom field
    const legendaField = task.custom_fields?.find(
      (cf) => cf.name?.toLowerCase() === 'legenda'
    );
    const caption = legendaField?.value?.trim() || task.name || '';

    return { media_urls: mediaUrls, thumbnail_url: thumbnailUrl, caption, post_type: postType };
  }

  // ─── SM Approved List ─────────────────────────────────────────

  /**
   * Get deliveries with approval_status 'sm_approved' for clients
   * where social_media_id = userId
   */
  async listSmApproved(userId, role) {
    const query = db('deliveries')
      .join('clients', 'deliveries.client_id', 'clients.id')
      .leftJoin('scheduled_posts', 'scheduled_posts.delivery_id', 'deliveries.id')
      .leftJoin(
        db.raw(`LATERAL (SELECT * FROM approval_items ai WHERE ai.delivery_id = deliveries.id ORDER BY ai.created_at DESC LIMIT 1) AS approval_items ON true`)
      )
      .select(
        'deliveries.*',
        'clients.name as client_name',
        'clients.instagram_account',
        db.raw('COALESCE(scheduled_posts.media_urls, approval_items.media_urls) as media_urls'),
        db.raw('COALESCE(scheduled_posts.caption, approval_items.caption) as caption'),
        db.raw('COALESCE(scheduled_posts.thumbnail_url, approval_items.thumbnail_url) as thumbnail_url'),
        db.raw('COALESCE(scheduled_posts.post_type, approval_items.post_type) as post_type')
      )
      .where('deliveries.approval_status', 'sm_approved')
      .orderBy('deliveries.updated_at', 'desc');

    if (!['ceo', 'dev', 'admin'].includes(role)) {
      query.where('clients.social_media_id', userId);
    }
    return query;
  }

  // ─── SM Approve ───────────────────────────────────────────────

  /**
   * SM approves a delivery: verify it's sm_pending, update to sm_approved
   */
  async smApprove(deliveryId, data, userId) {
    const delivery = await db('deliveries').where({ id: deliveryId }).first();
    if (!delivery) {
      throw Object.assign(new Error('Delivery not found'), { status: 404 });
    }
    if (delivery.approval_status !== 'sm_pending') {
      throw Object.assign(
        new Error(`Delivery is not in sm_pending status (current: ${delivery.approval_status})`),
        { status: 400 }
      );
    }

    const [updated] = await db('deliveries')
      .where({ id: deliveryId })
      .update({ approval_status: 'sm_approved', updated_at: new Date() })
      .returning('*');

    logger.info('SM approved delivery', { deliveryId, userId });
    eventBus.emit('sse', { type: 'approval:updated', payload: { deliveryId, clientId: updated.client_id } });

    return updated;
  }

  // ─── SM Revert ────────────────────────────────────────────────

  /**
   * SM reverts a delivery: move sm_approved back to sm_pending
   */
  async smRevert(deliveryId, userId) {
    const delivery = await db('deliveries').where({ id: deliveryId }).first();
    if (!delivery) {
      throw Object.assign(new Error('Delivery not found'), { status: 404 });
    }
    if (delivery.approval_status !== 'sm_approved') {
      throw Object.assign(
        new Error(`Delivery is not in sm_approved status (current: ${delivery.approval_status})`),
        { status: 400 }
      );
    }

    const [updated] = await db('deliveries')
      .where({ id: deliveryId })
      .update({ approval_status: 'sm_pending', updated_at: new Date() })
      .returning('*');

    logger.info('SM reverted delivery', { deliveryId, userId });
    eventBus.emit('sse', { type: 'approval:updated', payload: { deliveryId, clientId: updated.client_id } });

    return updated;
  }

  // ─── Send To Client ───────────────────────────────────────────

  /**
   * Main flow: send a batch of sm_approved deliveries to the client for approval
   */
  async sendToClient(clientId, items, userId) {
    // Verify client exists and has whatsapp_group
    const client = await db('clients').where({ id: clientId }).first();
    if (!client) {
      throw Object.assign(new Error('Client not found'), { status: 404 });
    }
    if (!client.whatsapp_group && !client.whatsapp) {
      throw Object.assign(new Error('Client does not have WhatsApp configured (group or personal)'), { status: 400 });
    }

    // Verify all deliveries are sm_approved for this client
    const deliveryIds = items.map((i) => i.delivery_id);
    const deliveries = await db('deliveries')
      .whereIn('id', deliveryIds)
      .where('client_id', clientId)
      .select('*');

    if (deliveries.length !== deliveryIds.length) {
      throw Object.assign(
        new Error('One or more deliveries not found or do not belong to this client'),
        { status: 400 }
      );
    }

    const nonApproved = deliveries.filter((d) => d.approval_status !== 'sm_approved');
    if (nonApproved.length > 0) {
      throw Object.assign(
        new Error(`Deliveries must be in sm_approved status: ${nonApproved.map((d) => d.id).join(', ')}`),
        { status: 400 }
      );
    }

    // Check if there's an existing pending batch for this client — reuse it
    let batch = await db('approval_batches')
      .where({ client_id: clientId, status: 'pending' })
      .orderBy('created_at', 'desc')
      .first();

    const isExistingBatch = !!batch;

    if (!batch) {
      [batch] = await db('approval_batches')
        .insert({ client_id: clientId, created_by: userId })
        .returning('*');
      logger.info('Created new approval batch', { batchId: batch.id, clientId });
    } else {
      logger.info('Reusing existing pending batch', { batchId: batch.id, clientId });
    }

    // Create approval_items and update deliveries
    const createdItems = [];
    for (const item of items) {
      const delivery = deliveries.find((d) => d.id === item.delivery_id);

      const [approvalItem] = await db('approval_items')
        .insert({
          batch_id: batch.id,
          delivery_id: item.delivery_id,
          caption: item.caption ?? null,
          media_urls: item.media_urls ? JSON.stringify(item.media_urls) : null,
          thumbnail_url: item.thumbnail_url ?? null,
          post_type: item.post_type ?? null,
        })
        .returning('*');

      createdItems.push(approvalItem);

      // Update delivery approval_status to client_pending
      await db('deliveries')
        .where({ id: item.delivery_id })
        .update({ approval_status: 'client_pending', updated_at: new Date() });
    }

    // Build approval link
    const baseUrl = (env.clientUrl || 'http://localhost:4401').split(',')[0].trim();
    const approvalLink = `${baseUrl}/aprovacao/${batch.token}`;

    // Send WhatsApp message — different text if adding to existing batch
    const whatsappMessage = isExistingBatch
      ? `Novas publicações foram adicionadas ao seu link de aprovação! ` +
        `${createdItems.length} novo(s) post(s) inserido(s).\n\n` +
        `Acesse o mesmo link para revisar:\n${approvalLink}`
      : `Olá! Temos ${createdItems.length} post(s) aguardando sua aprovação.\n\n` +
        `Acesse o link abaixo para aprovar ou solicitar correções:\n${approvalLink}`;

    // Send to group if available, otherwise to client's personal WhatsApp
    const whatsappDest = client.whatsapp_group || evolutionService.buildPersonalJid(client.whatsapp);
    if (whatsappDest) {
      await evolutionService.sendText(whatsappDest, whatsappMessage);
    }

    // Schedule BullMQ reminder job (every 24h)
    try {
      const { approvalReminderQueue } = require('../../queues');
      await approvalReminderQueue.add(
        'send-reminder',
        { batchId: batch.id, clientId, approvalLink },
        {
          repeat: { every: 24 * 60 * 60 * 1000 },
          jobId: `approval-reminder-${batch.id}`,
        }
      );
      logger.info('Scheduled approval reminder job', { batchId: batch.id });
    } catch (err) {
      logger.warn('Could not schedule approval reminder job', { batchId: batch.id, error: err.message });
    }

    eventBus.emit('sse', {
      type: 'approval:updated',
      payload: { batchId: batch.id, clientId, itemCount: createdItems.length },
    });

    return { batch, items: createdItems, approvalLink };
  }

  // ─── Get Batch By Token ───────────────────────────────────────

  /**
   * Get batch + items + client for public approval page
   */
  async getBatchByToken(token) {
    const batch = await db('approval_batches')
      .join('clients', 'approval_batches.client_id', 'clients.id')
      .select(
        'approval_batches.*',
        'clients.name as client_name',
        'clients.instagram_account',
        'clients.avatar_url as client_avatar_url'
      )
      .where('approval_batches.token', token)
      .first();

    if (!batch) {
      throw Object.assign(new Error('Approval batch not found'), { status: 404 });
    }
    if (batch.status !== 'pending') {
      throw Object.assign(new Error('Este link de aprovação não está mais ativo'), { status: 410 });
    }

    const batchItems = await db('approval_items')
      .join('deliveries', 'approval_items.delivery_id', 'deliveries.id')
      .select(
        'approval_items.*',
        'deliveries.title as delivery_title',
        'deliveries.content_type as delivery_content_type'
      )
      .where('approval_items.batch_id', batch.id)
      .orderBy('approval_items.created_at', 'asc');

    return { batch, items: batchItems };
  }

  // ─── Client Respond ───────────────────────────────────────────

  /**
   * Public endpoint: client approves or rejects an item in the batch
   */
  async clientRespond(token, itemId, status, rejectionReason, mediaUrls) {
    // Verify batch is pending
    const batch = await db('approval_batches')
      .join('clients', 'approval_batches.client_id', 'clients.id')
      .select('approval_batches.*', 'clients.name as client_name', 'clients.social_media_id')
      .where('approval_batches.token', token)
      .first();

    if (!batch) {
      throw Object.assign(new Error('Approval batch not found'), { status: 404 });
    }
    if (batch.status !== 'pending') {
      throw Object.assign(new Error('Batch is no longer pending'), { status: 400 });
    }

    // Verify item exists and belongs to batch and is pending
    const item = await db('approval_items')
      .where({ id: itemId, batch_id: batch.id })
      .first();

    if (!item) {
      throw Object.assign(new Error('Approval item not found'), { status: 404 });
    }
    if (item.status !== 'pending') {
      throw Object.assign(new Error('Item has already been responded to'), { status: 400 });
    }

    // Map status to item/delivery approval_status values
    const itemStatus = status; // 'approved' or 'rejected'
    const deliveryApprovalStatus = status === 'approved' ? 'client_approved' : 'client_rejected';

    // Update item
    const itemUpdate = {
      status: itemStatus,
      rejection_reason: rejectionReason || null,
      responded_at: new Date(),
      updated_at: new Date(),
    };
    if (mediaUrls) {
      itemUpdate.media_urls = JSON.stringify(mediaUrls);
    }

    const [updatedItem] = await db('approval_items')
      .where({ id: itemId })
      .update(itemUpdate)
      .returning('*');

    // Update delivery approval_status
    const delivery = await db('deliveries').where({ id: item.delivery_id }).first();
    await db('deliveries')
      .where({ id: item.delivery_id })
      .update({ approval_status: deliveryApprovalStatus, updated_at: new Date() });

    // Move ClickUp task
    if (delivery?.clickup_task_id) {
      const clickupStatus = status === 'approved' ? 'agendamento' : 'correção';
      await this._moveClickUpTask(delivery.clickup_task_id, clickupStatus);
    }

    // If rejected, notify social media via WhatsApp
    if (status === 'rejected') {
      await this._notifySmRejection(batch, updatedItem, delivery, rejectionReason);
    }

    // Check if all items have been responded to
    const pendingItems = await db('approval_items')
      .where({ batch_id: batch.id, status: 'pending' })
      .count('id as count')
      .first();

    const allResponded = parseInt(pendingItems.count, 10) === 0;

    if (allResponded) {
      // Complete batch
      await db('approval_batches')
        .where({ id: batch.id })
        .update({ status: 'completed', completed_at: new Date(), updated_at: new Date() });

      // Cancel reminder job
      try {
        const { approvalReminderQueue } = require('../../queues');
        const jobs = await approvalReminderQueue.getRepeatableJobs();
        const reminderJob = jobs.find((j) => j.id === `approval-reminder-${batch.id}`);
        if (reminderJob) {
          await approvalReminderQueue.removeRepeatableByKey(reminderJob.key);
          logger.info('Cancelled approval reminder job', { batchId: batch.id });
        }
      } catch (err) {
        logger.warn('Could not cancel approval reminder job', { batchId: batch.id, error: err.message });
      }

      logger.info('Approval batch completed', { batchId: batch.id });
    }

    eventBus.emit('sse', {
      type: 'approval:updated',
      payload: { batchId: batch.id, itemId, status, allResponded },
    });

    return { item: updatedItem, allResponded };
  }

  // ─── Revoke Batch ─────────────────────────────────────────────

  /**
   * Revoke a pending batch: revert pending items to sm_approved
   */
  async revokeBatch(batchId, userId) {
    const batch = await db('approval_batches').where({ id: batchId }).first();
    if (!batch) {
      throw Object.assign(new Error('Approval batch not found'), { status: 404 });
    }
    if (batch.status === 'revoked') {
      throw Object.assign(new Error('Batch already revoked'), { status: 400 });
    }

    // Get all items
    const items = await db('approval_items')
      .where({ batch_id: batchId })
      .select('*');

    // Revert only pending and approved items to sm_approved
    // Rejected items stay as client_rejected (they need correction)
    for (const item of items) {
      if (item.status !== 'rejected') {
        await db('deliveries')
          .where({ id: item.delivery_id })
          .update({ approval_status: 'sm_approved', updated_at: new Date() });
      }
    }

    // Revoke the batch
    await db('approval_batches')
      .where({ id: batchId })
      .update({ status: 'revoked', revoked_at: new Date(), updated_at: new Date() });

    // Cancel reminder job
    try {
      const { approvalReminderQueue } = require('../../queues');
      const jobs = await approvalReminderQueue.getRepeatableJobs();
      const reminderJob = jobs.find((j) => j.id === `approval-reminder-${batchId}`);
      if (reminderJob) {
        await approvalReminderQueue.removeRepeatableByKey(reminderJob.key);
        logger.info('Cancelled approval reminder job on revoke', { batchId });
      }
    } catch (err) {
      logger.warn('Could not cancel approval reminder job on revoke', { batchId, error: err.message });
    }

    logger.info('Approval batch revoked', { batchId, userId, revertedCount: items.length });
    eventBus.emit('sse', { type: 'approval:updated', payload: { batchId, clientId: batch.client_id } });

    return { success: true, revertedCount: items.length };
  }

  // ─── List Batches ─────────────────────────────────────────────

  /**
   * List batches for a client with item counts
   */
  async listBatches(clientId) {
    return db('approval_batches')
      .leftJoin('approval_items', 'approval_batches.id', 'approval_items.batch_id')
      .select(
        'approval_batches.*',
        db.raw('count(approval_items.id) as total_items'),
        db.raw("count(approval_items.id) filter (where approval_items.status = 'pending') as pending_count"),
        db.raw("count(approval_items.id) filter (where approval_items.status = 'approved') as approved_count"),
        db.raw("count(approval_items.id) filter (where approval_items.status = 'rejected') as rejected_count")
      )
      .where('approval_batches.client_id', clientId)
      .where('approval_batches.status', 'pending')
      .groupBy('approval_batches.id')
      .orderBy('approval_batches.created_at', 'desc');
  }

  // ─── Get Batch Items ───────────────────────────────────────────

  async getBatchItems(batchId) {
    const batch = await db('approval_batches').where({ id: batchId }).first();
    if (!batch) {
      throw Object.assign(new Error('Approval batch not found'), { status: 404 });
    }

    const items = await db('approval_items')
      .join('deliveries', 'approval_items.delivery_id', 'deliveries.id')
      .select(
        'approval_items.*',
        'deliveries.title as delivery_title',
        'deliveries.content_type as delivery_content_type'
      )
      .where('approval_items.batch_id', batchId)
      .orderBy('approval_items.created_at', 'asc');

    return { batch, items };
  }

  // ─── Update Batch Item ────────────────────────────────────────

  async updateBatchItem(batchId, itemId, data) {
    const batch = await db('approval_batches').where({ id: batchId }).first();
    if (!batch) {
      throw Object.assign(new Error('Approval batch not found'), { status: 404 });
    }

    const item = await db('approval_items').where({ id: itemId, batch_id: batchId }).first();
    if (!item) {
      throw Object.assign(new Error('Approval item not found'), { status: 404 });
    }

    const updateData = {};
    if (data.caption !== undefined) updateData.caption = data.caption;
    if (data.media_urls !== undefined) updateData.media_urls = JSON.stringify(data.media_urls);
    if (data.thumbnail_url !== undefined) updateData.thumbnail_url = data.thumbnail_url;
    if (data.post_type !== undefined) updateData.post_type = data.post_type;
    updateData.updated_at = new Date();

    const [updated] = await db('approval_items')
      .where({ id: itemId })
      .update(updateData)
      .returning('*');

    logger.info('Approval item updated', { batchId, itemId });
    return updated;
  }

  // ─── Remove Batch Item ────────────────────────────────────────

  async removeBatchItem(batchId, itemId) {
    const batch = await db('approval_batches').where({ id: batchId }).first();
    if (!batch) {
      throw Object.assign(new Error('Approval batch not found'), { status: 404 });
    }

    const item = await db('approval_items').where({ id: itemId, batch_id: batchId }).first();
    if (!item) {
      throw Object.assign(new Error('Approval item not found'), { status: 404 });
    }

    // Revert delivery back to sm_approved
    await db('deliveries')
      .where({ id: item.delivery_id })
      .update({ approval_status: 'sm_approved', updated_at: new Date() });

    await db('approval_items').where({ id: itemId }).del();

    // If batch has no more items, auto-revoke it
    const remaining = await db('approval_items').where({ batch_id: batchId }).count('id as count').first();
    if (parseInt(remaining.count, 10) === 0) {
      await db('approval_batches')
        .where({ id: batchId })
        .update({ status: 'revoked', revoked_at: new Date(), updated_at: new Date() });
      logger.info('Batch auto-revoked (no items left)', { batchId });
    }

    logger.info('Approval item removed from batch', { batchId, itemId });
    eventBus.emit('sse', { type: 'approval:updated', payload: { batchId, clientId: batch.client_id } });
    return { success: true };
  }

  // ─── List WhatsApp Groups ─────────────────────────────────────

  /**
   * Delegate to Evolution service
   */
  async listWhatsAppGroups() {
    return evolutionService.listGroups();
  }

  // ─── Private Helpers ──────────────────────────────────────────

  /**
   * Move a ClickUp task to the given status via ClickUp API
   */
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
        const err = await res.text();
        logger.error('ClickUp task move failed', { clickupTaskId, statusName, error: err });
        return null;
      }

      logger.info('ClickUp task moved', { clickupTaskId, statusName });
      return res.json();
    } catch (err) {
      logger.error('ClickUp task move error', { clickupTaskId, statusName, error: err.message });
      return null;
    }
  }

  /**
   * Notify the social media professional of a rejection via WhatsApp
   */
  async _notifySmRejection(batch, item, delivery, rejectionReason) {
    try {
      if (!batch.social_media_id) {
        logger.warn('No social_media_id on batch client, skipping SM rejection notification', { batchId: batch.id });
        return;
      }

      const smUser = await db('users').where({ id: batch.social_media_id }).first();
      if (!smUser?.whatsapp) {
        logger.warn('SM user has no whatsapp configured, skipping rejection notification', { userId: batch.social_media_id });
        return;
      }

      const deliveryTitle = delivery?.title || item.delivery_id;
      const message =
        `Rejeição recebida para o post: "${deliveryTitle}"\n\n` +
        `Cliente: ${batch.client_name}\n` +
        `Motivo: ${rejectionReason}\n\n` +
        `Por favor, faça as correções necessárias.`;

      const jid = evolutionService.buildPersonalJid(smUser.whatsapp);
      await evolutionService.sendText(jid, message);
      logger.info('SM rejection notification sent', { smUserId: smUser.id, batchId: batch.id, itemId: item.id });
    } catch (err) {
      logger.error('Failed to send SM rejection notification', { error: err.message, batchId: batch.id });
    }
  }
}

module.exports = new ApprovalsService();
