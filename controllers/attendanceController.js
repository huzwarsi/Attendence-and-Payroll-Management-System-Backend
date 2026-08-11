const prisma = require('../config/prisma');

// Helper to format date to YYYY-MM-DD start of day in UTC
const getTodayDate = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
};

const parseDateOnly = (dateStr) => {
  const d = new Date(dateStr);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
};

// Helper: validate QR code token
const validateQRToken = async (qr_token) => {
  if (!qr_token) return { valid: false, error: 'QR Code token is required.' };
  const now = new Date();
  const qr = await prisma.qRCode.findUnique({ where: { qr_token } });
  if (!qr || !qr.is_active || qr.expires_at <= now) {
    return { valid: false, error: 'QR Code is invalid or has expired. Please re-scan daily QR.' };
  }
  return { valid: true, qr };
};

// 1. Staff Check-in
const checkIn = async (req, res) => {
  try {
    const { qr_token } = req.body;
    const staff_id = req.user.staff_id || req.user.id;

    // Validate QR Token
    const qrValidation = await validateQRToken(qr_token);
    if (!qrValidation.valid) {
      return res.status(400).json({ error: qrValidation.error });
    }

    // Get staff details for shift time
    const staff = await prisma.staff.findUnique({ where: { id: staff_id } });
    if (!staff || !staff.is_active) {
      return res.status(403).json({ error: 'Staff account not found or inactive.' });
    }

    const today = getTodayDate();
    const now = new Date();

    // Check if attendance record exists for today
    let attendance = await prisma.attendance.findUnique({
      where: {
        staff_id_date: {
          staff_id,
          date: today
        }
      }
    });

    if (attendance && attendance.check_in_time) {
      return res.status(400).json({ error: 'You have already checked in for today!' });
    }

    // Determine status (present vs late)
    // Assigned shift check-in time e.g., "09:00"
    const [assignedHours, assignedMins] = staff.check_in_time.split(':').map(Number);
    const assignedTimeToday = new Date(now);
    assignedTimeToday.setHours(assignedHours, assignedMins, 0, 0);

    // If actual check-in is after assigned time + 5 mins grace -> late
    const isLate = now > assignedTimeToday;
    const status = isLate ? 'late' : 'present';

    if (attendance) {
      attendance = await prisma.attendance.update({
        where: { id: attendance.id },
        data: {
          check_in_time: now,
          status
        }
      });
    } else {
      attendance = await prisma.attendance.create({
        data: {
          staff_id,
          date: today,
          check_in_time: now,
          status
        }
      });
    }

    return res.json({
      message: isLate ? `Checked in successfully (Marked LATE. Assigned shift: ${staff.check_in_time})` : 'Checked in successfully!',
      attendance,
      status: attendance.status
    });
  } catch (error) {
    console.error('Check-in error:', error);
    return res.status(500).json({ error: 'Server error during check-in.' });
  }
};

// 2. Staff Break Start
const breakStart = async (req, res) => {
  try {
    const { qr_token } = req.body;
    const staff_id = req.user.staff_id || req.user.id;

    const qrValidation = await validateQRToken(qr_token);
    if (!qrValidation.valid) {
      return res.status(400).json({ error: qrValidation.error });
    }

    const today = getTodayDate();
    const now = new Date();

    const attendance = await prisma.attendance.findUnique({
      where: {
        staff_id_date: {
          staff_id,
          date: today
        }
      },
      include: { breaks: true }
    });

    if (!attendance || !attendance.check_in_time) {
      return res.status(400).json({ error: 'You must check in first before starting a break.' });
    }

    if (attendance.check_out_time) {
      return res.status(400).json({ error: 'You have already checked out for today.' });
    }

    // Check if an open break already exists
    const openBreak = attendance.breaks.find((b) => b.break_end === null);
    if (openBreak) {
      return res.status(400).json({ error: 'You already have an active ongoing break. Please end it first.' });
    }

    const newBreak = await prisma.break.create({
      data: {
        attendance_id: attendance.id,
        break_start: now
      }
    });

    return res.json({
      message: 'Break started successfully!',
      break: newBreak
    });
  } catch (error) {
    console.error('Break start error:', error);
    return res.status(500).json({ error: 'Server error during break start.' });
  }
};

// 3. Staff Break End
const breakEnd = async (req, res) => {
  try {
    const { qr_token } = req.body;
    const staff_id = req.user.staff_id || req.user.id;

    const qrValidation = await validateQRToken(qr_token);
    if (!qrValidation.valid) {
      return res.status(400).json({ error: qrValidation.error });
    }

    const today = getTodayDate();
    const now = new Date();

    const attendance = await prisma.attendance.findUnique({
      where: {
        staff_id_date: {
          staff_id,
          date: today
        }
      },
      include: { breaks: true }
    });

    if (!attendance || !attendance.check_in_time) {
      return res.status(400).json({ error: 'No active attendance found for today.' });
    }

    const openBreak = attendance.breaks.find((b) => b.break_end === null);
    if (!openBreak) {
      return res.status(400).json({ error: 'No open break found to end.' });
    }

    const updatedBreak = await prisma.break.update({
      where: { id: openBreak.id },
      data: { break_end: now }
    });

    return res.json({
      message: 'Break ended successfully!',
      break: updatedBreak
    });
  } catch (error) {
    console.error('Break end error:', error);
    return res.status(500).json({ error: 'Server error during break end.' });
  }
};

// 4. Staff Check-out
const checkOut = async (req, res) => {
  try {
    const { qr_token } = req.body;
    const staff_id = req.user.staff_id || req.user.id;

    const qrValidation = await validateQRToken(qr_token);
    if (!qrValidation.valid) {
      return res.status(400).json({ error: qrValidation.error });
    }

    const today = getTodayDate();
    const now = new Date();

    const attendance = await prisma.attendance.findUnique({
      where: {
        staff_id_date: {
          staff_id,
          date: today
        }
      },
      include: { breaks: true }
    });

    if (!attendance || !attendance.check_in_time) {
      return res.status(400).json({ error: 'Cannot check-out before checking in!' });
    }

    if (attendance.check_out_time) {
      return res.status(400).json({ error: 'You have already checked out for today!' });
    }

    // Ensure no open break
    const openBreak = attendance.breaks.find((b) => b.break_end === null);
    if (openBreak) {
      return res.status(400).json({ error: 'You cannot check out while on an open break. Please end your break first.' });
    }

    // Compute total break minutes
    let total_break_minutes = 0;
    attendance.breaks.forEach((b) => {
      if (b.break_start && b.break_end) {
        const durationMs = new Date(b.break_end) - new Date(b.break_start);
        total_break_minutes += Math.max(0, durationMs / (1000 * 60));
      }
    });

    // Compute total working hours
    const totalTimeMs = now - new Date(attendance.check_in_time);
    const totalTimeMinutes = Math.max(0, totalTimeMs / (1000 * 60));
    const netWorkingMinutes = Math.max(0, totalTimeMinutes - total_break_minutes);
    const total_working_hours = parseFloat((netWorkingMinutes / 60).toFixed(2));

    const updatedAttendance = await prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        check_out_time: now,
        total_break_minutes: parseFloat(total_break_minutes.toFixed(2)),
        total_working_hours
      }
    });

    return res.json({
      message: 'Checked out successfully!',
      attendance: updatedAttendance
    });
  } catch (error) {
    console.error('Check-out error:', error);
    return res.status(500).json({ error: 'Server error during check-out.' });
  }
};

// 5. Manual Attendance Entry (Admin) — Action-type based workflow
const manualAttendance = async (req, res) => {
  try {
    const { staff_id, date, action_type, check_in_time, check_out_time, status } = req.body;

    if (!staff_id || !date) {
      return res.status(400).json({ error: 'Staff ID and date are required.' });
    }

    // Support legacy calls that don't send action_type
    const action = action_type || (status === 'absent' ? 'mark_absent' : 'edit');

    const parsedDate = parseDateOnly(date);
    const staffIdInt = parseInt(staff_id);

    // Get staff details for late detection
    const staff = await prisma.staff.findUnique({ where: { id: staffIdInt } });
    if (!staff || !staff.is_active) {
      return res.status(400).json({ error: 'Staff member not found or inactive.' });
    }

    // Helper: parse time string to DateTime
    const parseTimeToDate = (timeStr) => {
      if (!timeStr) return null;
      if (timeStr.includes('T')) return new Date(timeStr);
      return new Date(`${date}T${timeStr}:00`);
    };

    // Fetch existing record if any
    const existing = await prisma.attendance.findUnique({
      where: { staff_id_date: { staff_id: staffIdInt, date: parsedDate } },
      include: { breaks: true }
    });

    // ---------- ACTION: MARK ABSENT ----------
    if (action === 'mark_absent') {
      const data = {
        status: 'absent',
        check_in_time: null,
        check_out_time: null,
        total_working_hours: 0,
        total_break_minutes: 0
      };

      const attendance = await prisma.attendance.upsert({
        where: { staff_id_date: { staff_id: staffIdInt, date: parsedDate } },
        update: data,
        create: { staff_id: staffIdInt, date: parsedDate, ...data }
      });

      return res.json({ message: 'Staff marked as absent.', attendance });
    }

    // ---------- ACTION: CHECK-IN ----------
    if (action === 'checkin') {
      if (!check_in_time) {
        return res.status(400).json({ error: 'Check-in time is required.' });
      }
      if (existing && existing.check_in_time) {
        return res.status(400).json({ error: 'This staff member already has a check-in for this date. Use "Edit" to modify.' });
      }

      const checkInDateTime = parseTimeToDate(check_in_time);
      if (!checkInDateTime || isNaN(checkInDateTime)) {
        return res.status(400).json({ error: 'Invalid check-in time format.' });
      }

      // Determine present vs late
      const [assignedH, assignedM] = staff.check_in_time.split(':').map(Number);
      const assignedTime = new Date(checkInDateTime);
      assignedTime.setHours(assignedH, assignedM, 0, 0);
      const isLate = checkInDateTime > assignedTime;
      const resolvedStatus = isLate ? 'late' : 'present';

      const data = {
        check_in_time: checkInDateTime,
        status: resolvedStatus
      };

      const attendance = await prisma.attendance.upsert({
        where: { staff_id_date: { staff_id: staffIdInt, date: parsedDate } },
        update: data,
        create: { staff_id: staffIdInt, date: parsedDate, ...data }
      });

      return res.json({
        message: isLate ? `Checked in (marked LATE, shift: ${staff.check_in_time})` : 'Checked in successfully.',
        attendance
      });
    }

    // ---------- ACTION: CHECK-OUT ----------
    if (action === 'checkout') {
      if (!check_out_time) {
        return res.status(400).json({ error: 'Check-out time is required.' });
      }
      if (!existing || !existing.check_in_time) {
        return res.status(400).json({ error: 'Cannot check-out without an existing check-in. Add a check-in first.' });
      }

      const checkOutDateTime = parseTimeToDate(check_out_time);
      if (!checkOutDateTime || isNaN(checkOutDateTime)) {
        return res.status(400).json({ error: 'Invalid check-out time format.' });
      }

      if (checkOutDateTime <= new Date(existing.check_in_time)) {
        return res.status(400).json({ error: 'Check-out time must be after check-in time.' });
      }

      // Compute break minutes from DB breaks
      let total_break_minutes = 0;
      if (existing.breaks) {
        existing.breaks.forEach((b) => {
          if (b.break_start && b.break_end) {
            total_break_minutes += Math.max(0, (new Date(b.break_end) - new Date(b.break_start)) / (1000 * 60));
          }
        });
      }

      const totalTimeMs = checkOutDateTime - new Date(existing.check_in_time);
      const netMinutes = Math.max(0, totalTimeMs / (1000 * 60) - total_break_minutes);
      const total_working_hours = parseFloat((netMinutes / 60).toFixed(2));

      const attendance = await prisma.attendance.update({
        where: { id: existing.id },
        data: {
          check_out_time: checkOutDateTime,
          total_break_minutes: parseFloat(total_break_minutes.toFixed(2)),
          total_working_hours
        }
      });

      return res.json({ message: 'Checked out successfully.', attendance });
    }

    // ---------- ACTION: EDIT EXISTING RECORD ----------
    if (action === 'edit') {
      const checkInDateTime = parseTimeToDate(check_in_time);
      const checkOutDateTime = parseTimeToDate(check_out_time);

      if (checkOutDateTime && !checkInDateTime) {
        return res.status(400).json({ error: 'Check-out time cannot exist without a check-in time.' });
      }

      if (checkInDateTime && checkOutDateTime && checkOutDateTime <= checkInDateTime) {
        return res.status(400).json({ error: 'Check-out time must be after check-in time.' });
      }

      // Determine status
      let resolvedStatus = status || 'present';
      if (checkInDateTime && !status) {
        const [assignedH, assignedM] = staff.check_in_time.split(':').map(Number);
        const assignedTime = new Date(checkInDateTime);
        assignedTime.setHours(assignedH, assignedM, 0, 0);
        resolvedStatus = checkInDateTime > assignedTime ? 'late' : 'present';
      }

      // Compute working hours if both times present
      let total_working_hours = 0;
      let total_break_minutes = 0;
      if (checkInDateTime && checkOutDateTime) {
        // Get breaks from existing record if available
        if (existing && existing.breaks) {
          existing.breaks.forEach((b) => {
            if (b.break_start && b.break_end) {
              total_break_minutes += Math.max(0, (new Date(b.break_end) - new Date(b.break_start)) / (1000 * 60));
            }
          });
        }
        const totalTimeMs = checkOutDateTime - checkInDateTime;
        const netMinutes = Math.max(0, totalTimeMs / (1000 * 60) - total_break_minutes);
        total_working_hours = parseFloat((netMinutes / 60).toFixed(2));
      }

      const data = {
        status: resolvedStatus,
        check_in_time: checkInDateTime,
        check_out_time: checkOutDateTime,
        total_working_hours,
        total_break_minutes: parseFloat(total_break_minutes.toFixed(2))
      };

      const attendance = await prisma.attendance.upsert({
        where: { staff_id_date: { staff_id: staffIdInt, date: parsedDate } },
        update: data,
        create: { staff_id: staffIdInt, date: parsedDate, ...data }
      });

      return res.json({ message: 'Attendance record updated successfully.', attendance });
    }

    return res.status(400).json({ error: 'Invalid action_type. Must be: checkin, checkout, mark_absent, or edit.' });
  } catch (error) {
    console.error('Manual attendance error:', error);
    return res.status(500).json({ error: 'Failed to save manual attendance.' });
  }
};

// 6. Get Today's Attendance — merged with ALL active staff (Admin)
const getTodayAttendance = async (req, res) => {
  try {
    const dateParam = req.query.date;
    const targetDate = dateParam ? parseDateOnly(dateParam) : getTodayDate();

    // Fetch all active staff
    const allStaff = await prisma.staff.findMany({
      where: { is_active: true },
      select: {
        id: true,
        full_name: true,
        designation: true,
        email: true,
        phone: true,
        check_in_time: true,
        check_out_time: true
      },
      orderBy: { full_name: 'asc' }
    });

    // Fetch all attendance records for the target date
    const attendanceRecords = await prisma.attendance.findMany({
      where: { date: targetDate },
      include: { breaks: true }
    });

    // Build a map of staff_id -> attendance record
    const attendanceMap = {};
    attendanceRecords.forEach((att) => {
      attendanceMap[att.staff_id] = att;
    });

    // Merge: every active staff member gets a row
    const merged = allStaff.map((staff) => {
      const att = attendanceMap[staff.id] || null;
      const hasCheckedIn = Boolean(att && att.check_in_time);
      const hasCheckedOut = Boolean(att && att.check_out_time);
      const openBreak = att?.breaks?.find((b) => b.break_end === null) || null;
      const isOnBreak = Boolean(openBreak);

      // Compute live working hours for staff currently working (checked in but not out)
      let liveWorkingHours = att?.total_working_hours || 0;
      let liveBreakMinutes = att?.total_break_minutes || 0;
      if (hasCheckedIn && !hasCheckedOut) {
        const now = new Date();
        let totalBreakMins = 0;
        if (att.breaks) {
          att.breaks.forEach((b) => {
            if (b.break_start && b.break_end) {
              totalBreakMins += Math.max(0, (new Date(b.break_end) - new Date(b.break_start)) / (1000 * 60));
            } else if (b.break_start && !b.break_end) {
              // Currently on break — count time up to now
              totalBreakMins += Math.max(0, (now - new Date(b.break_start)) / (1000 * 60));
            }
          });
        }
        const totalTimeMs = now - new Date(att.check_in_time);
        const netMinutes = Math.max(0, totalTimeMs / (1000 * 60) - totalBreakMins);
        liveWorkingHours = parseFloat((netMinutes / 60).toFixed(2));
        liveBreakMinutes = parseFloat(totalBreakMins.toFixed(2));
      }

      // Determine display status
      let displayStatus = 'not_marked';
      if (att) {
        if (att.status === 'absent') displayStatus = 'absent';
        else if (hasCheckedOut) displayStatus = 'completed';
        else if (isOnBreak) displayStatus = 'on_break';
        else if (hasCheckedIn) displayStatus = att.status; // 'present' or 'late'
        else displayStatus = att.status; // edge case: record exists but no check-in
      }

      // Determine which action is available
      let nextAction = 'checkin';
      if (att && att.status === 'absent') nextAction = 'none';
      else if (hasCheckedOut) nextAction = 'completed';
      else if (isOnBreak) nextAction = 'end_break';
      else if (hasCheckedIn) nextAction = 'checkout';

      return {
        staff_id: staff.id,
        staff,
        date: targetDate,
        attendance_id: att?.id || null,
        status: displayStatus,
        db_status: att?.status || null,
        check_in_time: att?.check_in_time || null,
        check_out_time: att?.check_out_time || null,
        breaks: att?.breaks || [],
        total_break_minutes: liveBreakMinutes,
        total_working_hours: liveWorkingHours,
        has_checked_in: hasCheckedIn,
        has_checked_out: hasCheckedOut,
        is_on_break: isOnBreak,
        next_action: nextAction
      };
    });

    return res.json({
      date: targetDate,
      total_staff: allStaff.length,
      marked_count: attendanceRecords.length,
      data: merged
    });
  } catch (error) {
    console.error('Get today attendance error:', error);
    return res.status(500).json({ error: 'Failed to fetch today\'s attendance.' });
  }
};

// 7. Get Attendance List — historical filtering (Admin)
const getAttendanceList = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const { staff_id, status, from, to } = req.query;

    const where = {};

    if (staff_id) where.staff_id = parseInt(staff_id);
    if (status) where.status = status;

    if (from || to) {
      where.date = {};
      if (from) where.date.gte = parseDateOnly(from);
      if (to) where.date.lte = parseDateOnly(to);
    }

    const [total, records] = await Promise.all([
      prisma.attendance.count({ where }),
      prisma.attendance.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          staff: {
            select: {
              id: true,
              full_name: true,
              designation: true,
              email: true,
              phone: true
            }
          },
          breaks: true
        }
      })
    ]);

    return res.json({
      data: records,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get attendance list error:', error);
    return res.status(500).json({ error: 'Failed to fetch attendance list.' });
  }
};

module.exports = {
  checkIn,
  breakStart,
  breakEnd,
  checkOut,
  manualAttendance,
  getTodayAttendance,
  getAttendanceList
};
