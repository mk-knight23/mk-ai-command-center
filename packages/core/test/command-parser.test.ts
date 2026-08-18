import { describe, expect, it } from "vitest";
import { parseCommand } from "../src/command-parser.js";

describe("command parser", () => {
  it("routes research commands to research agent at level_0", () => {
    const p = parseCommand("Research five AI automation opportunities and prepare a report");
    expect(p.agentSlug).toBe("research-agent");
    expect(p.riskLevel).toBe("level_0");
    expect(p.isSchedule).toBe(false);
  });

  it("flags sending email as level_2", () => {
    const p = parseCommand("Send a follow-up email to the client");
    expect(p.agentSlug).toBe("email-agent");
    expect(p.riskLevel).toBe("level_2");
    expect(p.writesExternal).toBe(true);
  });

  it("keeps email reading at level_0", () => {
    const p = parseCommand("Summarize my unread email inbox");
    expect(p.agentSlug).toBe("email-agent");
    expect(p.riskLevel).toBe("level_0");
  });

  it("detects daily schedule with time", () => {
    const p = parseCommand("Every day at 9:00 am send my priority brief");
    expect(p.isSchedule).toBe(true);
    expect(p.scheduleCron).toBe("0 9 * * *");
    expect(p.scheduleTimezone).toBe("Asia/Kolkata");
  });

  it("detects weekday schedule", () => {
    const p = parseCommand("Every weekday at 9:00 AM, send my calendar and priority brief");
    expect(p.scheduleCron).toBe("0 9 * * 1-5");
  });

  it("detects named-day schedule", () => {
    const p = parseCommand("Every monday at 8:30 am summarize the week");
    expect(p.scheduleCron).toBe("30 8 * * 1");
  });

  it("escalates github merge to level_3", () => {
    const p = parseCommand("Merge the open PR in my GitHub repo");
    expect(p.riskLevel).toBe("level_3");
  });

  it("publish content requires approval", () => {
    const p = parseCommand("Publish the LinkedIn post draft");
    expect(p.agentSlug).toBe("content-agent");
    expect(p.riskLevel).toBe("level_2");
  });

  it("falls back to orchestrator for unknown commands", () => {
    const p = parseCommand("Do the thing we discussed");
    expect(p.agentSlug).toBe("chief-orchestrator");
    expect(p.riskLevel).toBe("level_0");
  });

  it("pause automations is an internal reversible change", () => {
    const p = parseCommand("Pause all non-essential content automations");
    expect(p.intent).toBe("pause_automation");
    expect(p.riskLevel).toBe("level_1");
  });
});
