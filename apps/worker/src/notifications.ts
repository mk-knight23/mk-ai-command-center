import { eq } from "drizzle-orm";
import { completeJob, notifications, type JobRow } from "@mkcc/db";
import type { WorkerContext } from "./index.js";

interface NotificationPayload {
  notificationId?: string;
  kind?: string;
  approvalId?: string;
  taskId?: string;
  actionSummary?: string;
  riskLevel?: string;
}

export async function sendNotificationJob(ctx: WorkerContext, job: JobRow): Promise<void> {
  const { handle, env } = ctx;
  const payload = JSON.parse(job.payload || "{}") as NotificationPayload;

  if (payload.notificationId) {
    const notification = await handle.db.query.notifications.findFirst({
      where: eq(notifications.id, payload.notificationId),
    });
    if (!notification) {
      completeJob(handle, job.id);
      return;
    }
    try {
      await deliver(ctx, notification.channel, notification.recipient, notification.subject, notification.body);
      await handle.db
        .update(notifications)
        .set({ status: "sent", sentAt: Date.now() })
        .where(eq(notifications.id, notification.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await handle.db
        .update(notifications)
        .set({ status: "failed", error: message.slice(0, 1000) })
        .where(eq(notifications.id, notification.id));
    }
    completeJob(handle, job.id);
    return;
  }

  if (payload.kind === "approval_requested") {
    const dashboardUrl = env.TELEGRAM_DASHBOARD_BASE_URL ?? env.PUBLIC_APP_URL;
    const body = [
      `Approval needed (${payload.riskLevel})`,
      payload.actionSummary ?? "",
      `Task: ${payload.taskId ?? ""}`,
      `Approve in dashboard: ${dashboardUrl}/approvals`,
      env.TELEGRAM_BOT_TOKEN ? `Or reply: /approve ${payload.approvalId ?? ""}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    await deliver(ctx, "telegram", "owner", "Approval requested", body);
    completeJob(handle, job.id);
    return;
  }

  completeJob(handle, job.id);
}

async function deliver(
  ctx: WorkerContext,
  channel: string,
  recipient: string,
  subject: string,
  body: string,
): Promise<void> {
  const { env } = ctx;
  if (channel === "telegram") {
    if (!env.TELEGRAM_BOT_TOKEN) return;
    const chatIds = (env.TELEGRAM_ALLOWED_CHAT_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const chatId of chatIds) {
      const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: `${subject}\n${body}`.slice(0, 4000),
        }),
      });
      if (!res.ok) {
        throw new Error(`Telegram send failed: ${res.status}`);
      }
    }
    return;
  }
  if (channel === "email") {
    if (!env.SMTP_HOST || !env.SMTP_USER) return;
    console.warn("[notify] SMTP delivery not implemented in this build; email skipped");
    return;
  }
  // dashboard channel: persisted row is the delivery
}
