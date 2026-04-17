const { Worker } = require('bullmq');
const logger = require('../utils/logger');
const publishService = require('../modules/youtube/youtube-publish.service');
const { connection } = require('./index');

const worker = new Worker('youtube-publish', async (job) => {
  const { postId } = job.data;
  logger.info('Processing YouTube publish job', { postId, jobId: job.id });

  await publishService.executeScheduledPost(postId);
}, {
  connection,
  concurrency: 1,
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
  logger.info('YouTube publish job completed', { jobId: job.id, postId: job.data.postId });
});

worker.on('failed', (job, err) => {
  logger.error('YouTube publish job failed', { jobId: job?.id, postId: job?.data?.postId, error: err.message });
});

module.exports = worker;
