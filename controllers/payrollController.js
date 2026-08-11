const prisma = require('../config/prisma');
const { generatePayslipPDF } = require('../utils/pdfGenerator');
const { exportToCSV } = require('../utils/csvExporter');

// Helper to calculate payroll for one staff member with Elapsed Eligible Days & Joining Date logic
const calculateStaffPayroll = async (staff_id, month, year) => {
  const staff = await prisma.staff.findUnique({ where: { id: staff_id } });
  if (!staff) throw new Error(`Staff with ID ${staff_id} not found.`);

  const targetMonth = parseInt(month);
  const targetYear = parseInt(year);

  // Total days in target month (e.g. 31 days for August)
  const days_in_month = new Date(targetYear, targetMonth, 0).getDate();

  // Define target month start and end boundaries (UTC)
  const monthStartDate = new Date(Date.UTC(targetYear, targetMonth - 1, 1));
  const monthEndDate = new Date(Date.UTC(targetYear, targetMonth, 0, 23, 59, 59, 999));

  // Determine current date boundary to prevent counting future unelapsed days
  const now = new Date();
  const todayEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999));

  // If target period is in the future relative to current month/year, skip calculation
  if (targetYear > now.getFullYear() || (targetYear === now.getFullYear() && targetMonth > (now.getMonth() + 1))) {
    return {
      skip: true,
      reason: `Cannot generate payroll for future period (${targetMonth}/${targetYear}).`
    };
  }

  // Determine effective month end date for payroll calculation:
  // Past completed month -> monthEndDate.
  // Current in-progress month -> min(monthEndDate, todayEnd) so future days are NOT counted.
  let effectiveMonthEnd = monthEndDate;
  if (targetYear === now.getFullYear() && targetMonth === (now.getMonth() + 1)) {
    effectiveMonthEnd = new Date(Math.min(monthEndDate.getTime(), todayEnd.getTime()));
  }

  // Determine staff joining date (Date only)
  const joiningDateRaw = staff.joining_date ? new Date(staff.joining_date) : monthStartDate;
  const joiningYear = joiningDateRaw.getUTCFullYear();
  const joiningMonth = joiningDateRaw.getUTCMonth() + 1;
  const joiningDay = joiningDateRaw.getUTCDate();
  const joiningDateOnly = new Date(Date.UTC(joiningYear, joiningMonth - 1, joiningDay));

  // Rule D: If Joining Date is after the elapsed payroll period (joining in future)
  if (joiningDateOnly > effectiveMonthEnd) {
    return {
      skip: true,
      reason: `Joining Date (${joiningDateOnly.toISOString().split('T')[0]}) is after elapsed payroll period (${effectiveMonthEnd.toISOString().split('T')[0]}).`
    };
  }

  // Determine effective start date for payroll:
  // Joined before month -> monthStartDate. Joined during month -> joiningDateOnly.
  let effectiveStartDate = monthStartDate;
  if (joiningDateOnly > monthStartDate && joiningDateOnly <= effectiveMonthEnd) {
    effectiveStartDate = joiningDateOnly;
  }

  // Calculate ELAPSED ELIGIBLE DAYS:
  // Exact number of elapsed calendar days between effectiveStartDate and effectiveMonthEnd (inclusive)
  const startMs = Date.UTC(effectiveStartDate.getUTCFullYear(), effectiveStartDate.getUTCMonth(), effectiveStartDate.getUTCDate());
  const endMs = Date.UTC(effectiveMonthEnd.getUTCFullYear(), effectiveMonthEnd.getUTCMonth(), effectiveMonthEnd.getUTCDate());
  const eligible_days = Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1);

  // Prorated factor based on elapsed eligible days out of total days in month
  const proratedFactor = days_in_month > 0 ? eligible_days / days_in_month : 1;

  const monthly_basic_salary = staff.basic_salary || 0;
  const prorated_basic_salary = parseFloat((monthly_basic_salary * proratedFactor).toFixed(2));

  const raw_allowance_transport = staff.allowance_transport || 0;
  const raw_allowance_food = staff.allowance_food || 0;
  const raw_allowance_other = staff.allowance_other || 0;
  const raw_total_allowances = raw_allowance_transport + raw_allowance_food + raw_allowance_other;
  const total_allowances = parseFloat((raw_total_allowances * proratedFactor).toFixed(2));

  // Query attendance ONLY for elapsed eligible period [effectiveStartDate, effectiveMonthEnd]
  // Pre-joining dates (< effectiveStartDate) and future dates (> effectiveMonthEnd) are EXCLUDED.
  const attendances = await prisma.attendance.findMany({
    where: {
      staff_id,
      date: {
        gte: effectiveStartDate,
        lte: effectiveMonthEnd
      }
    }
  });

  let present_days = 0;
  let late_count = 0;
  let absent_days = 0;

  attendances.forEach((att) => {
    if (att.status === 'present') present_days++;
    else if (att.status === 'late') {
      present_days++;
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

  const late_deduction = parseFloat((late_count * (staff.deduction_late_amount || 0)).toFixed(2));
  const absence_deduction = parseFloat((chargeable_absent_days * (staff.deduction_absence_amount || 0)).toFixed(2));
  const other_deduction = parseFloat((staff.deduction_other || 0).toFixed(2));

  const total_deduction = parseFloat((late_deduction + absence_deduction + other_deduction).toFixed(2));
  const net_salary = Math.max(0, parseFloat(((prorated_basic_salary + total_allowances) - total_deduction).toFixed(2)));

  return {
    skip: false,
    staff_id,
    month: targetMonth,
    year: targetYear,
    present_days,
    absent_days,
    late_count,
    allowed_monthly_leaves,
    allowed_paid_leaves,
    leaves_used,
    excess_leaves,
    remaining_leaves,
    basic_salary: monthly_basic_salary,
    days_in_month,
    eligible_days,
    prorated_basic_salary,
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

    if (calculatedData.skip) {
      return res.status(400).json({ error: calculatedData.reason });
    }

    const { skip, ...dataToSave } = calculatedData;

    const payroll = await prisma.payroll.upsert({
      where: {
        staff_id_month_year: {
          staff_id: parseInt(staff_id),
          month: parseInt(month),
          year: parseInt(year)
        }
      },
      update: dataToSave,
      create: dataToSave,
      include: {
        staff: {
          select: {
            id: true,
            full_name: true,
            designation: true,
            email: true,
            phone: true,
            cnic: true,
            joining_date: true
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
    let skippedCount = 0;

    for (const staff of activeStaff) {
      const calculatedData = await calculateStaffPayroll(staff.id, parseInt(month), parseInt(year));
      
      if (calculatedData.skip) {
        skippedCount++;
        continue;
      }

      const { skip, ...dataToSave } = calculatedData;

      const payroll = await prisma.payroll.upsert({
        where: {
          staff_id_month_year: {
            staff_id: staff.id,
            month: parseInt(month),
            year: parseInt(year)
          }
        },
        update: dataToSave,
        create: dataToSave
      });
      results.push(payroll);
    }

    return res.json({
      message: `Payroll generated for ${results.length} eligible staff members (${skippedCount} skipped as joining date is after elapsed period).`,
      count: results.length,
      skipped: skippedCount
    });
  } catch (error) {
    console.error('Generate all payroll error:', error);
    return res.status(500).json({ error: 'Failed to bulk generate payroll.' });
  }
};

// 3. Get payroll list or staff payroll history
const getPayroll = async (req, res) => {
  try {
    const { staff_id } = req.params;
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
            joining_date: true,
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
      Joining_Date: p.staff.joining_date ? new Date(p.staff.joining_date).toISOString().split('T')[0] : 'N/A',
      Month: p.month,
      Year: p.year,
      Days_In_Month: p.days_in_month || 30,
      Elapsed_Eligible_Days: p.eligible_days || 30,
      Monthly_Basic_Salary: p.basic_salary,
      Prorated_Basic_Salary: p.prorated_basic_salary || p.basic_salary,
      Present_Days: p.present_days,
      Absent_Days: p.absent_days,
      Late_Count: p.late_count,
      Allowed_Monthly_Leaves: p.allowed_monthly_leaves,
      Allowed_Paid_Leaves: p.allowed_paid_leaves,
      Leaves_Used: p.leaves_used,
      Excess_Leaves: p.excess_leaves,
      Remaining_Leaves: p.remaining_leaves,
      Total_Allowances: p.total_allowances,
      Late_Deduction: p.late_deduction,
      Absence_Deduction: p.absence_deduction,
      Other_Deduction: p.other_deduction,
      Total_Deduction: p.total_deduction,
      Net_Salary: p.net_salary,
      Generated_At: p.generated_at
    }));

    const fields = [
      'Payroll_ID', 'Staff_ID', 'Staff_Name', 'Designation', 'Email', 'Joining_Date',
      'Month', 'Year', 'Days_In_Month', 'Elapsed_Eligible_Days', 'Monthly_Basic_Salary',
      'Prorated_Basic_Salary', 'Present_Days', 'Absent_Days', 'Late_Count',
      'Allowed_Monthly_Leaves', 'Allowed_Paid_Leaves', 'Leaves_Used',
      'Excess_Leaves', 'Remaining_Leaves', 'Total_Allowances',
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
