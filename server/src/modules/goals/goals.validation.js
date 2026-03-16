const Joi = require('joi');

const curveLevel = Joi.object({
  from: Joi.number().integer().min(0).required(),
  to: Joi.number().integer().min(1).allow(null).required(),
  multiplier: Joi.number().precision(2).min(0).required(),
});

const createGoalTemplateSchema = Joi.object({
  role: Joi.string().valid('producer').required(),
  producer_type: Joi.string()
    .valid('video_editor', 'designer', 'captation', 'social_media')
    .required(),
  name: Joi.string().min(2).max(100).required(),
  monthly_target: Joi.number().integer().min(1).required(),
  multiplier_cap: Joi.number().precision(2).min(1).required(),
  curve_config: Joi.object({
    levels: Joi.array().items(curveLevel).min(1).required(),
  }).required(),
});

const updateGoalTemplateSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  monthly_target: Joi.number().integer().min(1).optional(),
  multiplier_cap: Joi.number().precision(2).min(1).optional(),
  curve_config: Joi.object({
    levels: Joi.array().items(curveLevel).min(1).required(),
  }).optional(),
  is_active: Joi.boolean().optional(),
}).min(1);

const createUserGoalSchema = Joi.object({
  user_id: Joi.string().uuid().required(),
  goal_template_id: Joi.string().uuid().allow(null).optional(),
  month: Joi.date().required(),
  monthly_target: Joi.number().integer().min(1).required(),
  multiplier_cap: Joi.number().precision(2).min(1).optional(),
  curve_config: Joi.object({
    levels: Joi.array().items(curveLevel).min(1).required(),
  }).optional(),
});

const updateUserGoalSchema = Joi.object({
  monthly_target: Joi.number().integer().min(1).optional(),
  multiplier_cap: Joi.number().precision(2).min(1).optional(),
  curve_config: Joi.object({
    levels: Joi.array().items(curveLevel).min(1).required(),
  }).optional(),
}).min(1);

module.exports = {
  createGoalTemplateSchema,
  updateGoalTemplateSchema,
  createUserGoalSchema,
  updateUserGoalSchema,
};
