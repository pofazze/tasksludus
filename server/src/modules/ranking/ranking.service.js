const db = require('../../config/db');

class RankingService {
  async getRanking(month) {
    const ranking = await db('monthly_calculations')
      .join('users', 'monthly_calculations.user_id', 'users.id')
      .where('monthly_calculations.month', month)
      .select(
        'users.id',
        'users.name',
        'users.avatar_url',
        'users.producer_type',
        'monthly_calculations.total_deliveries',
        'monthly_calculations.multiplier_applied',
        'monthly_calculations.suggested_bonus',
        'monthly_calculations.final_bonus',
        'monthly_calculations.status'
      )
      .orderBy('monthly_calculations.total_deliveries', 'desc');

    // Check if names should be shown
    const showNames = await db('app_settings')
      .where({ key: 'ranking_show_names' })
      .first();

    const shouldShowNames = showNames ? JSON.parse(showNames.value) : true;

    return ranking.map((entry, index) => ({
      ...entry,
      rank: index + 1,
      position: index + 1,
      multiplier: entry.multiplier_applied,
      bonus: entry.final_bonus != null ? parseFloat(entry.final_bonus) : parseFloat(entry.suggested_bonus) || null,
      name: shouldShowNames ? entry.name : `Produtor ${index + 1}`,
      avatar_url: shouldShowNames ? entry.avatar_url : null,
    }));
  }

  async getHistory(userId, limit = 6) {
    return db('monthly_calculations')
      .where({ user_id: userId })
      .orderBy('month', 'desc')
      .limit(limit);
  }
}

module.exports = new RankingService();
