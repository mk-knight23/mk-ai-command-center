import { Bot, type CommandContext, type Context } from "grammy";
import { approvalRequired, parseCommand } from "@mkcc/core";
import {
  audit,
  budgetSnapshot,
  cancelTask,
  createTask,
  decideApproval,
  getTask,
  listIncidents,
  listTasks,
  listWorkflows,
  pauseTask,
  pendingApprovals,
  queueDepth,
  resumeTask,
  taskCountsByStatus,
  triggerWorkflow,
  getWorkflowBySlug,
  agents,
} from "@mkcc/db";
import type { WorkerContext } from "./index.js";

function allowedChatIds(ctx: WorkerContext): Set<string> {
  return new Set(
    (ctx.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function fmtTaskLine(t: { id: string; objective: string; status: string }): string {
  return `• [${t.status}] ${t.objective.slice(0, 60)}\n  id: ${t.id}`;
}

export async function startTelegramBot(ctx: WorkerContext): Promise<void> {
  const { env, handle } = ctx;
  if (!env.TELEGRAM_BOT_TOKEN) {
    console.log("[telegram] TELEGRAM_BOT_TOKEN not set — bot disabled");
    return;
  }
  if (env.ENABLE_TELEGRAM === false) {
    console.log("[telegram] disabled via ENABLE_TELEGRAM=false");
    return;
  }

  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  bot.use(async (msg, next) => {
    const chatId = String(msg.chat?.id ?? "");
    if (!allowedChatIds(ctx).has(chatId)) {
      await audit(handle, {
        actor: `telegram:${chatId}`,
        action: "telegram.access_denied",
        meta: { username: msg.from?.username ?? "" },
      });
      console.warn(`[telegram] rejected unauthorized chat ${chatId}`);
      if (msg.message?.text?.startsWith("/start")) {
        await msg.reply("This bot is private. Your chat id has been logged.");
      }
      return;
    }
    await next();
  });

  bot.command("start", async (msg) => {
    await msg.reply(`${env.APP_NAME} connected. Send /help for commands.`);
  });

  bot.command("help", async (msg) => {
    await msg.reply(
      [
        "Commands:",
        "/status — system summary",
        "/new <text> — create a task",
        "/tasks — recent tasks",
        "/task <id> — task detail",
        "/agents — agent roster",
        "/automations — workflows",
        "/run <slug> — trigger workflow",
        "/pause <task id> · /resume <task id> · /cancel <task id>",
        "/approve <id> · /reject <id> — approvals",
        "/costs · /health · /incidents · /daily",
        "Or just type a natural-language instruction.",
      ].join("\n"),
    );
  });

  bot.command("status", async (msg) => {
    const [counts, queue, budget, approvals] = await Promise.all([
      taskCountsByStatus(handle),
      Promise.resolve(queueDepth(handle)),
      budgetSnapshot(handle),
      pendingApprovals(handle),
    ]);
    await msg.reply(
      [
        `${env.APP_NAME} status`,
        `Tasks: ${counts.running ?? 0} running · ${counts.queued ?? 0} queued · ${counts.completed ?? 0} done · ${counts.failed ?? 0} failed`,
        `Queue: ${queue.pending ?? 0} pending · ${queue.dead ?? 0} dead-lettered`,
        `Approvals waiting: ${approvals.length}`,
        `Spend today: $${budget.spentTodayUsd.toFixed(2)} / $${budget.dailyLimitUsd}`,
      ].join("\n"),
    );
  });

  bot.command("tasks", async (msg) => {
    const { items } = await listTasks(handle, { limit: 8 });
    if (items.length === 0) {
      await msg.reply("No tasks yet.");
      return;
    }
    await msg.reply(items.map(fmtTaskLine).join("\n"));
  });

  bot.command("task", async (msg) => {
    const id = msg.match?.trim();
    if (!id) {
      await msg.reply("Usage: /task <id>");
      return;
    }
    const task = await getTask(handle, id);
    if (!task) {
      await msg.reply("Task not found.");
      return;
    }
    await msg.reply(
      [
        `Objective: ${task.objective}`,
        `Status: ${task.status} · Risk: ${task.riskLevel}`,
        `Agent: ${task.assignedAgentSlug ?? "—"}`,
        `Cost: $${task.costUsd.toFixed(4)} · Attempts: ${task.attemptCount}`,
        task.error ? `Error: ${task.error.slice(0, 200)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  });

  bot.command("agents", async (msg) => {
    const rows = await handle.db.query.agents.findMany({ orderBy: [agents.name] });
    await msg.reply(rows.map((a) => `• ${a.name} (${a.slug})`).join("\n"));
  });

  bot.command("automations", async (msg) => {
    const rows = await listWorkflows(handle);
    if (rows.length === 0) {
      await msg.reply("No automations configured.");
      return;
    }
    await msg.reply(rows.map((w) => `• ${w.name} [${w.status}] slug=${w.slug}`).join("\n"));
  });

  bot.command("run", async (msg) => {
    const slug = msg.match?.trim();
    if (!slug) {
      await msg.reply("Usage: /run <workflow-slug>");
      return;
    }
    const workflow = await getWorkflowBySlug(handle, slug);
    if (!workflow) {
      await msg.reply(`Workflow not found: ${slug}`);
      return;
    }
    try {
      const { taskId } = await triggerWorkflow(handle, workflow.id, "telegram");
      await msg.reply(`Triggered ${workflow.name}. Task: ${taskId}`);
    } catch (error) {
      await msg.reply(error instanceof Error ? error.message : "Trigger failed");
    }
  });

  const taskControl = (action: "pause" | "resume" | "cancel") => async (msg: CommandContext<Context>) => {
    const id = msg.match?.trim();
    if (!id) {
      await msg.reply(`Usage: /${action} <task id>`);
      return;
    }
    try {
      const actor = `telegram:${msg.from?.username ?? "owner"}`;
      if (action === "pause") await pauseTask(handle, id, actor);
      if (action === "resume") await resumeTask(handle, id, actor);
      if (action === "cancel") await cancelTask(handle, id, actor);
      await msg.reply(`Task ${action} requested: ${id}`);
    } catch (error) {
      await msg.reply(error instanceof Error ? error.message : "Action failed");
    }
  };
  bot.command("pause", taskControl("pause"));
  bot.command("resume", taskControl("resume"));
  bot.command("cancel", taskControl("cancel"));

  const decide = (decision: "approved" | "rejected") => async (msg: CommandContext<Context>) => {
    const id = msg.match?.trim();
    if (!id) {
      await msg.reply(`Usage: /${decision === "approved" ? "approve" : "reject"} <approval id>`);
      return;
    }
    const result = await decideApproval(handle, id, decision, `telegram:${msg.from?.username ?? "owner"}`);
    if (result.outcome === "error") {
      await msg.reply(`Could not decide approval: ${result.code}`);
      return;
    }
    await msg.reply(
      result.outcome === "approved"
        ? `Approved. Task ${result.task.id} re-queued.`
        : `Rejected. Task ${result.task.id} cancelled.`,
    );
  };
  bot.command("approve", decide("approved"));
  bot.command("reject", decide("rejected"));

  bot.command("costs", async (msg) => {
    const budget = await budgetSnapshot(handle);
    await msg.reply(
      `Today: $${budget.spentTodayUsd.toFixed(3)} / $${budget.dailyLimitUsd}\nMonth: $${budget.spentThisMonthUsd.toFixed(2)} / $${budget.monthlyLimitUsd}`,
    );
  });

  bot.command("health", async (msg) => {
    const depth = queueDepth(handle);
    await msg.reply(
      `DB: up · Queue pending: ${depth.pending ?? 0} · dead: ${depth.dead ?? 0} · Worker polling active`,
    );
  });

  bot.command("incidents", async (msg) => {
    const items = await listIncidents(handle, 10);
    const open = items.filter((i) => i.status === "open");
    if (open.length === 0) {
      await msg.reply("No open incidents.");
      return;
    }
    await msg.reply(open.map((i) => `• [${i.severity}] ${i.title}`).join("\n"));
  });

  bot.command("daily", async (msg) => {
    const [counts, budget, approvals] = await Promise.all([
      taskCountsByStatus(handle),
      budgetSnapshot(handle),
      pendingApprovals(handle),
    ]);
    await msg.reply(
      [
        "Daily brief",
        `Completed: ${counts.completed ?? 0} · Failed: ${counts.failed ?? 0} · Active: ${(counts.running ?? 0) + (counts.queued ?? 0)}`,
        `Pending approvals: ${approvals.length}`,
        `Spend: $${budget.spentTodayUsd.toFixed(2)} today`,
      ].join("\n"),
    );
  });

  bot.command("settings", async (msg) => {
    await msg.reply(
      `Provider: ${env.AI_DEFAULT_PROVIDER}\nDaily budget: $${env.AI_DAILY_BUDGET_USD}\nTimezone: Asia/Kolkata\nDashboard: ${env.TELEGRAM_DASHBOARD_BASE_URL ?? env.PUBLIC_APP_URL}`,
    );
  });

  bot.command("new", async (msg) => {
    const text = msg.match?.trim();
    if (!text) {
      await msg.reply("Usage: /new <instruction>");
      return;
    }
    await createFromText(ctx, msg, text);
  });

  bot.on("message:text", async (msg) => {
    const text = msg.msg.text;
    if (!text || text.startsWith("/")) return;
    await createFromText(ctx, msg, text);
  });

  bot.catch((error) => {
    console.error("[telegram] bot error:", error);
  });

  console.log("[telegram] bot starting (long polling)");
  void bot.start({
    onStart: (info) => console.log(`[telegram] running as @${info.username}`),
  });
}

async function createFromText(
  ctx: WorkerContext,
  msg: { reply: (text: string) => Promise<unknown>; from?: { username?: string }; chat?: { id: number | string } },
  text: string,
): Promise<void> {
  const { handle } = ctx;
  const parsed = parseCommand(text);
  const task = await createTask(handle, {
    objective: parsed.normalizedObjective,
    source: "telegram",
    assignedAgentSlug: parsed.agentSlug,
    riskLevel: parsed.riskLevel,
    meta: { intent: parsed.intent, chatId: String(msg.chat?.id ?? "") },
    actor: `telegram:${msg.from?.username ?? "owner"}`,
  });
  const needsApproval = approvalRequired(parsed.riskLevel);
  await msg.reply(
    [
      "Task accepted.",
      `Objective: ${task.objective.slice(0, 120)}`,
      `Agent: ${parsed.agentSlug} · Risk: ${parsed.riskLevel}`,
      needsApproval ? "Approval will be required before external execution." : "Executing (safe/internal).",
      `id: ${task.id}`,
    ].join("\n"),
  );
}
