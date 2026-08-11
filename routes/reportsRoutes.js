const express = require('express');
const router = express.Router();
const {
  getStaffReport,
  getAttendanceReport,
  getPayrollReport
} = require('../controllers/reportsController');
const { verifyAdmin } = require('../middleware/auth');

router.use(verifyAdmin);

router.get('/staff', getStaffReport);
router.get('/attendance', getAttendanceReport);
router.get('/payroll', getPayrollReport);

module.exports = router;
