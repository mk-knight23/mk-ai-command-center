import { desc, eq, and, gt } from "drizzle-orm";
import { newId } from "@mkcc/core";
import type { DbHandle } from "../client.js";
import { auditLogs, taskEvents } from "../schema.js";

export async function recordTaskEvent(
  handle: DbHandle,
  args: {
    taskId: string;
    type: string;
    actor?: string;
    payload?: Record<string, unknown>;
    correlationId?: string;
  },
): Promise<string> {
  const id = newId("evt");
  await handle.db.insert(taskEvents).values({
    id,
    taskId: args.taskId,
    type: args.type,
    actor: args.actor ?? "system",
    correlationId: args.correlationId,
    payload: JSON.stringify(args.payload ?? {}),
    createdAt: Date.now(),
  });
  return id;
}

export async function listTaskEvents(handle: DbHandle, taskId: string, limit = 200) {
  return handle.db.query.taskEvents.findMany({
    where: eq(taskEvents.taskId, taskId),
    orderBy: [taskEvents.createdAt],
    limit,
  });
}

export async function recentEvents(handle: DbHandle, sinceMs: number, limit = 100) {
  return handle.db.query.taskEvents.findMany({
    where: gt(taskEvents.createdAt, sinceMs),
    orderBy: [desc(taskEvents.createdAt)],
    limit,
  });
}

export async function audit(
  handle: DbHandle,
  args: {
    actor: string;
    action: string;
    entityType?: string;
    entityId?: string;
    ip?: string;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  await handle.db.insert(auditLogs).values({
    id: newId("aud"),
    actor: args.actor,
    action: args.action,
    entityType: args.entityType ?? "",
    entityId: args.entityId ?? "",
    ip: args.ip,
    meta: JSON.stringify(args.meta ?? {}),
    createdAt: Date.now(),
  });
}

export async function recentAuditLogs(handle: DbHandle, limit = 100) {
  return handle.db.query.auditLogs.findMany({
    orderBy: [desc(auditLogs.createdAt)],
    limit,
  });
}
