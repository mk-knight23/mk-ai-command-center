export interface BudgetState {
  dailyLimitUsd: number;
  monthlyLimitUsd: number;
  spentTodayUsd: number;
  spentThisMonthUsd: number;
}

export type BudgetVerdict =
  | { allowed: true }
  | { allowed: false; reason: "daily_budget_exceeded" | "monthly_budget_exceeded" };

export function checkBudget(state: BudgetState, estimatedUsd: number = 0): BudgetVerdict {
  if (state.spentThisMonthUsd + estimatedUsd > state.monthlyLimitUsd) {
    return { allowed: false, reason: "monthly_budget_exceeded" };
  }
  if (state.spentTodayUsd + estimatedUsd > state.dailyLimitUsd) {
    return { allowed: false, reason: "daily_budget_exceeded" };
  }
  return { allowed: true };
}

export function budgetUtilization(state: BudgetState): {
  daily: number;
  monthly: number;
} {
  return {
    daily: state.dailyLimitUsd > 0 ? state.spentTodayUsd / state.dailyLimitUsd : 0,
    monthly: state.monthlyLimitUsd > 0 ? state.spentThisMonthUsd / state.monthlyLimitUsd : 0,
  };
}

export const BUDGET_ALERT_THRESHOLDS = [0.5, 0.8, 1.0] as const;

export function crossedThreshold(
  before: number,
  after: number,
  limit: number,
): number | null {
  if (limit <= 0) return null;
  for (const t of BUDGET_ALERT_THRESHOLDS) {
    const boundary = limit * t;
    if (before < boundary && after >= boundary) return t;
  }
  return null;
}
