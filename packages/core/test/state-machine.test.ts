import { describe, expect, it } from "vitest";
import {
  allowedTransitions,
  assertTransition,
  canTransition,
  isTerminal,
} from "../src/state-machine.js";

describe("task state machine", () => {
  it("allows the happy path lifecycle", () => {
    const path = [
      ["draft", "validating"],
      ["validating", "planned"],
      ["planned", "waiting_approval"],
      ["waiting_approval", "queued"],
      ["queued", "running"],
      ["running", "completed"],
      ["completed", "archived"],
    ] as const;
    for (const [from, to] of path) {
      expect(canTransition(from, to)).toBe(true);
    }
  });

  it("rejects skipping the queue into running from planned", () => {
    expect(canTransition("planned", "running")).toBe(false);
  });

  it("rejects transitions out of archived", () => {
    expect(allowedTransitions("archived")).toEqual([]);
    expect(isTerminal("archived")).toBe(true);
  });

  it("allows retry flow and dead-lettering", () => {
    expect(canTransition("running", "retrying")).toBe(true);
    expect(canTransition("retrying", "queued")).toBe(true);
    expect(canTransition("retrying", "dead_lettered")).toBe(true);
    expect(canTransition("dead_lettered", "queued")).toBe(true);
  });

  it("allows pause/resume", () => {
    expect(canTransition("running", "paused")).toBe(true);
    expect(canTransition("paused", "queued")).toBe(true);
  });

  it("assertTransition throws on illegal transition", () => {
    expect(() => assertTransition("completed", "running")).toThrow(/Illegal task transition/);
  });

  it("failed tasks can be manually retried or dead-lettered", () => {
    expect(canTransition("failed", "queued")).toBe(true);
    expect(canTransition("failed", "dead_lettered")).toBe(true);
  });
});
