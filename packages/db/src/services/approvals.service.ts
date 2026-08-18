import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { approvalExpiry, newId } from "@mkcc/core";
import type { RiskLevel } from "@mkcc/shared";
import type { DbHandle } from "../client.js";
import { approvals, tasks } from "../schema.js";
import { audit, recordTaskEvent } from "./events.service.js";
import { enqueueJob } from "./queue.service.js";
import { getTask, transitionTask, type TaskRow } from "./tasks.service.js";

export interface ApprovalRow {
  id: string;
  taskId: string;
  actionSummary: string;
  actionHash: string;
  riskLevel: string;
  status: string;
  requestedBy: string;
  decidedBy: string | null;
  decisionNote: string | null;
  decidedAt: number | null;
  expiresAt: number;
  createdAt: number;
}

export function computeActionHash(args: {
  taskId: string;
  actionSummary: string;
  riskLevel: string;
}): string {
  return createHash("sha256")
    .update(`${args.taskId}|${args.actionSummary}|${args.riskLevel}`)
    .digest("hex");
}

export async function requestApproval(
  handle: DbHandle,
  args: { taskId: string; actionSummary: string; riskLevel: RiskLevel; requestedBy?: string },
): Promise<ApprovalRow> {
  const now = Date.now();
  const id = newId("apr");
  const actionHash = computeActionHash(args);
  await handle.db.insert(approvals).values({
    id,
    taskId: args.taskId,
    actionSummary: args.actionSummary,
    actionHash,
    riskLevel: args.riskLevel,
    status: "pending",
    requestedBy: args.requestedBy ?? "system",
    expiresAt: approvalExpiry(args.riskLevel, now),
    createdAt: now,
  });
  await handle.db
    .update(tasks)
    .set({ approvedActionHash: actionHash, updatedAt: now })
    .where(eq(tasks.id, args.taskId));
  await recordTaskEvent(handle, {
    taskId: args.taskId,
    type: "approval_requested",
    actor: args.requestedBy ?? "system",
    payload: { approvalId: id, actionSummary: args.actionSummary, riskLevel: args.riskLevel },
  });
  enqueueJob(handle, "notification.send", {
    payload: {
      kind: "approval_requested",
      approvalId: id,
      taskId: args.taskId,
      actionSummary: args.actionSummary,
      riskLevel: args.riskLevel,
    },
    idempotencyKey: `notify:approval:${id}`,
  });
  const row = await handle.db.query.approvals.findFirst({ where: eq(approvals.id, id) });
  return row as ApprovalRow;
}

export async function pendingApprovals(handle: DbHandle): Promise<ApprovalRow[]> {
  const rows = await handle.db.query.approvals.findMany({
    where: eq(approvals.status, "pending"),
    orderBy: [desc(approvals.createdAt)],
  });
  return rows as ApprovalRow[];
}

export async function getApproval(handle: DbHandle, id: string): Promise<ApprovalRow | null> {
  const row = await handle.db.query.approvals.findFirst({ where: eq(approvals.id, id) });
  return (row as ApprovalRow | undefined) ?? null;
}

export type DecisionResult =
  | { outcome: "approved"; task: TaskRow }
  | { outcome: "rejected"; task: TaskRow }
  | { outcome: "error"; code: "not_found" | "not_pending" | "expired" | "task_state_changed" };

export async function decideApproval(
  handle: DbHandle,
  approvalId: string,
  decision: "approved" | "rejected",
  decidedBy: string,
  note?: string,
): Promise<DecisionResult> {
  const approval = await getApproval(handle, approvalId);
  if (!approval) return { outcome: "error", code: "not_found" };
  if (approval.status !== "pending") return { outcome: "error", code: "not_pending" };

  const now = Date.now();
  if (now >= approval.expiresAt) {
    await handle.db
      .update(approvals)
      .set({ status: "expired", decidedAt: now, decidedBy })
      .where(eq(approvals.id, approvalId));
    await recordTaskEvent(handle, {
      taskId: approval.taskId,
      type: "approval_expired",
      actor: decidedBy,
      payload: { approvalId },
    });
    return { outcome: "error", code: "expired" };
  }

  const task = await getTask(handle, approval.taskId);
  if (!task) return { outcome: "error", code: "not_found" };

  await handle.db
    .update(approvals)
    .set({ status: decision, decidedAt: now, decidedBy, decisionNote: note ?? null })
    .where(eq(approvals.id, approvalId));

  await recordTaskEvent(handle, {
    taskId: approval.taskId,
    type: decision === "approved" ? "approval_granted" : "approval_rejected",
    actor: decidedBy,
    payload: { approvalId, note },
  });
  await audit(handle, {
    actor: decidedBy,
    action: `approval.${decision}`,
    entityType: "approval",
    entityId: approvalId,
    meta: { taskId: approval.taskId },
  });

  if (decision === "rejected") {
    const updated = await transitionTask(handle, approval.taskId, {
      to: "cancelled",
      actor: decidedBy,
      note: `Approval rejected: ${approval.actionSummary}`,
    });
    return { outcome: "rejected", task: updated };
  }

  if (task.status !== "waiting_approval" || task.approvedActionHash !== approval.actionHash) {
    return { outcome: "error", code: "task_state_changed" };
  }

  const updated = await transitionTask(handle, approval.taskId, {
    to: "queued",
    actor: decidedBy,
    note: `Approved: ${approval.actionSummary}`,
  });
  enqueueJob(handle, "task.execute", {
    taskId: approval.taskId,
    idempotencyKey: `exec:${approval.taskId}:approved:${approvalId}`,
  });
  return { outcome: "approved", task: updated };
}

export async function expireStaleApprovals(handle: DbHandle): Promise<number> {
  const now = Date.now();
  const stale = handle.sqlite
    .prepare("SELECT id, task_id FROM approvals WHERE status = 'pending' AND expires_at <= ?")
    .all(now) as { id: string; task_id: string }[];
  for (const row of stale) {
    await handle.db
      .update(approvals)
      .set({ status: "expired", decidedAt: now, decidedBy: "system" })
      .where(eq(approvals.id, row.id));
    await recordTaskEvent(handle, {
      taskId: row.task_id,
      type: "approval_expired",
      actor: "system",
      payload: { approvalId: row.id },
    });
  }
  return stale.length;
}
