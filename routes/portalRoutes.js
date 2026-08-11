const express = require('express');
const router = express.Router();
const {
  getPortalDashboard,
  getPortalAttendance,
  getPortalPayroll,
  getPortalLeaves
} = require('../controllers/portalController');
const { verifyStaff } = require('../middleware/auth');

router.use(verifyStaff);

router.get('/dashboard', getPortalDashboard);
router.get('/attendance', getPortalAttendance);
router.get('/payroll', getPortalPayroll);
router.get('/leaves', getPortalLeaves);

module.exports = router;
