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
