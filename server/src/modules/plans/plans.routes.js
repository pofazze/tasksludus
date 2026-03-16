const express = require('express');
const plansController = require('./plans.controller');
const { authenticate, managementLevel } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', plansController.list.bind(plansController));
router.get('/:id', plansController.getById.bind(plansController));
router.post('/', managementLevel, plansController.create.bind(plansController));
router.put('/:id', managementLevel, plansController.update.bind(plansController));
router.delete('/:id', managementLevel, plansController.deletePlan.bind(plansController));
router.post('/clients/:clientId/assign', managementLevel, plansController.assignToClient.bind(plansController));

module.exports = router;
