const express = require('express');
const router = express.Router();
const { generateQR, getTodayQR, validateQRToken } = require('../controllers/qrController');
const { verifyAdmin } = require('../middleware/auth');

router.post('/generate', verifyAdmin, generateQR);
router.get('/today', verifyAdmin, getTodayQR);
router.get('/validate/:token', validateQRToken);

module.exports = router;
