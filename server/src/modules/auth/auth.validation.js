const Joi = require('joi');

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

const registerFromInviteSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  password: Joi.string().min(6).required(),
});

const createInviteSchema = Joi.object({
  email: Joi.string().email().required(),
  role: Joi.string()
    .valid('director', 'manager', 'account_manager', 'producer', 'client')
    .required(),
  producer_type: Joi.string()
    .valid('video_editor', 'designer', 'captation', 'social_media')
    .when('role', { is: 'producer', then: Joi.required(), otherwise: Joi.forbidden() }),
  name: Joi.string().min(2).max(100).optional(),
  password: Joi.string().min(6).optional(),
  whatsapp: Joi.string().max(20).optional().allow(''),
  client_id: Joi.string().uuid().when('role', {
    is: 'client',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
});

module.exports = {
  loginSchema,
  registerFromInviteSchema,
  createInviteSchema,
};
