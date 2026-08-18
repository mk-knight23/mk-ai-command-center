import { and, desc, eq, or } from "drizzle-orm";
import {
  assertTransition,
  canTransition,
  newId,
  DEFAULT_RETRY_POLICY,
  backoffDelay,
} from "@mkcc/core";
import type { TaskSource, TaskState } from "@mkcc/shared";
import type { DbHandle } from "../client.js";
import { tasks } from "../schema.js";
import { audit, recordTaskEvent } from "./events.service.js";
import { cancelPendingJobsForTask, enqueueJob } from "./queue.service.js";

export interface TaskRow {
  id: string;
  parentTaskId: string | null;
  objective: string;
  description: string;
  status: string;
  priority: string;
  riskLevel: string;
  source: string;
  creatorId: string | null;
  assignedAgentSlug: string | null;
  workflowRunId: string | null;
  idempotencyKey: string | null;
  depth: number;
  attemptCount: number;
  maxAttempts: number;
  tokensUsed: number;
  costUsd: number;
  result: string | null;
  error: string | null;
  meta: string;
  approvedActionHash: string | null;
  startedAt: number | null;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateTaskArgs {
  objective: string;
  description?: string;
  priority?: string;
  riskLevel?: string;
  source?: TaskSource;
  creatorId?: string;
  parentTaskId?: string;
  assignedAgentSlug?: string;
  workflowRunId?: string;
  idempotencyKey?: string;
  meta?: Record<string, unknown>;
  enqueue?: boolean;
  actor?: string;
}

export async function createTask(handle: DbHandle, args: CreateTaskArgs): Promise<TaskRow> {
  if (args.idempotencyKey) {
    const existing = await handle.db.query.tasks.findFirst({
      where: eq(tasks.idempotencyKey, args.idempotencyKey),
    });
    if (existing) return existing as TaskRow;
  }

  const now = Date.now();
  let depth = 0;
  if (args.parentTaskId) {
    const parent = await handle.db.query.tasks.findFirst({
      where: eq(tasks.id, args.parentTaskId),
    });
    if (!parent) throw new Error(`Parent task not found: ${args.parentTaskId}`);
    depth = parent.depth + 1;
  }

  const id = newId("tsk");
  await handle.db.insert(tasks).values({
    id,
    parentTaskId: args.parentTaskId ?? null,
    objective: args.objective,
    description: args.description ?? "",
    status: "queued",
    priority: args.priority ?? "normal",
    riskLevel: args.riskLevel ?? "level_0",
    source: args.source ?? "dashboard",
    creatorId: args.creatorId ?? null,
    assignedAgentSlug: args.assignedAgentSlug ?? null,
    workflowRunId: args.workflowRunId ?? null,
    idempotencyKey: args.idempotencyKey ?? null,
    depth,
    meta: JSON.stringify(args.meta ?? {}),
    createdAt: now,
    updatedAt: now,
  });

  await recordTaskEvent(handle, {
    taskId: id,
    type: "task_created",
    actor: args.actor ?? "system",
    payload: { source: args.source ?? "dashboard", objective: args.objective.slice(0, 200) },
  });
  await audit(handle, {
    actor: args.actor ?? "system",
    action: "task.created",
    entityType: "task",
    entityId: id,
  });

  if (args.enqueue !== false) {
    enqueueJob(handle, "task.execute", { taskId: id, idempotencyKey: `exec:${id}` });
    await recordTaskEvent(handle, { taskId: id, type: "task_queued", actor: "system" });
  }

  const created = await handle.db.query.tasks.findFirst({ where: eq(tasks.id, id) });
  return created as TaskRow;
}

export async function getTask(handle: DbHandle, id: string): Promise<TaskRow | null> {
  const row = await handle.db.query.tasks.findFirst({ where: eq(tasks.id, id) });
  return (row as TaskRow | undefined) ?? null;
}

export async function listTasks(
  handle: DbHandle,
  opts: { status?: string; limit?: number; offset?: number; agentSlug?: string } = {},
): Promise<{ items: TaskRow[]; total: number }> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;
  const conditions = [];
  if (opts.status) conditions.push(eq(tasks.status, opts.status));
  if (opts.agentSlug) conditions.push(eq(tasks.assignedAgentSlug, opts.agentSlug));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, countRows] = await Promise.all([
    handle.db.query.tasks.findMany({
      where,
      orderBy: [desc(tasks.createdAt)],
      limit,
      offset,
    }),
    handle.db
      .select({ n: tasks.id })
      .from(tasks)
      .where(where),
  ]);
  return { items: items as TaskRow[], total: countRows.length };
}

export interface TransitionArgs {
  to: TaskState;
  actor?: string;
  note?: string;
  result?: unknown;
  error?: string;
  meta?: Record<string, unknown>;
  approvedActionHash?: string | null;
}

export async function transitionTask(
  handle: DbHandle,
  taskId: string,
  args: TransitionArgs,
): Promise<TaskRow> {
  const task = await getTask(handle, taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  const from = task.status as TaskState;
  assertTransition(from, args.to);

  const now = Date.now();
  const patch: Record<string, unknown> = { status: args.to, updatedAt: now };
  if (args.to === "running" && !task.startedAt) patch.startedAt = now;
  if (["completed", "failed", "cancelled", "dead_lettered"].includes(args.to)) {
    patch.completedAt = now;
  }
  if (args.result !== undefined) patch.result = JSON.stringify(args.result);
  if (args.error !== undefined) patch.error = args.error.slice(0, 4000);
  if (args.approvedActionHash !== undefined) patch.approvedActionHash = args.approvedActionHash;
  if (args.meta) {
    const merged = { ...JSON.parse(task.meta || "{}"), ...args.meta };
    patch.meta = JSON.stringify(merged);
  }

  await handle.db.update(tasks).set(patch).where(eq(tasks.id, taskId));

  const eventByState: Partial<Record<TaskState, string>> = {
    running: "task_started",
    paused: "task_paused",
    queued: from === "paused" ? "task_resumed" : "task_queued",
    retrying: "task_retrying",
    completed: "task_completed",
    failed: "task_failed",
    cancelled: "task_cancelled",
  };
  const eventType = eventByState[args.to] ?? "task_progress";

  await recordTaskEvent(handle, {
    taskId,
    type: eventType,
    actor: args.actor ?? "system",
    payload: { from, to: args.to, note: args.note },
  });
  await audit(handle, {
    actor: args.actor ?? "system",
    action: `task.${args.to}`,
    entityType: "task",
    entityId: taskId,
    meta: args.note ? { note: args.note } : undefined,
  });

  if (args.to === "cancelled") {
    cancelPendingJobsForTask(handle, taskId);
  }

  const updated = await getTask(handle, taskId);
  return updated as TaskRow;
}

export async function pauseTask(handle: DbHandle, taskId: string, actor: string) {
  return transitionTask(handle, taskId, { to: "paused", actor });
}

export async function resumeTask(handle: DbHandle, taskId: string, actor: string) {
  const task = await transitionTask(handle, taskId, { to: "queued", actor });
  enqueueJob(handle, "task.execute", {
    taskId,
    idempotencyKey: `exec:${taskId}:${Date.now()}`,
  });
  return task;
}

export async function cancelTask(handle: DbHandle, taskId: string, actor: string, note?: string) {
  return transitionTask(handle, taskId, { to: "cancelled", actor, note });
}

export async function retryTask(handle: DbHandle, taskId: string, actor: string) {
  const task = await getTask(handle, taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  if (task.status === "retrying") {
    await transitionTask(handle, taskId, { to: "queued", actor });
  } else {
    await transitionTask(handle, taskId, { to: "queued", actor, note: "manual retry" });
  }
  enqueueJob(handle, "task.execute", { taskId, idempotencyKey: `exec:${taskId}:${Date.now()}` });
  return getTask(handle, taskId);
}

export async function archiveTask(handle: DbHandle, taskId: string, actor: string) {
  return transitionTask(handle, taskId, { to: "archived", actor });
}

export async function taskCountsByStatus(handle: DbHandle): Promise<Record<string, number>> {
  const rows = handle.sqlite
    .prepare("SELECT status, COUNT(*) as n FROM tasks GROUP BY status")
    .all() as { status: string; n: number }[];
  const out: Record<string, number> = {};
  for (const row of rows) out[row.status] = row.n;
  return out;
}
