const { Worker } = require('bullmq');
const logger = require('../utils/logger');
const publishService = require('../modules/tiktok/tiktok-publish.service');
const { connection } = require('./index');

const worker = new Worker('tiktok-publish', async (job) => {
  const { postId } = job.data;
  logger.info('Processing TikTok publish job', { postId, jobId: job.id });

  await publishService.executeScheduledPost(postId);
}, {
  connection,
  concurrency: 1,
  limiter: {
    max: 5,
    duration: 60 * 1000, // 5 per minute
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 30000, // 30s, 60s, 120s
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
});

worker.on('completed', (job) => {
  logger.info('TikTok publish job completed', { jobId: job.id, postId: job.data.postId });
});

worker.on('failed', (job, err) => {
  logger.error('TikTok publish job failed', { jobId: job?.id, postId: job?.data?.postId, error: err.message });
});

module.exports = worker;
