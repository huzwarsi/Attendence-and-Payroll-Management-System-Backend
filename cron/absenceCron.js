const cron = require('node-cron');
const prisma = require('../config/prisma');

const getTodayDate = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
};

const initAbsenceCron = () => {
  // Run daily at 23:55 (5 minutes before midnight)
  cron.schedule('55 23 * * *', async () => {
    console.log('[Cron Job] Running daily end-of-day absence checker...');
    try {
      const today = getTodayDate();

      // Find all active staff members
      const activeStaff = await prisma.staff.findMany({
        where: { is_active: true }
      });

      let markedCount = 0;

      for (const staff of activeStaff) {
        // Check if attendance record exists for today
        const existingAttendance = await prisma.attendance.findUnique({
          where: {
            staff_id_date: {
              staff_id: staff.id,
              date: today
            }
          }
        });

        // If no attendance record exists, mark as absent
        if (!existingAttendance) {
          await prisma.attendance.create({
            data: {
              staff_id: staff.id,
              date: today,
              status: 'absent',
              total_working_hours: 0,
              total_break_minutes: 0
            }
          });
          markedCount++;
        }
      }

      console.log(`[Cron Job] Daily absence check completed. Automatically marked ${markedCount} staff members as absent.`);
    } catch (error) {
      console.error('[Cron Job] Error running absence checker:', error);
    }
  });

  console.log('[Cron Job] Daily absence tracking cron initialized (runs at 23:55 daily).');
};

module.exports = initAbsenceCron;
