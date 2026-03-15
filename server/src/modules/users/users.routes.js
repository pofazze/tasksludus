const express = require('express');
const usersController = require('./users.controller');
const { authenticate, ceoOnly, adminLevel, managementLevel } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', managementLevel, usersController.list.bind(usersController));
router.get('/:id', usersController.getById.bind(usersController));
router.put('/:id', usersController.update.bind(usersController));
router.patch('/:id/salary', ceoOnly, usersController.updateSalary.bind(usersController));
router.patch('/:id/auto-calc', adminLevel, usersController.toggleAutoCalc.bind(usersController));
router.patch('/:id/deactivate', managementLevel, usersController.deactivate.bind(usersController));

module.exports = router;
