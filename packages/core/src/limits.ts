export interface OrchestrationLimits {
  maxDepth: number;
  maxChildrenPerTask: number;
  maxAgentIterations: number;
  maxRuntimeMs: number;
  maxConcurrentTasks: number;
}

export const DEFAULT_LIMITS: OrchestrationLimits = {
  maxDepth: 3,
  maxChildrenPerTask: 8,
  maxAgentIterations: 12,
  maxRuntimeMs: 30 * 60_000,
  maxConcurrentTasks: 4,
};

export function canDelegate(
  depth: number,
  childCount: number,
  limits: OrchestrationLimits = DEFAULT_LIMITS,
): { allowed: boolean; reason?: string } {
  if (depth + 1 > limits.maxDepth) {
    return { allowed: false, reason: `Delegation depth would exceed ${limits.maxDepth}` };
  }
  if (childCount >= limits.maxChildrenPerTask) {
    return { allowed: false, reason: `Parent already has ${limits.maxChildrenPerTask} children` };
  }
  return { allowed: true };
}
