import type { RiskLevel } from "@mkcc/shared";

export interface RiskInput {
  sendsExternally?: boolean;
  publishes?: boolean;
  createsCalendarEvent?: boolean;
  opensPullRequest?: boolean;
  deploysToStaging?: boolean;
  contactsLead?: boolean;
  deletesData?: boolean;
  mergesCode?: boolean;
  forcePushes?: boolean;
  deploysToProduction?: boolean;
  changesDns?: boolean;
  modifiesPermissions?: boolean;
  touchesCredentials?: boolean;
  makesPayment?: boolean;
  bulkCommunication?: boolean;
  changesSecurityConfig?: boolean;
  writesInternal?: boolean;
}

export function classifyRisk(input: RiskInput): RiskLevel {
  if (
    input.deletesData ||
    input.mergesCode ||
    input.forcePushes ||
    input.deploysToProduction ||
    input.changesDns ||
    input.modifiesPermissions ||
    input.touchesCredentials ||
    input.makesPayment ||
    input.bulkCommunication ||
    input.changesSecurityConfig
  ) {
    return "level_3";
  }
  if (
    input.sendsExternally ||
    input.publishes ||
    input.createsCalendarEvent ||
    input.opensPullRequest ||
    input.deploysToStaging ||
    input.contactsLead
  ) {
    return "level_2";
  }
  if (input.writesInternal) {
    return "level_1";
  }
  return "level_0";
}

export function riskRank(level: RiskLevel): number {
  return Number(level.slice(-1));
}

export function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return riskRank(a) >= riskRank(b) ? a : b;
}
