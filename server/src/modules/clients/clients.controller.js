const clientsService = require('./clients.service');
const { createClientSchema, updateClientSchema } = require('./clients.validation');

class ClientsController {
  async list(req, res, next) {
    try {
      const { is_active } = req.query;
      const clients = await clientsService.list({ is_active });
      res.json(clients);
    } catch (err) {
      next(err);
    }
  }

  async getById(req, res, next) {
    try {
      const client = await clientsService.getById(req.params.id);
      res.json(client);
    } catch (err) {
      next(err);
    }
  }

  async create(req, res, next) {
    try {
      const { error, value } = createClientSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const client = await clientsService.create(value);
      res.status(201).json(client);
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const { error, value } = updateClientSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const client = await clientsService.update(req.params.id, value);
      res.json(client);
    } catch (err) {
      next(err);
    }
  }

  async getOverages(req, res, next) {
    try {
      const { month, status } = req.query;
      const overages = await clientsService.getOverages(req.params.id, { month, status });
      res.json(overages);
    } catch (err) {
      next(err);
    }
  }
  async getInstagramPosts(req, res, next) {
    try {
      const posts = await clientsService.getInstagramPosts(req.params.id);
      res.json(posts);
    } catch (err) {
      next(err);
    }
  }

  async syncInstagram(req, res, next) {
    try {
      const result = await clientsService.syncInstagramPosts(req.params.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ClientsController();
