const db = require('../../config/db');

class DeliveriesService {
  async list(filters = {}) {
    const query = db('deliveries')
      .join('users', 'deliveries.user_id', 'users.id')
      .join('clients', 'deliveries.client_id', 'clients.id')
      .leftJoin('scheduled_posts', 'scheduled_posts.delivery_id', 'deliveries.id')
      .leftJoin('approval_items', 'approval_items.delivery_id', 'deliveries.id')
      .select(
        'deliveries.*',
        'users.name as user_name',
        'users.avatar_url as user_avatar_url',
        'clients.name as client_name',
        db.raw('COALESCE(scheduled_posts.media_urls, approval_items.media_urls) as media_urls'),
        db.raw('COALESCE(scheduled_posts.thumbnail_url, approval_items.thumbnail_url) as thumbnail_url'),
        db.raw('COALESCE(scheduled_posts.caption, approval_items.caption) as caption'),
        'scheduled_posts.scheduled_at'
      )
      .orderBy('deliveries.created_at', 'desc');

    if (filters.user_id) query.where('deliveries.user_id', filters.user_id);
    if (filters.client_id) query.where('deliveries.client_id', filters.client_id);
    if (filters.month) query.where('deliveries.month', filters.month);
    if (filters.content_type) query.where('deliveries.content_type', filters.content_type);
    if (filters.status) {
      query.where('deliveries.status', filters.status);
    } else {
      query.whereNot('deliveries.status', 'cancelado');
    }
    return query;
  }

  async getById(id) {
    const delivery = await db('deliveries')
      .join('users', 'deliveries.user_id', 'users.id')
      .join('clients', 'deliveries.client_id', 'clients.id')
      .leftJoin('scheduled_posts', 'scheduled_posts.delivery_id', 'deliveries.id')
      .leftJoin('approval_items', 'approval_items.delivery_id', 'deliveries.id')
      .select(
        'deliveries.*',
        'users.name as user_name',
        'users.avatar_url as user_avatar_url',
        'clients.name as client_name',
        db.raw('COALESCE(scheduled_posts.media_urls, approval_items.media_urls) as media_urls'),
        db.raw('COALESCE(scheduled_posts.thumbnail_url, approval_items.thumbnail_url) as thumbnail_url'),
        db.raw('COALESCE(scheduled_posts.caption, approval_items.caption) as caption'),
        'scheduled_posts.scheduled_at'
      )
      .where('deliveries.id', id)
      .first();
    if (!delivery) {
      throw Object.assign(new Error('Delivery not found'), { status: 404 });
    }
    return delivery;
  }

  async create(data) {
    const [delivery] = await db('deliveries').insert(data).returning('*');
    return delivery;
  }

  async update(id, data) {
    const [updated] = await db('deliveries')
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    if (!updated) {
      throw Object.assign(new Error('Delivery not found'), { status: 404 });
    }
    return updated;
  }

  async getPhases(deliveryId) {
    return db('delivery_phases')
      .leftJoin('users', 'delivery_phases.user_id', 'users.id')
      .select(
        'delivery_phases.*',
        'users.name as user_name'
      )
      .where('delivery_phases.delivery_id', deliveryId)
      .orderBy('delivery_phases.entered_at', 'asc');
  }

  async getStats(filters = {}) {
    const query = db('delivery_time_stats').orderBy('period', 'desc');
    if (filters.content_type) query.where('content_type', filters.content_type);
    if (filters.difficulty) query.where('difficulty', filters.difficulty);
    if (filters.period) query.where('period', filters.period);
    return query;
  }
}

module.exports = new DeliveriesService();
