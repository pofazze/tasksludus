const { Queue } = require('bullmq');
const env = require('../config/env');
const logger = require('../utils/logger');

const connection = {
  url: env.redis.url,
  maxRetriesPerRequest: null,
};

const instagramPublishQueue = new Queue('instagram-publish', { connection });
const tokenRefreshQueue = new Queue('token-refresh', { connection });
const deliverySyncQueue = new Queue('delivery-sync', { connection });

async function schedulePost(postId, scheduledAt) {
  const delay = new Date(scheduledAt).getTime() - Date.now();
  if (delay <= 0) {
    // Publish immediately
    await instagramPublishQueue.add('publish', { postId }, { jobId: `post-${postId}` });
  } else {
    await instagramPublishQueue.add('publish', { postId }, {
      delay,
      jobId: `post-${postId}`,
    });
  }
  logger.info('Post scheduled in queue', { postId, delay: Math.round(delay / 1000) + 's' });
}

async function cancelScheduledPost(postId) {
  try {
    const job = await instagramPublishQueue.getJob(`post-${postId}`);
    if (job) {
      await job.remove();
      logger.info('Scheduled post removed from queue', { postId });
    }
  } catch (err) {
    // Job may be locked by an active worker — safe to ignore
    logger.warn('Could not remove scheduled job (may be processing)', { postId, error: err.message });
  }
}

async function reschedulePost(postId, newScheduledAt) {
  await cancelScheduledPost(postId);
  await schedulePost(postId, newScheduledAt);
}

async function setupRepeatable() {
  // Remove old daily job if exists
  const repeatable = await tokenRefreshQueue.getRepeatableJobs();
  for (const job of repeatable) {
    if (job.id === 'daily-token-refresh') {
      await tokenRefreshQueue.removeRepeatableByKey(job.key);
    }
  }

  // Token refresh: every 6 hours
  await tokenRefreshQueue.add('refresh-expiring', {}, {
    repeat: { pattern: '0 */6 * * *' },
    jobId: 'token-refresh-6h',
  });
  logger.info('Token refresh repeatable job configured (every 6h)');

  // Delivery sync: every 30 minutes
  const syncRepeatable = await deliverySyncQueue.getRepeatableJobs();
  for (const job of syncRepeatable) {
    await deliverySyncQueue.removeRepeatableByKey(job.key);
  }
  await deliverySyncQueue.add('sync-deliveries', {}, {
    repeat: { pattern: '*/5 * * * *' },
    jobId: 'delivery-sync-5m',
  });
  logger.info('Delivery sync repeatable job configured (every 5m)');
}

module.exports = {
  instagramPublishQueue,
  tokenRefreshQueue,
  deliverySyncQueue,
  schedulePost,
  cancelScheduledPost,
  reschedulePost,
  setupRepeatable,
  connection,
};
