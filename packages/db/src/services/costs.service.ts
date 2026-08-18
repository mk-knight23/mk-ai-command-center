import { desc, eq, gte, sql } from "drizzle-orm";
import { newId } from "@mkcc/core";
import type { NotificationChannel } from "@mkcc/shared";
import type { DbHandle } from "../client.js";
import { budgets, costs, notifications } from "../schema.js";
import { enqueueJob } from "./queue.service.js";

export async function enqueueNotification(
  handle: DbHandle,
  args: {
    channel: NotificationChannel;
    recipient: string;
    subject?: string;
    body: string;
    taskId?: string;
  },
): Promise<string> {
  const id = newId("ntf");
  await handle.db.insert(notifications).values({
    id,
    channel: args.channel,
    recipient: args.recipient,
    subject: args.subject ?? "",
    body: args.body,
    status: "pending",
    taskId: args.taskId ?? null,
    createdAt: Date.now(),
  });
  enqueueJob(handle, "notification.send", {
    payload: { notificationId: id },
    idempotencyKey: `notify:${id}`,
  });
  return id;
}

export async function recentNotifications(handle: DbHandle, limit = 50) {
  return handle.db.query.notifications.findMany({
    orderBy: [desc(notifications.createdAt)],
    limit,
  });
}

function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export async function recordCost(
  handle: DbHandle,
  args: {
    taskId?: string;
    provider: string;
    model: string;
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
  },
): Promise<void> {
  await handle.db.insert(costs).values({
    id: newId("cst"),
    taskId: args.taskId ?? null,
    provider: args.provider,
    model: args.model,
    tokensIn: args.tokensIn,
    tokensOut: args.tokensOut,
    costUsd: args.costUsd,
    day: dayKey(Date.now()),
    createdAt: Date.now(),
  });
}

export async function spendSince(handle: DbHandle, sinceMs: number): Promise<number> {
  const rows = handle.sqlite
    .prepare("SELECT COALESCE(SUM(cost_usd), 0) as total FROM costs WHERE created_at >= ?")
    .get(sinceMs) as { total: number };
  return rows.total;
}

export interface BudgetSnapshot {
  dailyLimitUsd: number;
  monthlyLimitUsd: number;
  spentTodayUsd: number;
  spentThisMonthUsd: number;
}

export async function budgetSnapshot(handle: DbHandle): Promise<BudgetSnapshot> {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [daily, monthly] = await Promise.all([
    handle.db.query.budgets.findFirst({ where: eq(budgets.scope, "daily") }),
    handle.db.query.budgets.findFirst({ where: eq(budgets.scope, "monthly") }),
  ]);
  const [spentTodayUsd, spentThisMonthUsd] = await Promise.all([
    spendSince(handle, startOfDay.getTime()),
    spendSince(handle, startOfMonth.getTime()),
  ]);
  return {
    dailyLimitUsd: daily?.limitUsd ?? 20,
    monthlyLimitUsd: monthly?.limitUsd ?? 300,
    spentTodayUsd,
    spentThisMonthUsd,
  };
}

export async function costBreakdown(handle: DbHandle, days = 7) {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const byDay = handle.sqlite
    .prepare(
      `SELECT day, SUM(cost_usd) as total, SUM(tokens_in) as tin, SUM(tokens_out) as tout
       FROM costs WHERE created_at >= ? GROUP BY day ORDER BY day`,
    )
    .all(since) as { day: string; total: number; tin: number; tout: number }[];
  const byProvider = handle.sqlite
    .prepare(
      `SELECT provider, model, SUM(cost_usd) as total, COUNT(*) as calls
       FROM costs WHERE created_at >= ? GROUP BY provider, model ORDER BY total DESC`,
    )
    .all(since) as { provider: string; model: string; total: number; calls: number }[];
  return { byDay, byProvider };
}
