const Joi = require('joi');

const POST_TYPES = ['image', 'video', 'reel', 'story', 'carousel', 'tiktok_video', 'tiktok_photo'];

const createScheduledPostSchema = Joi.object({
  client_id: Joi.string().uuid().required(),
  delivery_id: Joi.string().uuid().allow(null).optional(),
  clickup_task_id: Joi.string().max(50).allow(null, '').optional(),
  caption: Joi.string().max(2200).allow(null, '').optional(),
  post_type: Joi.string().valid(...POST_TYPES).allow(null).required(),
  media_urls: Joi.array().items(Joi.object({
    url: Joi.string().uri().required(),
    type: Joi.string().valid('image', 'video').required(),
    order: Joi.number().integer().min(0).optional(),
  })).min(1).required(),
  thumbnail_url: Joi.string().uri().allow(null, '').optional(),
  scheduled_at: Joi.date().iso().allow(null).optional(),
  platform: Joi.string().valid('instagram', 'tiktok').default('instagram'),
  platforms: Joi.array().items(Joi.string().valid('instagram', 'tiktok')).optional(),
  platform_overrides: Joi.object().pattern(
    Joi.string().valid('instagram', 'tiktok'),
    Joi.object({
      caption: Joi.string().max(2200).optional(),
      scheduled_at: Joi.date().iso().optional(),
    })
  ).optional(),
});

const updateScheduledPostSchema = Joi.object({
  caption: Joi.string().max(2200).allow(null, '').optional(),
  post_type: Joi.string().valid(...POST_TYPES).allow(null).optional(),
  media_urls: Joi.array().items(Joi.object({
    url: Joi.string().uri().required(),
    type: Joi.string().valid('image', 'video').required(),
    order: Joi.number().integer().min(0).optional(),
  })).min(1).optional(),
  thumbnail_url: Joi.string().uri().allow(null, '').optional(),
  scheduled_at: Joi.date().iso().allow(null).optional(),
  id: Joi.string().uuid().strip(),
  client_id: Joi.string().uuid().strip(),
  delivery_id: Joi.string().uuid().allow(null).strip(),
  clickup_task_id: Joi.string().max(50).allow(null, '').strip(),
  status: Joi.string().strip(),
  platform: Joi.string().valid('instagram', 'tiktok').strip(),
  platforms: Joi.array().items(Joi.string().valid('instagram', 'tiktok')).strip(),
  platform_overrides: Joi.object().strip(),
}).min(1);

module.exports = {
  createScheduledPostSchema,
  updateScheduledPostSchema,
};
