/**
 * Computes goal achievement score based on UoM type
 * Returns a value between 0 and 1 (0% - 100%)
 */

const computeScore = (uom, target, actual, targetDate, completionDate) => {
  if (actual === null || actual === undefined) return null;

  switch (uom) {
    case 'NUMERIC_MIN':
    case 'PERCENT_MIN':
      // Higher is better (e.g., Sales Revenue)
      if (target === 0) return actual === 0 ? 1 : 0;
      return Math.min(actual / target, 1.5); // cap at 150%

    case 'NUMERIC_MAX':
    case 'PERCENT_MAX':
      // Lower is better (e.g., TAT, Cost)
      if (actual === 0) return 1; // achieved zero = perfect
      return Math.min(target / actual, 1.5);

    case 'TIMELINE':
      // Date-based completion
      if (!targetDate || !completionDate) return null;
      const deadline = new Date(targetDate);
      const done = new Date(completionDate);
      if (done <= deadline) return 1; // completed on or before deadline
      // Penalize proportionally for late delivery (capped at 0)
      const daysLate = Math.floor((done - deadline) / (1000 * 60 * 60 * 24));
      return Math.max(0, 1 - daysLate * 0.1);

    case 'ZERO_BASED':
      // Zero = success (e.g., safety incidents)
      return actual === 0 ? 1 : 0;

    default:
      return null;
  }
};

/**
 * Compute weighted overall score for a goal sheet
 */
const computeOverallScore = (goals) => {
  if (!goals || goals.length === 0) return 0;

  let totalWeightage = 0;
  let weightedScore = 0;

  for (const goal of goals) {
    const latestAchievement = goal.achievements?.slice(-1)[0];
    if (latestAchievement?.score !== null && latestAchievement?.score !== undefined) {
      weightedScore += latestAchievement.score * goal.weightage;
      totalWeightage += goal.weightage;
    }
  }

  if (totalWeightage === 0) return 0;
  return (weightedScore / totalWeightage) * 100;
};

module.exports = { computeScore, computeOverallScore };
