const crypto = require('crypto');

jest.mock('../../config/env', () => ({
  tiktok: { clientSecret: 'test-client-secret' },
}));

const { verifySignature, parseSignatureHeader } = require('./tiktok-webhook.service');

const SECRET = 'test-client-secret';
const BODY = '{"client_key":"k","event":"authorization.removed","create_time":1,"user_openid":"o","content":"{\\"reason\\":1}"}';

function sign(body, timestamp, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

describe('parseSignatureHeader', () => {
  test('parses valid header', () => {
    expect(parseSignatureHeader('t=1633174587,s=abc123')).toEqual({ timestamp: '1633174587', signature: 'abc123' });
  });

  test('parses header with spaces', () => {
    expect(parseSignatureHeader('t=1633174587, s=abc123')).toEqual({ timestamp: '1633174587', signature: 'abc123' });
  });

  test('returns null for missing parts', () => {
    expect(parseSignatureHeader('t=1633174587')).toBeNull();
    expect(parseSignatureHeader('s=abc123')).toBeNull();
    expect(parseSignatureHeader('')).toBeNull();
    expect(parseSignatureHeader(undefined)).toBeNull();
  });
});

describe('verifySignature', () => {
  const now = 1_700_000_000;

  test('accepts valid signature within tolerance', () => {
    const t = now - 10;
    const header = `t=${t},s=${sign(BODY, t)}`;
    expect(verifySignature(BODY, header, { now })).toBe(true);
  });

  test('rejects tampered body', () => {
    const t = now;
    const header = `t=${t},s=${sign(BODY, t)}`;
    expect(verifySignature(`${BODY}x`, header, { now })).toBe(false);
  });

  test('rejects wrong secret', () => {
    const t = now;
    const header = `t=${t},s=${sign(BODY, t, 'wrong-secret')}`;
    expect(verifySignature(BODY, header, { now })).toBe(false);
  });

  test('rejects timestamp older than 300 seconds', () => {
    const t = now - 301;
    const header = `t=${t},s=${sign(BODY, t)}`;
    expect(verifySignature(BODY, header, { now })).toBe(false);
  });

  test('rejects timestamp more than 300 seconds in the future', () => {
    const t = now + 301;
    const header = `t=${t},s=${sign(BODY, t)}`;
    expect(verifySignature(BODY, header, { now })).toBe(false);
  });

  test('rejects malformed header', () => {
    expect(verifySignature(BODY, 'not-a-signature', { now })).toBe(false);
    expect(verifySignature(BODY, undefined, { now })).toBe(false);
    expect(verifySignature(BODY, '', { now })).toBe(false);
  });

  test('rejects when client_secret is not configured', () => {
    const t = now;
    const header = `t=${t},s=${sign(BODY, t, '')}`;
    expect(verifySignature(BODY, header, { now, clientSecret: '' })).toBe(false);
  });

  test('rejects signature with wrong hex length (timing-safe guard)', () => {
    const t = now;
    const header = `t=${t},s=abc`;
    expect(verifySignature(BODY, header, { now })).toBe(false);
  });

  test('rejects non-hex signature characters', () => {
    const t = now;
    const header = `t=${t},s=${'z'.repeat(64)}`;
    expect(verifySignature(BODY, header, { now })).toBe(false);
  });

  test('rejects null rawBody', () => {
    const t = now;
    const header = `t=${t},s=${sign(BODY, t)}`;
    expect(verifySignature(null, header, { now })).toBe(false);
    expect(verifySignature(undefined, header, { now })).toBe(false);
  });
});

// ---- processEvent / handlers ----

const mockDb = {
  inserts: [],
  updates: [],
};

jest.mock('../../config/db', () => {
  return jest.fn((table) => {
    const builder = {
      _table: table,
      _where: null,
      where(conditions) { this._where = conditions; return this; },
      first() { return Promise.resolve(mockDb.firstResult || null); },
      insert(row) {
        mockDb.inserts.push({ table: this._table, row });
        return {
          returning: () => Promise.resolve([{ id: 'evt-1', ...row }]),
        };
      },
      update(row) {
        mockDb.updates.push({ table: this._table, where: this._where, row });
        return Promise.resolve(1);
      },
    };
    return builder;
  });
});

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../utils/event-bus', () => ({
  emit: jest.fn(),
}));

const service = require('./tiktok-webhook.service');
const eventBus = require('../../utils/event-bus');

beforeEach(() => {
  mockDb.inserts.length = 0;
  mockDb.updates.length = 0;
  mockDb.firstResult = null;
  eventBus.emit.mockClear();
});

describe('processEvent', () => {
  test('logs every event to webhook_events with source=tiktok', async () => {
    const event = {
      client_key: 'k', event: 'post.publish.complete', create_time: 1,
      user_openid: 'o', content: JSON.stringify({ publish_id: 'p-1', publish_type: 'DIRECT_POST' }),
    };
    await service.processEvent(event);
    expect(mockDb.inserts).toHaveLength(1);
    expect(mockDb.inserts[0]).toMatchObject({
      table: 'webhook_events',
      row: expect.objectContaining({ source: 'tiktok', event_type: 'post.publish.complete' }),
    });
  });

  test('authorization.removed marks client tokens inactive', async () => {
    mockDb.firstResult = { id: 'tok-1', client_id: 'client-123' };
    const event = {
      client_key: 'k', event: 'authorization.removed', create_time: 1,
      user_openid: 'open-abc', content: JSON.stringify({ reason: 1 }),
    };
    await service.processEvent(event);
    const tokUpdate = mockDb.updates.find((u) => u.table === 'client_tiktok_tokens');
    expect(tokUpdate).toBeTruthy();
    expect(tokUpdate.where).toEqual({ tiktok_open_id: 'open-abc' });
    expect(tokUpdate.row).toMatchObject({ is_active: false });
  });

  test('post.publish.complete marks scheduled_post published and emits SSE', async () => {
    mockDb.firstResult = { id: 'post-1', client_id: 'client-1', delivery_id: null };
    const event = {
      client_key: 'k', event: 'post.publish.complete', create_time: 1, user_openid: 'o',
      content: JSON.stringify({ publish_id: 'pub-1', publish_type: 'DIRECT_POST' }),
    };
    await service.processEvent(event);
    const update = mockDb.updates.find((u) => u.table === 'scheduled_posts');
    expect(update).toBeTruthy();
    expect(update.where).toEqual({ tiktok_publish_id: 'pub-1' });
    expect(update.row).toMatchObject({ status: 'published' });
    expect(eventBus.emit).toHaveBeenCalledWith('post:updated', expect.objectContaining({ id: 'post-1' }));
  });

  test('post.publish.publicly_available saves tiktok post_id in permalink', async () => {
    mockDb.firstResult = { id: 'post-1', client_id: 'client-1', tiktok_username: 'johndoe' };
    const event = {
      client_key: 'k', event: 'post.publish.publicly_available', create_time: 1, user_openid: 'o',
      content: JSON.stringify({ publish_id: 'pub-1', post_id: '7300000000000000000', publish_type: 'DIRECT_POST' }),
    };
    await service.processEvent(event);
    const update = mockDb.updates.find((u) => u.table === 'scheduled_posts');
    expect(update.row.tiktok_permalink).toContain('7300000000000000000');
  });

  test('post.publish.failed marks scheduled_post failed with error_message', async () => {
    mockDb.firstResult = { id: 'post-1', client_id: 'client-1' };
    const event = {
      client_key: 'k', event: 'post.publish.failed', create_time: 1, user_openid: 'o',
      content: JSON.stringify({ publish_id: 'pub-1', reason: 'video_too_long', publish_type: 'DIRECT_POST' }),
    };
    await service.processEvent(event);
    const update = mockDb.updates.find((u) => u.table === 'scheduled_posts');
    expect(update.row).toMatchObject({ status: 'failed' });
    expect(update.row.error_message).toContain('video_too_long');
  });

  test('unknown events are logged but not fatal', async () => {
    const event = { client_key: 'k', event: 'something.weird', create_time: 1, user_openid: 'o', content: '{}' };
    await expect(service.processEvent(event)).resolves.toBeUndefined();
    expect(mockDb.inserts).toHaveLength(1);
  });

  test('malformed content string does not throw', async () => {
    const event = { client_key: 'k', event: 'post.publish.complete', create_time: 1, user_openid: 'o', content: 'not-json' };
    await expect(service.processEvent(event)).resolves.toBeUndefined();
  });
});
