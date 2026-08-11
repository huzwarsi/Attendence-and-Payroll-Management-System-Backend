const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'attendance_payroll_super_secret_jwt_key_2026';

const verifyToken = (req, res, next) => {
  let token = null;

  // 1. Prefer Authorization Bearer header (sent from frontend localStorage)
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  // 2. Fall back to cookie if no Bearer header present
  if (!token && req.cookies?.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication token required.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

const verifyAdmin = (req, res, next) => {
  verifyToken(req, res, () => {
    if (req.user && req.user.role === 'admin') {
      next();
    } else {
      res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }
  });
};

const verifyStaff = (req, res, next) => {
  verifyToken(req, res, () => {
    if (req.user && req.user.role === 'staff') {
      next();
    } else {
      res.status(403).json({ error: 'Access denied. Staff privileges required.' });
    }
  });
};

module.exports = {
  verifyToken,
  verifyAdmin,
  verifyStaff
};
