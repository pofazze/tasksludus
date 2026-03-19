const { Queue } = require('bullmq');
const env = require('../config/env');
const logger = require('../utils/logger');

const connection = {
  url: env.redis.url,
  maxRetriesPerRequest: null,
};

const instagramPublishQueue = new Queue('instagram-publish', { connection });
const tokenRefreshQueue = new Queue('token-refresh', { connection });

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
  const job = await instagramPublishQueue.getJob(`post-${postId}`);
  if (job) {
    await job.remove();
    logger.info('Scheduled post removed from queue', { postId });
  }
}

async function reschedulePost(postId, newScheduledAt) {
  await cancelScheduledPost(postId);
  await schedulePost(postId, newScheduledAt);
}

async function setupRepeatable() {
  // Token refresh: daily at 3:00 AM
  await tokenRefreshQueue.add('refresh-expiring', {}, {
    repeat: { pattern: '0 3 * * *' },
    jobId: 'daily-token-refresh',
  });
  logger.info('Token refresh repeatable job configured (daily 3 AM)');
}

module.exports = {
  instagramPublishQueue,
  tokenRefreshQueue,
  schedulePost,
  cancelScheduledPost,
  reschedulePost,
  setupRepeatable,
  connection,
};
