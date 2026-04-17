const db = require('../../config/db');
const logger = require('../../utils/logger');
const youtubeOAuth = require('./youtube-oauth.service');
const clickupOAuth = require('../webhooks/clickup-oauth.service');
const eventBus = require('../../utils/event-bus');
const notificationsService = require('../notifications/notifications.service');

const YT_UPLOAD_INIT_URL = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
const YT_THUMBNAIL_URL = (videoId) => `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`;

class YouTubePublishService {
  async executeScheduledPost(postId) {
    const post = await db('scheduled_posts').where({ id: postId }).first();
    if (!post) throw Object.assign(new Error('Post not found'), { status: 404 });
    if (post.status === 'published') return post;
    if (post.platform !== 'youtube') {
      throw Object.assign(new Error(`Post platform is not youtube: ${post.platform}`), { status: 400 });
    }

    await db('scheduled_posts').where({ id: postId }).update({ status: 'publishing', updated_at: new Date() });

    try {
      // Step 1: Load token, refresh if expiring within 5 minutes
      const row = await db('client_youtube_tokens')
        .where({ client_id: post.client_id, is_active: true })
        .first();
      if (!row) throw Object.assign(new Error('YouTube not connected for this client'), { status: 404 });

      const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);
      if (row.token_expires_at && new Date(row.token_expires_at) < fiveMinFromNow) {
        logger.info('YouTube token expiring soon, refreshing', { clientId: post.client_id });
        await youtubeOAuth.refreshToken(post.client_id);
      }

      const accessToken = await youtubeOAuth.getDecryptedToken(post.client_id);

      // Step 2: Parse media_urls, find video
      let mediaUrls = post.media_urls;
      if (typeof mediaUrls === 'string') {
        try { mediaUrls = JSON.parse(mediaUrls); } catch { mediaUrls = []; }
      }
      if (!Array.isArray(mediaUrls)) mediaUrls = [];

      const videoMedia = mediaUrls.find((m) => m.type === 'video');
      if (!videoMedia) throw new Error('No video URL found for YouTube post');
      const videoUrl = videoMedia.url;

      // Step 3: Download video to Buffer
      logger.info('Downloading video for YouTube upload', { postId, urlPrefix: videoUrl?.slice(0, 80) });
      const videoRes = await fetch(videoUrl);
      if (!videoRes.ok) throw new Error(`Failed to download video: HTTP ${videoRes.status}`);
      const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
      logger.info('Video downloaded', { postId, sizeBytes: videoBuffer.length });

      // Step 4: Determine Short vs Normal
      const isShort = this._isShort(post.post_type);

      // Step 5: Build metadata
      let title = (post.caption || '').slice(0, 100);
      if (isShort && !title.includes('#Shorts')) title += ' #Shorts';

      const snippet = {
        title,
        description: post.caption || '',
        tags: [],
        categoryId: '22',
      };

      const hasScheduledAt = post.scheduled_at && new Date(post.scheduled_at) > new Date();
      const status = hasScheduledAt
        ? { privacyStatus: 'private', publishAt: new Date(post.scheduled_at).toISOString() }
        : { privacyStatus: 'public' };

      // Step 6: Initiate resumable upload
      const uploadUri = await this._initResumableUpload(accessToken, { snippet, status });

      // Step 7: Upload video bytes
      const uploadResult = await this._uploadVideoBytes(uploadUri, videoBuffer);
      const videoId = uploadResult.id;
      if (!videoId) throw new Error('YouTube upload did not return a video ID');

      logger.info('YouTube video uploaded', { postId, videoId });

      // Step 8: Set thumbnail if provided
      if (post.thumbnail_url) {
        try {
          const thumbRes = await fetch(post.thumbnail_url);
          if (thumbRes.ok) {
            const thumbBuffer = Buffer.from(await thumbRes.arrayBuffer());
            await this._setThumbnail(accessToken, videoId, thumbBuffer);
            logger.info('YouTube thumbnail set', { postId, videoId });
          } else {
            logger.warn('Failed to download thumbnail', { postId, status: thumbRes.status });
          }
        } catch (err) {
          logger.warn('Error setting YouTube thumbnail (non-fatal)', { postId, error: err.message });
        }
      }

      // Step 9: Build permalink
      const permalink = isShort
        ? `https://youtube.com/shorts/${videoId}`
        : `https://youtube.com/watch?v=${videoId}`;

      // Step 10: Update DB
      const [updated] = await db('scheduled_posts')
        .where({ id: postId })
        .update({
          status: 'published',
          youtube_video_id: videoId,
          youtube_permalink: permalink,
          published_at: new Date(),
          updated_at: new Date(),
        })
        .returning('*');

      logger.info('YouTube post published', { postId, videoId, permalink });

      // Step 11: Group-ready check → moveToPublicacao + notifyPublishSuccess
      const groupReady = await this._isGroupFullyPublished(post);
      if (groupReady) {
        if (post.clickup_task_id) {
          await this._moveToPublicacao(post.clickup_task_id);
        }
        let deliveryRow = null;
        if (post.delivery_id) {
          deliveryRow = await db('deliveries').where({ id: post.delivery_id }).first();
          await db('deliveries')
            .where({ id: post.delivery_id })
            .update({ status: 'publicado', completed_at: new Date(), updated_at: new Date() });
        } else if (post.clickup_task_id) {
          deliveryRow = await db('deliveries').where({ clickup_task_id: post.clickup_task_id }).first();
          await db('deliveries')
            .where({ clickup_task_id: post.clickup_task_id })
            .update({ status: 'publicado', completed_at: new Date(), updated_at: new Date() });
        }
        await notificationsService.notifyPublishSuccess({
          ...post,
          delivery_title: deliveryRow?.title || null,
        });
      }

      eventBus.emit('sse', { type: 'post:updated', payload: { id: postId, status: 'published' } });
      eventBus.emit('sse', { type: 'delivery:updated', payload: { clickup_task_id: post.clickup_task_id } });

      return updated;
    } catch (err) {
      const retryCount = (post.retry_count || 0) + 1;
      // If quota exceeded, set retry_count to 99 to prevent further retries
      const effectiveRetryCount = err.message?.includes('quotaExceeded') ? 99 : retryCount;
      await db('scheduled_posts')
        .where({ id: postId })
        .update({
          status: effectiveRetryCount > 2 ? 'failed' : 'scheduled',
          error_message: err.message,
          retry_count: effectiveRetryCount,
          updated_at: new Date(),
        });

      logger.error('YouTube post publish failed', { postId, error: err.message, retryCount: effectiveRetryCount });
      eventBus.emit('sse', { type: 'post:updated', payload: { id: postId, status: effectiveRetryCount > 2 ? 'failed' : 'scheduled' } });
      throw err;
    }
  }

  _isShort(postType) {
    if (['yt_shorts', 'reel'].includes(postType)) return true;
    if (postType === 'yt_video') return false;
    return true; // default Short
  }

  async _initResumableUpload(accessToken, { snippet, status }) {
    const res = await fetch(YT_UPLOAD_INIT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({ snippet, status }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error('YouTube resumable upload init failed', { status: res.status, body: text.slice(0, 500) });
      let parsed;
      try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
      const errMsg = parsed?.error?.errors?.[0]?.reason || parsed?.error?.message || text || 'YouTube upload init failed';
      throw Object.assign(new Error(errMsg), { status: 502 });
    }

    const uploadUri = res.headers.get('location');
    if (!uploadUri) throw new Error('YouTube upload init did not return a Location header');
    logger.info('YouTube resumable upload initiated', { uploadUri: uploadUri.slice(0, 80) });
    return uploadUri;
  }

  async _uploadVideoBytes(uploadUri, videoBuffer, contentType = 'video/mp4') {
    const res = await fetch(uploadUri, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(videoBuffer.length),
      },
      body: videoBuffer,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error('YouTube video byte upload failed', { status: res.status, body: text.slice(0, 500) });
      let parsed;
      try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
      const errMsg = parsed?.error?.errors?.[0]?.reason || parsed?.error?.message || text || 'YouTube video upload failed';
      throw Object.assign(new Error(errMsg), { status: 502 });
    }

    const data = await res.json();
    logger.info('YouTube video bytes uploaded', { videoId: data.id, status: data.status?.uploadStatus });
    return data;
  }

  async _setThumbnail(accessToken, videoId, thumbBuffer) {
    const res = await fetch(YT_THUMBNAIL_URL(videoId), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'image/jpeg',
      },
      body: thumbBuffer,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.warn('YouTube thumbnail set failed', { videoId, status: res.status, body: text.slice(0, 300) });
      throw new Error(`YouTube thumbnail set failed: HTTP ${res.status}`);
    }

    return res.json();
  }

  async _isGroupFullyPublished(post) {
    if (!post.post_group_id) return true;
    const siblings = await db('scheduled_posts').where({ post_group_id: post.post_group_id });
    return siblings.every((s) => s.status === 'published');
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
        body: JSON.stringify({ status: 'publicado' }),
      });
      if (res.ok) {
        logger.info('Moved ClickUp task to publicado', { clickupTaskId });
      } else {
        logger.warn('Failed to move ClickUp task to publicado', { clickupTaskId, status: res.status });
      }
    } catch (err) {
      logger.warn('Error moving ClickUp task to publicado', { clickupTaskId, error: err.message });
    }
  }
}

module.exports = new YouTubePublishService();
