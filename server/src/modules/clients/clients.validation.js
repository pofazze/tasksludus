const Joi = require('joi');

const createClientSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  company: Joi.string().max(100).allow(null, '').optional(),
  instagram_account: Joi.string().max(100).allow(null, '').optional(),
  user_id: Joi.string().uuid().allow(null).optional(),
  is_active: Joi.boolean().default(true).optional(),
  clickup_list_id: Joi.string().max(50).allow(null, '').optional(),
  automations_enabled: Joi.boolean().default(false).optional(),
  category: Joi.string().valid('health', 'experts').allow(null, '').optional(),
  social_media_id: Joi.string().uuid().allow(null).optional(),
  whatsapp: Joi.string().max(20).allow(null, '').optional(),
  whatsapp_group: Joi.string().max(50).allow(null, '').optional(),
});

const updateClientSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  company: Joi.string().max(100).allow(null, '').optional(),
  instagram_account: Joi.string().max(100).allow(null, '').optional(),
  is_active: Joi.boolean().optional(),
  user_id: Joi.string().uuid().allow(null).optional(),
  clickup_list_id: Joi.string().max(50).allow(null, '').optional(),
  automations_enabled: Joi.boolean().optional(),
  category: Joi.string().valid('health', 'experts').allow(null, '').optional(),
  social_media_id: Joi.string().uuid().allow(null).optional(),
  whatsapp: Joi.string().max(20).allow(null, '').optional(),
  whatsapp_group: Joi.string().max(50).allow(null, '').optional(),
}).min(1);

module.exports = {
  createClientSchema,
  updateClientSchema,
};
