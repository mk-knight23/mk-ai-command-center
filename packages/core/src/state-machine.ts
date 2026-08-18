import type { TaskState } from "@mkcc/shared";

const TRANSITIONS: Record<TaskState, readonly TaskState[]> = {
  draft: ["validating", "queued", "cancelled", "archived"],
  validating: ["planned", "queued", "failed", "cancelled"],
  planned: ["queued", "waiting_approval", "cancelled"],
  queued: ["running", "paused", "cancelled"],
  running: [
    "waiting_approval",
    "waiting_dependency",
    "paused",
    "retrying",
    "completed",
    "failed",
    "cancelled",
  ],
  waiting_dependency: ["queued", "paused", "cancelled"],
  waiting_approval: ["queued", "cancelled", "failed"],
  paused: ["queued", "cancelled"],
  retrying: ["queued", "dead_lettered", "cancelled"],
  failed: ["queued", "dead_lettered", "archived"],
  completed: ["archived"],
  cancelled: ["archived"],
  dead_lettered: ["queued", "archived"],
  archived: [],
};

export function canTransition(from: TaskState, to: TaskState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: TaskState, to: TaskState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal task transition: ${from} -> ${to}`);
  }
}

export function allowedTransitions(from: TaskState): readonly TaskState[] {
  return TRANSITIONS[from];
}

export function isTerminal(state: TaskState): boolean {
  return allowedTransitions(state).length === 0 || state === "archived";
}
