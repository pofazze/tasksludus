const express = require('express');
const calculationsController = require('./calculations.controller');
const { authenticate, adminLevel, ceoOnly } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', adminLevel, calculationsController.list.bind(calculationsController));
router.post('/suggest', adminLevel, calculationsController.suggest.bind(calculationsController));
router.put('/:id', adminLevel, calculationsController.adjust.bind(calculationsController));
router.patch('/:id/close', ceoOnly, calculationsController.close.bind(calculationsController));
router.patch('/close-all', ceoOnly, calculationsController.closeAll.bind(calculationsController));

module.exports = router;
