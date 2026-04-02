const db = require('../../config/db');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const oauthService = require('./instagram-oauth.service');
const clickupOAuth = require('../webhooks/clickup-oauth.service');
const crypto = require('crypto');
const eventBus = require('../../utils/event-bus');

const GRAPH_URL = 'https://graph.instagram.com/v25.0';

const POLL_INTERVALS = [5000, 10000, 20000, 40000, 60000]; // 5s, 10s, 20s, 40s, 60s
const MAX_POLL_TIME = 5 * 60 * 1000; // 5 minutes

// Temp media store — pre-downloaded files served to Instagram
const tempMediaStore = new Map();
const TEMP_MEDIA_TTL = 10 * 60 * 1000; // 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of tempMediaStore) {
    if (now > entry.expiresAt) tempMediaStore.delete(token);
  }
}, 60 * 1000);

class InstagramPublishService {
  async executeScheduledPost(postId) {
    const post = await db('scheduled_posts').where({ id: postId }).first();
    if (!post) throw Object.assign(new Error('Post not found'), { status: 404 });
    if (post.status === 'published') return post;
    if (!post.post_type) throw Object.assign(new Error('Formato não definido — selecione antes de publicar'), { status: 400 });

    await db('scheduled_posts').where({ id: postId }).update({ status: 'publishing', updated_at: new Date() });

    const tempTokens = [];
    try {
      const accessToken = await oauthService.getDecryptedToken(post.client_id);
      const igToken = await db('client_instagram_tokens').where({ client_id: post.client_id }).first();
      const igUserId = igToken.ig_user_id;

      // Re-fetch media URLs from ClickUp if task is linked (S3 URLs expire)
      let mediaUrls = post.media_urls;
      if (post.clickup_task_id) {
        mediaUrls = await this.resolveMediaUrls(post.clickup_task_id, mediaUrls);
      }

      // Pre-download all media and serve from temp URLs (bypasses ClickUp CDN bot blocking)
      // Sequential uploads to avoid Catbox 429 rate limiting
      const resolvedMedia = [];
      for (const m of mediaUrls) {
        const { url: tempUrl, token } = await this._prepareTempMediaUrl(m.url);
        tempTokens.push(token);
        resolvedMedia.push({ ...m, url: tempUrl });
      }
      mediaUrls = resolvedMedia;

      let thumbnailUrl = post.thumbnail_url;
      if (thumbnailUrl) {
        const { url: tempUrl, token } = await this._prepareTempMediaUrl(thumbnailUrl);
        tempTokens.push(token);
        thumbnailUrl = tempUrl;
      }

      logger.info('Publishing post — resolved media URLs', {
        postId,
        postType: post.post_type,
        mediaCount: mediaUrls.length,
        urls: mediaUrls.map((m) => ({ type: m.type, urlPrefix: m.url?.slice(0, 120) })),
        thumbnailUrl: post.thumbnail_url?.slice(0, 120),
      });

      // Separate media by type for smart selection
      const videoMedia = mediaUrls.find((m) => m.type === 'video');
      const imageMedia = mediaUrls.find((m) => m.type === 'image');
      let effectivePostType = post.post_type;

      // For video/reel posts: use the video attachment (not the cover image)
      // For image posts: if only video found, publish as reel
      if (['video', 'reel'].includes(effectivePostType) && !videoMedia && imageMedia) {
        effectivePostType = 'image';
        logger.warn('Post type mismatch: post_type=video/reel but only images found, publishing as image', { postId });
      } else if (effectivePostType === 'image' && !imageMedia && videoMedia) {
        effectivePostType = 'reel';
        logger.warn('Post type mismatch: post_type=image but only video found, publishing as reel', { postId });
      }

      let result;
      switch (effectivePostType) {
        case 'image':
          result = await this.publishImage(igUserId, accessToken, (imageMedia || mediaUrls[0])?.url, post.caption);
          break;
        case 'video':
        case 'reel':
          result = await this.publishVideo(igUserId, accessToken, (videoMedia || mediaUrls[0])?.url, post.caption, effectivePostType === 'reel', thumbnailUrl);
          break;
        case 'story':
          result = await this.publishStory(igUserId, accessToken, mediaUrls[0]);
          break;
        case 'carousel':
          result = await this.publishCarousel(igUserId, accessToken, mediaUrls, post.caption);
          break;
        default:
          throw new Error(`Unsupported post type: ${effectivePostType}`);
      }

      const [updated] = await db('scheduled_posts')
        .where({ id: postId })
        .update({
          status: 'published',
          ig_container_id: result.containerId,
          ig_media_id: result.mediaId,
          ig_permalink: result.permalink,
          published_at: new Date(),
          media_urls: JSON.stringify(mediaUrls),
          updated_at: new Date(),
        })
        .returning('*');

      logger.info('Post published', { postId, igMediaId: result.mediaId });
      eventBus.emit('sse', { type: 'post:updated', payload: { id: postId, status: 'published' } });
      eventBus.emit('sse', { type: 'delivery:updated', payload: { clickup_task_id: post.clickup_task_id } });
      eventBus.emit('sse', { type: 'ranking:updated' });
      this._cleanupTempMedia(tempTokens);

      // Move ClickUp task to "publicação" after successful publish
      if (post.clickup_task_id) {
        await this._moveToPublicacao(post.clickup_task_id);
      }

      // Fallback: update delivery status directly (webhook may be delayed)
      if (post.delivery_id) {
        await db('deliveries')
          .where({ id: post.delivery_id })
          .update({ status: 'publicacao', completed_at: new Date(), updated_at: new Date() });
      } else if (post.clickup_task_id) {
        await db('deliveries')
          .where({ clickup_task_id: post.clickup_task_id })
          .update({ status: 'publicacao', completed_at: new Date(), updated_at: new Date() });
      }

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

      this._cleanupTempMedia(tempTokens);
      logger.error('Post publish failed', { postId, error: err.message, retryCount });
      eventBus.emit('sse', { type: 'post:updated', payload: { id: postId, status: 'failed' } });
      throw err;
    }
  }

  async publishImage(igUserId, accessToken, imageUrl, caption) {
    // Step 1: Create media container
    const containerId = await this._createContainer(igUserId, accessToken, {
      image_url: imageUrl,
      caption,
    });

    // Step 2: Wait for processing (large images need time)
    await this._pollContainerStatus(containerId, accessToken);

    // Step 3: Publish
    const mediaId = await this._publishContainer(igUserId, accessToken, containerId);
    const permalink = await this._getPermalink(mediaId, accessToken);

    return { containerId, mediaId, permalink };
  }

  async publishVideo(igUserId, accessToken, videoUrl, caption, isReel = true, coverUrl = null) {
    // Try with cover first, fallback without if it fails
    if (coverUrl) {
      try {
        logger.info('Reel cover image set', { coverUrl: coverUrl.slice(0, 120) });
        const result = await this._publishVideoContainer(igUserId, accessToken, videoUrl, caption, coverUrl);
        return result;
      } catch (err) {
        logger.warn('Reel publish with cover failed, retrying without cover', { error: err.message });
      }
    }

    // Publish without cover (either no cover provided or cover attempt failed)
    return this._publishVideoContainer(igUserId, accessToken, videoUrl, caption, null);
  }

  async _publishVideoContainer(igUserId, accessToken, videoUrl, caption, coverUrl) {
    const params = {
      media_type: 'REELS',
      video_url: videoUrl,
      caption,
    };
    if (coverUrl) {
      params.cover_url = coverUrl;
    }

    const containerId = await this._createContainer(igUserId, accessToken, params);
    await this._pollContainerStatus(containerId, accessToken);
    const mediaId = await this._publishContainer(igUserId, accessToken, containerId);
    const permalink = await this._getPermalink(mediaId, accessToken);
    return { containerId, mediaId, permalink };
  }

  async publishStory(igUserId, accessToken, media) {
    const isVideo = media.type === 'video';
    const params = {
      media_type: 'STORIES',
      ...(isVideo ? { video_url: media.url } : { image_url: media.url }),
    };

    const containerId = await this._createContainer(igUserId, accessToken, params);

    // Always poll — Instagram needs processing time for both images and videos
    await this._pollContainerStatus(containerId, accessToken);

    const mediaId = await this._publishContainer(igUserId, accessToken, containerId);
    return { containerId, mediaId, permalink: null }; // Stories have no permalink
  }

  async publishCarousel(igUserId, accessToken, mediaItems, caption) {
    // Step 1: Create child containers (2-10 items)
    const childIds = [];
    for (const item of mediaItems.slice(0, 10)) {
      const isVideo = item.type === 'video';
      const params = {
        is_carousel_item: true,
        ...(isVideo ? { video_url: item.url, media_type: 'REELS' } : { image_url: item.url }),
      };

      const childId = await this._createContainer(igUserId, accessToken, params);

      // Always poll — Instagram needs processing time for all media types
      await this._pollContainerStatus(childId, accessToken);

      childIds.push(childId);
    }

    // Step 2: Create carousel container
    const containerId = await this._createContainer(igUserId, accessToken, {
      media_type: 'CAROUSEL',
      caption,
      children: childIds.join(','),
    });

    // Step 3: Poll carousel container before publishing
    await this._pollContainerStatus(containerId, accessToken);

    // Step 4: Publish
    const mediaId = await this._publishContainer(igUserId, accessToken, containerId);
    const permalink = await this._getPermalink(mediaId, accessToken);

    return { containerId, mediaId, permalink };
  }

  async resolveMediaUrls(clickupTaskId, existingUrls) {
    try {
      const token = await clickupOAuth.getDecryptedToken();
      const res = await fetch(`https://api.clickup.com/api/v2/task/${clickupTaskId}`, {
        headers: { Authorization: token },
      });

      if (!res.ok) {
        logger.warn('Failed to re-fetch ClickUp task for media', { clickupTaskId });
        return existingUrls; // Fall back to saved URLs
      }

      const task = await res.json();
      if (!task.attachments || task.attachments.length === 0) {
        return existingUrls;
      }

      return task.attachments
        .filter((a) => a.url && (a.mimetype?.startsWith('image/') || a.mimetype?.startsWith('video/')))
        .map((a, i) => ({
          url: a.url,
          type: a.mimetype?.startsWith('video/') ? 'video' : 'image',
          order: i,
        }));
    } catch (err) {
      logger.warn('Error resolving media URLs', { clickupTaskId, error: err.message });
      return existingUrls;
    }
  }

  async _prepareTempMediaUrl(url) {
    // Normalize Google Drive URLs to direct download (confirm=t bypasses virus-scan HTML page)
    const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    const fetchUrl = driveMatch
      ? `https://drive.google.com/uc?export=download&confirm=t&id=${driveMatch[1]}`
      : url;

    logger.info('Pre-downloading media for temp upload', { fetchUrl: fetchUrl.slice(0, 120) });
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error(`Failed to download media: HTTP ${res.status} from ${fetchUrl.slice(0, 120)}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || 'application/octet-stream';

    // Reject HTML responses — Google Drive returns HTML for scan warnings or expired links
    if (contentType.includes('text/html')) {
      throw new Error(`Download returned HTML instead of media (likely expired or blocked). URL: ${fetchUrl.slice(0, 120)}`);
    }

    // Upload to external temp storage (Railway Fastly blocks Instagram's bot)
    const ext = contentType.includes('video') ? 'mp4' : contentType.includes('image/png') ? 'png' : 'jpg';
    const publicUrl = await this._uploadToTempStorage(buffer, `media.${ext}`, contentType);

    logger.info('Temp media URL created', { publicUrl: publicUrl.slice(0, 120), contentType, sizeMB: (buffer.length / 1024 / 1024).toFixed(1) });
    return { url: publicUrl, token: null };
  }

  async _uploadToTempStorage(buffer, filename, contentType) {
    const blob = new Blob([buffer], { type: contentType });

    const MAX_RETRIES = 3;
    const BACKOFF_MS = [2000, 4000, 8000];

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const formData = new FormData();
      formData.append('reqtype', 'fileupload');
      formData.append('time', '1h');
      formData.append('fileToUpload', blob, filename);

      if (attempt > 0) {
        logger.info('Retrying temp storage upload', { attempt, filename, delay: BACKOFF_MS[attempt - 1] });
        await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt - 1]));
      }

      logger.info('Uploading to temp storage', { filename, contentType, sizeMB: (buffer.length / 1024 / 1024).toFixed(1), attempt });
      const res = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
        method: 'POST',
        body: formData,
      });

      if (res.status === 429 && attempt < MAX_RETRIES) {
        logger.warn('Temp storage rate limited (429), will retry', { attempt, filename });
        continue;
      }

      if (!res.ok) {
        const text = await res.text();
        if (attempt < MAX_RETRIES) continue;
        throw new Error(`Temp storage upload failed after ${MAX_RETRIES} retries: HTTP ${res.status} — ${text.slice(0, 200)}`);
      }

      const url = (await res.text()).trim();
      if (!url.startsWith('http')) {
        if (attempt < MAX_RETRIES) continue;
        throw new Error(`Temp storage error: ${url.slice(0, 200)}`);
      }
      return url;
    }
  }

  getTempMedia(token) {
    return tempMediaStore.get(token) || null;
  }

  storeTempMedia(buffer, contentType, filename) {
    const token = crypto.randomUUID();
    tempMediaStore.set(token, { buffer, contentType, filename, expiresAt: Date.now() + TEMP_MEDIA_TTL });
    return token;
  }

  _cleanupTempMedia(tokens) {
    for (const token of tokens) {
      tempMediaStore.delete(token);
    }
  }

  _normalizeMediaUrlForApi(url) {
    const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    if (driveMatch) {
      return `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
    }
    return url;
  }

  _normalizeMediaUrl(url) {
    // Convert Google Drive view links to direct download
    const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    if (driveMatch) {
      return `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
    }
    // Proxy ClickUp attachments through our server (for browser display only)
    if (url.includes('clickup-attachments.com')) {
      const baseUrl = env.meta.redirectUri.replace('/api/instagram/oauth/callback', '');
      const decoded = decodeURIComponent(url);
      return `${baseUrl}/api/instagram/media-proxy?url=${encodeURIComponent(decoded)}`;
    }
    return url;
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

  // --- Private helpers ---

  async _createContainer(igUserId, accessToken, params) {
    const url = `${GRAPH_URL}/${igUserId}/media`;
    const bodyParams = { ...params, access_token: accessToken };

    logger.info('Creating IG container', {
      url,
      igUserId,
      paramKeys: Object.keys(params),
      videoUrl: (params.video_url || params.image_url || '').slice(0, 200),
      coverUrl: params.cover_url?.slice(0, 200),
      tokenPrefix: accessToken?.slice(0, 8),
      tokenLength: accessToken?.length,
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyParams),
    });

    const responseText = await res.text();
    logger.info('IG container response', { status: res.status, body: responseText.slice(0, 500) });

    if (!res.ok) {
      let parsedErr;
      try { parsedErr = JSON.parse(responseText); } catch { parsedErr = { raw: responseText }; }
      logger.error('Failed to create IG container', { igUserId, error: parsedErr, params: Object.keys(params) });
      throw Object.assign(new Error(parsedErr.error?.message || responseText || 'Failed to create Instagram media container'), { status: 502 });
    }

    const data = JSON.parse(responseText);
    return data.id;
  }

  async _publishContainer(igUserId, accessToken, containerId) {
    const url = `${GRAPH_URL}/${igUserId}/media_publish`;
    const bodyParams = { creation_id: containerId, access_token: accessToken };

    logger.info('Publishing IG container', { url, igUserId, containerId });

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyParams),
    });

    const responseText = await res.text();
    logger.info('IG publish response', { status: res.status, body: responseText.slice(0, 500) });

    if (!res.ok) {
      let parsedErr;
      try { parsedErr = JSON.parse(responseText); } catch { parsedErr = { raw: responseText }; }
      throw Object.assign(new Error(parsedErr.error?.message || responseText || 'Failed to publish Instagram media'), { status: 502 });
    }

    const data = JSON.parse(responseText);
    return data.id;
  }

  async _pollContainerStatus(containerId, accessToken) {
    const startTime = Date.now();
    let attempt = 0;

    while (Date.now() - startTime < MAX_POLL_TIME) {
      const delay = POLL_INTERVALS[Math.min(attempt, POLL_INTERVALS.length - 1)];
      await new Promise((resolve) => setTimeout(resolve, delay));

      const url = `${GRAPH_URL}/${containerId}?fields=id,status_code,status,error_message&access_token=${accessToken}`;
      const res = await fetch(url);
      const data = await res.json();

      logger.info('Polling container status', { containerId, status_code: data.status_code, status: data.status, error_message: data.error_message, attempt, fullResponse: JSON.stringify(data).slice(0, 500) });

      if (data.status_code === 'FINISHED') return;
      if (data.status_code === 'ERROR') {
        const detail = data.error_message || data.status || 'unknown error';
        logger.error('IG container processing FAILED', { containerId, status: data.status, error_message: data.error_message, fullData: JSON.stringify(data) });
        throw new Error(`Media processing failed: ${detail}`);
      }

      attempt++;
    }

    throw new Error('Media processing timed out after 5 minutes');
  }

  async _getPermalink(mediaId, accessToken) {
    try {
      const res = await fetch(`${GRAPH_URL}/${mediaId}?fields=permalink&access_token=${accessToken}`);
      const data = await res.json();
      return data.permalink || null;
    } catch {
      return null;
    }
  }
}

module.exports = new InstagramPublishService();
