const Joi = require('joi');

const smApproveSchema = Joi.object({
  delivery_id: Joi.string().uuid().required(),
  caption: Joi.string().max(2200).allow(null, '').optional(),
  media_urls: Joi.array().items(Joi.object({
    url: Joi.string().required(),
    type: Joi.string().valid('image', 'video').required(),
    order: Joi.number().integer().min(0).optional(),
  })).min(1).required(),
  thumbnail_url: Joi.string().allow(null, '').optional(),
  post_type: Joi.string().valid('reel', 'feed', 'carrossel', 'story', 'image', 'carousel').required(),
});

const sendToClientSchema = Joi.object({
  client_id: Joi.string().uuid().required(),
  items: Joi.array().items(Joi.object({
    delivery_id: Joi.string().uuid().required(),
    caption: Joi.string().max(2200).allow(null, '').optional(),
    media_urls: Joi.array().items(Joi.object({
      url: Joi.string().required(),
      type: Joi.string().valid('image', 'video').required(),
      order: Joi.number().integer().min(0).optional(),
    })).optional(),
    thumbnail_url: Joi.string().allow(null, '').optional(),
    post_type: Joi.string().valid('reel', 'feed', 'carrossel', 'story', 'image', 'carousel').optional(),
  })).min(1).required(),
});

const clientRespondSchema = Joi.object({
  status: Joi.string().valid('approved', 'rejected').required(),
  rejection_reason: Joi.string().max(2000).when('status', {
    is: 'rejected',
    then: Joi.required(),
    otherwise: Joi.allow(null, '').optional(),
  }),
});

module.exports = {
  smApproveSchema,
  sendToClientSchema,
  clientRespondSchema,
};
