import { describe, expect, it } from "vitest";
import { nextRunAfter, parseCron } from "../src/schedule.js";

describe("cron parsing", () => {
  it("parses wildcards", () => {
    const f = parseCron("* * * * *");
    expect(f.minutes.size).toBe(60);
    expect(f.hours.size).toBe(24);
  });

  it("parses steps, ranges and lists", () => {
    const f = parseCron("*/15 9-17 1,15 * 1-5");
    expect([...f.minutes]).toEqual([0, 15, 30, 45]);
    expect(f.hours.size).toBe(9);
    expect([...f.daysOfMonth]).toEqual([1, 15]);
    expect([...f.daysOfWeek]).toEqual([1, 2, 3, 4, 5]);
  });

  it("rejects malformed expressions", () => {
    expect(() => parseCron("* * * *")).toThrow(/5 fields/);
    expect(() => parseCron("60 * * * *")).toThrow(/out of range/);
    expect(() => parseCron("a * * * *")).toThrow(/Invalid cron value/);
    expect(() => parseCron("5-1 * * * *")).toThrow(/Invalid cron range/);
  });
});

describe("nextRunAfter", () => {
  it("finds next daily 9:00 UTC run", () => {
    const after = Date.UTC(2026, 7, 7, 10, 0, 0);
    const next = nextRunAfter("0 9 * * *", after, "UTC");
    expect(new Date(next).toISOString()).toBe("2026-08-08T09:00:00.000Z");
  });

  it("respects Asia/Kolkata timezone for weekday brief", () => {
    const after = Date.UTC(2026, 7, 7, 10, 0, 0);
    const next = nextRunAfter("0 9 * * 1-5", after, "Asia/Kolkata");
    const iso = new Date(next).toISOString();
    expect(iso).toBe("2026-08-10T03:30:00.000Z");
  });

  it("handles every-15-minute schedule", () => {
    const after = Date.UTC(2026, 7, 7, 10, 7, 30);
    const next = nextRunAfter("*/15 * * * *", after, "UTC");
    expect(new Date(next).toISOString()).toBe("2026-08-07T10:15:00.000Z");
  });

  it("never returns a time at or before the reference", () => {
    const after = Date.UTC(2026, 7, 7, 9, 0, 0);
    const next = nextRunAfter("0 9 * * *", after, "UTC");
    expect(next).toBeGreaterThan(after);
  });
});
