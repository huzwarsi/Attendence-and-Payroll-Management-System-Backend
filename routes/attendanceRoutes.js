const express = require('express');
const router = express.Router();
const {
  checkIn,
  breakStart,
  breakEnd,
  checkOut,
  manualAttendance,
  getTodayAttendance,
  getAttendanceList
} = require('../controllers/attendanceController');
const { verifyAdmin, verifyStaff } = require('../middleware/auth');

// Staff mobile scan endpoints
router.post('/checkin', verifyStaff, checkIn);
router.post('/checkout', verifyStaff, checkOut);
router.post('/break-start', verifyStaff, breakStart);
router.post('/break-end', verifyStaff, breakEnd);

// Admin attendance endpoints
router.get('/today', verifyAdmin, getTodayAttendance);
router.post('/manual', verifyAdmin, manualAttendance);
router.get('/', verifyAdmin, getAttendanceList);

module.exports = router;
