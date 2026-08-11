const prisma = require('../config/prisma');
const { generatePayslipPDF } = require('../utils/pdfGenerator');
const { exportToCSV } = require('../utils/csvExporter');

// Helper to calculate payroll for one staff member
const calculateStaffPayroll = async (staff_id, month, year) => {
  const staff = await prisma.staff.findUnique({ where: { id: staff_id } });
  if (!staff) throw new Error(`Staff with ID ${staff_id} not found.`);

  // Define start and end of target month
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  // Get attendance records for this month
  const attendances = await prisma.attendance.findMany({
    where: {
      staff_id,
      date: {
        gte: startDate,
        lte: endDate
      }
    }
  });

  let present_days = 0;
  let late_count = 0;
  let absent_days = 0;

  attendances.forEach((att) => {
    if (att.status === 'present') present_days++;
    else if (att.status === 'late') {
      present_days++; // count late as present day in attendance
      late_count++;
    } else if (att.status === 'absent') {
      absent_days++;
    }
  });

  const allowed_monthly_leaves = staff.allowed_monthly_leaves || 0;
  const allowed_paid_leaves = staff.allowed_paid_leaves || 0;
  const total_allowed_leaves = allowed_monthly_leaves + allowed_paid_leaves;

  let leaves_used = 0;
  let excess_leaves = 0;
  let chargeable_absent_days = 0;

  if (absent_days <= total_allowed_leaves) {
    leaves_used = absent_days;
    excess_leaves = 0;
    chargeable_absent_days = 0;
  } else {
    leaves_used = total_allowed_leaves;
    excess_leaves = absent_days - total_allowed_leaves;
    chargeable_absent_days = excess_leaves;
  }

  const remaining_leaves = Math.max(0, total_allowed_leaves - leaves_used);

  const basic_salary = staff.basic_salary || 0;
  const total_allowances = (staff.allowance_transport || 0) + (staff.allowance_food || 0) + (staff.allowance_other || 0);

  const late_deduction = late_count * (staff.deduction_late_amount || 0);
  const absence_deduction = chargeable_absent_days * (staff.deduction_absence_amount || 0);
  const other_deduction = staff.deduction_other || 0;

  const total_deduction = late_deduction + absence_deduction + other_deduction;
  const net_salary = Math.max(0, (basic_salary + total_allowances) - total_deduction);

  return {
    staff_id,
    month: parseInt(month),
    year: parseInt(year),
    present_days,
    absent_days,
    late_count,
    allowed_monthly_leaves,
    allowed_paid_leaves,
    leaves_used,
    excess_leaves,
    remaining_leaves,
    basic_salary,
    total_allowances,
    late_deduction,
    absence_deduction,
    other_deduction,
    total_deduction,
    net_salary
  };
};

// 1. Generate payroll for single staff
const generateSinglePayroll = async (req, res) => {
  try {
    const { staff_id, month, year } = req.body;

    if (!staff_id || !month || !year) {
      return res.status(400).json({ error: 'staff_id, month, and year are required.' });
    }

    const calculatedData = await calculateStaffPayroll(parseInt(staff_id), parseInt(month), parseInt(year));

    const payroll = await prisma.payroll.upsert({
      where: {
        staff_id_month_year: {
          staff_id: parseInt(staff_id),
          month: parseInt(month),
          year: parseInt(year)
        }
      },
      update: calculatedData,
      create: calculatedData,
      include: {
        staff: {
          select: {
            id: true,
            full_name: true,
            designation: true,
            email: true,
            phone: true,
            cnic: true
          }
        }
      }
    });

    return res.json({
      message: 'Payroll generated successfully',
      payroll
    });
  } catch (error) {
    console.error('Generate single payroll error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate payroll.' });
  }
};

// 2. Generate bulk payroll for all active staff
const generateAllPayroll = async (req, res) => {
  try {
    const { month, year } = req.body;

    if (!month || !year) {
      return res.status(400).json({ error: 'month and year are required.' });
    }

    const activeStaff = await prisma.staff.findMany({
      where: { is_active: true }
    });

    const results = [];
    for (const staff of activeStaff) {
      const calculatedData = await calculateStaffPayroll(staff.id, parseInt(month), parseInt(year));
      const payroll = await prisma.payroll.upsert({
        where: {
          staff_id_month_year: {
            staff_id: staff.id,
            month: parseInt(month),
            year: parseInt(year)
          }
        },
        update: calculatedData,
        create: calculatedData
      });
      results.push(payroll);
    }

    return res.json({
      message: `Payroll generated successfully for ${results.length} staff members`,
      count: results.length
    });
  } catch (error) {
    console.error('Generate all payroll error:', error);
    return res.status(500).json({ error: 'Failed to bulk generate payroll.' });
  }
};

// 3. Get payroll list or staff payroll history
const getPayroll = async (req, res) => {
  try {
    const { staff_id } = req.params; // optional param if hit via GET /api/payroll/:staff_id
    const month = req.query.month ? parseInt(req.query.month) : null;
    const year = req.query.year ? parseInt(req.query.year) : null;

    const where = {};
    if (staff_id) where.staff_id = parseInt(staff_id);
    if (month) where.month = month;
    if (year) where.year = year;

    const payrolls = await prisma.payroll.findMany({
      where,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: {
        staff: {
          select: {
            id: true,
            full_name: true,
            designation: true,
            email: true,
            phone: true,
            cnic: true,
            allowance_transport: true,
            allowance_food: true,
            allowance_other: true
          }
        }
      }
    });

    return res.json(payrolls);
  } catch (error) {
    console.error('Get payroll error:', error);
    return res.status(500).json({ error: 'Failed to fetch payroll records.' });
  }
};

// 4. Export PDF payslip
const exportPDF = async (req, res) => {
  try {
    const { payroll_id } = req.params;
    const id = parseInt(payroll_id);

    const payroll = await prisma.payroll.findUnique({
      where: { id },
      include: {
        staff: true
      }
    });

    if (!payroll) {
      return res.status(404).json({ error: 'Payroll record not found.' });
    }

    // Security check: staff can only download their own payslip PDF
    if (req.user.role === 'staff' && req.user.staff_id !== payroll.staff_id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    return generatePayslipPDF(payroll, res);
  } catch (error) {
    console.error('Export PDF error:', error);
    return res.status(500).json({ error: 'Failed to generate PDF payslip.' });
  }
};

// 5. Export CSV payroll report for month/year
const exportCSV = async (req, res) => {
  try {
    const month = req.query.month ? parseInt(req.query.month) : null;
    const year = req.query.year ? parseInt(req.query.year) : null;

    const where = {};
    if (month) where.month = month;
    if (year) where.year = year;

    const payrolls = await prisma.payroll.findMany({
      where,
      include: {
        staff: true
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }]
    });

    const exportData = payrolls.map((p) => ({
      Payroll_ID: p.id,
      Staff_ID: p.staff.id,
      Staff_Name: p.staff.full_name,
      Designation: p.staff.designation,
      Email: p.staff.email,
      Month: p.month,
      Year: p.year,
      Present_Days: p.present_days,
      Absent_Days: p.absent_days,
      Late_Count: p.late_count,
      Allowed_Monthly_Leaves: p.allowed_monthly_leaves,
      Allowed_Paid_Leaves: p.allowed_paid_leaves,
      Leaves_Used: p.leaves_used,
      Excess_Leaves: p.excess_leaves,
      Remaining_Leaves: p.remaining_leaves,
      Basic_Salary: p.basic_salary,
      Total_Allowances: p.total_allowances,
      Late_Deduction: p.late_deduction,
      Absence_Deduction: p.absence_deduction,
      Other_Deduction: p.other_deduction,
      Total_Deduction: p.total_deduction,
      Net_Salary: p.net_salary,
      Generated_At: p.generated_at
    }));

    const fields = [
      'Payroll_ID', 'Staff_ID', 'Staff_Name', 'Designation', 'Email',
      'Month', 'Year', 'Present_Days', 'Absent_Days', 'Late_Count',
      'Allowed_Monthly_Leaves', 'Allowed_Paid_Leaves', 'Leaves_Used',
      'Excess_Leaves', 'Remaining_Leaves', 'Basic_Salary', 'Total_Allowances',
      'Late_Deduction', 'Absence_Deduction', 'Other_Deduction', 'Total_Deduction',
      'Net_Salary', 'Generated_At'
    ];

    const filename = `Payroll_Report_${month || 'All'}_${year || 'All'}`;
    return exportToCSV(exportData, fields, filename, res);
  } catch (error) {
    console.error('Export CSV error:', error);
    return res.status(500).json({ error: 'Failed to generate CSV export.' });
  }
};

module.exports = {
  generateSinglePayroll,
  generateAllPayroll,
  getPayroll,
  exportPDF,
  exportCSV
};
