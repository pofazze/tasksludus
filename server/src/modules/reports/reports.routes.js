const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { reportsAuth } = require('./reports.auth');
const controller = require('./reports.controller');

const router = express.Router();

router.use(authenticate);

const qualityGuard = reportsAuth('quality');
router.get('/quality/first-approval-rate', qualityGuard, controller.firstApprovalRate);
router.get('/quality/rejection-rate', qualityGuard, controller.rejectionRate);
router.get('/quality/rework-per-task', qualityGuard, controller.reworkPerTask);
router.get('/quality/rejection-by-category', qualityGuard, controller.rejectionByCategory);
router.get('/quality/rejection-by-post-type', qualityGuard, controller.rejectionByPostType);
router.get('/quality/rejection-by-target', qualityGuard, controller.rejectionByTarget);
router.get('/quality/ranking', qualityGuard, controller.ranking);
router.get('/quality/volume-timeseries', qualityGuard, controller.volumeTimeseries);

module.exports = router;
