export interface CircuitBreakerOptions {
  failureThreshold: number;
  openMs: number;
}

type CircuitState = "closed" | "open" | "half_open";

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private openedAt = 0;

  constructor(private opts: CircuitBreakerOptions = { failureThreshold: 5, openMs: 60_000 }) {}

  allowRequest(now: number = Date.now()): boolean {
    if (this.state === "closed") return true;
    if (this.state === "open" && now - this.openedAt >= this.opts.openMs) {
      this.state = "half_open";
      return true;
    }
    return this.state === "half_open";
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = "closed";
  }

  recordFailure(now: number = Date.now()): void {
    this.failures += 1;
    if (this.state === "half_open" || this.failures >= this.opts.failureThreshold) {
      this.state = "open";
      this.openedAt = now;
    }
  }

  get currentState(): CircuitState {
    return this.state;
  }

  get failureCount(): number {
    return this.failures;
  }
}
