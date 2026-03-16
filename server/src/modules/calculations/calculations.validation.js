const Joi = require('joi');

const suggestSchema = Joi.object({
  month: Joi.date().required(),
  user_ids: Joi.array().items(Joi.string().uuid()).optional(),
});

const adjustSchema = Joi.object({
  final_bonus: Joi.number().precision(2).min(0).required(),
});

module.exports = {
  suggestSchema,
  adjustSchema,
};
