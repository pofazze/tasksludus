const request = require('supertest');
const express = require('express');

const userForRequest = { id: 'u1', role: 'manager' };

jest.mock('../../middleware/auth', () => ({
  authenticate: (req, _res, next) => { req.user = userForRequest; next(); },
}));

jest.mock('./reports.service', () => ({
  firstApprovalRate: jest.fn().mockResolvedValue([{ producerId: 'p1', producerName: 'x', rate: 0.5, total: 2, firstApproved: 1 }]),
  rejectionRate: jest.fn().mockResolvedValue([]),
  reworkPerTask: jest.fn().mockResolvedValue([]),
  rejectionByCategory: jest.fn().mockResolvedValue([]),
  rejectionByPostType: jest.fn().mockResolvedValue([]),
  rejectionByTarget: jest.fn().mockResolvedValue([]),
  ranking: jest.fn().mockResolvedValue([{ producerId: 'p1', volume: 2, firstApprovalRate: 0.5, score: 1 }]),
  volumeTimeseries: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/reports', require('./reports.routes'));
  return app;
}

describe('GET /api/reports/quality — happy paths', () => {
  beforeEach(() => { userForRequest.role = 'manager'; });

  test('first-approval-rate returns 200 with the service payload', async () => {
    const res = await request(buildApp())
      .get('/api/reports/quality/first-approval-rate')
      .query({ start: '2026-04-01', end: '2026-04-30' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].producerId).toBe('p1');
  });

  test('ranking returns 200', async () => {
    const res = await request(buildApp())
      .get('/api/reports/quality/ranking')
      .query({ start: '2026-04-01', end: '2026-04-30' });
    expect(res.status).toBe(200);
  });

  test('400 when start / end missing', async () => {
    const res = await request(buildApp())
      .get('/api/reports/quality/first-approval-rate');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/reports/quality — scoping', () => {
  test('producer sees only their own row in ranking', async () => {
    userForRequest.role = 'producer';
    userForRequest.id = 'p1';
    const res = await request(buildApp())
      .get('/api/reports/quality/ranking')
      .query({ start: '2026-04-01', end: '2026-04-30', producerId: 'someoneElse' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].producerId).toBe('p1');
  });

  test('account_manager gets 403 on quality', async () => {
    userForRequest.role = 'account_manager';
    const res = await request(buildApp())
      .get('/api/reports/quality/first-approval-rate')
      .query({ start: '2026-04-01', end: '2026-04-30' });
    expect(res.status).toBe(403);
  });

  test('client gets 403 on quality', async () => {
    userForRequest.role = 'client';
    const res = await request(buildApp())
      .get('/api/reports/quality/ranking')
      .query({ start: '2026-04-01', end: '2026-04-30' });
    expect(res.status).toBe(403);
  });
});
