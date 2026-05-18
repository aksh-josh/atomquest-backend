const router = require('express').Router();
const { login, register, me, changePassword } = require('../controllers/auth.controller');
const { authenticate, authorize } = require('../middleware/auth');

router.post('/login', login);
router.post('/register', authenticate, authorize('ADMIN'), register);
router.get('/me', authenticate, me);
router.put('/change-password', authenticate, changePassword);

module.exports = router;
