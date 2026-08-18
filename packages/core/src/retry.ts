export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 5_000,
  maxDelayMs: 5 * 60_000,
  multiplier: 2,
};

export function backoffDelay(attempt: number, policy: RetryPolicy = DEFAULT_RETRY_POLICY): number {
  const exp = Math.max(0, attempt - 1);
  const delay = policy.baseDelayMs * Math.pow(policy.multiplier, exp);
  return Math.min(delay, policy.maxDelayMs);
}

export function shouldRetry(attempt: number, policy: RetryPolicy = DEFAULT_RETRY_POLICY): boolean {
  return attempt < policy.maxAttempts;
}

export function nextAvailableAt(
  attempt: number,
  now: number = Date.now(),
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): number {
  return now + backoffDelay(attempt, policy);
}
