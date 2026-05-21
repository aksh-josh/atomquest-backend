const prisma = require('../config/db');
const { getActiveCycle, getCurrentPhase } = require('../services/cycle.service');

// GET /api/notifications  — returns notifications for current user based on role
const getNotifications = async (req, res, next) => {
  try {
    const { user } = req;
    const cycle = await getActiveCycle();
    const notifications = [];

    if (!cycle) {
      return res.json({ notifications: [], badges: {} });
    }

    if (user.role === 'EMPLOYEE') {
      // Check goal sheet status
      const sheet = await prisma.goalSheet.findUnique({
        where: { employeeId_cycleId: { employeeId: user.id, cycleId: cycle.id } },
        include: { goals: true, checkIns: true },
      });

      if (!sheet || sheet.goals.length === 0) {
        notifications.push({
          id: 'no-goals',
          type: 'warning',
          title: 'Goals not set',
          message: 'You haven\'t set your goals for this cycle yet.',
          link: '/employee/goals',
          linkLabel: 'Set Goals',
        });
      } else if (sheet.status === 'DRAFT') {
        notifications.push({
          id: 'draft',
          type: 'warning',
          title: 'Goals not submitted',
          message: 'Your goals are saved as draft. Submit for manager approval.',
          link: '/employee/goals',
          linkLabel: 'Submit Now',
        });
      } else if (sheet.status === 'REJECTED') {
        notifications.push({
          id: 'rejected',
          type: 'error',
          title: 'Goals returned for rework',
          message: sheet.managerNote
            ? `Manager feedback: "${sheet.managerNote}"`
            : 'Your manager returned your goals. Please revise and resubmit.',
          link: '/employee/goals',
          linkLabel: 'Revise Goals',
        });
      } else if (sheet.status === 'APPROVED' || sheet.status === 'LOCKED') {
        // Check if achievement logged for current quarter
        const currentPhase = getCurrentPhase();
        const hasAchievement = sheet.goals.every(g =>
          prisma.achievement.findFirst({ where: { goalId: g.id, quarter: currentPhase } })
        );
        notifications.push({
          id: 'approved',
          type: 'success',
          title: 'Goals approved!',
          message: 'Your goals are approved. Remember to log your quarterly achievements.',
          link: '/employee/goals',
          linkLabel: 'Log Achievement',
        });
      }

      return res.json({
        notifications,
        badges: {
          goals: sheet?.status === 'DRAFT' || sheet?.status === 'REJECTED' ? 1 : 0,
          checkins: sheet?.checkIns?.length || 0,
        },
      });
    }

    if (user.role === 'MANAGER') {
      // Find submitted sheets pending approval
      const reportees = await prisma.user.findMany({
        where: { managerId: user.id },
        select: { id: true },
      });
      const reporteeIds = reportees.map(r => r.id);

      const pendingSheets = await prisma.goalSheet.findMany({
        where: { cycleId: cycle.id, employeeId: { in: reporteeIds }, status: 'SUBMITTED' },
        include: { employee: { select: { name: true } } },
      });

      if (pendingSheets.length > 0) {
        notifications.push({
          id: 'pending-approval',
          type: 'warning',
          title: `${pendingSheets.length} sheet${pendingSheets.length > 1 ? 's' : ''} awaiting approval`,
          message: `${pendingSheets.map(s => s.employee.name).join(', ')} submitted their goals.`,
          link: '/manager/team',
          linkLabel: 'Review Now',
        });
      }

      // Check-in reminders
      const approvedSheets = await prisma.goalSheet.findMany({
        where: { cycleId: cycle.id, employeeId: { in: reporteeIds }, status: { in: ['APPROVED', 'LOCKED'] } },
        include: { checkIns: true },
      });

      const currentPhase = getCurrentPhase();
      const needsCheckin = approvedSheets.filter(
        s => !s.checkIns.find(c => c.quarter === currentPhase)
      );

      if (needsCheckin.length > 0 && currentPhase !== 'GOAL_SETTING') {
        notifications.push({
          id: 'checkin-pending',
          type: 'info',
          title: `${needsCheckin.length} check-in${needsCheckin.length > 1 ? 's' : ''} pending`,
          message: `Log quarterly check-ins for your team members.`,
          link: '/manager/checkins',
          linkLabel: 'Log Check-ins',
        });
      }

      return res.json({
        notifications,
        badges: {
          team: pendingSheets.length,
          checkins: needsCheckin.length,
        },
      });
    }

    if (user.role === 'ADMIN') {
      const [totalUsers, allSheets, submittedSheets] = await Promise.all([
        prisma.user.count(),
        prisma.goalSheet.count({ where: { cycleId: cycle.id } }),
        prisma.goalSheet.count({ where: { cycleId: cycle.id, status: 'SUBMITTED' } }),
      ]);

      if (submittedSheets > 0) {
        notifications.push({
          id: 'submitted',
          type: 'info',
          title: `${submittedSheets} sheet${submittedSheets > 1 ? 's' : ''} submitted`,
          message: 'Manager approvals are pending for some employees.',
          link: '/admin',
          linkLabel: 'View Dashboard',
        });
      }

      const noSheet = totalUsers - 1 - allSheets; // exclude admin
      if (noSheet > 0) {
        notifications.push({
          id: 'no-sheet',
          type: 'warning',
          title: `${noSheet} employee${noSheet > 1 ? 's' : ''} haven't set goals`,
          message: 'Some employees have not created goal sheets yet.',
          link: '/admin',
          linkLabel: 'View Dashboard',
        });
      }

      return res.json({
        notifications,
        badges: { dashboard: submittedSheets },
      });
    }

    res.json({ notifications: [], badges: {} });
  } catch (err) {
    next(err);
  }
};

module.exports = { getNotifications };
