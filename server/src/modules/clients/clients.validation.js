const Joi = require('joi');

const createClientSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  company: Joi.string().max(100).allow(null, '').optional(),
  instagram_account: Joi.string().max(100).allow(null, '').optional(),
});

const updateClientSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  company: Joi.string().max(100).allow(null, '').optional(),
  instagram_account: Joi.string().max(100).allow(null, '').optional(),
  is_active: Joi.boolean().optional(),
  user_id: Joi.string().uuid().allow(null).optional(),
}).min(1);

module.exports = {
  createClientSchema,
  updateClientSchema,
};
