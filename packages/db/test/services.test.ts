import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type DbHandle } from "../src/client.js";
import { ensureMigrated } from "../src/migrate.js";
import { seed } from "../src/seed.js";
import {
  createTask,
  getTask,
  transitionTask,
  pauseTask,
  resumeTask,
  cancelTask,
  taskCountsByStatus,
} from "../src/services/tasks.service.js";
import {
  claimJob,
  completeJob,
  enqueueJob,
  failJob,
  queueDepth,
  recoverStaleJobs,
} from "../src/services/queue.service.js";
import {
  decideApproval,
  requestApproval,
  computeActionHash,
} from "../src/services/approvals.service.js";
import { listTaskEvents } from "../src/services/events.service.js";

let handle: DbHandle;

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
});

afterAll(() => {
  handle.close();
});

describe("task lifecycle", () => {
  it("creates a task, enqueues it, and the job is claimable", async () => {
    const task = await createTask(handle, {
      objective: "Research AI automation opportunities",
      source: "dashboard",
      actor: "owner",
    });
    expect(task.status).toBe("queued");
    expect(task.depth).toBe(0);

    const job = claimJob(handle, 60_000);
    expect(job).not.toBeNull();
    expect(job?.kind).toBe("task.execute");
    expect(job?.taskId).toBe(task.id);
    expect(job?.attempt).toBe(1);
    completeJob(handle, job!.id);

    const depth = queueDepth(handle);
    expect(depth.completed).toBeGreaterThanOrEqual(1);
  });

  it("records creation and queue events in the timeline", async () => {
    const task = await createTask(handle, { objective: "Event trail task" });
    const events = await listTaskEvents(handle, task.id);
    const types = events.map((e) => e.type);
    expect(types).toContain("task_created");
    expect(types).toContain("task_queued");
  });

  it("enforces the state machine on transitions", async () => {
    const task = await createTask(handle, { objective: "Transition guard task" });
    await expect(
      transitionTask(handle, task.id, { to: "completed" }),
    ).rejects.toThrow(/Illegal task transition/);
  });

  it("supports pause and resume", async () => {
    const task = await createTask(handle, { objective: "Pausable task" });
    const paused = await pauseTask(handle, task.id, "owner");
    expect(paused.status).toBe("paused");
    const resumed = await resumeTask(handle, task.id, "owner");
    expect(resumed.status).toBe("queued");
  });

  it("cancel kills pending jobs for the task", async () => {
    const task = await createTask(handle, { objective: "Cancellable task" });
    const cancelled = await cancelTask(handle, task.id, "owner", "changed my mind");
    expect(cancelled.status).toBe("cancelled");
    const remaining = handle.sqlite
      .prepare(
        "SELECT COUNT(*) as n FROM jobs WHERE task_id = ? AND status IN ('pending','running')",
      )
      .get(task.id) as { n: number };
    expect(remaining.n).toBe(0);
  });

  it("counts tasks by status", async () => {
    const counts = await taskCountsByStatus(handle);
    expect(counts.cancelled).toBeGreaterThanOrEqual(1);
    expect(counts.queued).toBeGreaterThanOrEqual(0);
  });

  it("is idempotent on idempotencyKey", async () => {
    const a = await createTask(handle, {
      objective: "Idempotent task",
      idempotencyKey: "idem-12345678",
    });
    const b = await createTask(handle, {
      objective: "Idempotent task duplicate",
      idempotencyKey: "idem-12345678",
    });
    expect(a.id).toBe(b.id);
  });

  it("tracks child depth from parent", async () => {
    const parent = await createTask(handle, { objective: "Parent" });
    const child = await createTask(handle, {
      objective: "Child",
      parentTaskId: parent.id,
    });
    expect(child.depth).toBe(1);
  });
});

describe("queue durability semantics", () => {
  beforeEach(() => {
    handle.sqlite.prepare("DELETE FROM jobs").run();
  });

  it("schedules retries with backoff then dead-letters", async () => {
    const jobId = enqueueJob(handle, "test.retry", { maxAttempts: 2 });
    const job = claimJob(handle, 60_000);
    expect(job?.id).toBe(jobId);
    const first = failJob(handle, jobId, "transient", 10);
    expect(first).toBe("retry_scheduled");

    handle.sqlite.prepare("UPDATE jobs SET available_at = ? WHERE id = ?").run(Date.now() - 1, jobId);
    const job2 = claimJob(handle, 60_000);
    expect(job2?.id).toBe(jobId);
    expect(job2?.attempt).toBe(2);
    const second = failJob(handle, jobId, "again", 10);
    expect(second).toBe("dead_lettered");
  });

  it("recovers stale leases after worker death", async () => {
    const jobId = enqueueJob(handle, "test.stale", { maxAttempts: 3 });
    const job = claimJob(handle, 1);
    expect(job?.id).toBe(jobId);
    await new Promise((r) => setTimeout(r, 5));
    const recovered = recoverStaleJobs(handle);
    expect(recovered).toBeGreaterThanOrEqual(1);
    const reclaimed = claimJob(handle, 60_000);
    expect(reclaimed?.id).toBe(jobId);
    completeJob(handle, jobId);
  });

  it("deduplicates by idempotency key", () => {
    const a = enqueueJob(handle, "test.dup", { idempotencyKey: "dup-key-1" });
    const b = enqueueJob(handle, "test.dup", { idempotencyKey: "dup-key-1" });
    expect(a).toBe(b);
  });
});

describe("approval flow", () => {
  it("holds a task at approval, then approves into execution", async () => {
    const task = await createTask(handle, {
      objective: "Draft and send client email",
      riskLevel: "level_2",
    });
    await transitionTask(handle, task.id, { to: "running" });
    const approval = await requestApproval(handle, {
      taskId: task.id,
      actionSummary: "Send email to client@example.com",
      riskLevel: "level_2",
    });
    await transitionTask(handle, task.id, { to: "waiting_approval" });

    const held = await getTask(handle, task.id);
    expect(held?.approvedActionHash).toBe(
      computeActionHash({
        taskId: task.id,
        actionSummary: "Send email to client@example.com",
        riskLevel: "level_2",
      }),
    );

    const result = await decideApproval(handle, approval.id, "approved", "owner");
    expect(result.outcome).toBe("approved");
    if (result.outcome === "approved") {
      expect(result.task.status).toBe("queued");
    }
  });

  it("rejection cancels the task", async () => {
    const task = await createTask(handle, { objective: "Risky publish", riskLevel: "level_2" });
    await transitionTask(handle, task.id, { to: "running" });
    const approval = await requestApproval(handle, {
      taskId: task.id,
      actionSummary: "Publish post",
      riskLevel: "level_2",
    });
    await transitionTask(handle, task.id, { to: "waiting_approval" });
    const result = await decideApproval(handle, approval.id, "rejected", "owner", "not today");
    expect(result.outcome).toBe("rejected");
    if (result.outcome === "rejected") {
      expect(result.task.status).toBe("cancelled");
    }
  });

  it("rejects double decisions", async () => {
    const task = await createTask(handle, { objective: "Double decide", riskLevel: "level_2" });
    await transitionTask(handle, task.id, { to: "running" });
    const approval = await requestApproval(handle, {
      taskId: task.id,
      actionSummary: "Act",
      riskLevel: "level_2",
    });
    await transitionTask(handle, task.id, { to: "waiting_approval" });
    await decideApproval(handle, approval.id, "approved", "owner");
    const second = await decideApproval(handle, approval.id, "approved", "owner");
    expect(second).toEqual({ outcome: "error", code: "not_pending" });
  });
});
