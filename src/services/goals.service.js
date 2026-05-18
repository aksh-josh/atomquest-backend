const prisma = require('../config/db');
const { computeScore } = require('./score.service');

const MAX_GOALS = 8;
const MIN_WEIGHTAGE = 10;
const TOTAL_WEIGHTAGE = 100;

/**
 * Validate goals array before save
 */
const validateGoals = (goals) => {
  const errors = [];

  if (!goals || goals.length === 0) {
    errors.push('At least one goal is required');
    return errors;
  }

  if (goals.length > MAX_GOALS) {
    errors.push(`Maximum ${MAX_GOALS} goals allowed per employee`);
  }

  const totalWeightage = goals.reduce((sum, g) => sum + Number(g.weightage), 0);
  if (Math.abs(totalWeightage - TOTAL_WEIGHTAGE) > 0.01) {
    errors.push(`Total weightage must equal 100% (currently ${totalWeightage}%)`);
  }

  for (const goal of goals) {
    if (Number(goal.weightage) < MIN_WEIGHTAGE) {
      errors.push(`Goal "${goal.title}" has weightage below minimum ${MIN_WEIGHTAGE}%`);
    }
    if (!goal.title || goal.title.trim() === '') {
      errors.push('All goals must have a title');
    }
    if (!goal.thrustAreaId) {
      errors.push('All goals must have a Thrust Area');
    }
    if (goal.target === undefined || goal.target === null) {
      errors.push(`Goal "${goal.title}" must have a target value`);
    }
    if (goal.uom === 'TIMELINE' && !goal.targetDate) {
      errors.push(`Goal "${goal.title}" with Timeline UoM must have a target date`);
    }
  }

  return errors;
};

/**
 * Get or create goal sheet for employee in active cycle
 */
const getOrCreateGoalSheet = async (employeeId, cycleId) => {
  let sheet = await prisma.goalSheet.findUnique({
    where: { employeeId_cycleId: { employeeId, cycleId } },
    include: { goals: { include: { achievements: true, thrustArea: true } } },
  });

  if (!sheet) {
    sheet = await prisma.goalSheet.create({
      data: { employeeId, cycleId },
      include: { goals: { include: { achievements: true, thrustArea: true } } },
    });
  }

  return sheet;
};

/**
 * Save/update goals for a goal sheet (replaces all goals on draft)
 */
const saveGoals = async (goalSheetId, goalsData, userId) => {
  // Delete existing goals (cascade deletes achievements)
  await prisma.goal.deleteMany({ where: { goalSheetId } });

  // Create new goals
  const goals = await prisma.$transaction(
    goalsData.map((g) =>
      prisma.goal.create({
        data: {
          goalSheetId,
          thrustAreaId: g.thrustAreaId,
          title: g.title,
          description: g.description || null,
          uom: g.uom,
          target: Number(g.target),
          targetDate: g.targetDate ? new Date(g.targetDate) : null,
          weightage: Number(g.weightage),
          isShared: false,
        },
      })
    )
  );

  return goals;
};

/**
 * Submit goal sheet for manager approval
 */
const submitGoalSheet = async (goalSheetId, employeeId) => {
  const sheet = await prisma.goalSheet.findUnique({
    where: { id: goalSheetId },
    include: { goals: true },
  });

  if (!sheet) throw { statusCode: 404, message: 'Goal sheet not found' };
  if (sheet.employeeId !== employeeId) throw { statusCode: 403, message: 'Not your goal sheet' };
  if (sheet.status !== 'DRAFT' && sheet.status !== 'REJECTED') {
    throw { statusCode: 400, message: 'Only DRAFT or REJECTED sheets can be submitted' };
  }

  const errors = validateGoals(sheet.goals);
  if (errors.length > 0) {
    throw { statusCode: 400, message: errors.join('; ') };
  }

  return prisma.goalSheet.update({
    where: { id: goalSheetId },
    data: { status: 'SUBMITTED', submittedAt: new Date() },
  });
};

/**
 * Update achievement for a specific goal + quarter
 */
const updateAchievement = async (goalId, quarter, data, employeeId) => {
  // Verify ownership
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: { goalSheet: true },
  });

  if (!goal) throw { statusCode: 404, message: 'Goal not found' };
  if (goal.goalSheet.employeeId !== employeeId) {
    throw { statusCode: 403, message: 'Not your goal' };
  }
  if (goal.goalSheet.status !== 'APPROVED' && goal.goalSheet.status !== 'LOCKED') {
    throw { statusCode: 400, message: 'Goals must be approved before logging achievements' };
  }

  const score = computeScore(
    goal.uom,
    goal.target,
    data.actualValue,
    goal.targetDate,
    data.completionDate
  );

  return prisma.achievement.upsert({
    where: { goalId_quarter: { goalId, quarter } },
    update: {
      actualValue: data.actualValue !== undefined ? Number(data.actualValue) : undefined,
      completionDate: data.completionDate ? new Date(data.completionDate) : undefined,
      status: data.status || 'ON_TRACK',
      score,
    },
    create: {
      goalId,
      quarter,
      actualValue: data.actualValue !== undefined ? Number(data.actualValue) : null,
      completionDate: data.completionDate ? new Date(data.completionDate) : null,
      status: data.status || 'NOT_STARTED',
      score,
    },
  });
};

module.exports = {
  validateGoals,
  getOrCreateGoalSheet,
  saveGoals,
  submitGoalSheet,
  updateAchievement,
};
