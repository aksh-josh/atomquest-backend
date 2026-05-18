const prisma = require('../config/db');

const getActiveCycle = async () => {
  const cycle = await prisma.goalCycle.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  return cycle;
};

const getCurrentPhase = () => {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-based

  if (month === 5 || month === 6) return 'GOAL_SETTING';
  if (month === 7 || month === 8 || month === 9) return 'Q1_CHECKIN';
  if (month === 10 || month === 11 || month === 12) return 'Q2_CHECKIN';
  if (month === 1 || month === 2) return 'Q3_CHECKIN';
  if (month === 3 || month === 4) return 'Q4_ANNUAL';
  return 'GOAL_SETTING';
};

const isCheckinWindowOpen = (phase) => {
  const current = getCurrentPhase();
  return current === phase;
};

module.exports = { getActiveCycle, getCurrentPhase, isCheckinWindowOpen };
