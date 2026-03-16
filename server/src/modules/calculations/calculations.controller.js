const calculationsService = require('./calculations.service');
const { suggestSchema, adjustSchema } = require('./calculations.validation');

class CalculationsController {
  async list(req, res, next) {
    try {
      const { month, status, user_id } = req.query;
      const calcs = await calculationsService.list({ month, status, user_id });
      res.json(calcs);
    } catch (err) {
      next(err);
    }
  }

  async suggest(req, res, next) {
    try {
      const { error, value } = suggestSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const results = await calculationsService.suggest(value.month, value.user_ids);
      res.json(results);
    } catch (err) {
      next(err);
    }
  }

  async adjust(req, res, next) {
    try {
      const { error, value } = adjustSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const calc = await calculationsService.adjust(req.params.id, value.final_bonus);
      res.json(calc);
    } catch (err) {
      next(err);
    }
  }

  async close(req, res, next) {
    try {
      const calc = await calculationsService.close(req.params.id, req.user.id);
      res.json(calc);
    } catch (err) {
      next(err);
    }
  }

  async closeAll(req, res, next) {
    try {
      const { month } = req.body;
      if (!month) return res.status(400).json({ error: 'Month is required' });

      const calcs = await calculationsService.closeAll(month, req.user.id);
      res.json(calcs);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new CalculationsController();
