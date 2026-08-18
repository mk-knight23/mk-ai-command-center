import { desc, eq } from "drizzle-orm";
import type { DbHandle } from "../client.js";
import { healthChecks, incidents } from "../schema.js";
import { pendingApprovals } from "./approvals.service.js";
import { budgetSnapshot } from "./costs.service.js";
import { recentEvents } from "./events.service.js";
import { queueDepth } from "./queue.service.js";
import { taskCountsByStatus } from "./tasks.service.js";

export async function overview(handle: DbHandle) {
  const now = Date.now();
  const [counts, approvals, queue, budget, events] = await Promise.all([
    taskCountsByStatus(handle),
    pendingApprovals(handle),
    Promise.resolve(queueDepth(handle)),
    budgetSnapshot(handle),
    recentEvents(handle, now - 24 * 60 * 60 * 1000, 20),
  ]);

  const openIncidents = await handle.db.query.incidents.findMany({
    where: eq(incidents.status, "open"),
    orderBy: [desc(incidents.openedAt)],
  });

  const workerHeartbeat = await handle.db.query.healthChecks.findFirst({
    where: eq(healthChecks.name, "worker-heartbeat"),
    orderBy: [desc(healthChecks.checkedAt)],
  });

  return {
    tasks: counts,
    pendingApprovals: approvals.length,
    approvals: approvals.slice(0, 5),
    queue,
    budget,
    recentEvents: events.map((e) => ({
      id: e.id,
      taskId: e.taskId,
      type: e.type,
      actor: e.actor,
      createdAt: e.createdAt,
    })),
    openIncidents,
    worker: {
      alive: workerHeartbeat ? now - workerHeartbeat.checkedAt < 90_000 : false,
      lastSeenAt: workerHeartbeat?.checkedAt ?? null,
    },
    generatedAt: now,
  };
}

export async function recordHealthCheck(
  handle: DbHandle,
  args: { name: string; status: string; latencyMs?: number; details?: string },
) {
  await handle.db.insert(healthChecks).values({
    id: `hc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: args.name,
    status: args.status,
    latencyMs: args.latencyMs ?? null,
    details: args.details ?? "",
    checkedAt: Date.now(),
  });
}

export async function openIncident(
  handle: DbHandle,
  args: { title: string; severity?: string; source?: string; details?: string; taskId?: string },
): Promise<string> {
  const id = `inc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await handle.db.insert(incidents).values({
    id,
    title: args.title,
    severity: args.severity ?? "medium",
    status: "open",
    source: args.source ?? "system",
    taskId: args.taskId ?? null,
    details: args.details ?? "",
    openedAt: Date.now(),
  });
  return id;
}

export async function resolveIncident(handle: DbHandle, id: string, resolution: string) {
  await handle.db
    .update(incidents)
    .set({ status: "resolved", resolvedAt: Date.now(), resolution })
    .where(eq(incidents.id, id));
}

export async function listIncidents(handle: DbHandle, limit = 50) {
  return handle.db.query.incidents.findMany({
    orderBy: [desc(incidents.openedAt)],
    limit,
  });
}
