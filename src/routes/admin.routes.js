const router = require('express').Router();
const ctrl = require('../controllers/admin.controller');
const { authenticate, authorize } = require('../middleware/auth');

const adminOnly = [authenticate, authorize('ADMIN')];

// Users
router.get('/users', ...adminOnly, ctrl.getAllUsers);
router.post('/users', ...adminOnly, ctrl.createUser);
router.put('/users/:id', ...adminOnly, ctrl.updateUser);
router.delete('/users/:id', ...adminOnly, ctrl.deleteUser);

// Cycles
router.get('/cycles', ...adminOnly, ctrl.getCycles);
router.post('/cycles', ...adminOnly, ctrl.createCycle);
router.put('/cycles/:id/activate', ...adminOnly, ctrl.activateCycle);

// Thrust Areas
router.post('/thrust-areas', ...adminOnly, ctrl.createThrustArea);
router.put('/thrust-areas/:id', ...adminOnly, ctrl.updateThrustArea);

// Goal unlock
router.put('/goals/:sheetId/unlock', ...adminOnly, ctrl.unlockGoalSheet);

// Audit logs
router.get('/audit-logs', ...adminOnly, ctrl.getAuditLogs);

// Dashboard
router.get('/completion-dashboard', ...adminOnly, ctrl.getCompletionDashboard);

module.exports = router;
