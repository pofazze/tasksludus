const db = require('../../config/db');

class UsersService {
  async list(filters = {}) {
    const query = db('users')
      .select('id', 'name', 'email', 'role', 'producer_type', 'is_active', 'base_salary', 'auto_calc_enabled', 'avatar_url', 'whatsapp', 'clickup_id', 'created_at')
      .orderBy('name');

    if (filters.role) query.where('role', filters.role);
    if (filters.producer_type) query.where('producer_type', filters.producer_type);
    if (filters.is_active !== undefined) query.where('is_active', filters.is_active);

    return query;
  }

  async getById(id) {
    const user = await db('users')
      .where({ id })
      .select('id', 'name', 'email', 'role', 'producer_type', 'is_active', 'base_salary', 'auto_calc_enabled', 'avatar_url', 'created_at', 'updated_at')
      .first();

    if (!user) {
      throw Object.assign(new Error('User not found'), { status: 404 });
    }

    return user;
  }

  async update(id, data) {
    const [updated] = await db('users')
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('id', 'name', 'email', 'role', 'producer_type', 'is_active', 'avatar_url');

    if (!updated) {
      throw Object.assign(new Error('User not found'), { status: 404 });
    }

    return updated;
  }

  async updateSalary(id, baseSalary) {
    const [updated] = await db('users')
      .where({ id })
      .update({ base_salary: baseSalary, updated_at: new Date() })
      .returning('id', 'name', 'base_salary');

    if (!updated) {
      throw Object.assign(new Error('User not found'), { status: 404 });
    }

    return updated;
  }

  async toggleAutoCalc(id) {
    const user = await db('users').where({ id }).first();
    if (!user) {
      throw Object.assign(new Error('User not found'), { status: 404 });
    }

    const [updated] = await db('users')
      .where({ id })
      .update({ auto_calc_enabled: !user.auto_calc_enabled, updated_at: new Date() })
      .returning('id', 'name', 'auto_calc_enabled');

    return updated;
  }

  async deactivate(id) {
    const [updated] = await db('users')
      .where({ id })
      .update({ is_active: false, updated_at: new Date() })
      .returning('id', 'name', 'is_active');

    if (!updated) {
      throw Object.assign(new Error('User not found'), { status: 404 });
    }

    return updated;
  }
}

module.exports = new UsersService();
