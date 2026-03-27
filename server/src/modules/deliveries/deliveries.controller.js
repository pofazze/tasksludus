const deliveriesService = require('./deliveries.service');
const { createDeliverySchema, updateDeliverySchema } = require('./deliveries.validation');
const eventBus = require('../../utils/event-bus');

class DeliveriesController {
  async list(req, res, next) {
    try {
      const { user_id, client_id, month, content_type, status } = req.query;
      const deliveries = await deliveriesService.list({
        user_id, client_id, month, content_type, status,
      });
      res.json(deliveries);
    } catch (err) {
      next(err);
    }
  }

  async getById(req, res, next) {
    try {
      const delivery = await deliveriesService.getById(req.params.id);
      res.json(delivery);
    } catch (err) {
      next(err);
    }
  }

  async create(req, res, next) {
    try {
      const { error, value } = createDeliverySchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const delivery = await deliveriesService.create(value);
      eventBus.emit('sse', { type: 'delivery:created', payload: { id: delivery.id } });
      res.status(201).json(delivery);
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const { error, value } = updateDeliverySchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const delivery = await deliveriesService.update(req.params.id, value);
      eventBus.emit('sse', { type: 'delivery:updated', payload: { id: delivery.id } });
      res.json(delivery);
    } catch (err) {
      next(err);
    }
  }

  async getPhases(req, res, next) {
    try {
      const phases = await deliveriesService.getPhases(req.params.id);
      res.json(phases);
    } catch (err) {
      next(err);
    }
  }

  async getStats(req, res, next) {
    try {
      const { content_type, difficulty, period } = req.query;
      const stats = await deliveriesService.getStats({ content_type, difficulty, period });
      res.json(stats);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new DeliveriesController();
