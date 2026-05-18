const prisma = require('../config/db');
const { computeOverallScore } = require('../services/score.service');

// GET /api/reports/achievement?cycleId=&format=json|csv
const getAchievementReport = async (req, res, next) => {
  try {
    const { cycleId, format = 'json', department } = req.query;

    let cycle;
    if (cycleId) {
      cycle = await prisma.goalCycle.findUnique({ where: { id: cycleId } });
    } else {
      cycle = await prisma.goalCycle.findFirst({ where: { isActive: true } });
    }

    if (!cycle) return res.status(404).json({ error: 'Cycle not found' });

    // Role-based filtering
    let employeeFilter = {};
    if (req.user.role === 'MANAGER') {
      const reportees = await prisma.user.findMany({ where: { managerId: req.user.id }, select: { id: true } });
      employeeFilter = { employeeId: { in: reportees.map((r) => r.id) } };
    } else if (req.user.role === 'EMPLOYEE') {
      employeeFilter = { employeeId: req.user.id };
    }

    const sheets = await prisma.goalSheet.findMany({
      where: { cycleId: cycle.id, ...employeeFilter },
      include: {
        employee: { select: { name: true, email: true, department: true, manager: { select: { name: true } } } },
        goals: { include: { thrustArea: true, achievements: true } },
      },
    });

    if (format === 'csv') {
      const rows = [];
      rows.push(['Employee', 'Email', 'Department', 'Manager', 'Goal Title', 'Thrust Area', 'UoM', 'Target', 'Weightage', 'Quarter', 'Actual', 'Score %', 'Status']);

      for (const sheet of sheets) {
        for (const goal of sheet.goals) {
          if (goal.achievements.length === 0) {
            rows.push([
              sheet.employee.name, sheet.employee.email, sheet.employee.department || '',
              sheet.employee.manager?.name || '', goal.title, goal.thrustArea.name,
              goal.uom, goal.target, goal.weightage, '-', '-', '-', 'NOT_STARTED',
            ]);
          } else {
            for (const ach of goal.achievements) {
              rows.push([
                sheet.employee.name, sheet.employee.email, sheet.employee.department || '',
                sheet.employee.manager?.name || '', goal.title, goal.thrustArea.name,
                goal.uom, goal.target, goal.weightage, ach.quarter,
                ach.actualValue ?? '-',
                ach.score !== null ? (ach.score * 100).toFixed(1) : '-',
                ach.status,
              ]);
            }
          }
        }
      }

      const csvContent = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="achievement_report_${cycle.name}.csv"`);
      return res.send(csvContent);
    }

    // JSON format
    const data = sheets.map((sheet) => ({
      employee: sheet.employee,
      goalSheetStatus: sheet.status,
      overallScore: computeOverallScore(sheet.goals),
      goals: sheet.goals.map((g) => ({
        title: g.title,
        thrustArea: g.thrustArea.name,
        uom: g.uom,
        target: g.target,
        weightage: g.weightage,
        achievements: g.achievements,
      })),
    }));

    res.json({ cycle, report: data });
  } catch (err) {
    next(err);
  }
};

// GET /api/reports/completion  — who completed check-ins
const getCompletionReport = async (req, res, next) => {
  try {
    const cycle = await prisma.goalCycle.findFirst({ where: { isActive: true } });
    if (!cycle) return res.status(404).json({ error: 'No active cycle' });

    const sheets = await prisma.goalSheet.findMany({
      where: { cycleId: cycle.id },
      include: {
        employee: { select: { name: true, email: true, department: true } },
        checkIns: { include: { manager: { select: { name: true } } } },
      },
    });

    const report = sheets.map((s) => ({
      employee: s.employee,
      goalSheetStatus: s.status,
      checkIns: s.checkIns.map((c) => ({ quarter: c.quarter, manager: c.manager.name, completedAt: c.completedAt })),
      pendingQuarters: ['GOAL_SETTING', 'Q1_CHECKIN', 'Q2_CHECKIN', 'Q3_CHECKIN', 'Q4_ANNUAL'].filter(
        (q) => !s.checkIns.find((c) => c.quarter === q)
      ),
    }));

    res.json({ cycle, report });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAchievementReport, getCompletionReport };
