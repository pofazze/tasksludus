const express = require('express');
const { authenticate } = require('../../middleware/auth');
const controller = require('./approvals.controller');

const router = express.Router();

// Public endpoints (no auth) — must be before authenticate middleware
router.get('/public/:token', controller.getPublicBatch.bind(controller));
router.post('/public/:token/items/:itemId/respond', controller.clientRespond.bind(controller));

// Apply auth middleware for all other routes
router.use(authenticate);

// Social media endpoints
router.get('/pending', controller.listSmPending.bind(controller));
router.get('/corrections', controller.listSmRejected.bind(controller));
router.get('/client/:clientId', controller.listByClient.bind(controller));
router.get('/rejected/:clientId', controller.listRejected.bind(controller));
router.get('/delivery/:deliveryId/media', controller.getDeliveryMedia.bind(controller));
router.post('/sm-approve', controller.smApprove.bind(controller));
router.post('/send-to-client', controller.sendToClient.bind(controller));
router.get('/batches/:clientId', controller.listBatches.bind(controller));
router.post('/batches/:batchId/revoke', controller.revokeBatch.bind(controller));
router.get('/batches/:batchId/items', controller.getBatchItems.bind(controller));
router.put('/batches/:batchId/items/:itemId', controller.updateBatchItem.bind(controller));
router.delete('/batches/:batchId/items/:itemId', controller.removeBatchItem.bind(controller));
router.get('/whatsapp-groups', controller.listWhatsAppGroups.bind(controller));

module.exports = router;
