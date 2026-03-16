const db = require('../../config/db');

class CalculationsService {
  async list(filters = {}) {
    const query = db('monthly_calculations')
      .join('users', 'monthly_calculations.user_id', 'users.id')
      .select(
        'monthly_calculations.*',
        'users.name as user_name',
        'users.producer_type as user_producer_type'
      )
      .orderBy('monthly_calculations.month', 'desc');

    if (filters.month) query.where('monthly_calculations.month', filters.month);
    if (filters.status) query.where('monthly_calculations.status', filters.status);
    if (filters.user_id) query.where('monthly_calculations.user_id', filters.user_id);
    return query;
  }

  async suggest(month, userIds) {
    // Get users to calculate for
    let usersQuery = db('users')
      .where({ is_active: true, auto_calc_enabled: true })
      .whereNotNull('base_salary')
      .whereIn('role', ['producer']);

    if (userIds && userIds.length > 0) {
      usersQuery = usersQuery.whereIn('id', userIds);
    }

    const users = await usersQuery;
    const results = [];

    for (const user of users) {
      // Get user goal for this month
      const goal = await db('user_goals')
        .where({ user_id: user.id, month })
        .first();

      if (!goal) continue;

      // Count deliveries for this month
      const [{ count }] = await db('deliveries')
        .where({ user_id: user.id, month, status: 'completed' })
        .count('id as count');

      const totalDeliveries = parseInt(count, 10);

      // Get curve config (from goal override or template)
      let curveConfig = goal.curve_config;
      if (!curveConfig && goal.goal_template_id) {
        const template = await db('goal_templates')
          .where({ id: goal.goal_template_id })
          .first();
        curveConfig = template?.curve_config;
      }

      // Calculate multiplier using J-curve
      const multiplier = this._calculateMultiplier(totalDeliveries, curveConfig, goal.multiplier_cap);

      // Calculate bonus
      const suggestedBonus = parseFloat((user.base_salary * multiplier).toFixed(2));

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
            base_salary: user.base_salary,
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
            base_salary: user.base_salary,
            suggested_bonus: suggestedBonus,
            multiplier_applied: multiplier,
            status: 'calculated',
            calculated_at: new Date(),
          })
          .returning('*');
      }

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

    if (multiplierCap && multiplier > multiplierCap) {
      multiplier = multiplierCap;
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
