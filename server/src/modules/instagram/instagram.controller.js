const db = require('../../config/db');
const env = require('../../config/env');
const oauthService = require('./instagram-oauth.service');
const publishService = require('./instagram-publish.service');
const { schedulePost, cancelScheduledPost, reschedulePost } = require('../../queues');
const { createScheduledPostSchema, updateScheduledPostSchema } = require('./instagram.validation');

class InstagramController {
  // --- OAuth ---

  async getOAuthUrl(req, res, next) {
    try {
      const { clientId } = req.params;
      const url = oauthService.getAuthorizationUrl(clientId);
      res.json({ url });
    } catch (err) {
      next(err);
    }
  }

  async handleOAuthCallback(req, res, next) {
    try {
      const { code, state, error: oauthError } = req.query;

      if (oauthError) {
        return res.redirect(`${env.clientUrl}/clients?instagram_error=${oauthError}`);
      }

      const { clientId } = oauthService.parseState(state);
      await oauthService.handleCallback(code, clientId);

      res.redirect(`${env.clientUrl}/clients/${clientId}?instagram_connected=true`);
    } catch (err) {
      res.redirect(`${env.clientUrl}/clients?instagram_error=${encodeURIComponent(err.message)}`);
    }
  }

  async disconnectOAuth(req, res, next) {
    try {
      const { clientId } = req.params;
      await oauthService.disconnectClient(clientId);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }

  async getConnectionStatus(req, res, next) {
    try {
      const { clientId } = req.params;
      const status = await oauthService.getConnectionStatus(clientId);
      res.json(status);
    } catch (err) {
      next(err);
    }
  }

  // --- Scheduled Posts ---

  async listScheduledPosts(req, res, next) {
    try {
      const { client_id, month, status } = req.query;
      const query = db('scheduled_posts')
        .leftJoin('clients', 'scheduled_posts.client_id', 'clients.id')
        .leftJoin('deliveries', 'scheduled_posts.delivery_id', 'deliveries.id')
        .select(
          'scheduled_posts.*',
          'clients.name as client_name',
          'clients.instagram_account',
          'deliveries.title as delivery_title',
          'deliveries.content_type as delivery_content_type'
        )
        .orderBy('scheduled_posts.scheduled_at', 'asc');

      if (client_id) query.where('scheduled_posts.client_id', client_id);
      if (status) query.where('scheduled_posts.status', status);
      if (month) {
        // month format: 2026-03
        const start = new Date(`${month}-01T00:00:00Z`);
        const end = new Date(start);
        end.setMonth(end.getMonth() + 1);
        query.where('scheduled_posts.scheduled_at', '>=', start);
        query.where('scheduled_posts.scheduled_at', '<', end);
      }

      const posts = await query;
      res.json(posts);
    } catch (err) {
      next(err);
    }
  }

  async getScheduledPost(req, res, next) {
    try {
      const post = await db('scheduled_posts')
        .leftJoin('clients', 'scheduled_posts.client_id', 'clients.id')
        .select('scheduled_posts.*', 'clients.name as client_name')
        .where('scheduled_posts.id', req.params.id)
        .first();

      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }
      res.json(post);
    } catch (err) {
      next(err);
    }
  }

  async createScheduledPost(req, res, next) {
    try {
      const { error, value } = createScheduledPostSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const postData = {
        ...value,
        media_urls: JSON.stringify(value.media_urls),
        status: value.scheduled_at ? 'scheduled' : 'draft',
        created_by: req.user.id,
      };

      const [post] = await db('scheduled_posts').insert(postData).returning('*');

      // If scheduled, add to BullMQ queue
      if (post.status === 'scheduled' && post.scheduled_at) {
        await schedulePost(post.id, post.scheduled_at);
      }

      res.status(201).json(post);
    } catch (err) {
      next(err);
    }
  }

  async updateScheduledPost(req, res, next) {
    try {
      const { error, value } = updateScheduledPostSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const existing = await db('scheduled_posts').where({ id: req.params.id }).first();
      if (!existing) return res.status(404).json({ error: 'Post not found' });

      if (['published', 'publishing'].includes(existing.status)) {
        return res.status(400).json({ error: 'Cannot edit a published or publishing post' });
      }

      const updateData = { ...value, updated_at: new Date() };
      if (value.media_urls) updateData.media_urls = JSON.stringify(value.media_urls);

      // Determine new status
      if (value.scheduled_at) {
        updateData.status = 'scheduled';
      } else if (value.scheduled_at === null) {
        updateData.status = 'draft';
      }

      const [updated] = await db('scheduled_posts')
        .where({ id: req.params.id })
        .update(updateData)
        .returning('*');

      // Update queue job
      if (updated.status === 'scheduled' && updated.scheduled_at) {
        await reschedulePost(updated.id, updated.scheduled_at);
      } else if (updated.status === 'draft') {
        await cancelScheduledPost(updated.id);
      }

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }

  async deleteScheduledPost(req, res, next) {
    try {
      const existing = await db('scheduled_posts').where({ id: req.params.id }).first();
      if (!existing) return res.status(404).json({ error: 'Post not found' });

      if (existing.status === 'publishing') {
        return res.status(400).json({ error: 'Cannot delete a post that is currently publishing' });
      }

      await cancelScheduledPost(existing.id);
      await db('scheduled_posts').where({ id: req.params.id }).del();
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }

  async publishNow(req, res, next) {
    try {
      const post = await db('scheduled_posts').where({ id: req.params.id }).first();
      if (!post) return res.status(404).json({ error: 'Post not found' });

      if (post.status === 'published') {
        return res.status(400).json({ error: 'Post already published' });
      }

      // Remove delayed job if exists, publish immediately
      await cancelScheduledPost(post.id);
      await schedulePost(post.id, new Date());

      res.json({ message: 'Publishing started' });
    } catch (err) {
      next(err);
    }
  }

  async getCalendar(req, res, next) {
    try {
      const { clientId } = req.params;
      const { month } = req.query; // 2026-03

      if (!month) return res.status(400).json({ error: 'month query param required (YYYY-MM)' });

      const start = new Date(`${month}-01T00:00:00Z`);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);

      const posts = await db('scheduled_posts')
        .leftJoin('clients', 'scheduled_posts.client_id', 'clients.id')
        .select('scheduled_posts.*', 'clients.name as client_name', 'clients.instagram_account')
        .where('scheduled_posts.client_id', clientId)
        .where(function () {
          this.whereBetween('scheduled_posts.scheduled_at', [start, end])
            .orWhere(function () {
              this.whereNull('scheduled_posts.scheduled_at')
                .whereBetween('scheduled_posts.created_at', [start, end]);
            });
        })
        .orderBy('scheduled_posts.scheduled_at', 'asc');

      res.json(posts);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new InstagramController();
