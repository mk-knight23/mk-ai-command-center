import type { RiskLevel } from "@mkcc/shared";

export interface ApprovalPolicy {
  minRiskLevelRequiringApproval: RiskLevel;
}

export const DEFAULT_APPROVAL_POLICY: ApprovalPolicy = {
  minRiskLevelRequiringApproval: "level_2",
};

export function approvalRequired(
  risk: RiskLevel,
  policy: ApprovalPolicy = DEFAULT_APPROVAL_POLICY,
): boolean {
  return Number(risk.slice(-1)) >= Number(policy.minRiskLevelRequiringApproval.slice(-1));
}

export const APPROVAL_TTL_MS: Record<RiskLevel, number> = {
  level_0: 24 * 60 * 60 * 1000,
  level_1: 24 * 60 * 60 * 1000,
  level_2: 12 * 60 * 60 * 1000,
  level_3: 60 * 60 * 1000,
};

export function approvalExpiry(risk: RiskLevel, now: number = Date.now()): number {
  return now + APPROVAL_TTL_MS[risk];
}

export function isExpired(expiresAt: number, now: number = Date.now()): boolean {
  return now >= expiresAt;
}
