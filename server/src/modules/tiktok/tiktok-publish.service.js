const db = require('../../config/db');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const tiktokOAuth = require('./tiktok-oauth.service');
const clickupOAuth = require('../webhooks/clickup-oauth.service');
const eventBus = require('../../utils/event-bus');

const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2';

function getServerBaseUrl() {
  if (env.tiktok?.redirectUri) {
    try { return new URL(env.tiktok.redirectUri).origin; } catch {}
  }
  throw new Error('TIKTOK_REDIRECT_URI must be configured so the media proxy URL can be built');
}

// Escalating delays: 5s, 10s, 20s, 30s, 60s
const POLL_INTERVALS = [5000, 10000, 20000, 30000, 60000];

class TikTokPublishService {
  async executeScheduledPost(postId) {
    const post = await db('scheduled_posts').where({ id: postId }).first();
    if (!post) throw Object.assign(new Error('Post not found'), { status: 404 });
    if (post.status === 'published') return post;
    if (post.platform !== 'tiktok') {
      throw Object.assign(new Error(`Post platform is not tiktok: ${post.platform}`), { status: 400 });
    }

    await db('scheduled_posts').where({ id: postId }).update({ status: 'publishing', updated_at: new Date() });

    try {
      const accessToken = await tiktokOAuth.getDecryptedToken(post.client_id);

      // Parse media_urls — handle both JSONB (already array) and raw string
      let mediaUrls = post.media_urls;
      if (typeof mediaUrls === 'string') {
        try { mediaUrls = JSON.parse(mediaUrls); } catch { mediaUrls = []; }
      }
      if (!Array.isArray(mediaUrls)) mediaUrls = [];

      // Determine publish path: video vs photo/carousel
      const isVideoPostType = ['reel', 'video', 'tiktok_video'].includes(post.post_type);
      const allMediaAreVideo = mediaUrls.length > 0 && mediaUrls.every((m) => m.type === 'video');
      const videoIdx = mediaUrls.findIndex((m) => m.type === 'video');

      // TikTok PULL_FROM_URL requires URLs on a verified domain. Route every
      // media URL through our own server so the prefix we verify
      // (https://server-production-bea3.up.railway.app/api/tiktok/media/) is
      // the one TikTok fetches, regardless of where the media actually lives.
      const proxyBase = `${getServerBaseUrl()}/api/tiktok/media/${postId}`;

      let publishId;
      if (isVideoPostType || allMediaAreVideo) {
        const effectiveIdx = videoIdx >= 0 ? videoIdx : (mediaUrls.length > 0 ? 0 : -1);
        if (effectiveIdx < 0) throw new Error('No video URL found for video post');
        const videoUrl = `${proxyBase}/${effectiveIdx}`;
        const sourceUrl = mediaUrls[effectiveIdx].url;
        logger.info('Publishing TikTok video', { postId, videoUrl, sourcePrefix: sourceUrl?.slice(0, 80) });
        const result = await this.publishVideo(accessToken, videoUrl, post.caption, env.tiktok.defaultPrivacyLevel);
        publishId = result.publish_id;
      } else {
        const photoUrls = mediaUrls
          .map((m, i) => (m.url ? `${proxyBase}/${i}` : null))
          .filter(Boolean);
        if (!photoUrls.length) throw new Error('No photo URLs found for photo post');
        logger.info('Publishing TikTok photo/carousel', { postId, count: photoUrls.length });
        const result = await this.publishPhoto(accessToken, photoUrls, post.caption, 0, env.tiktok.defaultPrivacyLevel);
        publishId = result.publish_id;
      }

      // Poll until PUBLISH_COMPLETE
      await this.pollPublishStatus(accessToken, publishId);

      const [updated] = await db('scheduled_posts')
        .where({ id: postId })
        .update({
          status: 'published',
          tiktok_publish_id: publishId,
          published_at: new Date(),
          updated_at: new Date(),
        })
        .returning('*');

      logger.info('TikTok post published', { postId, publishId });

      // Move ClickUp task to publicação
      if (post.clickup_task_id) {
        await this._moveToPublicacao(post.clickup_task_id);
      }

      // Update delivery status
      if (post.delivery_id) {
        await db('deliveries')
          .where({ id: post.delivery_id })
          .update({ status: 'publicacao', completed_at: new Date(), updated_at: new Date() });
      } else if (post.clickup_task_id) {
        await db('deliveries')
          .where({ clickup_task_id: post.clickup_task_id })
          .update({ status: 'publicacao', completed_at: new Date(), updated_at: new Date() });
      }

      eventBus.emit('sse', { type: 'post:updated', payload: { id: postId, status: 'published' } });
      eventBus.emit('sse', { type: 'delivery:updated', payload: { clickup_task_id: post.clickup_task_id } });

      return updated;
    } catch (err) {
      const retryCount = (post.retry_count || 0) + 1;
      await db('scheduled_posts')
        .where({ id: postId })
        .update({
          status: retryCount > 2 ? 'failed' : 'scheduled',
          error_message: err.message,
          retry_count: retryCount,
          updated_at: new Date(),
        });

      logger.error('TikTok post publish failed', { postId, error: err.message, retryCount });
      eventBus.emit('sse', { type: 'post:updated', payload: { id: postId, status: retryCount > 2 ? 'failed' : 'scheduled' } });
      throw err;
    }
  }

  async publishVideo(token, videoUrl, caption, privacyLevel = 'SELF_ONLY') {
    const url = `${TIKTOK_API_BASE}/post/publish/video/init/`;
    const body = {
      post_info: {
        title: caption || '',
        privacy_level: privacyLevel,
        disable_comment: false,
        disable_duet: false,
        disable_stitch: false,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: videoUrl,
      },
    };

    logger.info('TikTok video init', { videoUrl: videoUrl.slice(0, 120), privacyLevel });

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify(body),
    });

    const responseText = await res.text();
    logger.info('TikTok video init response', { status: res.status, body: responseText.slice(0, 500) });

    if (!res.ok) {
      let parsed;
      try { parsed = JSON.parse(responseText); } catch { parsed = { raw: responseText }; }
      throw Object.assign(
        new Error(parsed?.error?.message || responseText || 'TikTok video init failed'),
        { status: 502 }
      );
    }

    const data = JSON.parse(responseText);
    if (data?.error?.code && data.error.code !== 'ok') {
      throw Object.assign(new Error(data.error.message || 'TikTok video init error'), { status: 502 });
    }

    return { publish_id: data?.data?.publish_id };
  }

  async publishPhoto(token, photoUrls, caption, coverIndex = 0, privacyLevel = 'SELF_ONLY') {
    const url = `${TIKTOK_API_BASE}/post/publish/content/init/`;

    const title = (caption || '').slice(0, 90);
    const description = (caption || '').slice(0, 4000);

    const body = {
      media_type: 'PHOTO',
      post_mode: 'DIRECT_POST',
      post_info: {
        title,
        description,
        privacy_level: privacyLevel,
      },
      source_info: {
        photo_images: photoUrls,
        photo_cover_index: coverIndex,
      },
    };

    logger.info('TikTok photo init', { photoCount: photoUrls.length, privacyLevel });

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify(body),
    });

    const responseText = await res.text();
    logger.info('TikTok photo init response', { status: res.status, body: responseText.slice(0, 500) });

    if (!res.ok) {
      let parsed;
      try { parsed = JSON.parse(responseText); } catch { parsed = { raw: responseText }; }
      throw Object.assign(
        new Error(parsed?.error?.message || responseText || 'TikTok photo init failed'),
        { status: 502 }
      );
    }

    const data = JSON.parse(responseText);
    if (data?.error?.code && data.error.code !== 'ok') {
      throw Object.assign(new Error(data.error.message || 'TikTok photo init error'), { status: 502 });
    }

    return { publish_id: data?.data?.publish_id };
  }

  async queryCreatorInfo(token) {
    const url = `${TIKTOK_API_BASE}/post/publish/creator_info/query/`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({}),
    });

    const responseText = await res.text();
    logger.info('TikTok creator info response', { status: res.status, body: responseText.slice(0, 500) });

    if (!res.ok) {
      let parsed;
      try { parsed = JSON.parse(responseText); } catch { parsed = { raw: responseText }; }
      throw Object.assign(
        new Error(parsed?.error?.message || responseText || 'TikTok creator info query failed'),
        { status: 502 }
      );
    }

    const data = JSON.parse(responseText);
    if (data?.error?.code && data.error.code !== 'ok') {
      throw Object.assign(new Error(data.error.message || 'TikTok creator info error'), { status: 502 });
    }

    return data?.data || data;
  }

  async pollPublishStatus(token, publishId, maxAttempts = 15) {
    const url = `${TIKTOK_API_BASE}/post/publish/status/fetch/`;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const delay = POLL_INTERVALS[Math.min(attempt, POLL_INTERVALS.length - 1)];
      await new Promise((resolve) => setTimeout(resolve, delay));

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({ publish_id: publishId }),
      });

      const responseText = await res.text();
      let data;
      try { data = JSON.parse(responseText); } catch { data = {}; }

      const status = data?.data?.status;
      logger.info('TikTok publish status poll', { publishId, status, attempt, body: responseText.slice(0, 300) });

      if (status === 'PUBLISH_COMPLETE') {
        return data.data;
      }

      if (status === 'FAILED') {
        const detail = data?.data?.fail_reason || data?.error?.message || 'unknown error';
        throw Object.assign(new Error(`TikTok publish failed: ${detail}`), { status: 502 });
      }

      // PROCESSING_UPLOAD or PROCESSING_DOWNLOAD — continue polling
    }

    throw new Error(`TikTok publish status timed out after ${maxAttempts} attempts for publish_id=${publishId}`);
  }

  async _moveToPublicacao(clickupTaskId) {
    try {
      const token = await clickupOAuth.getDecryptedToken();
      const res = await fetch(`https://api.clickup.com/api/v2/task/${clickupTaskId}`, {
        method: 'PUT',
        headers: {
          Authorization: token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'publicação' }),
      });
      if (res.ok) {
        logger.info('Moved ClickUp task to publicação', { clickupTaskId });
      } else {
        logger.warn('Failed to move ClickUp task to publicação', { clickupTaskId, status: res.status });
      }
    } catch (err) {
      logger.warn('Error moving ClickUp task to publicação', { clickupTaskId, error: err.message });
    }
  }
}

module.exports = new TikTokPublishService();
