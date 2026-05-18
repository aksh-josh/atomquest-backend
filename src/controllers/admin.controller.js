const bcrypt = require('bcryptjs');
const prisma = require('../config/db');

// GET /api/admin/users
const getAllUsers = async (req, res, next) => {
  try {
    const { role, department } = req.query;
    const users = await prisma.user.findMany({
      where: {
        ...(role && { role }),
        ...(department && { department }),
      },
      select: {
        id: true, name: true, email: true, role: true, department: true,
        manager: { select: { id: true, name: true } },
        _count: { select: { reportees: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json({ users });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/users
const createUser = async (req, res, next) => {
  try {
    const { name, email, password, role, department, managerId } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) return res.status(409).json({ error: 'Email already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email: email.toLowerCase(), password: hashed, role: role || 'EMPLOYEE', department, managerId: managerId || null },
      select: { id: true, name: true, email: true, role: true, department: true, managerId: true },
    });

    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/users/:id
const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, role, department, managerId } = req.body;

    const user = await prisma.user.update({
      where: { id },
      data: { name, role, department, managerId: managerId || null },
      select: { id: true, name: true, email: true, role: true, department: true, managerId: true },
    });

    res.json({ user });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/admin/users/:id
const deleteUser = async (req, res, next) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ message: 'User deleted' });
  } catch (err) {
    next(err);
  }
};

// ─── CYCLES ───────────────────────────────────────────────────────────────────

// POST /api/admin/cycles
const createCycle = async (req, res, next) => {
  try {
    const { name, phase, startDate, endDate } = req.body;

    const cycle = await prisma.goalCycle.create({
      data: { name, phase, startDate: new Date(startDate), endDate: new Date(endDate), isActive: false },
    });

    res.status(201).json({ cycle });
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/cycles/:id/activate
const activateCycle = async (req, res, next) => {
  try {
    // Deactivate all cycles first
    await prisma.goalCycle.updateMany({ data: { isActive: false } });
    const cycle = await prisma.goalCycle.update({
      where: { id: req.params.id },
      data: { isActive: true },
    });
    res.json({ cycle, message: 'Cycle activated' });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/cycles
const getCycles = async (req, res, next) => {
  try {
    const cycles = await prisma.goalCycle.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ cycles });
  } catch (err) {
    next(err);
  }
};

// ─── THRUST AREAS ─────────────────────────────────────────────────────────────

// POST /api/admin/thrust-areas
const createThrustArea = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    const area = await prisma.thrustArea.create({ data: { name, description } });
    res.status(201).json({ thrustArea: area });
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/thrust-areas/:id
const updateThrustArea = async (req, res, next) => {
  try {
    const area = await prisma.thrustArea.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json({ thrustArea: area });
  } catch (err) {
    next(err);
  }
};

// ─── GOAL UNLOCK ──────────────────────────────────────────────────────────────

// PUT /api/admin/goals/:sheetId/unlock
const unlockGoalSheet = async (req, res, next) => {
  try {
    const { sheetId } = req.params;
    const { reason } = req.body;

    const sheet = await prisma.goalSheet.findUnique({ where: { id: sheetId } });
    if (!sheet) return res.status(404).json({ error: 'Goal sheet not found' });

    const updated = await prisma.goalSheet.update({
      where: { id: sheetId },
      data: { status: 'DRAFT' },
    });

    await prisma.auditLog.create({
      data: {
        goalSheetId: sheetId,
        userId: req.user.id,
        action: 'ADMIN_UNLOCK',
        details: { reason: reason || 'Admin unlocked for editing' },
      },
    });

    res.json({ sheet: updated, message: 'Goal sheet unlocked for editing' });
  } catch (err) {
    next(err);
  }
};

// ─── AUDIT LOGS ───────────────────────────────────────────────────────────────

// GET /api/admin/audit-logs
const getAuditLogs = async (req, res, next) => {
  try {
    const { goalSheetId, userId, page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: {
          ...(goalSheetId && { goalSheetId }),
          ...(userId && { userId }),
        },
        include: {
          user: { select: { name: true, email: true, role: true } },
          goalSheet: { include: { employee: { select: { name: true, email: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.auditLog.count({ where: { ...(goalSheetId && { goalSheetId }), ...(userId && { userId }) } }),
    ]);

    res.json({ logs, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/completion-dashboard  — real-time check-in completion
const getCompletionDashboard = async (req, res, next) => {
  try {
    const cycle = await prisma.goalCycle.findFirst({ where: { isActive: true } });
    if (!cycle) return res.status(404).json({ error: 'No active cycle' });

    const allSheets = await prisma.goalSheet.findMany({
      where: { cycleId: cycle.id },
      include: {
        employee: { select: { id: true, name: true, email: true, department: true, manager: { select: { name: true } } } },
        checkIns: true,
        goals: true,
      },
    });

    const summary = allSheets.map((s) => ({
      employee: s.employee,
      goalSheetStatus: s.status,
      goalCount: s.goals.length,
      checkInsCompleted: s.checkIns.map((c) => c.quarter),
    }));

    const stats = {
      total: allSheets.length,
      submitted: allSheets.filter((s) => s.status === 'SUBMITTED').length,
      approved: allSheets.filter((s) => ['APPROVED', 'LOCKED'].includes(s.status)).length,
      draft: allSheets.filter((s) => s.status === 'DRAFT').length,
      rejected: allSheets.filter((s) => s.status === 'REJECTED').length,
    };

    res.json({ stats, employees: summary, cycle });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAllUsers, createUser, updateUser, deleteUser,
  createCycle, activateCycle, getCycles,
  createThrustArea, updateThrustArea,
  unlockGoalSheet,
  getAuditLogs,
  getCompletionDashboard,
};
