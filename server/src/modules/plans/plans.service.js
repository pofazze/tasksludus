const db = require('../../config/db');

class PlansService {
  async list(filters = {}) {
    const query = db('plans').orderBy('name');
    if (filters.is_active !== undefined) query.where('is_active', filters.is_active);
    return query;
  }

  async getById(id) {
    const plan = await db('plans').where({ id }).first();
    if (!plan) {
      throw Object.assign(new Error('Plan not found'), { status: 404 });
    }
    const limits = await db('plan_limits').where({ plan_id: id });
    return { ...plan, limits };
  }

  async create(data) {
    const { limits, ...planData } = data;
    const [plan] = await db('plans').insert(planData).returning('*');

    if (limits && limits.length > 0) {
      const limitRows = limits.map((l) => ({ ...l, plan_id: plan.id }));
      await db('plan_limits').insert(limitRows);
    }

    const savedLimits = await db('plan_limits').where({ plan_id: plan.id });
    return { ...plan, limits: savedLimits };
  }

  async update(id, data) {
    const { limits, ...planData } = data;

    if (Object.keys(planData).length > 0) {
      const [updated] = await db('plans')
        .where({ id })
        .update({ ...planData, updated_at: new Date() })
        .returning('*');
      if (!updated) {
        throw Object.assign(new Error('Plan not found'), { status: 404 });
      }
    }

    if (limits) {
      await db('plan_limits').where({ plan_id: id }).del();
      const limitRows = limits.map((l) => ({ ...l, plan_id: id }));
      await db('plan_limits').insert(limitRows);
    }

    return this.getById(id);
  }

  async deletePlan(id) {
    const deleted = await db('plans').where({ id }).del();
    if (!deleted) {
      throw Object.assign(new Error('Plan not found'), { status: 404 });
    }
  }

  async assignToClient(clientId, data) {
    // Deactivate current plan if any
    await db('client_plans')
      .where({ client_id: clientId, status: 'active' })
      .update({ status: 'cancelled', ends_at: new Date() });

    const [clientPlan] = await db('client_plans')
      .insert({
        client_id: clientId,
        plan_id: data.plan_id,
        starts_at: data.starts_at,
        ends_at: data.ends_at || null,
        status: 'active',
      })
      .returning('*');
    return clientPlan;
  }
}

module.exports = new PlansService();
