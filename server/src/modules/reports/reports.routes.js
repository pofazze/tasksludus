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

const capacityGuard = reportsAuth('capacity');
router.get('/capacity/active-tasks', capacityGuard, controller.activeTasks);
router.get('/capacity/avg-phase-duration', capacityGuard, controller.avgPhaseDuration);
router.get('/capacity/total-hours', capacityGuard, controller.totalHours);
router.get('/capacity/overdue', capacityGuard, controller.overdue);
router.get('/capacity/phase-distribution', capacityGuard, controller.phaseDistribution);
router.get('/capacity/weekly-heatmap', capacityGuard, controller.weeklyHeatmap);
router.get('/capacity/avg-work-timeseries', capacityGuard, controller.avgWorkTimeseries);

module.exports = router;
