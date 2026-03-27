const { Router } = require('express');
const jwt = require('jsonwebtoken');
const db = require('../../config/db');
const env = require('../../config/env');
const eventBus = require('../../utils/event-bus');
const logger = require('../../utils/logger');

const router = Router();

router.get('/stream', async (req, res) => {
  // Auth: verify JWT from query param (EventSource can't send headers)
  const token = req.query.token;
  if (!token) return res.status(401).json({ error: 'Token required' });

  let user;
  try {
    const payload = jwt.verify(token, env.jwt.secret);
    if (payload.type !== 'access') return res.status(401).json({ error: 'Invalid token type' });
    user = await db('users').where({ id: payload.sub, is_active: true }).select('id', 'role').first();
    if (!user) return res.status(401).json({ error: 'User not found' });
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  // Forward all eventBus events to this client
  const onEvent = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  eventBus.on('sse', onEvent);

  // Heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30_000);

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    eventBus.off('sse', onEvent);
    logger.info('SSE client disconnected', { userId: user.id });
  });

  logger.info('SSE client connected', { userId: user.id });
});

module.exports = router;
