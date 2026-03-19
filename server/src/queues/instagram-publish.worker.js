const { Worker } = require('bullmq');
const logger = require('../utils/logger');
const publishService = require('../modules/instagram/instagram-publish.service');
const { connection } = require('./index');

const worker = new Worker('instagram-publish', async (job) => {
  const { postId } = job.data;
  logger.info('Processing publish job', { postId, jobId: job.id });

  await publishService.executeScheduledPost(postId);
}, {
  connection,
  concurrency: 2,
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
  logger.info('Publish job completed', { jobId: job.id, postId: job.data.postId });
});

worker.on('failed', (job, err) => {
  logger.error('Publish job failed', { jobId: job?.id, postId: job?.data?.postId, error: err.message });
});

module.exports = worker;
