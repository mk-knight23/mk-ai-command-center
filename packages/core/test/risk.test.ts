import { describe, expect, it } from "vitest";
import { classifyRisk, maxRisk, riskRank } from "../src/risk.js";

describe("risk classification", () => {
  it("classifies read-only work as level_0", () => {
    expect(classifyRisk({})).toBe("level_0");
  });

  it("classifies internal writes as level_1", () => {
    expect(classifyRisk({ writesInternal: true })).toBe("level_1");
  });

  it("classifies external actions as level_2", () => {
    expect(classifyRisk({ sendsExternally: true })).toBe("level_2");
    expect(classifyRisk({ publishes: true })).toBe("level_2");
    expect(classifyRisk({ createsCalendarEvent: true })).toBe("level_2");
    expect(classifyRisk({ opensPullRequest: true })).toBe("level_2");
    expect(classifyRisk({ deploysToStaging: true })).toBe("level_2");
    expect(classifyRisk({ contactsLead: true })).toBe("level_2");
  });

  it("classifies destructive/privileged actions as level_3", () => {
    expect(classifyRisk({ deletesData: true })).toBe("level_3");
    expect(classifyRisk({ mergesCode: true })).toBe("level_3");
    expect(classifyRisk({ forcePushes: true })).toBe("level_3");
    expect(classifyRisk({ deploysToProduction: true })).toBe("level_3");
    expect(classifyRisk({ changesDns: true })).toBe("level_3");
    expect(classifyRisk({ makesPayment: true })).toBe("level_3");
    expect(classifyRisk({ bulkCommunication: true })).toBe("level_3");
    expect(classifyRisk({ touchesCredentials: true })).toBe("level_3");
  });

  it("level_3 wins over mixed signals", () => {
    expect(classifyRisk({ sendsExternally: true, deletesData: true })).toBe("level_3");
  });

  it("maxRisk and riskRank order levels", () => {
    expect(riskRank("level_0")).toBe(0);
    expect(riskRank("level_3")).toBe(3);
    expect(maxRisk("level_1", "level_2")).toBe("level_2");
    expect(maxRisk("level_3", "level_0")).toBe("level_3");
  });
});
