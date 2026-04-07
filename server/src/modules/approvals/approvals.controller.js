const service = require('./approvals.service');
const { smApproveSchema, sendToClientSchema, clientRespondSchema } = require('./approvals.validation');
const logger = require('../../utils/logger');

class ApprovalsController {
  async listSmPending(req, res, next) {
    try {
      const deliveries = await service.listSmPending(req.user.id);
      res.json(deliveries);
    } catch (err) {
      next(err);
    }
  }

  async listByClient(req, res, next) {
    try {
      const deliveries = await service.listByClient(req.params.clientId);
      res.json(deliveries);
    } catch (err) {
      next(err);
    }
  }

  async listSmRejected(req, res, next) {
    try {
      const deliveries = await service.listSmRejected(req.user.id);
      res.json(deliveries);
    } catch (err) {
      next(err);
    }
  }

  async listRejected(req, res, next) {
    try {
      const deliveries = await service.listRejected(req.params.clientId);
      res.json(deliveries);
    } catch (err) {
      next(err);
    }
  }

  async smApprove(req, res, next) {
    try {
      const { error, value } = smApproveSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const result = await service.smApprove(value.delivery_id, value, req.user.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async sendToClient(req, res, next) {
    try {
      const { error, value } = sendToClientSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const result = await service.sendToClient(value.client_id, value.items, req.user.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async listBatches(req, res, next) {
    try {
      const batches = await service.listBatches(req.params.clientId);
      res.json(batches);
    } catch (err) {
      next(err);
    }
  }

  async revokeBatch(req, res, next) {
    try {
      const result = await service.revokeBatch(req.params.batchId, req.user.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async getBatchItems(req, res, next) {
    try {
      const data = await service.getBatchItems(req.params.batchId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }

  async updateBatchItem(req, res, next) {
    try {
      const result = await service.updateBatchItem(req.params.batchId, req.params.itemId, req.body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async removeBatchItem(req, res, next) {
    try {
      const result = await service.removeBatchItem(req.params.batchId, req.params.itemId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async listWhatsAppGroups(req, res, next) {
    try {
      const groups = await service.listWhatsAppGroups();
      res.json(groups);
    } catch (err) {
      next(err);
    }
  }

  async getPublicBatch(req, res, next) {
    try {
      const data = await service.getBatchByToken(req.params.token);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }

  async clientRespond(req, res, next) {
    try {
      const { error, value } = clientRespondSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const result = await service.clientRespond(
        req.params.token,
        req.params.itemId,
        value.status,
        value.rejection_reason,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ApprovalsController();
