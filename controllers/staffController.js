const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');

// Create new Staff member
const createStaff = async (req, res) => {
  try {
    const {
      full_name,
      phone,
      email,
      address,
      cnic,
      emergency_contact,
      designation,
      joining_date,
      basic_salary,
      allowance_transport,
      allowance_food,
      allowance_other,
      deduction_late_amount,
      deduction_absence_amount,
      deduction_other,
      check_in_time,
      check_out_time,
      allowed_monthly_leaves,
      allowed_paid_leaves,
      password,
      is_active
    } = req.body;

    if (!full_name || !email || !phone || !cnic || !designation) {
      return res.status(400).json({ error: 'Full name, email, phone, CNIC, and designation are required.' });
    }

    // Check unique email and CNIC
    const existingEmail = await prisma.staff.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (existingEmail) {
      return res.status(400).json({ error: 'A staff member with this email already exists.' });
    }

    const existingCNIC = await prisma.staff.findUnique({ where: { cnic: cnic.trim() } });
    if (existingCNIC) {
      return res.status(400).json({ error: 'A staff member with this CNIC already exists.' });
    }

    const plainPassword = password || 'staff123';
    const password_hash = await bcrypt.hash(plainPassword, 10);

    const staff = await prisma.staff.create({
      data: {
        full_name: full_name.trim(),
        phone: phone.trim(),
        email: email.toLowerCase().trim(),
        address: address || '',
        cnic: cnic.trim(),
        emergency_contact: emergency_contact || '',
        designation: designation.trim(),
        joining_date: joining_date ? new Date(joining_date) : new Date(),
        basic_salary: parseFloat(basic_salary) || 0,
        allowance_transport: parseFloat(allowance_transport) || 0,
        allowance_food: parseFloat(allowance_food) || 0,
        allowance_other: parseFloat(allowance_other) || 0,
        deduction_late_amount: parseFloat(deduction_late_amount) || 0,
        deduction_absence_amount: parseFloat(deduction_absence_amount) || 0,
        deduction_other: parseFloat(deduction_other) || 0,
        check_in_time: check_in_time || '09:00',
        check_out_time: check_out_time || '17:00',
        allowed_monthly_leaves: parseInt(allowed_monthly_leaves) || 2,
        allowed_paid_leaves: parseInt(allowed_paid_leaves) || 1,
        password_hash,
        is_active: is_active !== undefined ? Boolean(is_active) : true
      }
    });

    const { password_hash: _, ...staffWithoutPassword } = staff;
    return res.status(201).json({
      message: 'Staff member created successfully',
      staff: staffWithoutPassword
    });
  } catch (error) {
    console.error('Create staff error:', error);
    return res.status(500).json({ error: 'Failed to create staff member.' });
  }
};

// Get list of staff with pagination and search
const getStaffList = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || req.query.query || '';
    const designation = req.query.designation || '';
    const skip = (page - 1) * limit;

    const where = {};

    if (search) {
      where.OR = [
        { full_name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { cnic: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (designation) {
      where.designation = { equals: designation, mode: 'insensitive' };
    }

    const [total, staff] = await Promise.all([
      prisma.staff.count({ where }),
      prisma.staff.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          full_name: true,
          phone: true,
          email: true,
          address: true,
          cnic: true,
          emergency_contact: true,
          designation: true,
          joining_date: true,
          basic_salary: true,
          allowance_transport: true,
          allowance_food: true,
          allowance_other: true,
          deduction_late_amount: true,
          deduction_absence_amount: true,
          deduction_other: true,
          check_in_time: true,
          check_out_time: true,
          allowed_monthly_leaves: true,
          allowed_paid_leaves: true,
          is_active: true,
          created_at: true,
          updated_at: true
        }
      })
    ]);

    return res.json({
      data: staff,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get staff list error:', error);
    return res.status(500).json({ error: 'Failed to fetch staff list.' });
  }
};

// Search Staff API specifically
const searchStaff = async (req, res) => {
  return getStaffList(req, res);
};

// Get single staff by ID
const getStaffById = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const staff = await prisma.staff.findUnique({
      where: { id },
      select: {
        id: true,
        full_name: true,
        phone: true,
        email: true,
        address: true,
        cnic: true,
        emergency_contact: true,
        designation: true,
        joining_date: true,
        basic_salary: true,
        allowance_transport: true,
        allowance_food: true,
        allowance_other: true,
        deduction_late_amount: true,
        deduction_absence_amount: true,
        deduction_other: true,
        check_in_time: true,
        check_out_time: true,
        allowed_monthly_leaves: true,
        allowed_paid_leaves: true,
        is_active: true,
        created_at: true,
        updated_at: true
      }
    });

    if (!staff) {
      return res.status(404).json({ error: 'Staff member not found.' });
    }

    return res.json(staff);
  } catch (error) {
    console.error('Get staff by ID error:', error);
    return res.status(500).json({ error: 'Failed to fetch staff record.' });
  }
};

// Update Staff
const updateStaff = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const {
      full_name,
      phone,
      email,
      address,
      cnic,
      emergency_contact,
      designation,
      joining_date,
      basic_salary,
      allowance_transport,
      allowance_food,
      allowance_other,
      deduction_late_amount,
      deduction_absence_amount,
      deduction_other,
      check_in_time,
      check_out_time,
      allowed_monthly_leaves,
      allowed_paid_leaves,
      password,
      is_active
    } = req.body;

    const existingStaff = await prisma.staff.findUnique({ where: { id } });
    if (!existingStaff) {
      return res.status(404).json({ error: 'Staff member not found.' });
    }

    const updateData = {};

    if (full_name) updateData.full_name = full_name.trim();
    if (phone) updateData.phone = phone.trim();
    if (email) updateData.email = email.toLowerCase().trim();
    if (address !== undefined) updateData.address = address;
    if (cnic) updateData.cnic = cnic.trim();
    if (emergency_contact !== undefined) updateData.emergency_contact = emergency_contact;
    if (designation) updateData.designation = designation.trim();
    if (joining_date) updateData.joining_date = new Date(joining_date);

    if (basic_salary !== undefined) updateData.basic_salary = parseFloat(basic_salary);
    if (allowance_transport !== undefined) updateData.allowance_transport = parseFloat(allowance_transport);
    if (allowance_food !== undefined) updateData.allowance_food = parseFloat(allowance_food);
    if (allowance_other !== undefined) updateData.allowance_other = parseFloat(allowance_other);

    if (deduction_late_amount !== undefined) updateData.deduction_late_amount = parseFloat(deduction_late_amount);
    if (deduction_absence_amount !== undefined) updateData.deduction_absence_amount = parseFloat(deduction_absence_amount);
    if (deduction_other !== undefined) updateData.deduction_other = parseFloat(deduction_other);

    if (check_in_time) updateData.check_in_time = check_in_time;
    if (check_out_time) updateData.check_out_time = check_out_time;

    if (allowed_monthly_leaves !== undefined) updateData.allowed_monthly_leaves = parseInt(allowed_monthly_leaves);
    if (allowed_paid_leaves !== undefined) updateData.allowed_paid_leaves = parseInt(allowed_paid_leaves);

    if (is_active !== undefined) updateData.is_active = Boolean(is_active);

    if (password && password.trim() !== '') {
      updateData.password_hash = await bcrypt.hash(password.trim(), 10);
    }

    const updatedStaff = await prisma.staff.update({
      where: { id },
      data: updateData
    });

    const { password_hash: _, ...staffWithoutPassword } = updatedStaff;
    return res.json({
      message: 'Staff record updated successfully',
      staff: staffWithoutPassword
    });
  } catch (error) {
    console.error('Update staff error:', error);
    return res.status(500).json({ error: 'Failed to update staff member.' });
  }
};

// Delete Staff
const deleteStaff = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existingStaff = await prisma.staff.findUnique({ where: { id } });
    if (!existingStaff) {
      return res.status(404).json({ error: 'Staff member not found.' });
    }

    await prisma.staff.delete({ where: { id } });
    return res.json({ message: 'Staff member deleted successfully' });
  } catch (error) {
    console.error('Delete staff error:', error);
    return res.status(500).json({ error: 'Failed to delete staff member.' });
  }
};

module.exports = {
  createStaff,
  getStaffList,
  searchStaff,
  getStaffById,
  updateStaff,
  deleteStaff
};
