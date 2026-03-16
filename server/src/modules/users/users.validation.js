const Joi = require('joi');

const updateUserSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  avatar_url: Joi.string().uri().allow(null).optional(),
  whatsapp: Joi.string().max(20).allow(null, '').optional(),
}).min(1);

const updateSalarySchema = Joi.object({
  base_salary: Joi.number().precision(2).min(0).required(),
});

module.exports = {
  updateUserSchema,
  updateSalarySchema,
};
