const { Queue } = require('bullmq');
const env = require('../config/env');
const logger = require('../utils/logger');

const connection = {
  url: env.redis.url,
  maxRetriesPerRequest: null,
};

const instagramPublishQueue = new Queue('instagram-publish', { connection });
const tiktokPublishQueue = new Queue('tiktok-publish', { connection });
const tokenRefreshQueue = new Queue('token-refresh', { connection });
const deliverySyncQueue = new Queue('delivery-sync', { connection });
const approvalReminderQueue = new Queue('approval-reminder', { connection });
const approvalReviewWindowQueue = new Queue('approval-review-window', { connection });

async function schedulePost(postId, scheduledAt, platform = 'instagram') {
  const delay = new Date(scheduledAt).getTime() - Date.now();
  // Use unique jobId per attempt to avoid BullMQ deduplication with stale failed/completed jobs
  const jobId = `post-${postId}-${Date.now()}`;
  const queue = platform === 'tiktok' ? tiktokPublishQueue : instagramPublishQueue;
  if (delay <= 0) {
    await queue.add('publish', { postId }, { jobId });
  } else {
    await queue.add('publish', { postId }, { delay, jobId });
  }
  logger.info('Post scheduled in queue', { postId, platform, delay: Math.round(delay / 1000) + 's' });
}

async function cancelScheduledPost(postId) {
  const queues = [instagramPublishQueue, tiktokPublishQueue];
  for (const queue of queues) {
    try {
      // Find all jobs for this post (jobId format: post-{postId}-{timestamp})
      const states = ['delayed', 'waiting', 'active'];
      for (const state of states) {
        const jobs = await queue.getJobs([state]);
        for (const job of jobs) {
          if (job.data?.postId === postId) {
            try {
              await job.remove();
              logger.info('Scheduled post removed from queue', { postId, jobId: job.id, state, queue: queue.name });
            } catch {
              // Job may be locked by active worker
            }
          }
        }
      }
    } catch (err) {
      logger.warn('Could not remove scheduled job', { postId, queue: queue.name, error: err.message });
    }
  }
}

async function reschedulePost(postId, newScheduledAt, platform = 'instagram') {
  await cancelScheduledPost(postId);
  await schedulePost(postId, newScheduledAt, platform);
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

async function enqueueApprovalReviewWindow(batchId, delayMs = 8 * 60 * 1000) {
  await approvalReviewWindowQueue.add(
    'approval-window-fire',
    { batchId },
    { delay: delayMs, jobId: `window:${batchId}`, removeOnComplete: { count: 100 }, removeOnFail: { count: 100 } },
  );
}

async function promoteApprovalReviewWindow(batchId) {
  const job = await approvalReviewWindowQueue.getJob(`window:${batchId}`);
  if (job) {
    try { await job.promote(); } catch { /* already promoted or completed */ }
  }
}

module.exports = {
  instagramPublishQueue,
  tiktokPublishQueue,
  tokenRefreshQueue,
  deliverySyncQueue,
  approvalReminderQueue,
  approvalReviewWindowQueue,
  enqueueApprovalReviewWindow,
  promoteApprovalReviewWindow,
  schedulePost,
  cancelScheduledPost,
  reschedulePost,
  setupRepeatable,
  connection,
};
