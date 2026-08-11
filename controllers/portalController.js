const prisma = require('../config/prisma');

const getTodayDate = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
};

// 1. Dashboard summary for logged in staff
const getPortalDashboard = async (req, res) => {
  try {
    const staff_id = req.user.staff_id || req.user.id;

    const staff = await prisma.staff.findUnique({
      where: { id: staff_id },
      select: {
        id: true,
        full_name: true,
        designation: true,
        email: true,
        phone: true,
        check_in_time: true,
        check_out_time: true,
        allowed_monthly_leaves: true,
        allowed_paid_leaves: true
      }
    });

    if (!staff) {
      return res.status(404).json({ error: 'Staff record not found.' });
    }

    const today = getTodayDate();

    const todayAttendance = await prisma.attendance.findUnique({
      where: {
        staff_id_date: {
          staff_id,
          date: today
        }
      },
      include: { breaks: true }
    });

    const activeBreak = todayAttendance?.breaks.find((b) => b.break_end === null) || null;

    return res.json({
      staff,
      today: {
        date: today,
        has_checked_in: Boolean(todayAttendance && todayAttendance.check_in_time),
        has_checked_out: Boolean(todayAttendance && todayAttendance.check_out_time),
        status: todayAttendance ? todayAttendance.status : 'not_marked',
        check_in_time: todayAttendance?.check_in_time || null,
        check_out_time: todayAttendance?.check_out_time || null,
        total_working_hours: todayAttendance?.total_working_hours || 0,
        total_break_minutes: todayAttendance?.total_break_minutes || 0,
        is_on_break: Boolean(activeBreak),
        active_break_start: activeBreak?.break_start || null,
        breaks: todayAttendance?.breaks || []
      }
    });
  } catch (error) {
    console.error('Get portal dashboard error:', error);
    return res.status(500).json({ error: 'Failed to fetch portal dashboard.' });
  }
};

// 2. Monthly attendance history for logged in staff
const getPortalAttendance = async (req, res) => {
  try {
    const staff_id = req.user.staff_id || req.user.id;
    const now = new Date();
    const month = req.query.month ? parseInt(req.query.month) : now.getMonth() + 1;
    const year = req.query.year ? parseInt(req.query.year) : now.getFullYear();

    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const records = await prisma.attendance.findMany({
      where: {
        staff_id,
        date: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: { date: 'desc' },
      include: { breaks: true }
    });

    return res.json({
      month,
      year,
      records
    });
  } catch (error) {
    console.error('Get portal attendance error:', error);
    return res.status(500).json({ error: 'Failed to fetch attendance history.' });
  }
};

// 3. Payroll history for logged in staff
const getPortalPayroll = async (req, res) => {
  try {
    const staff_id = req.user.staff_id || req.user.id;
    const month = req.query.month ? parseInt(req.query.month) : null;
    const year = req.query.year ? parseInt(req.query.year) : null;

    const where = { staff_id };
    if (month) where.month = month;
    if (year) where.year = year;

    const payrolls = await prisma.payroll.findMany({
      where,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: {
        staff: {
          select: {
            full_name: true,
            designation: true,
            allowance_transport: true,
            allowance_food: true,
            allowance_other: true
          }
        }
      }
    });

    return res.json(payrolls);
  } catch (error) {
    console.error('Get portal payroll error:', error);
    return res.status(500).json({ error: 'Failed to fetch payroll history.' });
  }
};

// 4. Leave summary for logged in staff
const getPortalLeaves = async (req, res) => {
  try {
    const staff_id = req.user.staff_id || req.user.id;
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const staff = await prisma.staff.findUnique({ where: { id: staff_id } });
    if (!staff) return res.status(404).json({ error: 'Staff not found.' });

    const startDate = new Date(Date.UTC(currentYear, currentMonth - 1, 1));
    const endDate = new Date(Date.UTC(currentYear, currentMonth, 0, 23, 59, 59, 999));

    const absentRecords = await prisma.attendance.count({
      where: {
        staff_id,
        status: 'absent',
        date: { gte: startDate, lte: endDate }
      }
    });

    const allowed_monthly_leaves = staff.allowed_monthly_leaves || 0;
    const allowed_paid_leaves = staff.allowed_paid_leaves || 0;
    const total_allowed_leaves = allowed_monthly_leaves + allowed_paid_leaves;

    const leaves_used = Math.min(absentRecords, total_allowed_leaves);
    const excess_leaves = Math.max(0, absentRecords - total_allowed_leaves);
    const remaining_leaves = Math.max(0, total_allowed_leaves - leaves_used);

    return res.json({
      allowed_monthly_leaves,
      allowed_paid_leaves,
      total_allowed_leaves,
      absent_days_count: absentRecords,
      leaves_used,
      excess_leaves,
      remaining_leaves
    });
  } catch (error) {
    console.error('Get portal leaves error:', error);
    return res.status(500).json({ error: 'Failed to fetch leave summary.' });
  }
};

module.exports = {
  getPortalDashboard,
  getPortalAttendance,
  getPortalPayroll,
  getPortalLeaves
};
