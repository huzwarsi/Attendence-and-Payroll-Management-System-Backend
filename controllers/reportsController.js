const prisma = require('../config/prisma');
const { exportToCSV } = require('../utils/csvExporter');
const PDFDocument = require('pdfkit');

// 1. Staff Report
const getStaffReport = async (req, res) => {
  try {
    const { designation, format } = req.query;
    const where = { is_active: true };

    if (designation) {
      where.designation = { equals: designation, mode: 'insensitive' };
    }

    const staffList = await prisma.staff.findMany({
      where,
      orderBy: { full_name: 'asc' }
    });

    if (format === 'csv') {
      const exportData = staffList.map((s) => ({
        Staff_ID: s.id,
        Full_Name: s.full_name,
        Phone: s.phone,
        Email: s.email,
        CNIC: s.cnic,
        Designation: s.designation,
        Joining_Date: s.joining_date,
        Basic_Salary: s.basic_salary,
        Transport_Allowance: s.allowance_transport,
        Food_Allowance: s.allowance_food,
        Other_Allowance: s.allowance_other,
        Shift_Start: s.check_in_time,
        Shift_End: s.check_out_time,
        Allowed_Monthly_Leaves: s.allowed_monthly_leaves,
        Allowed_Paid_Leaves: s.allowed_paid_leaves
      }));

      const fields = [
        'Staff_ID', 'Full_Name', 'Phone', 'Email', 'CNIC', 'Designation',
        'Joining_Date', 'Basic_Salary', 'Transport_Allowance', 'Food_Allowance',
        'Other_Allowance', 'Shift_Start', 'Shift_End', 'Allowed_Monthly_Leaves', 'Allowed_Paid_Leaves'
      ];

      return exportToCSV(exportData, fields, 'Staff_Directory_Report', res);
    }

    return res.json({ data: staffList });
  } catch (error) {
    console.error('Staff report error:', error);
    return res.status(500).json({ error: 'Failed to generate staff report.' });
  }
};

// 2. Attendance Report
const getAttendanceReport = async (req, res) => {
  try {
    const { from, to, staff_id, designation, format } = req.query;
    const where = {};

    if (staff_id) where.staff_id = parseInt(staff_id);

    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(Date.UTC(new Date(from).getFullYear(), new Date(from).getMonth(), new Date(from).getDate()));
      if (to) where.date.lte = new Date(Date.UTC(new Date(to).getFullYear(), new Date(to).getMonth(), new Date(to).getDate(), 23, 59, 59));
    }

    if (designation) {
      where.staff = { designation: { equals: designation, mode: 'insensitive' } };
    }

    const records = await prisma.attendance.findMany({
      where,
      orderBy: { date: 'desc' },
      include: { staff: true, breaks: true }
    });

    if (format === 'csv') {
      const exportData = records.map((r) => ({
        Attendance_ID: r.id,
        Date: new Date(r.date).toISOString().split('T')[0],
        Staff_ID: r.staff.id,
        Staff_Name: r.staff.full_name,
        Designation: r.staff.designation,
        Status: r.status.toUpperCase(),
        Check_In: r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString() : 'N/A',
        Check_Out: r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString() : 'N/A',
        Total_Working_Hours: r.total_working_hours || 0,
        Total_Break_Minutes: r.total_break_minutes || 0,
        Total_Breaks_Taken: r.breaks.length
      }));

      const fields = [
        'Attendance_ID', 'Date', 'Staff_ID', 'Staff_Name', 'Designation',
        'Status', 'Check_In', 'Check_Out', 'Total_Working_Hours',
        'Total_Break_Minutes', 'Total_Breaks_Taken'
      ];

      return exportToCSV(exportData, fields, 'Attendance_Report', res);
    }

    return res.json({ data: records });
  } catch (error) {
    console.error('Attendance report error:', error);
    return res.status(500).json({ error: 'Failed to generate attendance report.' });
  }
};

// 3. Payroll Summary Report
const getPayrollReport = async (req, res) => {
  try {
    const { from, to, staff_id, designation, format } = req.query;
    const where = {};

    if (staff_id) where.staff_id = parseInt(staff_id);
    if (designation) {
      where.staff = { designation: { equals: designation, mode: 'insensitive' } };
    }

    const records = await prisma.payroll.findMany({
      where,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: { staff: true }
    });

    if (format === 'csv') {
      const exportData = records.map((p) => ({
        Payroll_ID: p.id,
        Month_Year: `${p.month}/${p.year}`,
        Staff_ID: p.staff.id,
        Staff_Name: p.staff.full_name,
        Designation: p.staff.designation,
        Present_Days: p.present_days,
        Absent_Days: p.absent_days,
        Late_Count: p.late_count,
        Leaves_Used: p.leaves_used,
        Excess_Leaves: p.excess_leaves,
        Basic_Salary: p.basic_salary,
        Total_Allowances: p.total_allowances,
        Total_Deduction: p.total_deduction,
        Net_Salary: p.net_salary
      }));

      const fields = [
        'Payroll_ID', 'Month_Year', 'Staff_ID', 'Staff_Name', 'Designation',
        'Present_Days', 'Absent_Days', 'Late_Count', 'Leaves_Used',
        'Excess_Leaves', 'Basic_Salary', 'Total_Allowances', 'Total_Deduction', 'Net_Salary'
      ];

      return exportToCSV(exportData, fields, 'Payroll_Summary_Report', res);
    }

    return res.json({ data: records });
  } catch (error) {
    console.error('Payroll report error:', error);
    return res.status(500).json({ error: 'Failed to generate payroll report.' });
  }
};

module.exports = {
  getStaffReport,
  getAttendanceReport,
  getPayrollReport
};
