import { desc, eq } from "drizzle-orm";
import { newId, nextRunAfter } from "@mkcc/core";
import type { DbHandle } from "../client.js";
import { schedules, workflowRuns, workflows } from "../schema.js";
import { recordTaskEvent } from "./events.service.js";
import { createTask } from "./tasks.service.js";

export interface WorkflowRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  definition: string;
  approvalPolicy: string;
  retryPolicy: string;
  timeoutMs: number;
  status: string;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface ScheduleRow {
  id: string;
  workflowId: string;
  cronExpr: string;
  timezone: string;
  nextRunAt: number;
  lastRunAt: number | null;
  enabled: boolean;
  createdAt: number;
}

export async function listWorkflows(handle: DbHandle): Promise<WorkflowRow[]> {
  const rows = await handle.db.query.workflows.findMany({
    orderBy: [desc(workflows.createdAt)],
  });
  return rows as WorkflowRow[];
}

export async function getWorkflowBySlug(handle: DbHandle, slug: string) {
  const row = await handle.db.query.workflows.findFirst({ where: eq(workflows.slug, slug) });
  return (row as WorkflowRow | undefined) ?? null;
}

export async function upsertWorkflow(
  handle: DbHandle,
  args: {
    slug: string;
    name: string;
    description?: string;
    definition?: Record<string, unknown>;
    timeoutMs?: number;
    status?: string;
  },
): Promise<WorkflowRow> {
  const now = Date.now();
  const existing = await getWorkflowBySlug(handle, args.slug);
  if (existing) {
    await handle.db
      .update(workflows)
      .set({
        name: args.name,
        description: args.description ?? existing.description,
        definition: JSON.stringify(args.definition ?? JSON.parse(existing.definition)),
        timeoutMs: args.timeoutMs ?? existing.timeoutMs,
        status: args.status ?? existing.status,
        version: existing.version + 1,
        updatedAt: now,
      })
      .where(eq(workflows.id, existing.id));
    return (await getWorkflowBySlug(handle, args.slug)) as WorkflowRow;
  }
  await handle.db.insert(workflows).values({
    id: newId("wfl"),
    slug: args.slug,
    name: args.name,
    description: args.description ?? "",
    definition: JSON.stringify(args.definition ?? {}),
    timeoutMs: args.timeoutMs ?? 1800000,
    status: args.status ?? "enabled",
    createdAt: now,
    updatedAt: now,
  });
  return (await getWorkflowBySlug(handle, args.slug)) as WorkflowRow;
}

export async function setWorkflowStatus(handle: DbHandle, slug: string, status: string) {
  await handle.db
    .update(workflows)
    .set({ status, updatedAt: Date.now() })
    .where(eq(workflows.slug, slug));
}

export async function triggerWorkflow(
  handle: DbHandle,
  workflowId: string,
  trigger: string,
  input?: Record<string, unknown>,
): Promise<{ runId: string; taskId: string }> {
  const workflow = await handle.db.query.workflows.findFirst({
    where: eq(workflows.id, workflowId),
  });
  if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);
  if (workflow.status !== "enabled") {
    throw new Error(`Workflow ${workflow.slug} is disabled`);
  }

  const now = Date.now();
  const runId = newId("run");
  await handle.db.insert(workflowRuns).values({
    id: runId,
    workflowId,
    workflowVersion: workflow.version,
    trigger,
    status: "running",
    startedAt: now,
    createdAt: now,
  });

  const definition = JSON.parse(workflow.definition || "{}") as {
    objectiveTemplate?: string;
    agentSlug?: string;
    riskLevel?: string;
  };
  const objective =
    definition.objectiveTemplate ?? `Run workflow: ${workflow.name}`;

  const task = await createTask(handle, {
    objective,
    description: `Workflow run ${runId} (${workflow.slug}), trigger=${trigger}${
      input ? `, input=${JSON.stringify(input)}` : ""
    }`,
    source: trigger === "schedule" ? "schedule" : "api",
    assignedAgentSlug: definition.agentSlug,
    riskLevel: definition.riskLevel ?? "level_0",
    workflowRunId: runId,
    actor: "workflow-engine",
  });

  await handle.db
    .update(workflowRuns)
    .set({ taskId: task.id })
    .where(eq(workflowRuns.id, runId));

  await recordTaskEvent(handle, {
    taskId: task.id,
    type: "workflow_triggered",
    actor: "workflow-engine",
    payload: { workflowId, runId, trigger },
  });

  return { runId, taskId: task.id };
}

export async function finishWorkflowRun(
  handle: DbHandle,
  runId: string,
  status: "completed" | "failed",
  error?: string,
) {
  await handle.db
    .update(workflowRuns)
    .set({ status, error: error ?? null, finishedAt: Date.now() })
    .where(eq(workflowRuns.id, runId));
}

export async function listRuns(handle: DbHandle, workflowId?: string, limit = 50) {
  return handle.db.query.workflowRuns.findMany({
    where: workflowId ? eq(workflowRuns.workflowId, workflowId) : undefined,
    orderBy: [desc(workflowRuns.createdAt)],
    limit,
  });
}

export async function addSchedule(
  handle: DbHandle,
  args: { workflowId: string; cronExpr: string; timezone?: string },
): Promise<ScheduleRow> {
  const now = Date.now();
  const tz = args.timezone ?? "Asia/Kolkata";
  const id = newId("sch");
  await handle.db.insert(schedules).values({
    id,
    workflowId: args.workflowId,
    cronExpr: args.cronExpr,
    timezone: tz,
    nextRunAt: nextRunAfter(args.cronExpr, now, tz),
    createdAt: now,
  });
  const row = await handle.db.query.schedules.findFirst({ where: eq(schedules.id, id) });
  return row as ScheduleRow;
}

export async function listSchedules(handle: DbHandle): Promise<ScheduleRow[]> {
  const rows = await handle.db.query.schedules.findMany();
  return rows as unknown as ScheduleRow[];
}

export async function dueSchedules(handle: DbHandle, now: number): Promise<ScheduleRow[]> {
  const rows = handle.sqlite
    .prepare(
      `SELECT id, workflow_id, cron_expr, timezone, next_run_at, last_run_at, enabled, created_at
       FROM schedules WHERE enabled = 1 AND next_run_at <= ?`,
    )
    .all(now) as unknown as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    workflowId: String(r.workflow_id),
    cronExpr: String(r.cron_expr),
    timezone: String(r.timezone),
    nextRunAt: Number(r.next_run_at),
    lastRunAt: r.last_run_at === null ? null : Number(r.last_run_at),
    enabled: r.enabled === 1 || r.enabled === true,
    createdAt: Number(r.created_at),
  }));
}

export async function markScheduleRun(handle: DbHandle, scheduleId: string, now: number) {
  const row = await handle.db.query.schedules.findFirst({
    where: eq(schedules.id, scheduleId),
  });
  if (!row) return;
  const next = nextRunAfter(row.cronExpr, now, row.timezone);
  await handle.db
    .update(schedules)
    .set({ lastRunAt: now, nextRunAt: next })
    .where(eq(schedules.id, scheduleId));
}

export async function setScheduleEnabled(handle: DbHandle, scheduleId: string, enabled: boolean) {
  await handle.db.update(schedules).set({ enabled }).where(eq(schedules.id, scheduleId));
}
