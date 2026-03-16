const simulatorService = require('./simulator.service');

class SimulatorController {
  async getData(req, res, next) {
    try {
      const { month } = req.query;
      if (!month) return res.status(400).json({ error: 'Month query param is required' });

      const data = await simulatorService.getData(req.user.id, month);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }

  async calculate(req, res, next) {
    try {
      const { base_salary, deliveries, curve_config, multiplier_cap } = req.body;
      if (!base_salary || deliveries === undefined || !curve_config) {
        return res.status(400).json({ error: 'base_salary, deliveries, and curve_config are required' });
      }

      const result = await simulatorService.calculate(
        base_salary, deliveries, curve_config, multiplier_cap
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new SimulatorController();
