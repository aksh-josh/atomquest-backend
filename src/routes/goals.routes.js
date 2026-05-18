const router = require('express').Router();
const ctrl = require('../controllers/goals.controller');
const { authenticate, authorize } = require('../middleware/auth');

// Public (authenticated)
router.get('/thrust-areas', authenticate, ctrl.getThrustAreas);
router.get('/cycles', authenticate, ctrl.getCycles);

// Employee
router.get('/my-sheet', authenticate, ctrl.getMyGoalSheet);
router.post('/save', authenticate, authorize('EMPLOYEE', 'MANAGER', 'ADMIN'), ctrl.saveGoals);
router.post('/submit', authenticate, authorize('EMPLOYEE'), ctrl.submitGoalSheet);
router.post('/:goalId/achievement', authenticate, ctrl.updateAchievement);

// Manager
router.get('/team', authenticate, authorize('MANAGER', 'ADMIN'), ctrl.getTeamGoalSheets);
router.put('/:sheetId/approve', authenticate, authorize('MANAGER', 'ADMIN'), ctrl.approveGoalSheet);
router.put('/:sheetId/reject', authenticate, authorize('MANAGER', 'ADMIN'), ctrl.rejectGoalSheet);
router.put('/:sheetId/inline-edit', authenticate, authorize('MANAGER', 'ADMIN'), ctrl.inlineEditGoalSheet);

// Admin / Manager: push shared goals
router.post('/push-shared', authenticate, authorize('ADMIN', 'MANAGER'), ctrl.pushSharedGoal);

module.exports = router;
