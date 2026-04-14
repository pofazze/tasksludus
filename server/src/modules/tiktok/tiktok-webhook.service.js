const crypto = require('crypto');
const env = require('../../config/env');

const TIMESTAMP_TOLERANCE_SECONDS = 300;

function parseSignatureHeader(header) {
  if (!header || typeof header !== 'string') return null;
  const parts = {};
  header.split(',').forEach((kv) => {
    const [k, v] = kv.trim().split('=');
    if (k && v) parts[k] = v;
  });
  if (!parts.t || !parts.s) return null;
  return { timestamp: parts.t, signature: parts.s };
}

function verifySignature(rawBody, header, opts = {}) {
  const clientSecret = opts.clientSecret !== undefined ? opts.clientSecret : env.tiktok.clientSecret;
  const now = opts.now !== undefined ? opts.now : Math.floor(Date.now() / 1000);

  if (!clientSecret) return false;
  if (rawBody == null) return false;

  const parsed = parseSignatureHeader(header);
  if (!parsed) return false;

  const timestamp = Number(parsed.timestamp);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(now - timestamp) > TIMESTAMP_TOLERANCE_SECONDS) return false;

  const signedPayload = `${parsed.timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', clientSecret).update(signedPayload).digest('hex');

  const expectedBuf = Buffer.from(expected, 'hex');
  const receivedBuf = Buffer.from(parsed.signature, 'hex');
  if (expectedBuf.length !== receivedBuf.length) return false;

  try {
    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    return false;
  }
}

module.exports = {
  parseSignatureHeader,
  verifySignature,
  TIMESTAMP_TOLERANCE_SECONDS,
};
