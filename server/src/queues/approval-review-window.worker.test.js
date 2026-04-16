const mockNotify = jest.fn().mockResolvedValue(undefined);

jest.mock('../modules/notifications/notifications.service', () => ({
  notifyBatchReviewWindow: (...args) => mockNotify(...args),
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

const dbState = {
  approval_batches: {},
  approval_items: [],
  updates: [],
};

jest.mock('../config/db', () => {
  return jest.fn((table) => {
    const builder = {
      _table: table,
      _where: null,
      where(c) { this._where = c; return this; },
      whereIn() { return this; },
      whereRaw() { return this; },
      select() { return this; },
      orderBy() { return this; },
      first() {
        if (this._table === 'approval_batches') {
          return Promise.resolve(dbState.approval_batches[this._where.id] || null);
        }
        return Promise.resolve(null);
      },
      then(resolve) {
        if (this._table === 'approval_items') {
          const rows = dbState.approval_items.filter((i) => i.batch_id === this._where.batch_id);
          return Promise.resolve(rows).then(resolve);
        }
        return Promise.resolve([]).then(resolve);
      },
      update(patch) {
        if (this._table === 'approval_batches') {
          dbState.updates.push({ table: 'approval_batches', where: this._where, patch });
          const row = dbState.approval_batches[this._where.id];
          if (row) Object.assign(row, patch);
        }
        return Promise.resolve(1);
      },
    };
    return builder;
  });
});

// Import the handler directly (the worker file exports it for testing)
const { runWindowJob } = require('./approval-review-window.worker');

beforeEach(() => {
  mockNotify.mockClear();
  dbState.approval_batches = {};
  dbState.approval_items = [];
  dbState.updates = [];
});

describe('approval-review-window worker', () => {
  test('fires the dispatcher for an open window and marks fired_at', async () => {
    const startedAt = new Date('2026-04-15T10:00:00Z');
    dbState.approval_batches.b1 = { id: 'b1', social_media_id: 'sm1', client_id: 'c1', review_window_started_at: startedAt, review_window_fired_at: null };
    dbState.approval_items = [
      { id: 'i1', batch_id: 'b1', status: 'approved', responded_at: new Date('2026-04-15T10:01:00Z'), delivery_id: 'd1' },
      { id: 'i2', batch_id: 'b1', status: 'pending',  responded_at: null,                              delivery_id: 'd2' },
    ];
    await runWindowJob({ data: { batchId: 'b1' } });
    expect(mockNotify).toHaveBeenCalledTimes(1);
    const [batchArg, itemsArg] = mockNotify.mock.calls[0];
    expect(batchArg.id).toBe('b1');
    expect(itemsArg).toHaveLength(1);
    expect(itemsArg[0].id).toBe('i1');
    expect(dbState.updates.find((u) => u.patch.review_window_fired_at)).toBeTruthy();
  });

  test('idempotent: a second run when fired_at is set is a no-op', async () => {
    dbState.approval_batches.b1 = { id: 'b1', review_window_started_at: new Date('2026-04-15T10:00:00Z'), review_window_fired_at: new Date('2026-04-15T10:08:00Z') };
    dbState.approval_items = [{ id: 'i1', batch_id: 'b1', status: 'approved', responded_at: new Date('2026-04-15T10:01:00Z') }];
    await runWindowJob({ data: { batchId: 'b1' } });
    expect(mockNotify).not.toHaveBeenCalled();
  });

  test('only includes items reviewed during this window', async () => {
    const startedAt = new Date('2026-04-15T10:00:00Z');
    dbState.approval_batches.b1 = { id: 'b1', review_window_started_at: startedAt, review_window_fired_at: null };
    dbState.approval_items = [
      { id: 'old', batch_id: 'b1', status: 'approved', responded_at: new Date('2026-04-15T09:00:00Z') },
      { id: 'new', batch_id: 'b1', status: 'approved', responded_at: new Date('2026-04-15T10:03:00Z') },
    ];
    await runWindowJob({ data: { batchId: 'b1' } });
    const [, itemsArg] = mockNotify.mock.calls[0];
    expect(itemsArg.map((i) => i.id)).toEqual(['new']);
  });
});
