const request = require('supertest');
const express = require('express');

// In-memory store simulating scheduled_posts
const store = {
  rows: [],
  inserted: [],
  deleted: [],
  updated: [],
  reset() {
    this.rows = [];
    this.inserted = [];
    this.deleted = [];
    this.updated = [];
  },
};

jest.mock('../../config/db', () => {
  const db = jest.fn((table) => {
    const qb = {
      _table: table,
      _where: null,
      where(c) { this._where = c; return this; },
      // NOTE: whereIn is a no-op pass-through; controller must use per-row .where({id}).del()
      whereIn() { return this; },
      select() { return this; },
      // Allow `await db(table).where(cond)` to return matching rows as an array
      then(resolve, reject) {
        try {
          if (this._table !== 'scheduled_posts') return resolve([]);
          const cond = this._where || {};
          const results = store.rows.filter((r) =>
            Object.entries(cond).every(([k, v]) => r[k] === v),
          );
          resolve(results);
        } catch (e) {
          reject(e);
        }
      },
      first() {
        if (this._table !== 'scheduled_posts') return Promise.resolve(null);
        const row = store.rows.find((r) => r.id === (this._where && this._where.id));
        return Promise.resolve(row || null);
      },
      del() {
        if (this._table !== 'scheduled_posts') return Promise.resolve(0);
        const before = store.rows.length;
        store.rows = store.rows.filter((r) => r.id !== this._where.id);
        store.deleted.push(this._where.id);
        return Promise.resolve(before - store.rows.length);
      },
      insert(row) {
        const inserted = { id: `row-${store.rows.length + 1}`, ...row };
        store.rows.push(inserted);
        store.inserted.push(inserted);
        return { returning: () => Promise.resolve([inserted]) };
      },
      update(patch) {
        const row = store.rows.find((r) => r.id === (this._where && this._where.id));
        if (row) Object.assign(row, patch);
        store.updated.push({ id: this._where && this._where.id, patch });
        return { returning: () => Promise.resolve([row]) };
      },
    };
    return qb;
  });
  return db;
});

jest.mock('../../queues', () => ({
  schedulePost: jest.fn().mockResolvedValue(undefined),
  reschedulePost: jest.fn().mockResolvedValue(undefined),
  cancelScheduledPost: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../middleware/auth', () => ({
  authenticate: (req, _res, next) => { req.user = { id: 'user-1' }; next(); },
  managementLevel: (_req, _res, next) => next(),
  managementOrSocialMedia: (_req, _res, next) => next(),
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

jest.mock('../webhooks/clickup.service', () => ({
  moveToAgendado: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../webhooks/clickup-oauth.service', () => ({
  getDecryptedToken: jest.fn().mockResolvedValue('fake-token'),
}));

jest.mock('./instagram-oauth.service', () => ({
  getAuthorizationUrl: jest.fn(),
  parseState: jest.fn(),
  handleCallback: jest.fn(),
  getConnectionStatus: jest.fn(),
  disconnectClient: jest.fn(),
}));

jest.mock('./instagram-publish.service', () => ({
  uploadToPermanentStorage: jest.fn(),
  getTempMedia: jest.fn(),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/instagram', require('./instagram.routes'));
  return app;
}

function seedInstagramPost(overrides = {}) {
  const row = {
    id: 'post-ig',
    client_id: 'client-1',
    delivery_id: 'deliv-1',
    clickup_task_id: 'task-abc',
    caption: 'hello',
    post_type: 'reel',
    media_urls: JSON.stringify([{ url: 'https://x/a.mp4', type: 'video', order: 0 }]),
    thumbnail_url: null,
    scheduled_at: null,
    platform: 'instagram',
    post_group_id: null,
    status: 'draft',
    created_by: 'user-1',
    ...overrides,
  };
  store.rows.push(row);
  return row;
}

beforeEach(() => {
  store.reset();
  const queues = require('../../queues');
  for (const fn of Object.values(queues)) {
    if (typeof fn === 'function' && typeof fn.mockClear === 'function') fn.mockClear();
  }
});

describe('PUT /api/instagram/scheduled/:id — platform reconciliation', () => {
  test('adding tiktok to an instagram-only post creates a sibling tiktok row and shares post_group_id', async () => {
    seedInstagramPost();
    const res = await request(buildApp())
      .put('/api/instagram/scheduled/post-ig')
      .send({ platforms: ['instagram', 'tiktok'] });
    expect(res.status).toBe(200);
    const tiktok = store.rows.find((r) => r.platform === 'tiktok');
    expect(tiktok).toBeTruthy();
    expect(tiktok.clickup_task_id).toBe('task-abc');
    expect(tiktok.post_type).toBe('reel');
    const groupIds = new Set(store.rows.map((r) => r.post_group_id));
    expect(groupIds.size).toBe(1);
    expect([...groupIds][0]).toBeTruthy();
  });

  test('removing tiktok from a multi-platform group deletes the draft tiktok row and nulls post_group_id on the survivor', async () => {
    const gid = 'group-1';
    seedInstagramPost({ post_group_id: gid });
    seedInstagramPost({ id: 'post-tt', platform: 'tiktok', post_group_id: gid });
    const res = await request(buildApp())
      .put('/api/instagram/scheduled/post-ig')
      .send({ platforms: ['instagram'] });
    expect(res.status).toBe(200);
    expect(store.rows.find((r) => r.id === 'post-tt')).toBeUndefined();
    expect(store.deleted).toContain('post-tt');
    const survivor = store.rows.find((r) => r.id === 'post-ig');
    expect(survivor.post_group_id).toBeNull();
    const { cancelScheduledPost } = require('../../queues');
    expect(cancelScheduledPost).toHaveBeenCalledWith('post-tt');
  });

  test('removing a published platform is refused and leaves the row intact', async () => {
    const gid = 'group-1';
    seedInstagramPost({ status: 'published', post_group_id: gid });
    seedInstagramPost({ id: 'post-tt', platform: 'tiktok', post_group_id: gid });
    const res = await request(buildApp())
      .put('/api/instagram/scheduled/post-tt')
      .send({ platforms: ['tiktok'] });
    expect(res.status).toBe(409);
    expect(store.rows.find((r) => r.id === 'post-ig').status).toBe('published');
  });

  test('story post_type silently skips tiktok row creation', async () => {
    seedInstagramPost({ post_type: 'story' });
    const res = await request(buildApp())
      .put('/api/instagram/scheduled/post-ig')
      .send({ platforms: ['instagram', 'tiktok'] });
    expect(res.status).toBe(200);
    expect(store.rows.filter((r) => r.platform === 'tiktok')).toHaveLength(0);
  });

  test('platform_overrides apply the caption override only to tiktok', async () => {
    seedInstagramPost();
    const res = await request(buildApp())
      .put('/api/instagram/scheduled/post-ig')
      .send({
        caption: 'ig caption',
        platforms: ['instagram', 'tiktok'],
        platform_overrides: { tiktok: { caption: 'tiktok caption' } },
      });
    expect(res.status).toBe(200);
    const ig = store.rows.find((r) => r.platform === 'instagram');
    const tt = store.rows.find((r) => r.platform === 'tiktok');
    expect(ig).toBeTruthy();
    expect(tt).toBeTruthy();
    expect(ig.caption).toBe('ig caption');
    expect(tt.caption).toBe('tiktok caption');
  });

  test('request with no platforms field still updates the single post (backward compat)', async () => {
    seedInstagramPost();
    const res = await request(buildApp())
      .put('/api/instagram/scheduled/post-ig')
      .send({ caption: 'edited' });
    expect(res.status).toBe(200);
    expect(store.rows.find((r) => r.id === 'post-ig').caption).toBe('edited');
    expect(store.rows.filter((r) => r.platform === 'tiktok')).toHaveLength(0);
  });
});
