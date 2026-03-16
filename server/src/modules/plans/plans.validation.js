const Joi = require('joi');

const planLimitItem = Joi.object({
  content_type: Joi.string().required(),
  monthly_limit: Joi.number().integer().min(0).required(),
  overage_price: Joi.number().precision(2).min(0).required(),
});

const createPlanSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  description: Joi.string().allow(null, '').optional(),
  limits: Joi.array().items(planLimitItem).min(1).required(),
});

const updatePlanSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  description: Joi.string().allow(null, '').optional(),
  is_active: Joi.boolean().optional(),
  limits: Joi.array().items(planLimitItem).min(1).optional(),
}).min(1);

const assignPlanSchema = Joi.object({
  plan_id: Joi.string().uuid().required(),
  starts_at: Joi.date().required(),
  ends_at: Joi.date().allow(null).optional(),
});

module.exports = {
  createPlanSchema,
  updatePlanSchema,
  assignPlanSchema,
};
