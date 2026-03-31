const Joi = require('joi');

const createScheduledPostSchema = Joi.object({
  client_id: Joi.string().uuid().required(),
  delivery_id: Joi.string().uuid().allow(null).optional(),
  clickup_task_id: Joi.string().max(50).allow(null, '').optional(),
  caption: Joi.string().max(2200).allow(null, '').optional(),
  post_type: Joi.string().valid('image', 'video', 'reel', 'story', 'carousel').allow(null).required(),
  media_urls: Joi.array().items(Joi.object({
    url: Joi.string().uri().required(),
    type: Joi.string().valid('image', 'video').required(),
    order: Joi.number().integer().min(0).optional(),
  })).min(1).required(),
  thumbnail_url: Joi.string().uri().allow(null, '').optional(),
  scheduled_at: Joi.date().iso().allow(null).optional(),
});

const updateScheduledPostSchema = Joi.object({
  caption: Joi.string().max(2200).allow(null, '').optional(),
  post_type: Joi.string().valid('image', 'video', 'reel', 'story', 'carousel').allow(null).optional(),
  media_urls: Joi.array().items(Joi.object({
    url: Joi.string().uri().required(),
    type: Joi.string().valid('image', 'video').required(),
    order: Joi.number().integer().min(0).optional(),
  })).min(1).optional(),
  thumbnail_url: Joi.string().uri().allow(null, '').optional(),
  scheduled_at: Joi.date().iso().allow(null).optional(),
}).min(1);

module.exports = {
  createScheduledPostSchema,
  updateScheduledPostSchema,
};
