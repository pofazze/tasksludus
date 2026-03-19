const { Worker } = require('bullmq');
const logger = require('../utils/logger');
const oauthService = require('../modules/instagram/instagram-oauth.service');
const { connection } = require('./index');

const worker = new Worker('token-refresh', async () => {
  logger.info('Running token refresh check');

  const expiring = await oauthService.getTokensExpiringWithin(10);
  logger.info(`Found ${expiring.length} tokens expiring within 10 days`);

  for (const token of expiring) {
    try {
      await oauthService.refreshToken(token.client_id);
      logger.info('Token refreshed', { clientId: token.client_id, username: token.ig_username });
    } catch (err) {
      logger.error('Token refresh failed', { clientId: token.client_id, error: err.message });
    }
  }
}, {
  connection,
  concurrency: 1,
  defaultJobOptions: {
    removeOnComplete: { count: 30 },
    removeOnFail: { count: 30 },
  },
});

worker.on('failed', (_job, err) => {
  logger.error('Token refresh job failed', { error: err.message });
});

module.exports = worker;
