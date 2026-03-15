const Joi = require('joi');

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

const registerFromInviteSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  password: Joi.string().min(6).required(),
  google_id: Joi.string().optional(),
});

const createInviteSchema = Joi.object({
  email: Joi.string().email().required(),
  role: Joi.string()
    .valid('director', 'manager', 'account_manager', 'producer', 'client')
    .required(),
  producer_type: Joi.string()
    .valid('video_editor', 'designer', 'captation', 'social_media')
    .when('role', { is: 'producer', then: Joi.required(), otherwise: Joi.forbidden() }),
});

module.exports = {
  loginSchema,
  registerFromInviteSchema,
  createInviteSchema,
};
