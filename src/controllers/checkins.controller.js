const prisma = require('../config/db');
const { getActiveCycle, getCurrentPhase } = require('../services/cycle.service');

// POST /api/checkins/:sheetId  — Manager submits check-in comment
const submitCheckIn = async (req, res, next) => {
  try {
    const { sheetId } = req.params;
    const { comment, quarter } = req.body;

    const cycle = await getActiveCycle();
    if (!cycle) return res.status(404).json({ error: 'No active cycle found' });

    const currentQuarter = quarter || getCurrentPhase();

    const sheet = await prisma.goalSheet.findUnique({
      where: { id: sheetId },
      include: { employee: true },
    });

    if (!sheet) return res.status(404).json({ error: 'Goal sheet not found' });
    if (sheet.employee.managerId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to check in for this employee' });
    }
    if (sheet.status !== 'APPROVED' && sheet.status !== 'LOCKED') {
      return res.status(400).json({ error: 'Goals must be approved before check-ins' });
    }

    const checkIn = await prisma.checkIn.upsert({
      where: { goalSheetId_quarter: { goalSheetId: sheetId, quarter: currentQuarter } },
      update: { comment, completedAt: new Date() },
      create: {
        goalSheetId: sheetId,
        cycleId: cycle.id,
        managerId: req.user.id,
        quarter: currentQuarter,
        comment,
      },
    });

    res.json({ checkIn });
  } catch (err) {
    next(err);
  }
};

// GET /api/checkins/team  — Manager views all check-ins for their team
const getTeamCheckIns = async (req, res, next) => {
  try {
    const cycle = await getActiveCycle();
    if (!cycle) return res.status(404).json({ error: 'No active cycle found' });

    const reportees = await prisma.user.findMany({
      where: { managerId: req.user.id },
      select: { id: true, name: true, email: true },
    });
    const reporteeIds = reportees.map((r) => r.id);

    const sheets = await prisma.goalSheet.findMany({
      where: { cycleId: cycle.id, employeeId: { in: reporteeIds } },
      include: {
        employee: { select: { id: true, name: true, email: true } },
        checkIns: { orderBy: { completedAt: 'desc' } },
        goals: { include: { achievements: true } },
      },
    });

    res.json({ sheets, currentQuarter: getCurrentPhase() });
  } catch (err) {
    next(err);
  }
};

// GET /api/checkins/my  — Employee views their own check-in history
const getMyCheckIns = async (req, res, next) => {
  try {
    const cycle = await getActiveCycle();
    if (!cycle) return res.status(404).json({ error: 'No active cycle found' });

    const sheet = await prisma.goalSheet.findUnique({
      where: { employeeId_cycleId: { employeeId: req.user.id, cycleId: cycle.id } },
      include: {
        checkIns: { include: { manager: { select: { name: true, email: true } } }, orderBy: { completedAt: 'desc' } },
      },
    });

    if (!sheet) return res.json({ checkIns: [] });

    res.json({ checkIns: sheet.checkIns, currentQuarter: getCurrentPhase() });
  } catch (err) {
    next(err);
  }
};

module.exports = { submitCheckIn, getTeamCheckIns, getMyCheckIns };
