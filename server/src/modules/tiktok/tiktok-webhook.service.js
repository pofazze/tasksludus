const crypto = require('crypto');
const env = require('../../config/env');
const db = require('../../config/db');
const logger = require('../../utils/logger');
const eventBus = require('../../utils/event-bus');

const TIMESTAMP_TOLERANCE_SECONDS = 300;

function parseSignatureHeader(header) {
  if (!header || typeof header !== 'string') return null;
  const parts = {};
  header.split(',').forEach((kv) => {
    const [k, v] = kv.trim().split('=');
    if (k && v) parts[k] = v;
  });
  if (!parts.t || !parts.s) return null;
  return { timestamp: parts.t, signature: parts.s };
}

function verifySignature(rawBody, header, opts = {}) {
  const clientSecret = opts.clientSecret !== undefined ? opts.clientSecret : env.tiktok.clientSecret;
  const now = opts.now !== undefined ? opts.now : Math.floor(Date.now() / 1000);

  if (!clientSecret) return false;
  if (rawBody == null) return false;

  const parsed = parseSignatureHeader(header);
  if (!parsed) return false;
  if (!/^[0-9a-f]+$/i.test(parsed.signature)) return false;

  const timestamp = Number(parsed.timestamp);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(now - timestamp) > TIMESTAMP_TOLERANCE_SECONDS) return false;

  const signedPayload = `${parsed.timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', clientSecret).update(signedPayload).digest('hex');

  const expectedBuf = Buffer.from(expected, 'hex');
  const receivedBuf = Buffer.from(parsed.signature, 'hex');
  if (expectedBuf.length !== receivedBuf.length) return false;

  try {
    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    return false;
  }
}

function parseContent(raw) {
  if (!raw) return {};
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

async function logEvent(event) {
  const [row] = await db('webhook_events')
    .insert({
      source: 'tiktok',
      event_type: event.event || 'unknown',
      webhook_id: null,
      payload: JSON.stringify(event),
      status: 'received',
    })
    .returning('*');
  return row;
}

async function handleAuthorizationRemoved(event) {
  const openId = event.user_openid;
  if (!openId) return;
  const token = await db('client_tiktok_tokens').where({ tiktok_open_id: openId }).first();
  if (!token) {
    logger.warn('TikTok authorization.removed: no token found', { openId });
    return;
  }
  await db('client_tiktok_tokens')
    .where({ tiktok_open_id: openId })
    .update({
      is_active: false,
      access_token_encrypted: null,
      token_iv: null,
      token_auth_tag: null,
      refresh_token_encrypted: null,
      refresh_token_iv: null,
      refresh_token_auth_tag: null,
      updated_at: new Date(),
    });
  logger.info('TikTok authorization revoked', { clientId: token.client_id, openId });
  eventBus.emit('tiktok:disconnected', { clientId: token.client_id });
}

async function updateScheduledPostByPublishId(publishId, patch) {
  const post = await db('scheduled_posts').where({ tiktok_publish_id: publishId }).first();
  if (!post) {
    logger.warn('TikTok webhook: scheduled_post not found', { publishId });
    return null;
  }
  await db('scheduled_posts').where({ tiktok_publish_id: publishId }).update({ ...patch, updated_at: new Date() });
  eventBus.emit('post:updated', { id: post.id, clientId: post.client_id });
  return post;
}

async function handlePublishComplete(event) {
  const content = parseContent(event.content);
  if (!content.publish_id) return;
  await updateScheduledPostByPublishId(content.publish_id, {
    status: 'published',
    published_at: new Date(),
  });
}

async function handlePublishPubliclyAvailable(event) {
  const content = parseContent(event.content);
  if (!content.publish_id) return;
  const post = await db('scheduled_posts').where({ tiktok_publish_id: content.publish_id }).first();
  if (!post) {
    logger.warn('TikTok publicly_available: scheduled_post not found', { publishId: content.publish_id });
    return;
  }
  const tokenRow = await db('client_tiktok_tokens')
    .where({ client_id: post.client_id })
    .select('tiktok_username')
    .first();
  const username = tokenRow?.tiktok_username || null;
  const permalink = (content.post_id && username)
    ? `https://www.tiktok.com/@${username}/video/${content.post_id}`
    : null;
  await db('scheduled_posts')
    .where({ tiktok_publish_id: content.publish_id })
    .update({
      status: 'published',
      tiktok_permalink: permalink,
      updated_at: new Date(),
    });
  eventBus.emit('post:updated', { id: post.id, clientId: post.client_id });
}

async function handlePublishFailed(event) {
  const content = parseContent(event.content);
  if (!content.publish_id) return;
  await updateScheduledPostByPublishId(content.publish_id, {
    status: 'failed',
    error_message: `TikTok webhook: ${content.reason || 'unknown reason'}`,
  });
}

async function processEvent(event) {
  try {
    await logEvent(event);
    switch (event.event) {
      case 'authorization.removed':
        await handleAuthorizationRemoved(event); break;
      case 'post.publish.complete':
        await handlePublishComplete(event); break;
      case 'post.publish.publicly_available':
        await handlePublishPubliclyAvailable(event); break;
      case 'post.publish.failed':
        await handlePublishFailed(event); break;
      case 'post.publish.inbox_delivered':
      case 'post.publish.no_longer_publicaly_available':
        logger.info(`TikTok webhook (logged only): ${event.event}`);
        break;
      default:
        logger.info(`TikTok webhook (unhandled): ${event.event}`);
    }
  } catch (err) {
    logger.error('TikTok webhook processEvent failed', { error: err.message, event: event?.event });
  }
}

module.exports = {
  parseSignatureHeader,
  verifySignature,
  TIMESTAMP_TOLERANCE_SECONDS,
  logEvent,
  processEvent,
  handleAuthorizationRemoved,
  handlePublishComplete,
  handlePublishPubliclyAvailable,
  handlePublishFailed,
};
