const Joi = require('joi');

const createDeliverySchema = Joi.object({
  user_id: Joi.string().uuid().required(),
  client_id: Joi.string().uuid().required(),
  clickup_task_id: Joi.string().allow(null, '').optional(),
  title: Joi.string().min(2).max(200).required(),
  content_type: Joi.string().required(),
  difficulty: Joi.string().valid('easy', 'medium', 'hard').allow(null).optional(),
  urgency: Joi.string().valid('normal', 'urgent').allow(null).optional(),
  started_at: Joi.date().allow(null).optional(),
  completed_at: Joi.date().allow(null).optional(),
  status: Joi.string().valid('in_progress', 'completed').default('in_progress'),
  month: Joi.date().required(),
});

const updateDeliverySchema = Joi.object({
  title: Joi.string().min(2).max(200).optional(),
  content_type: Joi.string().optional(),
  difficulty: Joi.string().valid('easy', 'medium', 'hard').allow(null).optional(),
  urgency: Joi.string().valid('normal', 'urgent').allow(null).optional(),
  started_at: Joi.date().allow(null).optional(),
  completed_at: Joi.date().allow(null).optional(),
  status: Joi.string().valid('in_progress', 'completed').optional(),
}).min(1);

module.exports = {
  createDeliverySchema,
  updateDeliverySchema,
};
