const usersService = require('./users.service');
const calculationsService = require('../calculations/calculations.service');
const { updateUserSchema, updateSalarySchema } = require('./users.validation');

class UsersController {
  async list(req, res, next) {
    try {
      const { role, producer_type, is_active } = req.query;
      const users = await usersService.list({ role, producer_type, is_active });
      res.json(users);
    } catch (err) {
      next(err);
    }
  }

  async getById(req, res, next) {
    try {
      const user = await usersService.getById(req.params.id);
      res.json(user);
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const { error, value } = updateUserSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const user = await usersService.update(req.params.id, value);

      // Recalculate if base_deliveries changed
      if (value.base_deliveries !== undefined) {
        const now = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        await calculationsService.suggest(month, [req.params.id]).catch(() => {});
      }

      res.json(user);
    } catch (err) {
      next(err);
    }
  }

  async updateSalary(req, res, next) {
    try {
      const { error, value } = updateSalarySchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const user = await usersService.updateSalary(req.params.id, value.base_salary);

      // Recalculate commission for this user's current month
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      await calculationsService.suggest(month, [req.params.id]).catch(() => {});

      res.json(user);
    } catch (err) {
      next(err);
    }
  }

  async toggleAutoCalc(req, res, next) {
    try {
      const user = await usersService.toggleAutoCalc(req.params.id);
      res.json(user);
    } catch (err) {
      next(err);
    }
  }

  async deactivate(req, res, next) {
    try {
      const user = await usersService.deactivate(req.params.id);
      res.json(user);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new UsersController();
