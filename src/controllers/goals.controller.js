const prisma = require('../config/db');
const goalsService = require('../services/goals.service');
const { getActiveCycle } = require('../services/cycle.service');
const { computeOverallScore } = require('../services/score.service');

// ─── EMPLOYEE ENDPOINTS ───────────────────────────────────────────────────────

// GET /api/goals/my-sheet  — get current user's goal sheet for active cycle
const getMyGoalSheet = async (req, res, next) => {
  try {
    const cycle = await getActiveCycle();
    if (!cycle) return res.status(404).json({ error: 'No active cycle found' });

    const sheet = await goalsService.getOrCreateGoalSheet(req.user.id, cycle.id);
    const overallScore = computeOverallScore(sheet.goals);

    res.json({ sheet, cycle, overallScore });
  } catch (err) {
    next(err);
  }
};

// POST /api/goals/save  — save goals to draft
const saveGoals = async (req, res, next) => {
  try {
    const { goals } = req.body;
    const cycle = await getActiveCycle();
    if (!cycle) return res.status(404).json({ error: 'No active cycle found' });
    if (cycle.phase !== 'GOAL_SETTING') {
      return res.status(400).json({ error: 'Goal setting window is closed' });
    }

    const sheet = await goalsService.getOrCreateGoalSheet(req.user.id, cycle.id);

    if (sheet.status === 'APPROVED' || sheet.status === 'LOCKED') {
      return res.status(400).json({ error: 'Approved goals cannot be edited without Admin intervention' });
    }

    // Validate before saving
    const errors = goalsService.validateGoals(goals);
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    await goalsService.saveGoals(sheet.id, goals, req.user.id);

    const updated = await prisma.goalSheet.findUnique({
      where: { id: sheet.id },
      include: { goals: { include: { thrustArea: true, achievements: true } } },
    });

    res.json({ sheet: updated });
  } catch (err) {
    next(err);
  }
};

// POST /api/goals/submit  — submit for manager approval
const submitGoalSheet = async (req, res, next) => {
  try {
    const cycle = await getActiveCycle();
    if (!cycle) return res.status(404).json({ error: 'No active cycle found' });

    const sheet = await prisma.goalSheet.findUnique({
      where: { employeeId_cycleId: { employeeId: req.user.id, cycleId: cycle.id } },
      include: { goals: true },
    });

    if (!sheet) return res.status(404).json({ error: 'No goal sheet found. Please create goals first.' });

    const updated = await goalsService.submitGoalSheet(sheet.id, req.user.id);
    res.json({ sheet: updated, message: 'Goals submitted for approval' });
  } catch (err) {
    next(err);
  }
};

// POST /api/goals/:goalId/achievement  — log quarterly achievement
const updateAchievement = async (req, res, next) => {
  try {
    const { goalId } = req.params;
    const { quarter, actualValue, completionDate, status } = req.body;

    if (!quarter) return res.status(400).json({ error: 'Quarter is required' });

    const achievement = await goalsService.updateAchievement(
      goalId,
      quarter,
      { actualValue, completionDate, status },
      req.user.id
    );

    res.json({ achievement });
  } catch (err) {
    next(err);
  }
};

// ─── MANAGER ENDPOINTS ────────────────────────────────────────────────────────

// GET /api/goals/team  — get all goal sheets for manager's reportees
const getTeamGoalSheets = async (req, res, next) => {
  try {
    const { cycleId, status } = req.query;
    const cycle = cycleId ? { id: cycleId } : await getActiveCycle();
    if (!cycle) return res.status(404).json({ error: 'No active cycle found' });

    // Get all reportees
    const reportees = await prisma.user.findMany({
      where: { managerId: req.user.id },
      select: { id: true },
    });
    const reporteeIds = reportees.map((r) => r.id);

    const sheets = await prisma.goalSheet.findMany({
      where: {
        cycleId: cycle.id,
        employeeId: { in: reporteeIds },
        ...(status && { status }),
      },
      include: {
        employee: { select: { id: true, name: true, email: true, department: true } },
        goals: { include: { thrustArea: true, achievements: true } },
        checkIns: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const sheetsWithScore = sheets.map((s) => ({
      ...s,
      overallScore: computeOverallScore(s.goals),
    }));

    res.json({ sheets: sheetsWithScore, cycle });
  } catch (err) {
    next(err);
  }
};

// PUT /api/goals/:sheetId/approve  — approve goal sheet
const approveGoalSheet = async (req, res, next) => {
  try {
    const { sheetId } = req.params;
    const { managerNote } = req.body;

    const sheet = await prisma.goalSheet.findUnique({
      where: { id: sheetId },
      include: { employee: true, goals: true },
    });

    if (!sheet) return res.status(404).json({ error: 'Goal sheet not found' });
    if (sheet.employee.managerId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to approve this sheet' });
    }
    if (sheet.status !== 'SUBMITTED') {
      return res.status(400).json({ error: 'Only SUBMITTED sheets can be approved' });
    }

    const updated = await prisma.goalSheet.update({
      where: { id: sheetId },
      data: { status: 'APPROVED', approvedAt: new Date(), managerNote: managerNote || null },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        goalSheetId: sheetId,
        userId: req.user.id,
        action: 'GOAL_SHEET_APPROVED',
        details: { managerNote },
      },
    });

    res.json({ sheet: updated, message: 'Goals approved and locked' });
  } catch (err) {
    next(err);
  }
};

// PUT /api/goals/:sheetId/reject  — return for rework
const rejectGoalSheet = async (req, res, next) => {
  try {
    const { sheetId } = req.params;
    const { managerNote } = req.body;

    if (!managerNote) return res.status(400).json({ error: 'Please provide a reason for rejection' });

    const sheet = await prisma.goalSheet.findUnique({
      where: { id: sheetId },
      include: { employee: true },
    });

    if (!sheet) return res.status(404).json({ error: 'Goal sheet not found' });
    if (sheet.employee.managerId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to reject this sheet' });
    }
    if (sheet.status !== 'SUBMITTED') {
      return res.status(400).json({ error: 'Only SUBMITTED sheets can be rejected' });
    }

    const updated = await prisma.goalSheet.update({
      where: { id: sheetId },
      data: { status: 'REJECTED', rejectedAt: new Date(), managerNote },
    });

    await prisma.auditLog.create({
      data: {
        goalSheetId: sheetId,
        userId: req.user.id,
        action: 'GOAL_SHEET_REJECTED',
        details: { managerNote },
      },
    });

    res.json({ sheet: updated, message: 'Goal sheet returned for rework' });
  } catch (err) {
    next(err);
  }
};

// PUT /api/goals/:sheetId/inline-edit  — manager edits targets/weightages before approval
const inlineEditGoalSheet = async (req, res, next) => {
  try {
    const { sheetId } = req.params;
    const { goals } = req.body;

    const sheet = await prisma.goalSheet.findUnique({
      where: { id: sheetId },
      include: { employee: true },
    });

    if (!sheet) return res.status(404).json({ error: 'Goal sheet not found' });
    if (sheet.employee.managerId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (sheet.status !== 'SUBMITTED') {
      return res.status(400).json({ error: 'Can only inline-edit SUBMITTED sheets' });
    }

    const errors = goalsService.validateGoals(goals);
    if (errors.length > 0) return res.status(400).json({ errors });

    // Update goals
    await Promise.all(
      goals.map((g) =>
        prisma.goal.update({
          where: { id: g.id },
          data: {
            target: Number(g.target),
            weightage: Number(g.weightage),
            targetDate: g.targetDate ? new Date(g.targetDate) : undefined,
          },
        })
      )
    );

    await prisma.auditLog.create({
      data: {
        goalSheetId: sheetId,
        userId: req.user.id,
        action: 'MANAGER_INLINE_EDIT',
        details: { editedGoals: goals.map((g) => ({ id: g.id, target: g.target, weightage: g.weightage })) },
      },
    });

    const updated = await prisma.goalSheet.findUnique({
      where: { id: sheetId },
      include: { goals: { include: { thrustArea: true } } },
    });

    res.json({ sheet: updated });
  } catch (err) {
    next(err);
  }
};

// ─── SHARED GOALS ──────────────────────────────────────────────────────────────

// POST /api/goals/push-shared  — Admin/Manager pushes a KPI to multiple employees
const pushSharedGoal = async (req, res, next) => {
  try {
    const { employeeIds, thrustAreaId, title, description, uom, target, targetDate, defaultWeightage } = req.body;
    const cycle = await getActiveCycle();
    if (!cycle) return res.status(404).json({ error: 'No active cycle found' });

    const results = [];

    for (const employeeId of employeeIds) {
      const sheet = await goalsService.getOrCreateGoalSheet(employeeId, cycle.id);

      if (sheet.status === 'APPROVED' || sheet.status === 'LOCKED') {
        results.push({ employeeId, status: 'skipped', reason: 'Goals already approved' });
        continue;
      }

      const existingCount = await prisma.goal.count({ where: { goalSheetId: sheet.id } });
      if (existingCount >= 8) {
        results.push({ employeeId, status: 'skipped', reason: 'Max goals reached' });
        continue;
      }

      await prisma.goal.create({
        data: {
          goalSheetId: sheet.id,
          thrustAreaId,
          title,
          description: description || null,
          uom,
          target: Number(target),
          targetDate: targetDate ? new Date(targetDate) : null,
          weightage: Number(defaultWeightage || 10),
          isShared: true,
          parentGoalId: null,
        },
      });

      results.push({ employeeId, status: 'pushed' });
    }

    res.json({ results });
  } catch (err) {
    next(err);
  }
};

// GET /api/goals/thrust-areas  — get all thrust areas
const getThrustAreas = async (req, res, next) => {
  try {
    const areas = await prisma.thrustArea.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    res.json({ thrustAreas: areas });
  } catch (err) {
    next(err);
  }
};

// GET /api/goals/cycles  — get all cycles
const getCycles = async (req, res, next) => {
  try {
    const cycles = await prisma.goalCycle.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ cycles });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getMyGoalSheet,
  saveGoals,
  submitGoalSheet,
  updateAchievement,
  getTeamGoalSheets,
  approveGoalSheet,
  rejectGoalSheet,
  inlineEditGoalSheet,
  pushSharedGoal,
  getThrustAreas,
  getCycles,
};
