const { Worker } = require('bullmq');
const db = require('../config/db');
const logger = require('../utils/logger');
const notifications = require('../modules/notifications/notifications.service');
const { connection } = require('./index');

async function runWindowJob(job) {
  const { batchId } = job.data;
  logger.info('Running approval review window', { batchId });

  const batch = await db('approval_batches').where({ id: batchId }).first();
  if (!batch) {
    logger.warn('Window job: batch not found', { batchId });
    return;
  }
  if (batch.review_window_fired_at) {
    logger.info('Window already fired, skipping', { batchId });
    return;
  }
  const startedAt = batch.review_window_started_at;
  if (!startedAt) {
    logger.warn('Window job ran but started_at is null', { batchId });
    return;
  }

  const allItems = await db('approval_items').where({ batch_id: batchId });
  const startedAtMs = new Date(startedAt).getTime();
  const reviewed = allItems.filter((i) => i.responded_at && new Date(i.responded_at).getTime() >= startedAtMs && i.status !== 'pending');

  // Mark fired BEFORE dispatching so a retried job is a no-op even if the
  // dispatcher partially fails — the operator can replay manually if needed.
  await db('approval_batches').where({ id: batchId }).update({
    review_window_fired_at: new Date(),
    updated_at: new Date(),
  });

  if (reviewed.length === 0) {
    logger.info('Window fired but no reviewed items in scope, skipping notification', { batchId });
    return;
  }

  // Enrich items with delivery title + clickup_task_id + post_type so the
  // dispatcher does not have to fan out queries per item.
  const deliveryIds = [...new Set(reviewed.map((i) => i.delivery_id))];
  const deliveries = deliveryIds.length
    ? await db('deliveries').whereIn('id', deliveryIds)
    : [];
  const deliveryById = Object.fromEntries(deliveries.map((d) => [d.id, d]));
  const enriched = reviewed.map((i) => ({
    ...i,
    delivery_title: deliveryById[i.delivery_id]?.title || null,
    clickup_task_id: deliveryById[i.delivery_id]?.clickup_task_id || null,
    post_type: deliveryById[i.delivery_id]?.content_type || null,
  }));

  await notifications.notifyBatchReviewWindow(batch, enriched);
}

// Worker is only instantiated when not in test mode; tests import runWindowJob directly.
if (process.env.NODE_ENV !== 'test') {
  const worker = new Worker('approval-review-window', runWindowJob, {
    connection,
    concurrency: 1,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  });
  worker.on('completed', (job) => logger.info('approval-review-window completed', { jobId: job.id }));
  worker.on('failed', (job, err) => logger.error('approval-review-window failed', { jobId: job?.id, error: err.message }));
  module.exports = { worker, runWindowJob };
} else {
  module.exports = { runWindowJob };
}
