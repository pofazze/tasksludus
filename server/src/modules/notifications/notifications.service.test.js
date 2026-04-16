const mockSendText = jest.fn().mockResolvedValue(null);
const mockBuildPersonalJid = jest.fn((phone) => `${phone}@s.whatsapp.net`);

jest.mock('../evolution/evolution.service', () => ({
  sendText: (...args) => mockSendText(...args),
  buildPersonalJid: (...args) => mockBuildPersonalJid(...args),
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

const fixtures = {
  client: { id: 'c1', name: 'Cliente Demo', category: 'health', whatsapp_group: '120000@g.us' },
  smUser: { id: 'sm1', whatsapp: '5511999000001' },
  designer: { id: 'd1', clickup_id: 'cu-d1', whatsapp: '5511999000002' },
  editor: { id: 'e1', clickup_id: 'cu-e1', whatsapp: '5511999000003' },
  categoryGroup: '120363425760405482@g.us',
};

// mockDbState is prefixed with "mock" so Jest allows access from the jest.mock factory
const mockDbState = {
  app_settings: { category_whatsapp_groups: { health: '120363425760405482@g.us' } },
  clients: { c1: { id: 'c1', name: 'Cliente Demo', category: 'health', whatsapp_group: '120000@g.us' } },
  users: {
    sm1: { id: 'sm1', whatsapp: '5511999000001' },
    d1: { id: 'd1', clickup_id: 'cu-d1', whatsapp: '5511999000002' },
    e1: { id: 'e1', clickup_id: 'cu-e1', whatsapp: '5511999000003' },
  },
  delivery_phases: [],
  deliveries: {},
};

jest.mock('../../config/db', () => {
  return jest.fn((table) => {
    const builder = {
      _table: table,
      _where: null,
      _orderBy: null,
      where(c) { this._where = c; return this; },
      whereIn(col, vals) { this._whereInCol = col; this._whereInVals = vals; return this; },
      orderBy(col, dir) { this._orderBy = { col, dir }; return this; },
      select() { return this; },
      first() {
        if (this._table === 'app_settings' && this._where?.key) {
          const value = mockDbState.app_settings[this._where.key];
          return Promise.resolve(value ? { key: this._where.key, value } : null);
        }
        if (this._table === 'clients' && this._where?.id) {
          return Promise.resolve(mockDbState.clients[this._where.id] || null);
        }
        if (this._table === 'users' && this._where?.id) {
          return Promise.resolve(mockDbState.users[this._where.id] || null);
        }
        if (this._table === 'users' && this._where?.clickup_id) {
          const u = Object.values(mockDbState.users).find((x) => x.clickup_id === this._where.clickup_id);
          return Promise.resolve(u || null);
        }
        if (this._table === 'deliveries' && this._where?.id) {
          return Promise.resolve(mockDbState.deliveries[this._where.id] || null);
        }
        return Promise.resolve(null);
      },
      then(resolve) {
        if (this._table === 'delivery_phases') {
          let rows = mockDbState.delivery_phases.filter((p) => {
            if (this._where) {
              for (const k of Object.keys(this._where)) {
                if (p[k] !== this._where[k]) return false;
              }
            }
            if (this._whereInCol) {
              if (!this._whereInVals.includes(p[this._whereInCol])) return false;
            }
            return true;
          });
          if (this._orderBy) {
            rows = [...rows].sort((a, b) => {
              const av = a[this._orderBy.col]; const bv = b[this._orderBy.col];
              const cmp = av > bv ? 1 : av < bv ? -1 : 0;
              return this._orderBy.dir === 'desc' ? -cmp : cmp;
            });
          }
          return Promise.resolve(rows).then(resolve);
        }
        if (this._table === 'scheduled_posts') {
          return Promise.resolve([]).then(resolve);
        }
        return Promise.resolve([]).then(resolve);
      },
    };
    return builder;
  });
});

const notifications = require('./notifications.service');

beforeEach(() => {
  mockSendText.mockClear();
  mockBuildPersonalJid.mockClear();
  mockDbState.delivery_phases = [];
  mockDbState.deliveries = {};
  mockDbState.users.d1 = { id: 'd1', clickup_id: 'cu-d1', whatsapp: '5511999000002' };
  mockDbState.app_settings.category_whatsapp_groups = { health: '120363425760405482@g.us' };
});

describe('notifyBatchReviewWindow', () => {
  test('sends a digest with both approved and rejected sections to the SM', async () => {
    const batch = { id: 'b1', client_id: 'c1', social_media_id: 'sm1' };
    const items = [
      { id: 'i1', status: 'approved', delivery_id: 'dl1', delivery_title: 'Post A', clickup_task_id: 'tA', rejection_reason: null, rejection_target: null },
      { id: 'i2', status: 'rejected', delivery_id: 'dl2', delivery_title: 'Post B', clickup_task_id: 'tB', rejection_reason: 'Trocar a cor', rejection_target: null },
    ];
    await notifications.notifyBatchReviewWindow(batch, items);
    expect(mockSendText).toHaveBeenCalled();
    const [jid, text] = mockSendText.mock.calls.find((c) => c[0] === '5511999000001@s.whatsapp.net');
    expect(jid).toBe('5511999000001@s.whatsapp.net');
    expect(text).toContain('Cliente Demo');
    expect(text).toContain('✅ Aprovados (1)');
    expect(text).toContain('Post A');
    expect(text).toContain('❌ Reprovados (1)');
    expect(text).toContain('Post B');
    expect(text).toContain('Motivo: Trocar a cor');
  });

  test('omits the empty section when only approvals exist', async () => {
    const batch = { id: 'b1', client_id: 'c1', social_media_id: 'sm1' };
    const items = [{ id: 'i1', status: 'approved', delivery_id: 'dl1', delivery_title: 'Post A', clickup_task_id: 'tA' }];
    await notifications.notifyBatchReviewWindow(batch, items);
    const smCall = mockSendText.mock.calls.find((c) => c[0] === '5511999000001@s.whatsapp.net');
    expect(smCall[1]).toContain('✅ Aprovados (1)');
    expect(smCall[1]).not.toContain('❌ Reprovados');
  });

  test('skips silently when SM has no whatsapp configured', async () => {
    const batch = { id: 'b1', client_id: 'c1', social_media_id: 'sm-no-phone' };
    mockDbState.users['sm-no-phone'] = { id: 'sm-no-phone', whatsapp: null };
    await notifications.notifyBatchReviewWindow(batch, [
      { id: 'i1', status: 'approved', delivery_id: 'dl1', delivery_title: 'P', clickup_task_id: 't' },
    ]);
    expect(mockSendText).not.toHaveBeenCalledWith('5511999000001@s.whatsapp.net', expect.anything());
  });

  test('triggers notifyRejections when items contain rejections', async () => {
    mockDbState.deliveries.dl1 = { id: 'dl1', client_id: 'c1', clickup_task_id: 'tA', title: 'Post A' };
    mockDbState.delivery_phases = [
      { delivery_id: 'dl1', phase: 'design', user_id: 'd1', entered_at: '2026-04-01T00:00:00Z' },
    ];
    const batch = { id: 'b1', client_id: 'c1', social_media_id: 'sm1' };
    const items = [
      { id: 'i1', status: 'rejected', delivery_id: 'dl1', delivery_title: 'Post A', clickup_task_id: 'tA', rejection_reason: 'fix it', rejection_target: null, post_type: 'image' },
    ];
    await notifications.notifyBatchReviewWindow(batch, items);
    const designerCall = mockSendText.mock.calls.find((c) => c[0] === '5511999000002@s.whatsapp.net');
    expect(designerCall).toBeTruthy();
    expect(designerCall[1]).toContain('Post A');
  });
});

describe('notifyRejections — producer routing', () => {
  test('rejection_target=cover routes to the design phase assignee', async () => {
    mockDbState.deliveries.dl1 = { id: 'dl1', client_id: 'c1', clickup_task_id: 't1', title: 'Post X' };
    mockDbState.delivery_phases = [
      { delivery_id: 'dl1', phase: 'design', user_id: 'd1', entered_at: '2026-04-01T00:00:00Z' },
      { delivery_id: 'dl1', phase: 'edicao_de_video', user_id: 'e1', entered_at: '2026-04-02T00:00:00Z' },
    ];
    await notifications.notifyRejections(
      { id: 'b1', client_id: 'c1' },
      [{ id: 'i1', delivery_id: 'dl1', delivery_title: 'Post X', clickup_task_id: 't1', rejection_reason: 'fix cover', rejection_target: 'cover', post_type: 'reel' }],
    );
    const designerJids = mockSendText.mock.calls.map((c) => c[0]);
    expect(designerJids).toContain('5511999000002@s.whatsapp.net');
    expect(designerJids).not.toContain('5511999000003@s.whatsapp.net');
  });

  test('rejection_target=video routes to the edicao_de_video assignee', async () => {
    mockDbState.deliveries.dl1 = { id: 'dl1', client_id: 'c1', clickup_task_id: 't1', title: 'Post X' };
    mockDbState.delivery_phases = [
      { delivery_id: 'dl1', phase: 'design', user_id: 'd1', entered_at: '2026-04-01T00:00:00Z' },
      { delivery_id: 'dl1', phase: 'edicao_de_video', user_id: 'e1', entered_at: '2026-04-02T00:00:00Z' },
    ];
    await notifications.notifyRejections(
      { id: 'b1', client_id: 'c1' },
      [{ id: 'i1', delivery_id: 'dl1', delivery_title: 'Post X', clickup_task_id: 't1', rejection_reason: 'cut last second', rejection_target: 'video', post_type: 'reel' }],
    );
    const editorCall = mockSendText.mock.calls.find((c) => c[0] === '5511999000003@s.whatsapp.net');
    expect(editorCall).toBeTruthy();
  });

  test('reel without rejection_target falls back to edicao_de_video', async () => {
    mockDbState.deliveries.dl1 = { id: 'dl1', client_id: 'c1', clickup_task_id: 't1', title: 'Post X' };
    mockDbState.delivery_phases = [
      { delivery_id: 'dl1', phase: 'edicao_de_video', user_id: 'e1', entered_at: '2026-04-02T00:00:00Z' },
    ];
    await notifications.notifyRejections(
      { id: 'b1', client_id: 'c1' },
      [{ id: 'i1', delivery_id: 'dl1', delivery_title: 'Post X', clickup_task_id: 't1', rejection_reason: 'redo', rejection_target: null, post_type: 'reel' }],
    );
    const editorCall = mockSendText.mock.calls.find((c) => c[0] === '5511999000003@s.whatsapp.net');
    expect(editorCall).toBeTruthy();
  });

  test('image post falls back to design phase', async () => {
    mockDbState.deliveries.dl1 = { id: 'dl1', client_id: 'c1', clickup_task_id: 't1', title: 'Post X' };
    mockDbState.delivery_phases = [
      { delivery_id: 'dl1', phase: 'design', user_id: 'd1', entered_at: '2026-04-01T00:00:00Z' },
    ];
    await notifications.notifyRejections(
      { id: 'b1', client_id: 'c1' },
      [{ id: 'i1', delivery_id: 'dl1', delivery_title: 'Post X', clickup_task_id: 't1', rejection_reason: 'redo', rejection_target: null, post_type: 'image' }],
    );
    const designerCall = mockSendText.mock.calls.find((c) => c[0] === '5511999000002@s.whatsapp.net');
    expect(designerCall).toBeTruthy();
  });

  test('dedupes producers — same producer with three rejected items receives one message', async () => {
    mockDbState.deliveries.dl1 = { id: 'dl1', client_id: 'c1', clickup_task_id: 't1', title: 'A' };
    mockDbState.deliveries.dl2 = { id: 'dl2', client_id: 'c1', clickup_task_id: 't2', title: 'B' };
    mockDbState.deliveries.dl3 = { id: 'dl3', client_id: 'c1', clickup_task_id: 't3', title: 'C' };
    mockDbState.delivery_phases = [
      { delivery_id: 'dl1', phase: 'design', user_id: 'd1', entered_at: '2026-04-01T00:00:00Z' },
      { delivery_id: 'dl2', phase: 'design', user_id: 'd1', entered_at: '2026-04-01T00:00:00Z' },
      { delivery_id: 'dl3', phase: 'design', user_id: 'd1', entered_at: '2026-04-01T00:00:00Z' },
    ];
    const items = ['dl1', 'dl2', 'dl3'].map((id, i) => ({
      id: `i${i}`, delivery_id: id, delivery_title: mockDbState.deliveries[id].title, clickup_task_id: mockDbState.deliveries[id].clickup_task_id, rejection_reason: 'r', rejection_target: null, post_type: 'image',
    }));
    await notifications.notifyRejections({ id: 'b1', client_id: 'c1' }, items);
    const designerCalls = mockSendText.mock.calls.filter((c) => c[0] === '5511999000002@s.whatsapp.net');
    expect(designerCalls).toHaveLength(1);
    expect(designerCalls[0][1]).toContain('A');
    expect(designerCalls[0][1]).toContain('B');
    expect(designerCalls[0][1]).toContain('C');
  });

  test('sends the category-group summary using app_settings mapping', async () => {
    mockDbState.deliveries.dl1 = { id: 'dl1', client_id: 'c1', clickup_task_id: 't1', title: 'A' };
    mockDbState.delivery_phases = [
      { delivery_id: 'dl1', phase: 'design', user_id: 'd1', entered_at: '2026-04-01T00:00:00Z' },
    ];
    await notifications.notifyRejections(
      { id: 'b1', client_id: 'c1' },
      [{ id: 'i1', delivery_id: 'dl1', delivery_title: 'A', clickup_task_id: 't1', rejection_reason: 'r', rejection_target: null, post_type: 'image' }],
    );
    const groupCall = mockSendText.mock.calls.find((c) => c[0] === '120363425760405482@g.us');
    expect(groupCall).toBeTruthy();
    expect(groupCall[1]).toContain('Cliente Demo');
  });

  test('skips category group silently when category not mapped', async () => {
    mockDbState.app_settings.category_whatsapp_groups = {}; // empty mapping
    mockDbState.deliveries.dl1 = { id: 'dl1', client_id: 'c1', clickup_task_id: 't1', title: 'A' };
    mockDbState.delivery_phases = [
      { delivery_id: 'dl1', phase: 'design', user_id: 'd1', entered_at: '2026-04-01T00:00:00Z' },
    ];
    await notifications.notifyRejections(
      { id: 'b1', client_id: 'c1' },
      [{ id: 'i1', delivery_id: 'dl1', delivery_title: 'A', clickup_task_id: 't1', rejection_reason: 'r', rejection_target: null, post_type: 'image' }],
    );
    expect(mockSendText.mock.calls.find((c) => c[0] === '120363425760405482@g.us')).toBeUndefined();
  });

  test('producer with no whatsapp is skipped silently', async () => {
    mockDbState.users.d1.whatsapp = null;
    mockDbState.deliveries.dl1 = { id: 'dl1', client_id: 'c1', clickup_task_id: 't1', title: 'A' };
    mockDbState.delivery_phases = [
      { delivery_id: 'dl1', phase: 'design', user_id: 'd1', entered_at: '2026-04-01T00:00:00Z' },
    ];
    await notifications.notifyRejections(
      { id: 'b1', client_id: 'c1' },
      [{ id: 'i1', delivery_id: 'dl1', delivery_title: 'A', clickup_task_id: 't1', rejection_reason: 'r', rejection_target: null, post_type: 'image' }],
    );
    // Designer not contacted, but category group still receives the summary
    expect(mockSendText.mock.calls.find((c) => c[0] === '5511999000002@s.whatsapp.net')).toBeUndefined();
    expect(mockSendText.mock.calls.find((c) => c[0] === '120363425760405482@g.us')).toBeTruthy();
  });
});

describe('notifyPublishSuccess', () => {
  test('sends a digest with one platform link to client group and category group', async () => {
    const post = {
      client_id: 'c1',
      post_group_id: null,
      delivery_title: 'Post Y',
      ig_permalink: 'https://instagram.com/p/abc',
      tiktok_permalink: null,
      platform: 'instagram',
    };
    await notifications.notifyPublishSuccess(post);
    const clientGroupCall = mockSendText.mock.calls.find((c) => c[0] === '120000@g.us');
    const categoryCall = mockSendText.mock.calls.find((c) => c[0] === '120363425760405482@g.us');
    expect(clientGroupCall).toBeTruthy();
    expect(clientGroupCall[1]).toContain('Post Y');
    expect(clientGroupCall[1]).toContain('Instagram');
    expect(clientGroupCall[1]).toContain('https://instagram.com/p/abc');
    expect(categoryCall).toBeTruthy();
  });

  test('multi-platform: lists every platform with its permalink', async () => {
    const groupId = 'group-1';
    // Sibling rows are read by the dispatcher via post_group_id
    let dbModule;
    jest.isolateModules(() => { dbModule = require('../../config/db'); });
    // Use the existing mock — extend the `then` path for scheduled_posts
    // (the fixture below stays in test scope)
    const siblings = [
      { platform: 'instagram', ig_permalink: 'https://instagram.com/p/A', tiktok_permalink: null, status: 'published' },
      { platform: 'tiktok', ig_permalink: null, tiktok_permalink: 'https://www.tiktok.com/@x/video/1', status: 'published' },
    ];
    const original = require('../../config/db');
    jest.doMock('../../config/db', () => {
      return jest.fn((table) => {
        if (table === 'scheduled_posts') {
          return {
            where() { return this; },
            then(resolve) { return Promise.resolve(siblings).then(resolve); },
          };
        }
        return original(table);
      });
    });
    jest.resetModules();
    const dispatcher = require('./notifications.service');
    await dispatcher.notifyPublishSuccess({
      client_id: 'c1',
      post_group_id: groupId,
      delivery_title: 'Combo',
      platform: 'instagram',
      ig_permalink: 'https://instagram.com/p/A',
    });
    const clientCall = mockSendText.mock.calls.find((c) => c[0] === '120000@g.us');
    expect(clientCall[1]).toContain('Instagram');
    expect(clientCall[1]).toContain('TikTok');
    expect(clientCall[1]).toContain('https://www.tiktok.com/@x/video/1');
  });
});
