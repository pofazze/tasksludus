const db = require('../../config/db');
const logger = require('../../utils/logger');

// Default J-curve for producers without a specific goal template
const DEFAULT_CURVE = {
  levels: [
    { from: 0, to: 4, multiplier: 0 },
    { from: 5, to: 9, multiplier: 0.3 },
    { from: 10, to: 14, multiplier: 0.6 },
    { from: 15, to: 19, multiplier: 1.0 },
    { from: 20, to: 29, multiplier: 1.3 },
    { from: 30, to: null, multiplier: 1.5 },
  ],
};

class CalculationsService {
  /**
   * Resolve salary for a user: first check users.base_salary,
   * then fall back to role-based salary in app_settings.
   */
  async _resolveSalary(user) {
    if (user.base_salary) return parseFloat(user.base_salary);

    // Build role key: producer with type → "role:producer:video_editor", else "role:director"
    let roleKey = `role:${user.role}`;
    if (user.role === 'producer' && user.producer_type) {
      roleKey = `role:producer:${user.producer_type}`;
    }

    const setting = await db('app_settings').where({ key: roleKey }).first();
    if (setting) {
      const val = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value;
      if (val?.salary) return parseFloat(val.salary);
    }
    return 0;
  }

  /**
   * Resolve base deliveries threshold: user override → role setting → default 15.
   */
  async _resolveBaseDeliveries(user) {
    if (user.base_deliveries != null) return parseInt(user.base_deliveries, 10);

    let roleKey = `role:${user.role}`;
    if (user.role === 'producer' && user.producer_type) {
      roleKey = `role:producer:${user.producer_type}`;
    }

    const setting = await db('app_settings').where({ key: roleKey }).first();
    if (setting) {
      const val = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value;
      if (val?.expected_deliveries != null) return parseInt(val.expected_deliveries, 10);
    }
    return 15;
  }

  async list(filters = {}) {
    const query = db('monthly_calculations')
      .join('users', 'monthly_calculations.user_id', 'users.id')
      .select(
        'monthly_calculations.*',
        'users.name as user_name',
        'users.email as user_email',
        'users.producer_type as user_producer_type'
      )
      .orderBy('users.name');

    if (filters.month) query.where('monthly_calculations.month', filters.month);
    if (filters.status) query.where('monthly_calculations.status', filters.status);
    if (filters.user_id) query.where('monthly_calculations.user_id', filters.user_id);
    return query;
  }

  async suggest(month, userIds) {
    // Get active producers (don't require base_salary — use 0 as default)
    let usersQuery = db('users')
      .where({ is_active: true })
      .whereIn('role', ['producer', 'director']);

    if (userIds && userIds.length > 0) {
      usersQuery = usersQuery.whereIn('id', userIds);
    }

    const users = await usersQuery;
    const results = [];

    for (const user of users) {
      // Get or auto-create user goal for this month
      let goal = await db('user_goals')
        .where({ user_id: user.id, month })
        .first();

      if (!goal) {
        // Auto-create a default goal based on template or default curve
        const template = await db('goal_templates')
          .where({ role: user.role, is_active: true })
          .modify((qb) => {
            if (user.producer_type) qb.where('producer_type', user.producer_type);
          })
          .first();

        const [newGoal] = await db('user_goals')
          .insert({
            user_id: user.id,
            month,
            goal_template_id: template?.id || null,
            monthly_target: template?.monthly_target || 15,
            multiplier_cap: template?.multiplier_cap || 2.0,
            curve_config: JSON.stringify(template?.curve_config || DEFAULT_CURVE),
            defined_by: user.id,
          })
          .returning('*');
        goal = newGoal;
        logger.info(`Auto-created goal for ${user.name} (${month})`);
      }

      // Count all deliveries assigned to this user this month (any status).
      // In our pipeline, each phase has a different assignee, so the current
      // assignee reflects who is actively working on each piece.
      const [{ count }] = await db('deliveries')
        .where({ user_id: user.id })
        .where('month', month)
        .count('id as count');

      const totalDeliveries = parseInt(count, 10);

      // Count published deliveries separately for info
      const [{ count: totalPublished }] = await db('deliveries')
        .where({ user_id: user.id })
        .where('month', month)
        .whereIn('status', ['publicado', 'completed'])
        .count('id as count');

      // Get curve config
      let curveConfig = goal.curve_config;
      if (typeof curveConfig === 'string') {
        try { curveConfig = JSON.parse(curveConfig); } catch { curveConfig = null; }
      }
      if (!curveConfig && goal.goal_template_id) {
        const template = await db('goal_templates')
          .where({ id: goal.goal_template_id })
          .first();
        curveConfig = template?.curve_config;
        if (typeof curveConfig === 'string') {
          try { curveConfig = JSON.parse(curveConfig); } catch { curveConfig = null; }
        }
      }
      if (!curveConfig) curveConfig = DEFAULT_CURVE;

      // Linear multiplier: excess / base.
      // Minimum 10 excess to activate. At 2x base, multiplier = 1.0 (salary doubled).
      const baseDeliveries = await this._resolveBaseDeliveries(user);
      const excess = Math.max(0, totalDeliveries - baseDeliveries);
      const cap = parseFloat(goal.multiplier_cap) || 2.0;
      let multiplier = 0;
      if (excess >= 10) {
        multiplier = Math.min(excess / baseDeliveries, cap);
        multiplier = parseFloat(multiplier.toFixed(2));
      }

      // Calculate bonus (resolve from user or role settings)
      const baseSalary = await this._resolveSalary(user);
      const suggestedBonus = parseFloat((baseSalary * multiplier).toFixed(2));

      // Upsert calculation
      const existing = await db('monthly_calculations')
        .where({ user_id: user.id, month })
        .first();

      let calc;
      if (existing) {
        [calc] = await db('monthly_calculations')
          .where({ id: existing.id })
          .update({
            total_deliveries: totalDeliveries,
            base_salary: baseSalary,
            suggested_bonus: suggestedBonus,
            multiplier_applied: multiplier,
            status: 'calculated',
            calculated_at: new Date(),
            updated_at: new Date(),
          })
          .returning('*');
      } else {
        [calc] = await db('monthly_calculations')
          .insert({
            user_id: user.id,
            month,
            total_deliveries: totalDeliveries,
            base_salary: baseSalary,
            suggested_bonus: suggestedBonus,
            multiplier_applied: multiplier,
            status: 'calculated',
            calculated_at: new Date(),
          })
          .returning('*');
      }

      // Attach extra info for frontend
      calc.total_published = parseInt(totalPublished, 10);
      results.push(calc);
    }

    return results;
  }

  _calculateMultiplier(deliveries, curveConfig, multiplierCap) {
    if (!curveConfig || !curveConfig.levels) return 0;

    let multiplier = 0;
    for (const level of curveConfig.levels) {
      if (deliveries >= level.from && (level.to === null || deliveries <= level.to)) {
        multiplier = level.multiplier;
        break;
      }
    }

    if (multiplierCap && multiplier > parseFloat(multiplierCap)) {
      multiplier = parseFloat(multiplierCap);
    }

    return multiplier;
  }

  async adjust(id, finalBonus) {
    const [updated] = await db('monthly_calculations')
      .where({ id })
      .update({
        final_bonus: finalBonus,
        status: 'adjusted',
        updated_at: new Date(),
      })
      .returning('*');
    if (!updated) {
      throw Object.assign(new Error('Calculation not found'), { status: 404 });
    }
    return updated;
  }

  async close(id, closedBy) {
    const [updated] = await db('monthly_calculations')
      .where({ id })
      .update({
        status: 'closed',
        closed_by: closedBy,
        closed_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');
    if (!updated) {
      throw Object.assign(new Error('Calculation not found'), { status: 404 });
    }
    return updated;
  }

  async closeAll(month, closedBy) {
    const updated = await db('monthly_calculations')
      .where({ month })
      .whereIn('status', ['calculated', 'adjusted'])
      .update({
        status: 'closed',
        closed_by: closedBy,
        closed_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');
    return updated;
  }
}

module.exports = new CalculationsService();
