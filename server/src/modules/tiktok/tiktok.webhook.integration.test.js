const request = require('supertest');
const express = require('express');

jest.mock('../../config/db', () => jest.fn(() => ({
  where: () => ({ first: () => Promise.resolve(null), update: () => Promise.resolve(1) }),
  insert: () => ({ returning: () => Promise.resolve([]) }),
})));

jest.mock('./tiktok-oauth.service', () => ({
  getAuthorizationUrl: jest.fn(),
  parseState: jest.fn(),
  handleCallback: jest.fn(),
  getConnectionStatus: jest.fn(),
  disconnectClient: jest.fn(),
}));

jest.mock('./tiktok-webhook.service', () => ({
  verifySignature: jest.fn(),
  processEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../middleware/auth', () => ({
  authenticate: (req, _res, next) => next(),
  managementLevel: (_req, _res, next) => next(),
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

const webhookService = require('./tiktok-webhook.service');

function buildApp() {
  const app = express();
  app.use(express.json({
    verify: (req, _res, buf) => {
      if (req.url === '/api/tiktok/webhook') req.rawBody = buf.toString();
    },
  }));
  app.use('/api/tiktok', require('./tiktok.routes'));
  return app;
}

describe('POST /api/tiktok/webhook', () => {
  beforeEach(() => {
    webhookService.verifySignature.mockReset();
    webhookService.processEvent.mockClear();
    webhookService.processEvent.mockResolvedValue(undefined);
  });

  test('returns 200 and dispatches when signature is valid', async () => {
    webhookService.verifySignature.mockReturnValue(true);
    const body = { client_key: 'k', event: 'authorization.removed', create_time: 1, user_openid: 'o', content: '{}' };
    const res = await request(buildApp())
      .post('/api/tiktok/webhook')
      .set('Tiktok-Signature', 't=1,s=deadbeef')
      .send(body);
    expect(res.status).toBe(200);
    expect(webhookService.processEvent).toHaveBeenCalledWith(body);
  });

  test('returns 401 when signature is invalid', async () => {
    webhookService.verifySignature.mockReturnValue(false);
    const res = await request(buildApp())
      .post('/api/tiktok/webhook')
      .set('Tiktok-Signature', 't=1,s=bad')
      .send({ event: 'whatever' });
    expect(res.status).toBe(401);
    expect(webhookService.processEvent).not.toHaveBeenCalled();
  });

  test('returns 200 even if processEvent throws (async swallow)', async () => {
    webhookService.verifySignature.mockReturnValue(true);
    webhookService.processEvent.mockRejectedValueOnce(new Error('db down'));
    const res = await request(buildApp())
      .post('/api/tiktok/webhook')
      .set('Tiktok-Signature', 't=1,s=ok')
      .send({ event: 'post.publish.complete', content: '{}' });
    expect(res.status).toBe(200);
  });
});
