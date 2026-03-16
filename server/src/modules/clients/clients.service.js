const db = require('../../config/db');
const env = require('../../config/env');

class ClientsService {
  async list(filters = {}) {
    const query = db('clients').orderBy('name');
    if (filters.is_active !== undefined) query.where('is_active', filters.is_active);
    return query;
  }

  async getById(id) {
    const client = await db('clients').where({ id }).first();
    if (!client) {
      throw Object.assign(new Error('Client not found'), { status: 404 });
    }
    return client;
  }

  async create(data) {
    const [client] = await db('clients').insert(data).returning('*');
    return client;
  }

  async update(id, data) {
    const [updated] = await db('clients')
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    if (!updated) {
      throw Object.assign(new Error('Client not found'), { status: 404 });
    }
    return updated;
  }

  async getOverages(clientId, filters = {}) {
    const query = db('client_overages')
      .where('client_id', clientId)
      .orderBy('month', 'desc');
    if (filters.month) query.where('month', filters.month);
    if (filters.status) query.where('status', filters.status);
    return query;
  }

  // --- Instagram ---

  async getInstagramPosts(clientId) {
    const posts = await db('instagram_posts')
      .where('client_id', clientId)
      .orderBy('posted_at', 'desc');

    if (posts.length === 0) return [];

    const postIds = posts.map((p) => p.id);
    const metrics = await db('instagram_metrics')
      .whereIn('post_id', postIds)
      .orderBy('fetched_at', 'desc');

    // attach latest metrics to each post
    return posts.map((post) => {
      const postMetrics = metrics.find((m) => m.post_id === post.id);
      return { ...post, metrics: postMetrics || null };
    });
  }

  async syncInstagramPosts(clientId) {
    const client = await this.getById(clientId);
    if (!client.instagram_account) {
      throw Object.assign(new Error('Cliente não tem conta Instagram configurada'), { status: 400 });
    }

    // get token from integration config or env
    const integration = await db('integrations').where({ type: 'instagram' }).first();
    const token = integration?.config?.access_token || env.instagram.accessToken;
    if (!token) {
      throw Object.assign(new Error('Token do Instagram não configurado. Configure em Configurações > Integrações.'), { status: 400 });
    }

    // Fetch recent media from Instagram Graph API
    // The token must have access to the business account
    const handle = client.instagram_account.replace('@', '');

    try {
      // First search for the business account by username
      const searchRes = await fetch(
        `https://graph.facebook.com/v21.0/ig_hashtag_search?user_id=me&q=${handle}&access_token=${token}`
      );

      // Alternative: use direct media endpoint if we have the IG user ID stored
      // For now, try fetching media from the linked account
      const mediaRes = await fetch(
        `https://graph.instagram.com/me/media?fields=id,caption,media_type,media_url,permalink,timestamp&access_token=${token}&limit=20`
      );

      if (!mediaRes.ok) {
        const errData = await mediaRes.json().catch(() => ({}));
        throw Object.assign(
          new Error(errData.error?.message || `Instagram API retornou ${mediaRes.status}`),
          { status: 502 }
        );
      }

      const mediaData = await mediaRes.json();
      const posts = mediaData.data || [];

      const typeMap = { VIDEO: 'reel', IMAGE: 'feed', CAROUSEL_ALBUM: 'carousel' };
      let synced = 0;

      for (const post of posts) {
        const existing = await db('instagram_posts')
          .where({ instagram_media_id: post.id })
          .first();

        if (!existing) {
          await db('instagram_posts').insert({
            client_id: clientId,
            instagram_media_id: post.id,
            post_url: post.permalink,
            post_type: typeMap[post.media_type] || 'feed',
            posted_at: post.timestamp,
          });
          synced++;
        }
      }

      // Fetch metrics for each post
      const allPosts = await db('instagram_posts')
        .where('client_id', clientId)
        .orderBy('posted_at', 'desc')
        .limit(20);

      for (const p of allPosts) {
        try {
          const insightsRes = await fetch(
            `https://graph.instagram.com/${p.instagram_media_id}/insights?metric=impressions,reach,engagement,saved&access_token=${token}`
          );
          if (insightsRes.ok) {
            const insightsData = await insightsRes.json();
            const metricsMap = {};
            (insightsData.data || []).forEach((m) => {
              metricsMap[m.name] = m.values?.[0]?.value || 0;
            });

            await db('instagram_metrics').insert({
              post_id: p.id,
              impressions: metricsMap.impressions || 0,
              reach: metricsMap.reach || 0,
              engagement: metricsMap.engagement || 0,
              saves: metricsMap.saved || 0,
            });
          }
        } catch {
          // skip individual post metric failures
        }
      }

      return { synced, total: posts.length };
    } catch (err) {
      if (err.status) throw err;
      throw Object.assign(new Error('Erro ao conectar com Instagram: ' + err.message), { status: 502 });
    }
  }
}

module.exports = new ClientsService();
