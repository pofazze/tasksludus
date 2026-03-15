const Redis = require('ioredis');
const env = require('./env');
const logger = require('../utils/logger');

let redis;

if (env.redis.url) {
  redis = new Redis(env.redis.url, {
    maxRetriesPerRequest: null,
  });
} else {
  redis = new Redis({
    maxRetriesPerRequest: null,
  });
}

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('error', (err) => {
  logger.error('Redis error:', err.message);
});

module.exports = redis;
