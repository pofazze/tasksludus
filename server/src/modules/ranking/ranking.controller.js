const rankingService = require('./ranking.service');

class RankingController {
  async getRanking(req, res, next) {
    try {
      const { month } = req.query;
      if (!month) return res.status(400).json({ error: 'Month query param is required' });

      const ranking = await rankingService.getRanking(month);
      res.json(ranking);
    } catch (err) {
      next(err);
    }
  }

  async getHistory(req, res, next) {
    try {
      const userId = req.params.userId || req.user.id;
      const history = await rankingService.getHistory(userId);
      res.json(history);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new RankingController();
