const db = require('../../config/db');

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
}

module.exports = new ClientsService();
