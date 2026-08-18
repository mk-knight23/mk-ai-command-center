import { describe, expect, it } from "vitest";
import { budgetUtilization, checkBudget, crossedThreshold } from "../src/budgets.js";
import { DEFAULT_LIMITS, canDelegate } from "../src/limits.js";

describe("budget enforcement", () => {
  const base = {
    dailyLimitUsd: 20,
    monthlyLimitUsd: 300,
    spentTodayUsd: 0,
    spentThisMonthUsd: 0,
  };

  it("allows spend within budget", () => {
    expect(checkBudget(base, 5)).toEqual({ allowed: true });
  });

  it("blocks when daily budget would be exceeded", () => {
    const verdict = checkBudget({ ...base, spentTodayUsd: 19 }, 2);
    expect(verdict).toEqual({ allowed: false, reason: "daily_budget_exceeded" });
  });

  it("blocks when monthly budget would be exceeded", () => {
    const verdict = checkBudget({ ...base, spentThisMonthUsd: 299 }, 2);
    expect(verdict).toEqual({ allowed: false, reason: "monthly_budget_exceeded" });
  });

  it("reports utilization", () => {
    const u = budgetUtilization({ ...base, spentTodayUsd: 10, spentThisMonthUsd: 150 });
    expect(u.daily).toBeCloseTo(0.5);
    expect(u.monthly).toBeCloseTo(0.5);
  });

  it("detects threshold crossings", () => {
    expect(crossedThreshold(9, 10, 20)).toBe(0.5);
    expect(crossedThreshold(15, 16.5, 20)).toBe(0.8);
    expect(crossedThreshold(19, 21, 20)).toBe(1);
    expect(crossedThreshold(1, 2, 20)).toBeNull();
  });
});

describe("delegation limits", () => {
  it("allows delegation within limits", () => {
    expect(canDelegate(0, 0)).toEqual({ allowed: true });
  });

  it("blocks exceeding depth", () => {
    const res = canDelegate(DEFAULT_LIMITS.maxDepth, 0);
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/depth/i);
  });

  it("blocks exceeding child count", () => {
    const res = canDelegate(0, DEFAULT_LIMITS.maxChildrenPerTask);
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/children/i);
  });
});
