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
  async listSmPending(userId) {
    return db('deliveries')
      .join('clients', 'deliveries.client_id', 'clients.id')
      .select(
        'deliveries.*',
        'clients.name as client_name',
        'clients.instagram_account'
      )
      .where('deliveries.approval_status', 'sm_pending')
      .where('clients.social_media_id', userId)
      .orderBy('deliveries.created_at', 'desc');
  }

  // ─── List By Client ───────────────────────────────────────────

  /**
   * Get all deliveries with non-null approval_status for a client
   */
  async listByClient(clientId) {
    return db('deliveries')
      .join('clients', 'deliveries.client_id', 'clients.id')
      .select(
        'deliveries.*',
        'clients.name as client_name',
        'clients.instagram_account'
      )
      .where('deliveries.client_id', clientId)
      .whereNotNull('deliveries.approval_status')
      .orderBy('deliveries.created_at', 'desc');
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
    eventBus.emit('sse', { type: 'approval:sm_approved', payload: { deliveryId, clientId: updated.client_id } });

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
    if (!client.whatsapp_group) {
      throw Object.assign(new Error('Client does not have a WhatsApp group configured'), { status: 400 });
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

    // Check for existing pending batch for this client
    let batch = await db('approval_batches')
      .where({ client_id: clientId, status: 'pending' })
      .first();

    const isNewBatch = !batch;

    if (isNewBatch) {
      [batch] = await db('approval_batches')
        .insert({ client_id: clientId, created_by: userId })
        .returning('*');
      logger.info('Created new approval batch', { batchId: batch.id, clientId });
    } else {
      logger.info('Reusing existing pending approval batch', { batchId: batch.id, clientId });
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

    // Send WhatsApp message to group
    let whatsappMessage;
    if (isNewBatch) {
      whatsappMessage =
        `Olá! Temos ${createdItems.length} post(s) aguardando sua aprovação.\n\n` +
        `Acesse o link abaixo para aprovar ou solicitar correções:\n${approvalLink}`;
    } else {
      whatsappMessage =
        `Adicionamos ${createdItems.length} novo(s) post(s) ao seu lote de aprovação.\n\n` +
        `Acesse o link para revisar:\n${approvalLink}`;
    }

    await evolutionService.sendText(client.whatsapp_group, whatsappMessage);

    // Schedule BullMQ reminder job only for new batches (every 24h)
    if (isNewBatch) {
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
    }

    eventBus.emit('sse', {
      type: 'approval:sent_to_client',
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
        'clients.instagram_account'
      )
      .where('approval_batches.token', token)
      .first();

    if (!batch) {
      throw Object.assign(new Error('Approval batch not found'), { status: 404 });
    }

    const batchItems = await db('approval_items')
      .join('deliveries', 'approval_items.delivery_id', 'deliveries.id')
      .select(
        'approval_items.*',
        'deliveries.title as delivery_title'
      )
      .where('approval_items.batch_id', batch.id)
      .orderBy('approval_items.created_at', 'asc');

    return { batch, items: batchItems };
  }

  // ─── Client Respond ───────────────────────────────────────────

  /**
   * Public endpoint: client approves or rejects an item in the batch
   */
  async clientRespond(token, itemId, status, rejectionReason) {
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
    const [updatedItem] = await db('approval_items')
      .where({ id: itemId })
      .update({
        status: itemStatus,
        rejection_reason: rejectionReason || null,
        responded_at: new Date(),
        updated_at: new Date(),
      })
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
      type: 'approval:client_responded',
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
    if (batch.status !== 'pending') {
      throw Object.assign(new Error('Only pending batches can be revoked'), { status: 400 });
    }

    // Get pending items to revert their deliveries
    const pendingItems = await db('approval_items')
      .where({ batch_id: batchId, status: 'pending' })
      .select('*');

    // Revert pending items' deliveries back to sm_approved
    for (const item of pendingItems) {
      await db('deliveries')
        .where({ id: item.delivery_id })
        .update({ approval_status: 'sm_approved', updated_at: new Date() });
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

    logger.info('Approval batch revoked', { batchId, userId, revertedCount: pendingItems.length });
    eventBus.emit('sse', { type: 'approval:revoked', payload: { batchId, clientId: batch.client_id } });

    return { success: true, revertedCount: pendingItems.length };
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
      .groupBy('approval_batches.id')
      .orderBy('approval_batches.created_at', 'desc');
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
