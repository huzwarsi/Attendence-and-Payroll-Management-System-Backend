const PDFDocument = require('pdfkit');

const generatePayslipPDF = (payroll, res) => {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=payslip_${payroll.staff.full_name.replace(/\s+/g, '_')}_${payroll.month}_${payroll.year}.pdf`);

  doc.pipe(res);

  const primaryColor = '#1e293b';
  const accentColor = '#2563eb';
  const grayColor = '#64748b';
  const lightBg = '#f8fafc';

  // Header Banner
  doc.rect(40, 40, 515, 65).fill(primaryColor);
  doc.fillColor('#ffffff').fontSize(20).font('Helvetica-Bold').text('ATTENDANCE & PAYROLL SYSTEM', 55, 55);
  doc.fontSize(11).font('Helvetica').text('CONFIDENTIAL SALARY PAYSLIP', 55, 80);

  // Month & Year Tag
  doc.fontSize(12).font('Helvetica-Bold').text(`${payroll.month}/${payroll.year}`, 460, 65, { align: 'right' });

  doc.moveDown(3);

  // Staff Info Table Box
  const startY = 120;
  doc.rect(40, startY, 515, 85).fill(lightBg).stroke('#e2e8f0');

  doc.fillColor(primaryColor).fontSize(11).font('Helvetica-Bold');
  doc.text('STAFF DETAILS', 55, startY + 10);

  doc.fillColor(grayColor).fontSize(9).font('Helvetica');
  doc.text('Employee Name:', 55, startY + 30);
  doc.text('Employee ID:', 55, startY + 45);
  doc.text('Designation:', 55, startY + 60);

  doc.fillColor(primaryColor).font('Helvetica-Bold');
  doc.text(payroll.staff.full_name, 140, startY + 30);
  doc.text(`EMP-${payroll.staff.id}`, 140, startY + 45);
  doc.text(payroll.staff.designation, 140, startY + 60);

  doc.fillColor(grayColor).font('Helvetica');
  doc.text('Email:', 320, startY + 30);
  doc.text('Phone:', 320, startY + 45);
  doc.text('CNIC:', 320, startY + 60);

  doc.fillColor(primaryColor).font('Helvetica-Bold');
  doc.text(payroll.staff.email, 380, startY + 30);
  doc.text(payroll.staff.phone, 380, startY + 45);
  doc.text(payroll.staff.cnic, 380, startY + 60);

  // Attendance & Leave Summary Box
  const attY = 220;
  doc.rect(40, attY, 515, 75).fill('#f1f5f9').stroke('#cbd5e1');
  doc.fillColor(primaryColor).fontSize(11).font('Helvetica-Bold').text('ATTENDANCE & LEAVE BREAKDOWN', 55, attY + 10);

  doc.fontSize(9).font('Helvetica').fillColor(grayColor);
  doc.text(`Present Days: ${payroll.present_days}`, 55, attY + 32);
  doc.text(`Absent Days: ${payroll.absent_days}`, 170, attY + 32);
  doc.text(`Late Count: ${payroll.late_count}`, 285, attY + 32);

  doc.text(`Allowed Monthly Leaves: ${payroll.allowed_monthly_leaves}`, 55, attY + 50);
  doc.text(`Allowed Paid Leaves: ${payroll.allowed_paid_leaves}`, 170, attY + 50);
  doc.text(`Leaves Used: ${payroll.leaves_used}`, 285, attY + 50);
  doc.text(`Excess Leaves: ${payroll.excess_leaves}`, 400, attY + 50);

  // Financial Breakdown Tables (Earnings & Deductions side by side)
  const finY = 310;

  // Earnings Header
  doc.rect(40, finY, 250, 25).fill(accentColor);
  doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text('EARNINGS / ALLOWANCES', 50, finY + 8);
  doc.text('AMOUNT ($/PKR)', 190, finY + 8, { align: 'right' });

  // Earnings Items
  let eY = finY + 30;
  const earnings = [
    { label: 'Basic Salary', val: payroll.basic_salary },
    { label: 'Transport Allowance', val: payroll.staff?.allowance_transport || 0 },
    { label: 'Food Allowance', val: payroll.staff?.allowance_food || 0 },
    { label: 'Other Allowances', val: payroll.staff?.allowance_other || 0 }
  ];

  earnings.forEach((item, idx) => {
    doc.rect(40, eY + (idx * 22), 250, 22).fill(idx % 2 === 0 ? '#ffffff' : '#f8fafc').stroke('#e2e8f0');
    doc.fillColor(primaryColor).fontSize(9).font('Helvetica').text(item.label, 50, eY + (idx * 22) + 6);
    doc.font('Helvetica-Bold').text(item.val.toLocaleString('en-US', { minimumFractionDigits: 2 }), 190, eY + (idx * 22) + 6, { align: 'right' });
  });

  // Deductions Header
  doc.rect(305, finY, 250, 25).fill('#dc2626');
  doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text('DEDUCTIONS', 315, finY + 8);
  doc.text('AMOUNT ($/PKR)', 455, finY + 8, { align: 'right' });

  // Deductions Items
  let dY = finY + 30;
  const deductions = [
    { label: `Late Deduction (${payroll.late_count} times)`, val: payroll.late_deduction },
    { label: `Absence Deduction (${payroll.absent_days + payroll.excess_leaves} days)`, val: payroll.absence_deduction },
    { label: 'Other Deductions', val: payroll.other_deduction }
  ];

  deductions.forEach((item, idx) => {
    doc.rect(305, dY + (idx * 22), 250, 22).fill(idx % 2 === 0 ? '#ffffff' : '#f8fafc').stroke('#e2e8f0');
    doc.fillColor(primaryColor).fontSize(9).font('Helvetica').text(item.label, 315, dY + (idx * 22) + 6);
    doc.font('Helvetica-Bold').text(item.val.toLocaleString('en-US', { minimumFractionDigits: 2 }), 455, dY + (idx * 22) + 6, { align: 'right' });
  });

  // Totals Row
  const totalY = finY + 125;

  // Total Gross / Allowances
  doc.rect(40, totalY, 250, 25).fill('#e2e8f0');
  doc.fillColor(primaryColor).fontSize(9).font('Helvetica-Bold').text('TOTAL ALLOWANCES:', 50, totalY + 8);
  doc.text(payroll.total_allowances.toLocaleString('en-US', { minimumFractionDigits: 2 }), 190, totalY + 8, { align: 'right' });

  // Total Deductions
  doc.rect(305, totalY, 250, 25).fill('#fee2e2');
  doc.fillColor('#991b1b').fontSize(9).font('Helvetica-Bold').text('TOTAL DEDUCTION:', 315, totalY + 8);
  doc.text(payroll.total_deduction.toLocaleString('en-US', { minimumFractionDigits: 2 }), 455, totalY + 8, { align: 'right' });

  // Net Salary Highlight Banner
  const netY = totalY + 40;
  doc.rect(40, netY, 515, 45).fill('#1e293b');
  doc.fillColor('#ffffff').fontSize(14).font('Helvetica-Bold').text('NET PAYABLE SALARY:', 60, netY + 15);
  doc.fontSize(16).fillColor('#4ade80').text(`${payroll.net_salary.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 380, netY + 14, { align: 'right' });

  // Footer Note & Signatures
  const footY = netY + 80;
  doc.fillColor(grayColor).fontSize(8).font('Helvetica');
  doc.text('This is a computer-generated document and does not require a physical signature.', 40, footY, { align: 'center' });
  doc.text(`Generated on: ${new Date(payroll.generated_at).toLocaleString()}`, 40, footY + 15, { align: 'center' });

  doc.end();
};

module.exports = {
  generatePayslipPDF
};
