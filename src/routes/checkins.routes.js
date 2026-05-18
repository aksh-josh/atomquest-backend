const router = require('express').Router();
const ctrl = require('../controllers/checkins.controller');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/my', authenticate, ctrl.getMyCheckIns);
router.get('/team', authenticate, authorize('MANAGER', 'ADMIN'), ctrl.getTeamCheckIns);
router.post('/:sheetId', authenticate, authorize('MANAGER', 'ADMIN'), ctrl.submitCheckIn);

module.exports = router;
