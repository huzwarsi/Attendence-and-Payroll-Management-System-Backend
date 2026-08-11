const express = require('express');
const router = express.Router();
const { adminLogin, staffLogin, logout, getMe } = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');

router.post('/admin/login', adminLogin);
router.post('/staff/login', staffLogin);
router.post('/logout', logout);
router.get('/me', verifyToken, getMe);

module.exports = router;
