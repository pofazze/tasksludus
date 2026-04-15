const { Readable } = require('stream');
const sharp = require('sharp');
const db = require('../../config/db');
const logger = require('../../utils/logger');

const FORWARD_HEADERS = [
  'content-type',
  'content-length',
  'content-disposition',
  'accept-ranges',
  'cache-control',
  'last-modified',
  'etag',
];

// TikTok accepts only JPEG and WebP for carousel photos. Any other image format
// (notably PNG, which ClickUp generates as video-snapshot thumbnails) trips
// file_format_check_failed on the TikTok side, so the proxy transcodes on the
// fly. Non-image content and JPEG/WebP pass through untouched.
function shouldTranscodeToJpeg(contentType, url) {
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('image/jpeg') || ct.includes('image/webp')) return false;
  if (ct.startsWith('image/')) return true;
  // ClickUp sometimes serves with a generic content-type; fall back to extension.
  return /\.(png|gif|bmp|tiff|heic|heif)(\?|$)/i.test(url);
}

function parseMediaUrls(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
}

async function serveMedia(req, res) {
  const { postId, index } = req.params;
  const idx = Number(index);

  if (!postId || !Number.isInteger(idx) || idx < 0) {
    return res.status(400).send('bad request');
  }

  let post;
  try {
    post = await db('scheduled_posts').where({ id: postId }).first();
  } catch (err) {
    logger.error('TikTok media proxy DB error', { postId, error: err.message });
    return res.status(500).send('server error');
  }

  if (!post || post.platform !== 'tiktok') {
    return res.status(404).send('not found');
  }

  const mediaUrls = parseMediaUrls(post.media_urls);
  const media = mediaUrls[idx];
  if (!media?.url) return res.status(404).send('not found');

  const upstreamHeaders = {};
  if (req.headers.range) upstreamHeaders.range = req.headers.range;

  let upstream;
  try {
    upstream = await fetch(media.url, { headers: upstreamHeaders });
  } catch (err) {
    logger.error('TikTok media proxy upstream fetch failed', { postId, idx, error: err.message });
    return res.status(502).send('upstream error');
  }

  if (!upstream.ok && upstream.status !== 206) {
    logger.warn('TikTok media proxy upstream non-OK', { postId, idx, status: upstream.status });
    return res.status(upstream.status).send('upstream error');
  }

  const upstreamContentType = upstream.headers.get('content-type') || '';
  if (shouldTranscodeToJpeg(upstreamContentType, media.url)) {
    try {
      const input = Buffer.from(await upstream.arrayBuffer());
      const output = await sharp(input).jpeg({ quality: 90 }).toBuffer();
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Content-Length', output.length);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      return res.status(200).end(output);
    } catch (err) {
      logger.error('TikTok media proxy transcode failed', { postId, idx, url: media.url, error: err.message });
      return res.status(502).send('transcode error');
    }
  }

  for (const name of FORWARD_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) res.setHeader(name, value);
  }
  const contentRange = upstream.headers.get('content-range');
  if (contentRange) res.setHeader('content-range', contentRange);

  res.status(upstream.status);

  if (!upstream.body) {
    return res.end();
  }

  try {
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    logger.error('TikTok media proxy stream failed', { postId, idx, error: err.message });
    if (!res.headersSent) res.status(502);
    res.end();
  }
}

module.exports = { serveMedia };
