const express = require('express');
const goalsController = require('./goals.controller');
const { authenticate, managementLevel } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate);

// Goal Templates
router.get('/templates', goalsController.listTemplates.bind(goalsController));
router.get('/templates/:id', goalsController.getTemplate.bind(goalsController));
router.post('/templates', managementLevel, goalsController.createTemplate.bind(goalsController));
router.put('/templates/:id', managementLevel, goalsController.updateTemplate.bind(goalsController));
router.delete('/templates/:id', managementLevel, goalsController.deleteTemplate.bind(goalsController));

// User Goals
router.get('/', goalsController.listUserGoals.bind(goalsController));
router.get('/:id', goalsController.getUserGoal.bind(goalsController));
router.post('/', managementLevel, goalsController.createUserGoal.bind(goalsController));
router.put('/:id', managementLevel, goalsController.updateUserGoal.bind(goalsController));

module.exports = router;
