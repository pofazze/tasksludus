const express = require('express');
const clientsController = require('./clients.controller');
const { authenticate, managementLevel } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', clientsController.list.bind(clientsController));
router.get('/:id', clientsController.getById.bind(clientsController));
router.post('/', managementLevel, clientsController.create.bind(clientsController));
router.put('/:id', managementLevel, clientsController.update.bind(clientsController));
router.get('/:id/overages', clientsController.getOverages.bind(clientsController));

module.exports = router;
