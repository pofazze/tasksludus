const db = require('../../config/db');

class SimulatorService {
  async getData(userId, month) {
    const user = await db('users').where({ id: userId }).first();
    if (!user) {
      throw Object.assign(new Error('User not found'), { status: 404 });
    }

    const goal = await db('user_goals').where({ user_id: userId, month }).first();

    let curveConfig = goal?.curve_config;
    if (!curveConfig && goal?.goal_template_id) {
      const template = await db('goal_templates')
        .where({ id: goal.goal_template_id })
        .first();
      curveConfig = template?.curve_config;
    }

    const [{ count }] = await db('deliveries')
      .where({ user_id: userId, month, status: 'completed' })
      .count('id as count');

    return {
      base_salary: user.base_salary,
      current_deliveries: parseInt(count, 10),
      monthly_target: goal?.monthly_target || null,
      multiplier_cap: goal?.multiplier_cap || null,
      curve_config: curveConfig,
    };
  }

  async calculate(baseSalary, deliveries, curveConfig, multiplierCap) {
    if (!curveConfig || !curveConfig.levels) {
      return { multiplier: 0, bonus: 0 };
    }

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

    const bonus = parseFloat((baseSalary * multiplier).toFixed(2));
    return { multiplier, bonus };
  }
}

module.exports = new SimulatorService();
