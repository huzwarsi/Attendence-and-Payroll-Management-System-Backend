require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const prisma = require('./config/prisma');

const authRoutes = require('./routes/authRoutes');
const staffRoutes = require('./routes/staffRoutes');
const qrRoutes = require('./routes/qrRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const payrollRoutes = require('./routes/payrollRoutes');
const portalRoutes = require('./routes/portalRoutes');
const reportsRoutes = require('./routes/reportsRoutes');

const { verifyAdmin } = require('./middleware/auth');
const initAbsenceCron = require('./cron/absenceCron');

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// CORS configuration
const allowedOrigins = [
  FRONTEND_URL,
  'http://localhost:3000',
  'http://127.0.0.1:3000'
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, postman)
      if (!origin) return callback(null, true);

      const isAllowed =
        allowedOrigins.includes(origin) ||
        origin.endsWith('.vercel.app') ||
        process.env.NODE_ENV !== 'production';

      if (isAllowed) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// API Routes (mounted both with and without /api prefix for deployment flexibility)
app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);

app.use('/api/staff', staffRoutes);
app.use('/staff', staffRoutes);

app.use('/api/qr', qrRoutes);
app.use('/qr', qrRoutes);

app.use('/api/attendance', attendanceRoutes);
app.use('/attendance', attendanceRoutes);

app.use('/api/payroll', payrollRoutes);
app.use('/payroll', payrollRoutes);

app.use('/api/portal', portalRoutes);
app.use('/portal', portalRoutes);

app.use('/api/reports', reportsRoutes);
app.use('/reports', reportsRoutes);

// Admin Dashboard Summary Cards Endpoint
app.get(['/api/dashboard/stats', '/dashboard/stats'], verifyAdmin, async (req, res) => {
  try {
    const today = new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()));

    const totalStaff = await prisma.staff.count({ where: { is_active: true } });

    const todayAttendances = await prisma.attendance.findMany({
      where: { date: today }
    });

    let presentToday = 0;
    let lateToday = 0;
    let absentToday = 0;

    todayAttendances.forEach((att) => {
      if (att.status === 'present') presentToday++;
      else if (att.status === 'late') {
        presentToday++;
        lateToday++;
      } else if (att.status === 'absent') {
        absentToday++;
      }
    });

    // Unmarked staff count for today are assumed absent/pending
    const markedCount = todayAttendances.length;
    const pendingCount = Math.max(0, totalStaff - markedCount);
    const totalAbsentEst = absentToday + pendingCount;

    return res.json({
      total_staff: totalStaff,
      present_today: presentToday,
      late_today: lateToday,
      absent_today: totalAbsentEst,
      today_date: today
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return res.status(500).json({ error: 'Failed to fetch dashboard statistics.' });
  }
});

// Root & Health check
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    system: 'Attendance & Payroll System API',
    timestamp: new Date()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

// Start Server & Init Cron
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`🚀 Express Server running on http://localhost:${PORT}`);
    console.log(`==================================================`);
    initAbsenceCron();
  });
}

module.exports = app;
