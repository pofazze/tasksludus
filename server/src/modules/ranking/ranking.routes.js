const express = require('express');
const rankingController = require('./ranking.controller');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', rankingController.getRanking.bind(rankingController));
router.get('/history', rankingController.getHistory.bind(rankingController));
router.get('/history/:userId', rankingController.getHistory.bind(rankingController));

module.exports = router;
