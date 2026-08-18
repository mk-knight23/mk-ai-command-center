import { describe, expect, it } from "vitest";
import {
  DEFAULT_RETRY_POLICY,
  backoffDelay,
  nextAvailableAt,
  shouldRetry,
} from "../src/retry.js";

describe("retry math", () => {
  it("computes exponential backoff", () => {
    expect(backoffDelay(1)).toBe(5_000);
    expect(backoffDelay(2)).toBe(10_000);
    expect(backoffDelay(3)).toBe(20_000);
  });

  it("caps at maxDelay", () => {
    expect(backoffDelay(20)).toBe(DEFAULT_RETRY_POLICY.maxDelayMs);
  });

  it("custom policy respected", () => {
    const policy = { maxAttempts: 5, baseDelayMs: 100, maxDelayMs: 1_000, multiplier: 3 };
    expect(backoffDelay(1, policy)).toBe(100);
    expect(backoffDelay(2, policy)).toBe(300);
    expect(backoffDelay(3, policy)).toBe(900);
    expect(backoffDelay(4, policy)).toBe(1_000);
  });

  it("shouldRetry is bounded by maxAttempts", () => {
    expect(shouldRetry(1)).toBe(true);
    expect(shouldRetry(2)).toBe(true);
    expect(shouldRetry(3)).toBe(false);
    expect(shouldRetry(4)).toBe(false);
  });

  it("nextAvailableAt adds backoff to now", () => {
    const now = 1_000_000;
    expect(nextAvailableAt(1, now)).toBe(now + 5_000);
  });
});
