const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'attendance_payroll_super_secret_jwt_key_2026';

const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const admin = await prisma.admin.findUnique({
      where: { email: email.toLowerCase().trim() }
    });

    if (!admin) {
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    }

    const isMatch = await bcrypt.compare(password, admin.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    }

    const token = jwt.sign(
      { id: admin.id, email: admin.email, name: admin.name, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.json({
      message: 'Admin login successful',
      token,
      user: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: 'admin'
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

const staffLogin = async (req, res) => {
  try {
    const { login, password } = req.body; // login can be phone or email

    if (!login || !password) {
      return res.status(400).json({ error: 'Phone/Email and password are required.' });
    }

    const cleanLogin = login.trim();

    const staff = await prisma.staff.findFirst({
      where: {
        OR: [
          { email: cleanLogin.toLowerCase() },
          { phone: cleanLogin }
        ]
      }
    });

    if (!staff) {
      return res.status(401).json({ error: 'Invalid staff credentials.' });
    }

    if (!staff.is_active) {
      return res.status(403).json({ error: 'Your staff account is inactive. Please contact HR/Admin.' });
    }

    const isMatch = await bcrypt.compare(password, staff.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid staff credentials.' });
    }

    const token = jwt.sign(
      {
        id: staff.id,
        staff_id: staff.id,
        email: staff.email,
        name: staff.full_name,
        designation: staff.designation,
        role: 'staff'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.json({
      message: 'Staff login successful',
      token,
      user: {
        id: staff.id,
        staff_id: staff.id,
        name: staff.full_name,
        email: staff.email,
        phone: staff.phone,
        designation: staff.designation,
        role: 'staff'
      }
    });
  } catch (error) {
    console.error('Staff login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

const logout = (req, res) => {
  res.clearCookie('token');
  return res.json({ message: 'Logged out successfully' });
};

const getMe = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (req.user.role === 'admin') {
      const admin = await prisma.admin.findUnique({
        where: { id: req.user.id },
        select: { id: true, name: true, email: true }
      });

      if (!admin) {
        return res.status(401).json({ error: 'Admin user not found.' });
      }

      return res.json({
        user: {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: 'admin'
        }
      });
    } else if (req.user.role === 'staff') {
      const staffId = Number(req.user.id || req.user.staff_id);
      const staff = await prisma.staff.findUnique({
        where: { id: staffId },
        select: {
          id: true,
          full_name: true,
          email: true,
          phone: true,
          designation: true,
          is_active: true
        }
      });

      if (!staff) {
        return res.status(401).json({ error: 'Staff member not found.' });
      }

      if (!staff.is_active) {
        return res.status(403).json({ error: 'Staff account is inactive.' });
      }

      return res.json({
        user: {
          id: staff.id,
          staff_id: staff.id,
          name: staff.full_name,
          full_name: staff.full_name,
          email: staff.email,
          phone: staff.phone,
          designation: staff.designation,
          role: 'staff'
        }
      });
    }

    return res.json({ user: req.user });
  } catch (error) {
    console.error('getMe error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  adminLogin,
  staffLogin,
  logout,
  getMe
};
