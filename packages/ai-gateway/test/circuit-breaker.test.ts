import { describe, expect, it } from "vitest";
import { CircuitBreaker } from "../src/circuit-breaker.js";

describe("circuit breaker", () => {
  it("starts closed and allows requests", () => {
    const cb = new CircuitBreaker();
    expect(cb.currentState).toBe("closed");
    expect(cb.allowRequest()).toBe(true);
  });

  it("opens after threshold failures", () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, openMs: 1000 });
    const now = 1_000_000;
    cb.recordFailure(now);
    cb.recordFailure(now);
    expect(cb.allowRequest(now)).toBe(true);
    cb.recordFailure(now);
    expect(cb.currentState).toBe("open");
    expect(cb.allowRequest(now + 10)).toBe(false);
  });

  it("half-opens after cooldown and closes on success", () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, openMs: 500 });
    const now = 1_000_000;
    cb.recordFailure(now);
    expect(cb.allowRequest(now + 100)).toBe(false);
    expect(cb.allowRequest(now + 600)).toBe(true);
    expect(cb.currentState).toBe("half_open");
    cb.recordSuccess();
    expect(cb.currentState).toBe("closed");
  });

  it("half-open failure reopens", () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, openMs: 500 });
    const now = 1_000_000;
    cb.recordFailure(now);
    cb.allowRequest(now + 600);
    cb.recordFailure(now + 601);
    expect(cb.currentState).toBe("open");
  });
});
