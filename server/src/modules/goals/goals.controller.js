const goalsService = require('./goals.service');
const {
  createGoalTemplateSchema,
  updateGoalTemplateSchema,
  createUserGoalSchema,
  updateUserGoalSchema,
} = require('./goals.validation');
const eventBus = require('../../utils/event-bus');

class GoalsController {
  // --- Goal Templates ---

  async listTemplates(req, res, next) {
    try {
      const { role, producer_type, is_active } = req.query;
      const templates = await goalsService.listTemplates({ role, producer_type, is_active });
      res.json(templates);
    } catch (err) {
      next(err);
    }
  }

  async getTemplate(req, res, next) {
    try {
      const template = await goalsService.getTemplateById(req.params.id);
      res.json(template);
    } catch (err) {
      next(err);
    }
  }

  async createTemplate(req, res, next) {
    try {
      const { error, value } = createGoalTemplateSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const template = await goalsService.createTemplate(value);
      eventBus.emit('sse', { type: 'goals:updated' });
      res.status(201).json(template);
    } catch (err) {
      next(err);
    }
  }

  async updateTemplate(req, res, next) {
    try {
      const { error, value } = updateGoalTemplateSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const template = await goalsService.updateTemplate(req.params.id, value);
      eventBus.emit('sse', { type: 'goals:updated' });
      res.json(template);
    } catch (err) {
      next(err);
    }
  }

  async deleteTemplate(req, res, next) {
    try {
      await goalsService.deleteTemplate(req.params.id);
      eventBus.emit('sse', { type: 'goals:updated' });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }

  // --- User Goals ---

  async listUserGoals(req, res, next) {
    try {
      const { user_id, month } = req.query;
      const goals = await goalsService.listUserGoals({ user_id, month });
      res.json(goals);
    } catch (err) {
      next(err);
    }
  }

  async getUserGoal(req, res, next) {
    try {
      const goal = await goalsService.getUserGoalById(req.params.id);
      res.json(goal);
    } catch (err) {
      next(err);
    }
  }

  async createUserGoal(req, res, next) {
    try {
      const { error, value } = createUserGoalSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const goal = await goalsService.createUserGoal(value, req.user.id);
      eventBus.emit('sse', { type: 'goals:updated' });
      res.status(201).json(goal);
    } catch (err) {
      next(err);
    }
  }

  async updateUserGoal(req, res, next) {
    try {
      const { error, value } = updateUserGoalSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const goal = await goalsService.updateUserGoal(req.params.id, value);
      eventBus.emit('sse', { type: 'goals:updated' });
      res.json(goal);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new GoalsController();
