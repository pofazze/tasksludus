jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const state = {
  users: {},
  deliveries: {},
  approval_items: [],
  delivery_phases: [],
};

jest.mock('../../config/db', () => {
  return jest.fn((table) => {
    const qb = {
      _table: table,
      _where: null,
      _whereIn: null,
      _whereBetween: null,
      _orderBy: null,
      _groupBy: null,
      _rawExpr: null,
      where(cond) { this._where = cond; return this; },
      whereIn(col, vals) { this._whereIn = { col, vals }; return this; },
      whereBetween(col, range) { this._whereBetween = { col, range }; return this; },
      andWhere(cond) { this._where = { ...(this._where || {}), ...cond }; return this; },
      select() { return this; },
      orderBy(col, dir) { this._orderBy = { col, dir }; return this; },
      groupBy(...cols) { this._groupBy = cols; return this; },
      count() { return this; },
      first() {
        if (this._table === 'users' && this._where?.id) {
          return Promise.resolve(state.users[this._where.id] || null);
        }
        return Promise.resolve(null);
      },
      then(resolve) {
        let rows;
        if (this._table === 'delivery_phases') rows = state.delivery_phases;
        else if (this._table === 'approval_items') rows = state.approval_items;
        else if (this._table === 'deliveries') rows = Object.values(state.deliveries);
        else if (this._table === 'users') rows = Object.values(state.users);
        else rows = [];

        if (this._where) {
          rows = rows.filter((r) => Object.keys(this._where).every((k) => r[k] === this._where[k]));
        }
        if (this._whereIn) {
          rows = rows.filter((r) => this._whereIn.vals.includes(r[this._whereIn.col]));
        }
        if (this._whereBetween) {
          const [lo, hi] = this._whereBetween.range;
          rows = rows.filter((r) => {
            const v = r[this._whereBetween.col];
            return v !== null && v !== undefined && v >= lo && v <= hi;
          });
        }
        if (this._orderBy) {
          const { col, dir } = this._orderBy;
          rows = [...rows].sort((a, b) => {
            const av = a[col]; const bv = b[col];
            const cmp = av > bv ? 1 : av < bv ? -1 : 0;
            return dir === 'desc' ? -cmp : cmp;
          });
        }
        return Promise.resolve(rows).then(resolve);
      },
    };
    return qb;
  });
});

const reports = require('./reports.service');

beforeEach(() => {
  state.users = {};
  state.deliveries = {};
  state.approval_items = [];
  state.delivery_phases = [];
});

function seedUser(u) { state.users[u.id] = { producer_type: 'designer', ...u }; }
function seedDelivery(d) { state.deliveries[d.id] = { content_type: 'reel', client_id: 'c1', completed_at: new Date('2026-04-15T12:00:00Z'), ...d }; }
function seedPhase(p) { state.delivery_phases.push({ exited_at: null, duration_seconds: null, ...p }); }
function seedApproval(a) { state.approval_items.push({ status: 'approved', rejection_category: null, rejection_target: null, responded_at: new Date('2026-04-15T12:00:00Z'), ...a }); }

const RANGE = { start: new Date('2026-04-01T00:00:00Z'), end: new Date('2026-04-30T23:59:59Z') };

describe('firstApprovalRate', () => {
  test('counts deliveries with a single approved item and no rejections', async () => {
    seedUser({ id: 'u1', name: 'João' });
    seedDelivery({ id: 'd1' });
    seedDelivery({ id: 'd2' });
    seedPhase({ delivery_id: 'd1', user_id: 'u1', phase: 'em_producao_design', entered_at: new Date('2026-04-10'), exited_at: new Date('2026-04-10T02:00:00Z') });
    seedPhase({ delivery_id: 'd2', user_id: 'u1', phase: 'em_producao_design', entered_at: new Date('2026-04-12'), exited_at: new Date('2026-04-12T02:00:00Z') });
    seedApproval({ id: 'a1', delivery_id: 'd1', status: 'approved' });
    seedApproval({ id: 'a2', delivery_id: 'd2', status: 'rejected' });
    seedApproval({ id: 'a3', delivery_id: 'd2', status: 'approved' });
    const out = await reports.firstApprovalRate(RANGE);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ producerId: 'u1', producerName: 'João', total: 2, firstApproved: 1, rate: 0.5 });
  });
});

describe('rejectionRate', () => {
  test('ratio of rejected items to total items touched by the producer', async () => {
    seedUser({ id: 'u1', name: 'João' });
    seedDelivery({ id: 'd1' });
    seedPhase({ delivery_id: 'd1', user_id: 'u1', phase: 'em_producao_design', entered_at: new Date('2026-04-10') });
    seedApproval({ id: 'a1', delivery_id: 'd1', status: 'rejected' });
    seedApproval({ id: 'a2', delivery_id: 'd1', status: 'approved' });
    const out = await reports.rejectionRate(RANGE);
    expect(out[0]).toMatchObject({ producerId: 'u1', total: 2, rejected: 1, rate: 0.5 });
  });
});

describe('reworkPerTask', () => {
  test('average correcao phase openings per distinct delivery', async () => {
    seedUser({ id: 'u1', name: 'João' });
    seedDelivery({ id: 'd1' });
    seedDelivery({ id: 'd2' });
    seedPhase({ delivery_id: 'd1', user_id: 'u1', phase: 'em_producao_design', entered_at: new Date('2026-04-10') });
    seedPhase({ delivery_id: 'd2', user_id: 'u1', phase: 'em_producao_design', entered_at: new Date('2026-04-11') });
    seedPhase({ delivery_id: 'd1', phase: 'correcao', entered_at: new Date('2026-04-12') });
    seedPhase({ delivery_id: 'd1', phase: 'correcao', entered_at: new Date('2026-04-13') });
    const out = await reports.reworkPerTask(RANGE);
    expect(out[0]).toMatchObject({ producerId: 'u1', avgRework: 1 });
  });
});

describe('rejectionByCategory', () => {
  test('groups rejected items by category within the period', async () => {
    seedApproval({ id: 'a1', delivery_id: 'd1', status: 'rejected', rejection_category: 'capa' });
    seedApproval({ id: 'a2', delivery_id: 'd1', status: 'rejected', rejection_category: 'capa' });
    seedApproval({ id: 'a3', delivery_id: 'd1', status: 'rejected', rejection_category: 'texto' });
    const out = await reports.rejectionByCategory(RANGE);
    expect(out.sort((a, b) => a.category.localeCompare(b.category))).toEqual([
      { category: 'capa', count: 2 },
      { category: 'texto', count: 1 },
    ]);
  });
});

describe('rejectionByPostType', () => {
  test('groups by the delivery content_type and returns total + rejected + rate', async () => {
    seedDelivery({ id: 'd1', content_type: 'reel' });
    seedDelivery({ id: 'd2', content_type: 'reel' });
    seedDelivery({ id: 'd3', content_type: 'carrossel' });
    seedApproval({ id: 'a1', delivery_id: 'd1', status: 'rejected' });
    seedApproval({ id: 'a2', delivery_id: 'd2', status: 'approved' });
    seedApproval({ id: 'a3', delivery_id: 'd3', status: 'rejected' });
    const out = await reports.rejectionByPostType(RANGE);
    const reel = out.find((r) => r.postType === 'reel');
    const carr = out.find((r) => r.postType === 'carrossel');
    expect(reel).toMatchObject({ total: 2, rejected: 1, rate: 0.5 });
    expect(carr).toMatchObject({ total: 1, rejected: 1, rate: 1 });
  });
});

describe('rejectionByTarget', () => {
  test('groups by rejection_target cover/video', async () => {
    seedApproval({ id: 'a1', delivery_id: 'd1', status: 'rejected', rejection_target: 'cover' });
    seedApproval({ id: 'a2', delivery_id: 'd1', status: 'rejected', rejection_target: 'video' });
    seedApproval({ id: 'a3', delivery_id: 'd1', status: 'rejected', rejection_target: 'cover' });
    const out = await reports.rejectionByTarget(RANGE);
    const cover = out.find((r) => r.target === 'cover');
    const video = out.find((r) => r.target === 'video');
    expect(cover.count).toBe(2);
    expect(video.count).toBe(1);
  });
});

describe('ranking', () => {
  test('returns producers sorted by volume desc with score = firstApprovalRate', async () => {
    seedUser({ id: 'u1', name: 'João', producer_type: 'designer' });
    seedUser({ id: 'u2', name: 'Maria', producer_type: 'video_editor' });
    seedDelivery({ id: 'd1' });
    seedDelivery({ id: 'd2' });
    seedDelivery({ id: 'd3' });
    seedPhase({ delivery_id: 'd1', user_id: 'u1', phase: 'em_producao_design', entered_at: new Date('2026-04-10') });
    seedPhase({ delivery_id: 'd2', user_id: 'u1', phase: 'em_producao_design', entered_at: new Date('2026-04-11') });
    seedPhase({ delivery_id: 'd3', user_id: 'u2', phase: 'em_producao_video', entered_at: new Date('2026-04-12') });
    seedApproval({ id: 'a1', delivery_id: 'd1', status: 'approved' });
    seedApproval({ id: 'a2', delivery_id: 'd2', status: 'rejected' });
    seedApproval({ id: 'a3', delivery_id: 'd2', status: 'approved' });
    seedApproval({ id: 'a4', delivery_id: 'd3', status: 'approved' });
    const out = await reports.ranking(RANGE);
    expect(out[0].producerId).toBe('u1');
    expect(out[0].volume).toBe(2);
    expect(out[0].firstApprovalRate).toBe(0.5);
    expect(out[1].producerId).toBe('u2');
    expect(out[1].volume).toBe(1);
  });
});

describe('volumeTimeseries', () => {
  test('groups per producer per day bucket', async () => {
    seedUser({ id: 'u1', name: 'João' });
    seedDelivery({ id: 'd1', completed_at: new Date('2026-04-10T10:00:00Z') });
    seedDelivery({ id: 'd2', completed_at: new Date('2026-04-10T15:00:00Z') });
    seedDelivery({ id: 'd3', completed_at: new Date('2026-04-11T10:00:00Z') });
    seedPhase({ delivery_id: 'd1', user_id: 'u1', phase: 'em_producao_design', entered_at: new Date('2026-04-10T09:00:00Z') });
    seedPhase({ delivery_id: 'd2', user_id: 'u1', phase: 'em_producao_design', entered_at: new Date('2026-04-10T12:00:00Z') });
    seedPhase({ delivery_id: 'd3', user_id: 'u1', phase: 'em_producao_design', entered_at: new Date('2026-04-11T09:00:00Z') });
    const out = await reports.volumeTimeseries({ ...RANGE, granularity: 'day' });
    const apr10 = out.find((r) => r.bucket === '2026-04-10');
    const apr11 = out.find((r) => r.bucket === '2026-04-11');
    expect(apr10.count).toBe(2);
    expect(apr11.count).toBe(1);
  });
});
