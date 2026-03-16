const express = require('express');
const simulatorController = require('./simulator.controller');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', simulatorController.getData.bind(simulatorController));
router.post('/calculate', simulatorController.calculate.bind(simulatorController));

module.exports = router;
