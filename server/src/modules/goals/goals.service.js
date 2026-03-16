const db = require('../../config/db');

class GoalsService {
  // --- Goal Templates ---

  async listTemplates(filters = {}) {
    const query = db('goal_templates').orderBy('name');
    if (filters.role) query.where('role', filters.role);
    if (filters.producer_type) query.where('producer_type', filters.producer_type);
    if (filters.is_active !== undefined) query.where('is_active', filters.is_active);
    return query;
  }

  async getTemplateById(id) {
    const template = await db('goal_templates').where({ id }).first();
    if (!template) {
      throw Object.assign(new Error('Goal template not found'), { status: 404 });
    }
    return template;
  }

  async createTemplate(data) {
    const [template] = await db('goal_templates')
      .insert({
        ...data,
        curve_config: JSON.stringify(data.curve_config),
      })
      .returning('*');
    return template;
  }

  async updateTemplate(id, data) {
    const updateData = { ...data, updated_at: new Date() };
    if (data.curve_config) {
      updateData.curve_config = JSON.stringify(data.curve_config);
    }
    const [updated] = await db('goal_templates')
      .where({ id })
      .update(updateData)
      .returning('*');
    if (!updated) {
      throw Object.assign(new Error('Goal template not found'), { status: 404 });
    }
    return updated;
  }

  async deleteTemplate(id) {
    const deleted = await db('goal_templates').where({ id }).del();
    if (!deleted) {
      throw Object.assign(new Error('Goal template not found'), { status: 404 });
    }
  }

  // --- User Goals ---

  async listUserGoals(filters = {}) {
    const query = db('user_goals')
      .join('users', 'user_goals.user_id', 'users.id')
      .select(
        'user_goals.*',
        'users.name as user_name',
        'users.producer_type as user_producer_type'
      )
      .orderBy('user_goals.month', 'desc');

    if (filters.user_id) query.where('user_goals.user_id', filters.user_id);
    if (filters.month) query.where('user_goals.month', filters.month);
    return query;
  }

  async getUserGoalById(id) {
    const goal = await db('user_goals').where({ id }).first();
    if (!goal) {
      throw Object.assign(new Error('User goal not found'), { status: 404 });
    }
    return goal;
  }

  async createUserGoal(data, definedBy) {
    const insertData = {
      ...data,
      defined_by: definedBy,
    };
    if (data.curve_config) {
      insertData.curve_config = JSON.stringify(data.curve_config);
    }
    const [goal] = await db('user_goals').insert(insertData).returning('*');
    return goal;
  }

  async updateUserGoal(id, data) {
    const updateData = { ...data, updated_at: new Date() };
    if (data.curve_config) {
      updateData.curve_config = JSON.stringify(data.curve_config);
    }
    const [updated] = await db('user_goals')
      .where({ id })
      .update(updateData)
      .returning('*');
    if (!updated) {
      throw Object.assign(new Error('User goal not found'), { status: 404 });
    }
    return updated;
  }
}

module.exports = new GoalsService();
