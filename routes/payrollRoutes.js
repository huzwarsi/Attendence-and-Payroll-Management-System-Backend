const express = require('express');
const router = express.Router();
const {
  generateSinglePayroll,
  generateAllPayroll,
  getPayroll,
  exportPDF,
  exportCSV
} = require('../controllers/payrollController');
const { verifyAdmin, verifyToken } = require('../middleware/auth');

router.post('/generate', verifyAdmin, generateSinglePayroll);
router.post('/generate-all', verifyAdmin, generateAllPayroll);
router.get('/export/csv', verifyAdmin, exportCSV);
router.get('/export/pdf/:payroll_id', verifyToken, exportPDF);

router.get('/:staff_id', verifyToken, getPayroll);
router.get('/', verifyAdmin, getPayroll);

module.exports = router;
