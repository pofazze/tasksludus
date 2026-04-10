const { Worker } = require('bullmq');
const logger = require('../utils/logger');
const oauthService = require('../modules/instagram/instagram-oauth.service');
const tiktokOauthService = require('../modules/tiktok/tiktok-oauth.service');
const { connection } = require('./index');

const worker = new Worker('token-refresh', async () => {
  logger.info('Running token validation check');

  const activeTokens = await oauthService.getTokensExpiringWithin(0);
  logger.info(`Found ${activeTokens.length} active tokens to validate`);

  for (const token of activeTokens) {
    try {
      await oauthService.refreshToken(token.client_id);
      logger.info('Token validated', { clientId: token.client_id, username: token.ig_username });
    } catch (err) {
      logger.error('Token validation failed', { clientId: token.client_id, error: err.message });
    }
  }

  try {
    const tiktokTokens = await tiktokOauthService.getTokensExpiringWithin(1);
    logger.info(`Found ${tiktokTokens.length} TikTok tokens expiring within 1 day`);

    for (const token of tiktokTokens) {
      try {
        await tiktokOauthService.refreshToken(token.client_id);
        logger.info('TikTok token refreshed', { clientId: token.client_id });
      } catch (err) {
        logger.error('TikTok token refresh failed', { clientId: token.client_id, error: err.message });
      }
    }
  } catch (err) {
    logger.error('TikTok token refresh block failed', { error: err.message });
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
  logger.error('Token validation job failed', { error: err.message });
});

module.exports = worker;
