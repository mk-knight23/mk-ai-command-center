import { and, asc, eq, lte, sql } from "drizzle-orm";
import { newId } from "@mkcc/core";
import type { DbHandle } from "../client.js";
import { jobs } from "../schema.js";

export interface EnqueueOptions {
  taskId?: string;
  payload?: Record<string, unknown>;
  availableAt?: number;
  maxAttempts?: number;
  idempotencyKey?: string;
}

export interface JobRow {
  id: string;
  kind: string;
  taskId: string | null;
  payload: string;
  status: string;
  attempt: number;
  maxAttempts: number;
  availableAt: number;
  leasedAt: number | null;
  leaseExpiresAt: number | null;
  lastError: string | null;
  idempotencyKey: string | null;
  createdAt: number;
  updatedAt: number;
}

interface RawJobRow {
  id: string;
  kind: string;
  task_id: string | null;
  payload: string;
  status: string;
  attempt: number;
  max_attempts: number;
  available_at: number;
  leased_at: number | null;
  lease_expires_at: number | null;
  last_error: string | null;
  idempotency_key: string | null;
  created_at: number;
  updated_at: number;
}

function mapJob(raw: RawJobRow): JobRow {
  return {
    id: raw.id,
    kind: raw.kind,
    taskId: raw.task_id,
    payload: raw.payload,
    status: raw.status,
    attempt: raw.attempt,
    maxAttempts: raw.max_attempts,
    availableAt: raw.available_at,
    leasedAt: raw.leased_at,
    leaseExpiresAt: raw.lease_expires_at,
    lastError: raw.last_error,
    idempotencyKey: raw.idempotency_key,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export function enqueueJob(handle: DbHandle, kind: string, opts: EnqueueOptions = {}): string {
  const { sqlite } = handle;
  const now = Date.now();

  if (opts.idempotencyKey) {
    const existing = sqlite
      .prepare("SELECT id FROM jobs WHERE idempotency_key = ?")
      .get(opts.idempotencyKey) as { id: string } | undefined;
    if (existing) return existing.id;
  }

  const id = newId("job");
  sqlite
    .prepare(
      `INSERT INTO jobs (id, kind, task_id, payload, status, attempt, max_attempts, available_at, idempotency_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      kind,
      opts.taskId ?? null,
      JSON.stringify(opts.payload ?? {}),
      opts.maxAttempts ?? 3,
      opts.availableAt ?? now,
      opts.idempotencyKey ?? null,
      now,
      now,
    );
  return id;
}

export function claimJob(
  handle: DbHandle,
  leaseMs: number,
  now: number = Date.now(),
): JobRow | null {
  const { sqlite } = handle;
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    const row = sqlite
      .prepare(
        `SELECT id FROM jobs WHERE status = 'pending' AND available_at <= ?
         ORDER BY available_at ASC, created_at ASC LIMIT 1`,
      )
      .get(now) as { id: string } | undefined;
    if (!row) {
      sqlite.exec("COMMIT");
      return null;
    }
    const leaseExpiresAt = now + leaseMs;
    const updated = sqlite
      .prepare(
        `UPDATE jobs SET status = 'running', attempt = attempt + 1, leased_at = ?, lease_expires_at = ?, updated_at = ?
         WHERE id = ? AND status = 'pending'`,
      )
      .run(now, leaseExpiresAt, now, row.id);
    if (updated.changes === 0) {
      sqlite.exec("COMMIT");
      return null;
    }
    const job = sqlite.prepare("SELECT * FROM jobs WHERE id = ?").get(row.id) as unknown as RawJobRow;
    sqlite.exec("COMMIT");
    return mapJob(job);
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
}

export function completeJob(handle: DbHandle, jobId: string): void {
  handle.sqlite
    .prepare("UPDATE jobs SET status = 'completed', updated_at = ? WHERE id = ?")
    .run(Date.now(), jobId);
}

export function failJob(
  handle: DbHandle,
  jobId: string,
  error: string,
  retryDelayMs: number | null,
): "retry_scheduled" | "dead_lettered" {
  const { sqlite } = handle;
  const now = Date.now();
  const raw = sqlite.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId) as unknown as
    | RawJobRow
    | undefined;
  if (!raw) return "dead_lettered";
  const job = mapJob(raw);
  if (retryDelayMs !== null && job.attempt < job.maxAttempts) {
    sqlite
      .prepare(
        `UPDATE jobs SET status = 'pending', available_at = ?, last_error = ?, lease_expires_at = NULL, updated_at = ?
         WHERE id = ?`,
      )
      .run(now + retryDelayMs, error.slice(0, 2000), now, jobId);
    return "retry_scheduled";
  }
  sqlite
    .prepare(
      `UPDATE jobs SET status = 'dead', last_error = ?, lease_expires_at = NULL, updated_at = ? WHERE id = ?`,
    )
    .run(error.slice(0, 2000), now, jobId);
  return "dead_lettered";
}

export function recoverStaleJobs(handle: DbHandle, now: number = Date.now()): number {
  const { sqlite } = handle;
  const stale = sqlite
    .prepare(
      `SELECT id, attempt, max_attempts FROM jobs
       WHERE status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at < ?`,
    )
    .all(now) as unknown as { id: string; attempt: number; max_attempts: number }[];
  for (const job of stale) {
    if (job.attempt < job.max_attempts) {
      sqlite
        .prepare(
          `UPDATE jobs SET status = 'pending', available_at = ?, lease_expires_at = NULL, last_error = 'lease expired (worker restart?)', updated_at = ?
           WHERE id = ?`,
        )
        .run(now, now, job.id);
    } else {
      sqlite
        .prepare(
          `UPDATE jobs SET status = 'dead', lease_expires_at = NULL, last_error = 'lease expired after final attempt', updated_at = ?
           WHERE id = ?`,
        )
        .run(now, job.id);
    }
  }
  return stale.length;
}

export function cancelPendingJobsForTask(handle: DbHandle, taskId: string): number {
  const result = handle.sqlite
    .prepare(
      `UPDATE jobs SET status = 'completed', last_error = 'cancelled with task', updated_at = ?
       WHERE task_id = ? AND status IN ('pending', 'running')`,
    )
    .run(Date.now(), taskId);
  return Number(result.changes);
}

export function queueDepth(handle: DbHandle): Record<string, number> {
  const rows = handle.sqlite
    .prepare("SELECT status, COUNT(*) as n FROM jobs GROUP BY status")
    .all() as unknown as { status: string; n: number }[];
  const out: Record<string, number> = { pending: 0, running: 0, completed: 0, failed: 0, dead: 0 };
  for (const row of rows) out[row.status] = row.n;
  return out;
}

export function deadLetters(handle: DbHandle, limit = 50): JobRow[] {
  const rows = handle.sqlite
    .prepare("SELECT * FROM jobs WHERE status = 'dead' ORDER BY updated_at DESC LIMIT ?")
    .all(limit) as unknown as RawJobRow[];
  return rows.map(mapJob);
}
