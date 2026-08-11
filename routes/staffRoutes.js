const express = require('express');
const router = express.Router();
const {
  createStaff,
  getStaffList,
  searchStaff,
  getStaffById,
  updateStaff,
  deleteStaff
} = require('../controllers/staffController');
const { verifyAdmin } = require('../middleware/auth');

router.use(verifyAdmin);

router.get('/search', searchStaff);
router.post('/', createStaff);
router.get('/', getStaffList);
router.get('/:id', getStaffById);
router.put('/:id', updateStaff);
router.delete('/:id', deleteStaff);

module.exports = router;
