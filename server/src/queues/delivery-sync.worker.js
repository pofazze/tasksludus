const { Worker } = require('bullmq');
const logger = require('../utils/logger');
const clickupService = require('../modules/webhooks/clickup.service');
const { connection } = require('./index');

const worker = new Worker('delivery-sync', async () => {
  logger.info('Running periodic delivery sync with ClickUp');
  const result = await clickupService.syncAllDeliveries();
  logger.info('Delivery sync complete', result);
}, {
  connection,
  concurrency: 1,
  defaultJobOptions: {
    removeOnComplete: { count: 10 },
    removeOnFail: { count: 10 },
  },
});

worker.on('failed', (_job, err) => {
  logger.error('Delivery sync job failed', { error: err.message });
});

module.exports = worker;
