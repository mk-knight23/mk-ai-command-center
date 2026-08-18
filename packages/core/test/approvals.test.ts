import { describe, expect, it } from "vitest";
import {
  DEFAULT_APPROVAL_POLICY,
  approvalExpiry,
  approvalRequired,
  isExpired,
} from "../src/approvals.js";

describe("approval rules", () => {
  it("does not require approval for level_0 and level_1 by default", () => {
    expect(approvalRequired("level_0")).toBe(false);
    expect(approvalRequired("level_1")).toBe(false);
  });

  it("requires approval for level_2 and level_3 by default", () => {
    expect(approvalRequired("level_2")).toBe(true);
    expect(approvalRequired("level_3")).toBe(true);
  });

  it("respects a stricter policy", () => {
    expect(approvalRequired("level_1", { minRiskLevelRequiringApproval: "level_1" })).toBe(true);
  });

  it("respects a looser policy but level_3 callers still pass policy checks upstream", () => {
    expect(
      approvalRequired("level_2", { minRiskLevelRequiringApproval: "level_3" }),
    ).toBe(false);
  });

  it("higher risk gets shorter approval TTL", () => {
    const now = 1_000_000;
    expect(approvalExpiry("level_3", now)).toBeLessThan(approvalExpiry("level_2", now));
    expect(approvalExpiry("level_2", now)).toBeLessThan(approvalExpiry("level_1", now));
  });

  it("detects expiry", () => {
    expect(isExpired(100, 200)).toBe(true);
    expect(isExpired(300, 200)).toBe(false);
  });

  it("default policy requires approval from level_2", () => {
    expect(DEFAULT_APPROVAL_POLICY.minRiskLevelRequiringApproval).toBe("level_2");
  });
});
