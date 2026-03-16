const plansService = require('./plans.service');
const { createPlanSchema, updatePlanSchema, assignPlanSchema } = require('./plans.validation');

class PlansController {
  async list(req, res, next) {
    try {
      const { is_active } = req.query;
      const plans = await plansService.list({ is_active });
      res.json(plans);
    } catch (err) {
      next(err);
    }
  }

  async getById(req, res, next) {
    try {
      const plan = await plansService.getById(req.params.id);
      res.json(plan);
    } catch (err) {
      next(err);
    }
  }

  async create(req, res, next) {
    try {
      const { error, value } = createPlanSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const plan = await plansService.create(value);
      res.status(201).json(plan);
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const { error, value } = updatePlanSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const plan = await plansService.update(req.params.id, value);
      res.json(plan);
    } catch (err) {
      next(err);
    }
  }

  async deletePlan(req, res, next) {
    try {
      await plansService.deletePlan(req.params.id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }

  async assignToClient(req, res, next) {
    try {
      const { error, value } = assignPlanSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const clientPlan = await plansService.assignToClient(req.params.clientId, value);
      res.status(201).json(clientPlan);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new PlansController();
