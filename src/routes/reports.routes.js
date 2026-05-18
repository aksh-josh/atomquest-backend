const router = require('express').Router();
const ctrl = require('../controllers/reports.controller');
const { authenticate } = require('../middleware/auth');

router.get('/achievement', authenticate, ctrl.getAchievementReport);
router.get('/completion', authenticate, ctrl.getCompletionReport);

module.exports = router;
