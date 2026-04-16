const { reportsAuth } = require('./reports.auth');

function mockReqRes(user, query = {}, params = {}) {
  const req = { user, query: { ...query }, params: { ...params } };
  const res = {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(p) { this.payload = p; return this; },
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('reportsAuth — quality feature', () => {
  const mw = reportsAuth('quality');

  test('management role passes through without rewriting query', () => {
    const { req, res, next } = mockReqRes({ id: 'u1', role: 'ceo' }, { producerId: 'p1' });
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.query.producerId).toBe('p1');
  });

  test('dev bypasses every check', () => {
    const { req, res, next } = mockReqRes({ id: 'u1', role: 'dev' });
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('producer gets producerId forced to their own id', () => {
    const { req, res, next } = mockReqRes({ id: 'u1', role: 'producer' }, { producerId: 'otherUser' });
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.query.producerId).toBe('u1');
  });

  test('account_manager gets 403 on quality', () => {
    const { req, res, next } = mockReqRes({ id: 'u1', role: 'account_manager' });
    mw(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  test('client gets 403 on quality', () => {
    const { req, res, next } = mockReqRes({ id: 'u1', role: 'client' });
    mw(req, res, next);
    expect(res.statusCode).toBe(403);
  });
});

describe('reportsAuth — capacity feature', () => {
  const mw = reportsAuth('capacity');

  test('producer gets forced producerId', () => {
    const { req, res, next } = mockReqRes({ id: 'u1', role: 'producer' }, { producerId: 'other' });
    mw(req, res, next);
    expect(req.query.producerId).toBe('u1');
    expect(next).toHaveBeenCalled();
  });

  test('account_manager gets 403', () => {
    const { req, res, next } = mockReqRes({ id: 'u1', role: 'account_manager' });
    mw(req, res, next);
    expect(res.statusCode).toBe(403);
  });
});

describe('reportsAuth — client feature', () => {
  const mw = reportsAuth('client');

  test('manager passes through', () => {
    const { req, res, next } = mockReqRes({ id: 'u1', role: 'manager' }, {}, { clientId: 'c1' });
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('producer gets 403', () => {
    const { req, res, next } = mockReqRes({ id: 'u1', role: 'producer' });
    mw(req, res, next);
    expect(res.statusCode).toBe(403);
  });

  test('account_manager passes through and marks the request as scoped', () => {
    const { req, res, next } = mockReqRes({ id: 'u1', role: 'account_manager' }, {}, { clientId: 'c1' });
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req._scopedAccountManagerId).toBe('u1');
  });
});
