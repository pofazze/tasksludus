const mockEnqueue = jest.fn().mockResolvedValue(undefined);
const mockPromote = jest.fn().mockResolvedValue(undefined);

jest.mock('../../queues', () => ({
  enqueueApprovalReviewWindow: (...a) => mockEnqueue(...a),
  promoteApprovalReviewWindow: (...a) => mockPromote(...a),
  approvalReminderQueue: { getRepeatableJobs: jest.fn().mockResolvedValue([]), removeRepeatableByKey: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../webhooks/clickup-oauth.service', () => ({ getDecryptedToken: jest.fn().mockResolvedValue('tok') }));
jest.mock('../evolution/evolution.service', () => ({ sendText: jest.fn(), buildPersonalJid: (p) => `${p}@s.whatsapp.net` }));
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../utils/event-bus', () => ({ emit: jest.fn() }));

global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

const dbState = {
  approval_batches: {
    b1: {
      id: 'b1', token: 'tok-1', status: 'pending', client_id: 'c1', social_media_id: 'sm1',
      review_window_started_at: null, review_window_fired_at: null,
      client_name: 'Cliente Demo',
    },
  },
  approval_items: [
    { id: 'i1', batch_id: 'b1', delivery_id: 'd1', status: 'pending' },
    { id: 'i2', batch_id: 'b1', delivery_id: 'd2', status: 'pending' },
  ],
  deliveries: { d1: { id: 'd1', clickup_task_id: 'tA' }, d2: { id: 'd2', clickup_task_id: 'tB' } },
  updates: [],
};

jest.mock('../../config/db', () => {
  return jest.fn((table) => {
    const builder = {
      _table: table,
      _where: null,
      where(c, v) {
        if (typeof c === 'string' && v !== undefined) {
          if (!this._where || typeof this._where !== 'object') this._where = {};
          // strip table qualifier e.g. 'approval_batches.token' → 'token'
          const key = c.includes('.') ? c.split('.').pop() : c;
          this._where[key] = v;
        } else {
          this._where = c;
        }
        return this;
      },
      join() { return this; },
      select() { return this; },
      count(col) { this._countCol = col; return this; },
      first() {
        if (this._table === 'approval_batches' && this._where?.token) {
          return Promise.resolve(dbState.approval_batches.b1);
        }
        if (this._table === 'approval_batches' && this._where?.id) {
          return Promise.resolve(dbState.approval_batches[this._where.id] || null);
        }
        if (this._table === 'approval_items') {
          if (this._countCol) {
            const pending = dbState.approval_items.filter((i) => i.batch_id === this._where.batch_id && i.status === this._where.status).length;
            return Promise.resolve({ count: String(pending) });
          }
          const found = dbState.approval_items.find((i) => i.id === this._where.id && i.batch_id === this._where.batch_id);
          return Promise.resolve(found || null);
        }
        if (this._table === 'deliveries') {
          return Promise.resolve(dbState.deliveries[this._where.id] || null);
        }
        return Promise.resolve(null);
      },
      update(patch) {
        dbState.updates.push({ table: this._table, where: this._where, patch });
        if (this._table === 'approval_items') {
          const item = dbState.approval_items.find((i) => i.id === this._where.id);
          if (item) Object.assign(item, patch);
          return { returning: () => Promise.resolve([item]) };
        }
        if (this._table === 'approval_batches') {
          const b = dbState.approval_batches[this._where.id];
          if (b) Object.assign(b, patch);
        }
        return Promise.resolve(1);
      },
    };
    return builder;
  });
});

const service = require('./approvals.service');

beforeEach(() => {
  mockEnqueue.mockClear();
  mockPromote.mockClear();
  dbState.updates = [];
  dbState.approval_batches.b1.status = 'pending';
  dbState.approval_batches.b1.review_window_started_at = null;
  dbState.approval_batches.b1.review_window_fired_at = null;
  dbState.approval_items.forEach((i) => { i.status = 'pending'; i.responded_at = null; });
});

describe('clientRespond — review window trigger', () => {
  test('first review of the batch enqueues the window job and sets started_at', async () => {
    await service.clientRespond({ token: 'tok-1', itemId: 'i1', status: 'approved' });
    const batchUpdate = dbState.updates.find((u) => u.table === 'approval_batches' && u.patch.review_window_started_at);
    expect(batchUpdate).toBeTruthy();
    expect(mockEnqueue).toHaveBeenCalledWith('b1');
  });

  test('second review with one still pending does not re-enqueue or promote', async () => {
    dbState.approval_batches.b1.review_window_started_at = new Date('2026-04-16T10:00:00Z');
    dbState.approval_items[0].status = 'approved';
    await service.clientRespond({ token: 'tok-1', itemId: 'i2', status: 'approved' });
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockPromote).toHaveBeenCalledWith('b1');
  });

  test('persists rejection_target when provided', async () => {
    await service.clientRespond({ token: 'tok-1', itemId: 'i1', status: 'rejected', rejectionReason: 'fix it', rejectionTarget: 'cover' });
    const itemUpdate = dbState.updates.find((u) => u.table === 'approval_items');
    expect(itemUpdate.patch.rejection_target).toBe('cover');
  });

  test('review after fired_at opens a new window', async () => {
    dbState.approval_batches.b1.review_window_started_at = new Date('2026-04-16T10:00:00Z');
    dbState.approval_batches.b1.review_window_fired_at = new Date('2026-04-16T10:08:00Z');
    await service.clientRespond({ token: 'tok-1', itemId: 'i1', status: 'approved' });
    const batchUpdate = dbState.updates.find((u) => u.table === 'approval_batches' && u.patch.review_window_started_at);
    expect(batchUpdate.patch.review_window_started_at).toBeInstanceOf(Date);
    expect(batchUpdate.patch.review_window_fired_at).toBeNull();
    expect(mockEnqueue).toHaveBeenCalledWith('b1');
  });
});
