import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type DbHandle } from "@mkcc/db";
import { ensureMigrated } from "@mkcc/db";
import { seed } from "@mkcc/db";
import {
  claimJob,
  createTask,
  getTask,
  completeJob,
  pendingApprovals,
  decideApproval,
  type JobRow,
} from "@mkcc/db";
import type { Env } from "@mkcc/shared";
import type { AiGateway, CompletionRequest, CompletionResult } from "@mkcc/ai-gateway";
import { executeTaskJob } from "../src/executor.js";
import type { WorkerContext } from "../src/index.js";

let handle: DbHandle;
let shutdown: { requested: boolean };
let env: Env;

beforeAll(async () => {
  handle = createDb(":memory:");
  await ensureMigrated(handle);
  await seed(handle, {
    ownerEmail: "owner@mkcc.local",
    ownerPassword: "test-password-123",
    ownerName: "Test Owner",
    dailyBudgetUsd: 20,
    monthlyBudgetUsd: 300,
  });
  env = {
    NODE_ENV: "test",
    MKCC_DATA_DIR: "./data",
    WEB_PORT: 3100,
    PUBLIC_APP_URL: "http://localhost:3100",
    APP_NAME: "Test",
    NEXT_PUBLIC_APP_NAME: "Test",
    APP_OWNER_NAME: "Test Owner",
    OWNER_EMAIL: "owner@mkcc.local",
    SESSION_TTL_DAYS: 30,
    AI_DEFAULT_PROVIDER: "mock",
    AI_DAILY_BUDGET_USD: 20,
    AI_MONTHLY_BUDGET_USD: 300,
    WORKER_POLL_MS: 500,
    SCHEDULER_POLL_MS: 5000,
    JOB_LEASE_MS: 30000,
  };
  shutdown = { requested: false };
});

afterAll(() => {
  handle.close();
});

beforeEach(() => {
  let job;
  while ((job = claimJob(handle, 30_000)) !== null) {
    completeJob(handle, job.id);
  }
});

function makeCtx(gateway: AiGateway): WorkerContext {
  return { env, handle, gateway, shutdown };
}

function fakeGateway(content: string): AiGateway {
  const complete = async (req: CompletionRequest): Promise<CompletionResult> => ({
    content,
    provider: "mock",
    model: "mock-1",
    usage: { inputTokens: 10, outputTokens: 20 },
    costUsd: 0.0002,
    latencyMs: 5,
    ...req,
  });
  return { complete } as unknown as AiGateway;
}

describe("executeTaskJob", () => {
  it("completes a level_0 task end-to-end and records a notification", async () => {
    const task = await createTask(handle, {
      objective: "Summarize the meeting notes",
      assignedAgentSlug: "research-agent",
      riskLevel: "level_0",
    });
    const job = claimJob(handle, 30_000);
    expect(job).not.toBeNull();
    expect(job!.taskId).toBe(task.id);

    await executeTaskJob(makeCtx(fakeGateway("Done — here is the summary.")), job as JobRow);

    const after = await getTask(handle, task.id);
    expect(after.status).toBe("completed");
    expect(after.costUsd).toBeGreaterThan(0);

    const notifs = await handle.db.query.notifications.findMany();
    expect(notifs.some((n) => n.subject.includes("Task completed"))).toBe(true);
    completeJob(handle, job!.id);
  });

  it("holds a task for approval when agent output has level_2 actions", async () => {
    const task = await createTask(handle, {
      objective: "Send a follow-up email to the client",
      assignedAgentSlug: "email-agent",
      riskLevel: "level_2",
    });
    const job = claimJob(handle, 30_000);
    expect(job).not.toBeNull();

    const agentOutput = JSON.stringify({
      summary: "Ready to send a polite follow-up email.",
      actions: [{ description: "Send follow-up email to client", risk: "level_2" }],
    });
    await executeTaskJob(makeCtx(fakeGateway(agentOutput)), job as JobRow);

    const after = await getTask(handle, task.id);
    expect(after.status).toBe("waiting_approval");

    const pending = await pendingApprovals(handle);
    const approval = pending.find((a) => a.taskId === task.id);
    expect(approval).toBeDefined();
    expect(approval!.riskLevel).toBe("level_2");

    const decided = await decideApproval(handle, approval!.id, "approved", "owner@mkcc.local");
    expect(decided.outcome).toBe("approved");
    expect(decided.task.status).toBe("queued");
    completeJob(handle, job!.id);
  });

  it("fails a task that the provider cannot reach into a retryable state", async () => {
    const task = await createTask(handle, {
      objective: "Unreachable provider test",
      riskLevel: "level_0",
    });
    const job = claimJob(handle, 30_000);
    expect(job).not.toBeNull();

    const gateway = {
      complete: async () => {
        throw new Error("provider timeout");
      },
    } as unknown as AiGateway;

    await executeTaskJob(makeCtx(gateway), job as JobRow);

    const after = await getTask(handle, task.id);
    expect(["retrying", "dead_lettered"]).toContain(after.status);
    completeJob(handle, job!.id);
  });
});
