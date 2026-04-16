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
  activeTasks: jest.fn().mockResolvedValue([{ producerId: 'p1', producerName: 'x', phase: 'em_producao_design', count: 2, tasks: [] }]),
  avgPhaseDuration: jest.fn().mockResolvedValue([{ producerId: 'p1', phase: 'em_producao_design', avgSeconds: 3600, medianSeconds: 3600, sampleSize: 4 }]),
  totalHours: jest.fn().mockResolvedValue([{ producerId: 'p1', productionSeconds: 7200 }]),
  overdue: jest.fn().mockResolvedValue([{ producerId: 'p1', count: 1, tasks: [] }]),
  phaseDistribution: jest.fn().mockResolvedValue([{ producerId: 'p1', phase: 'em_producao_design', count: 3 }]),
  weeklyHeatmap: jest.fn().mockResolvedValue([{ dayOfWeek: 1, hour: 10, seconds: 1800 }]),
  avgWorkTimeseries: jest.fn().mockResolvedValue([{ producerId: 'p1', bucket: '2026-04-10', avgSeconds: 5400 }]),
  clientSummary: jest.fn().mockResolvedValue({ totalPublished: 3, byPlatform: { instagram: 2, tiktok: 1, youtube: 0 }, byPostType: { reel: 2, carousel: 1 } }),
  publishedList: jest.fn().mockResolvedValue([{ deliveryId: 'd1', title: 'X', publishedAt: new Date().toISOString(), platform: 'instagram', permalink: 'https://instagram.com/p/1', postType: 'reel', producersByPhase: { design: 'Ana' }, firstApproval: true }]),
  clientFirstApprovalRate: jest.fn().mockResolvedValue({ total: 2, firstApproved: 1, rate: 0.5 }),
  clientRejectionVolume: jest.fn().mockResolvedValue({ total: 1, byCategory: [{ category: 'capa', count: 1 }] }),
  clientAvgCycleTime: jest.fn().mockResolvedValue({ avgDaysStartToPublish: 4, medianDays: 3, byPostType: [{ postType: 'reel', avgDays: 5 }] }),
  clientResponsibilityHistory: jest.fn().mockResolvedValue([{ producerId: 'u1', producerName: 'Ana', producerType: 'designer', taskCount: 2, phases: ['design'] }]),
  publishedListToCsv: jest.fn().mockImplementation((rows) => `data_publicacao,titulo\n2026-04-10,X\n`),
}));

const mockClients = { c1: { id: 'c1', name: 'Dr X', account_manager_id: null }, c2: { id: 'c2', name: 'Dr Y', account_manager_id: 'otherManagerUser' } };
jest.mock('../../config/db', () => {
  return jest.fn((table) => ({
    where(conditions) {
      return {
        first: () => {
          if (table === 'clients' && conditions?.id) {
            return Promise.resolve(mockClients[conditions.id] || null);
          }
          return Promise.resolve(null);
        },
      };
    },
  }));
});

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

describe('GET /api/reports/capacity — happy paths', () => {
  beforeEach(() => { userForRequest.role = 'manager'; userForRequest.id = 'u1'; });

  test('active-tasks returns 200', async () => {
    const res = await request(buildApp())
      .get('/api/reports/capacity/active-tasks')
      .query({ start: '2026-04-01', end: '2026-04-30' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('total-hours returns 200 with productionSeconds', async () => {
    const res = await request(buildApp())
      .get('/api/reports/capacity/total-hours')
      .query({ start: '2026-04-01', end: '2026-04-30' });
    expect(res.status).toBe(200);
    expect(res.body[0].productionSeconds).toBe(7200);
  });

  test('weekly-heatmap returns 200 with the grid', async () => {
    const res = await request(buildApp())
      .get('/api/reports/capacity/weekly-heatmap')
      .query({ start: '2026-04-01', end: '2026-04-30' });
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ dayOfWeek: 1, hour: 10, seconds: 1800 });
  });
});

describe('GET /api/reports/capacity — scoping', () => {
  test('producer gets producerId rewritten and row filtered', async () => {
    userForRequest.role = 'producer';
    userForRequest.id = 'p1';
    const res = await request(buildApp())
      .get('/api/reports/capacity/total-hours')
      .query({ start: '2026-04-01', end: '2026-04-30', producerId: 'otherUser' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].producerId).toBe('p1');
  });

  test('account_manager gets 403 on capacity', async () => {
    userForRequest.role = 'account_manager';
    const res = await request(buildApp())
      .get('/api/reports/capacity/total-hours')
      .query({ start: '2026-04-01', end: '2026-04-30' });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/reports/client/:clientId — happy paths', () => {
  beforeEach(() => { userForRequest.role = 'manager'; userForRequest.id = 'u1'; });

  test('summary returns 200 with totals and breakdowns', async () => {
    const res = await request(buildApp())
      .get('/api/reports/client/c1/summary')
      .query({ start: '2026-04-01', end: '2026-04-30' });
    expect(res.status).toBe(200);
    expect(res.body.totalPublished).toBe(3);
    expect(res.body.byPlatform.instagram).toBe(2);
  });

  test('published-list returns 200 with detail rows', async () => {
    const res = await request(buildApp())
      .get('/api/reports/client/c1/published-list')
      .query({ start: '2026-04-01', end: '2026-04-30' });
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ platform: 'instagram', firstApproval: true });
  });

  test('published-list.csv returns 200 text/csv', async () => {
    const res = await request(buildApp())
      .get('/api/reports/client/c1/published-list.csv')
      .query({ start: '2026-04-01', end: '2026-04-30' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.text).toContain('data_publicacao');
  });

  test('rejection-volume returns byCategory', async () => {
    const res = await request(buildApp())
      .get('/api/reports/client/c1/rejection-volume')
      .query({ start: '2026-04-01', end: '2026-04-30' });
    expect(res.status).toBe(200);
    expect(res.body.byCategory[0]).toMatchObject({ category: 'capa', count: 1 });
  });
});

describe('GET /api/reports/client/:clientId — scoping', () => {
  test('account_manager is blocked from a client not theirs (403)', async () => {
    userForRequest.role = 'account_manager';
    userForRequest.id = 'amUser';
    const res = await request(buildApp())
      .get('/api/reports/client/c2/summary')
      .query({ start: '2026-04-01', end: '2026-04-30' });
    expect(res.status).toBe(403);
  });

  test('producer gets 403 on client feature', async () => {
    userForRequest.role = 'producer';
    const res = await request(buildApp())
      .get('/api/reports/client/c1/summary')
      .query({ start: '2026-04-01', end: '2026-04-30' });
    expect(res.status).toBe(403);
  });

  test('client role gets 403', async () => {
    userForRequest.role = 'client';
    const res = await request(buildApp())
      .get('/api/reports/client/c1/summary')
      .query({ start: '2026-04-01', end: '2026-04-30' });
    expect(res.status).toBe(403);
  });
});
