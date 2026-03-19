const express = require('express');
const deliveriesController = require('./deliveries.controller');
const { authenticate, managementLevel } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', deliveriesController.list.bind(deliveriesController));
router.get('/stats', deliveriesController.getStats.bind(deliveriesController));
router.get('/:id', deliveriesController.getById.bind(deliveriesController));
router.get('/:id/phases', deliveriesController.getPhases.bind(deliveriesController));
router.post('/', managementLevel, deliveriesController.create.bind(deliveriesController));
router.put('/:id', managementLevel, deliveriesController.update.bind(deliveriesController));

module.exports = router;
