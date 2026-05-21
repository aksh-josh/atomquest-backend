const router = require('express').Router();
const { getNotifications } = require('../controllers/notifications.controller');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, getNotifications);

module.exports = router;
