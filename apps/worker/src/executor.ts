import { and, eq } from "drizzle-orm";
import { approvalRequired, backoffDelay, DEFAULT_RETRY_POLICY, maxRisk } from "@mkcc/core";
import {
  agents,
  approvals,
  audit,
  budgetSnapshot,
  claimJob,
  completeJob,
  createTask,
  enqueueNotification,
  failJob,
  getTask,
  openIncident,
  recordCost,
  recordHealthCheck,
  recordTaskEvent,
  recoverStaleJobs,
  requestApproval,
  tasks,
  transitionTask,
  type JobRow,
} from "@mkcc/db";
import type { RiskLevel } from "@mkcc/shared";
import type { AiGateway, CompletionResult } from "@mkcc/ai-gateway";
import type { WorkerContext } from "./index.js";

interface AgentOutput {
  summary: string;
  actions: { description: string; risk: RiskLevel }[];
}

function parseAgentOutput(raw: string): AgentOutput {
  try {
    const parsed = JSON.parse(raw) as Partial<AgentOutput>;
    if (typeof parsed.summary === "string") {
      return {
        summary: parsed.summary,
        actions: Array.isArray(parsed.actions)
          ? parsed.actions
              .filter((a): a is { description: string; risk: RiskLevel } =>
                typeof a?.description === "string",
              )
              .map((a) => ({
                description: a.description,
                risk: (["level_0", "level_1", "level_2", "level_3"] as const).includes(a.risk)
                  ? a.risk
                  : "level_0",
              }))
          : [],
      };
    }
  } catch {
    /* not JSON — fall through */
  }
  return { summary: raw, actions: [] };
}

function agentSystemPrompt(args: {
  agentName: string;
  description: string;
  maxCostUsd: number;
}): string {
  return [
    `You are ${args.agentName}, a specialist agent in the MK AI Command Center.`,
    `Responsibility: ${args.description}`,
    "Rules: stay within scope; never invent credentials; never take actions beyond your tools;",
    `respect the cost ceiling of $${args.maxCostUsd}; flag anything risky instead of doing it.`,
    "Respond with JSON only, in this exact shape:",
    '{"summary": "concise outcome or proposed plan", "actions": [{"description": "action to take", "risk": "level_0|level_1|level_2|level_3"}]}',
    "If no external actions are needed, return an empty actions array.",
  ].join("\n");
}

async function loadAgent(handle: WorkerContext["handle"], slug: string | null) {
  if (!slug) return null;
  return handle.db.query.agents.findFirst({ where: eq(agents.slug, slug) });
}

async function hasGrantedApproval(
  handle: WorkerContext["handle"],
  taskId: string,
  actionHash: string | null,
): Promise<boolean> {
  if (!actionHash) return false;
  const row = await handle.db.query.approvals.findFirst({
    where: and(
      eq(approvals.taskId, taskId),
      eq(approvals.actionHash, actionHash),
      eq(approvals.status, "approved"),
    ),
  });
  return Boolean(row);
}

export async function executeTaskJob(ctx: WorkerContext, job: JobRow): Promise<void> {
  const { handle, gateway, env } = ctx;
  const taskId = job.taskId;
  if (!taskId) {
    completeJob(handle, job.id);
    return;
  }

  const task = await getTask(handle, taskId);
  if (!task) {
    completeJob(handle, job.id);
    return;
  }
  if (task.status !== "queued") {
    completeJob(handle, job.id);
    return;
  }

  await transitionTask(handle, taskId, { to: "running", actor: "worker" });

  const agent = await loadAgent(handle, task.assignedAgentSlug);
  const agentName = agent?.name ?? task.assignedAgentSlug ?? "Chief Orchestrator";
  const agentDescription = agent?.description ?? "General-purpose orchestration agent";
  const agentMaxCost = agent?.maxCostUsd ?? 5;

  const budget = await budgetSnapshot(handle);
  const dailyExceeded = budget.spentTodayUsd >= budget.dailyLimitUsd;
  const monthlyExceeded = budget.spentThisMonthUsd >= budget.monthlyLimitUsd;
  if (dailyExceeded || monthlyExceeded) {
    const reason = monthlyExceeded ? "monthly_budget_exceeded" : "daily_budget_exceeded";
    await transitionTask(handle, taskId, {
      to: "failed",
      actor: "cost-controller",
      error: `AI budget exceeded (${reason}); task blocked before provider call`,
    });
    const incidentId = await openIncident(handle, {
      title: `Budget exceeded — task ${taskId} blocked`,
      severity: "medium",
      source: "cost-controller",
      details: reason,
      taskId,
    });
    await enqueueNotification(handle, {
      channel: "dashboard",
      recipient: "owner",
      subject: "Budget exceeded",
      body: `Task blocked: ${reason}. Incident ${incidentId}.`,
      taskId,
    });
    completeJob(handle, job.id);
    return;
  }

  let completion: CompletionResult;
  try {
    completion = await gateway.complete({
      messages: [
        {
          role: "system",
          content: agentSystemPrompt({ agentName, description: agentDescription, maxCostUsd: agentMaxCost }),
        },
        { role: "user", content: task.objective + (task.description ? `\n\nContext: ${task.description}` : "") },
      ],
      purpose: "execute",
      maxTokens: 1500,
      timeoutMs: 90_000,
      taskId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordTaskEvent(handle, {
      taskId,
      type: "task_progress",
      actor: "worker",
      payload: { providerError: message.slice(0, 500), attempt: job.attempt },
    });
    const delay = backoffDelay(job.attempt, DEFAULT_RETRY_POLICY);
    const outcome = failJob(handle, job.id, message, delay);
    if (outcome === "retry_scheduled") {
      await transitionTask(handle, taskId, {
        to: "retrying",
        actor: "worker",
        note: `provider error; retry in ${Math.round(delay / 1000)}s`,
        error: message,
      });
    } else {
      await transitionTask(handle, taskId, {
        to: "dead_lettered",
        actor: "worker",
        error: message,
      });
      await openIncident(handle, {
        title: `Task ${taskId} dead-lettered after retries`,
        severity: "high",
        source: "worker",
        details: message.slice(0, 1000),
        taskId,
      });
      await enqueueNotification(handle, {
        channel: "dashboard",
        recipient: "owner",
        subject: "Task dead-lettered",
        body: `Task ${taskId} exhausted retries: ${message.slice(0, 200)}`,
        taskId,
      });
    }
    return;
  }

  await recordCost(handle, {
    taskId,
    provider: completion.provider,
    model: completion.model,
    tokensIn: completion.usage.inputTokens,
    tokensOut: completion.usage.outputTokens,
    costUsd: completion.costUsd,
  });
  await handle.db
    .update(tasks)
    .set({
      tokensUsed: task.tokensUsed + completion.usage.inputTokens + completion.usage.outputTokens,
      costUsd: task.costUsd + completion.costUsd,
    })
    .where(eq(tasks.id, taskId));

  const output = parseAgentOutput(completion.content);
  let effectiveRisk = task.riskLevel as RiskLevel;
  for (const action of output.actions) {
    effectiveRisk = maxRisk(effectiveRisk, action.risk);
  }

  const actionSummary =
    output.actions.length > 0
      ? output.actions.map((a) => a.description).join("; ")
      : `Complete: ${task.objective}`;

  const needsApproval =
    approvalRequired(effectiveRisk) && !(await hasGrantedApproval(handle, taskId, task.approvedActionHash));

  if (needsApproval) {
    await requestApproval(handle, {
      taskId,
      actionSummary: `[${agentName}] ${actionSummary}`.slice(0, 500),
      riskLevel: effectiveRisk,
      requestedBy: agentName,
    });
    await transitionTask(handle, taskId, {
      to: "waiting_approval",
      actor: "worker",
      note: `Risk ${effectiveRisk} requires approval`,
      meta: { agentOutput: output, provider: completion.provider, model: completion.model },
    });
    completeJob(handle, job.id);
    return;
  }

  await transitionTask(handle, taskId, {
    to: "completed",
    actor: agentName,
    result: {
      summary: output.summary,
      actions: output.actions,
      provider: completion.provider,
      model: completion.model,
      approved: task.approvedActionHash ? true : undefined,
    },
    meta: { latencyMs: completion.latencyMs },
  });
  await enqueueNotification(handle, {
    channel: "dashboard",
    recipient: "owner",
    subject: `Task completed: ${task.objective.slice(0, 60)}`,
    body: `${output.summary.slice(0, 400)}\nCost: $${completion.costUsd.toFixed(4)} · ${completion.latencyMs}ms · ${completion.provider}/${completion.model}`,
    taskId,
  });
  completeJob(handle, job.id);
}

export async function runExecutorLoop(ctx: WorkerContext): Promise<void> {
  const { handle, env, shutdown } = ctx;
  let sinceHeartbeat = 0;
  while (!shutdown.requested) {
    try {
      recoverStaleJobs(handle);
      const job = claimJob(handle, env.JOB_LEASE_MS);
      if (job) {
        try {
          if (job.kind === "task.execute") {
            await executeTaskJob(ctx, job);
          } else if (job.kind === "notification.send") {
            const { sendNotificationJob } = await import("./notifications.js");
            await sendNotificationJob(ctx, job);
          } else {
            completeJob(handle, job.id);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failJob(handle, job.id, message, backoffDelay(job.attempt, DEFAULT_RETRY_POLICY));
        }
        continue;
      }
    } catch (error) {
      console.error("[worker] loop error:", error);
    }

    sinceHeartbeat += env.WORKER_POLL_MS;
    if (sinceHeartbeat >= 30_000) {
      sinceHeartbeat = 0;
      try {
        await recordHealthCheck(handle, { name: "worker-heartbeat", status: "ok" });
      } catch {
        /* transient */
      }
    }
    await new Promise((r) => setTimeout(r, env.WORKER_POLL_MS));
  }
}

export { createTask, audit };
