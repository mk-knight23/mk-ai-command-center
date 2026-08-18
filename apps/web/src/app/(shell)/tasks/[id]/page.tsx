"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { RiskBadge, StatusBadge } from "@/components/Badges";
import { Card, ErrorState, Spinner } from "@/components/ui";
import { api } from "@/lib/fetch";
import { formatDateTime, timeAgo, type TaskSummary } from "@/lib/types";

interface TaskEvent {
  id: string;
  type: string;
  actor: string;
  payload: string;
  createdAt: number;
}

const ACTIONS: { action: string; label: string; className: string }[] = [
  { action: "pause", label: "Pause", className: "btn" },
  { action: "resume", label: "Resume", className: "btn" },
  { action: "retry", label: "Retry", className: "btn" },
  { action: "cancel", label: "Cancel", className: "btn btn-danger" },
  { action: "archive", label: "Archive", className: "btn" },
];

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [task, setTask] = useState<TaskSummary | null>(null);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, evts] = await Promise.all([
        api<TaskSummary>(`/api/tasks/${id}`),
        api<TaskEvent[]>(`/api/tasks/${id}/events`),
      ]);
      setTask(t);
      setEvents(evts);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load task");
    }
  }, [id]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5_000);
    return () => clearInterval(interval);
  }, [load]);

  async function runAction(action: string) {
    setActionBusy(action);
    try {
      await api(`/api/tasks/${id}/action`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActionBusy(null);
    }
  }

  if (error && !task) return <ErrorState message={error} onRetry={load} />;
  if (!task) return <Spinner label="Loading task…" />;

  let parsedResult: unknown = null;
  if (task.result) {
    try {
      parsedResult = JSON.parse(task.result);
    } catch {
      parsedResult = task.result;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/tasks" className="text-xs text-ink-faint hover:text-accent">
            ← All tasks
          </Link>
          <h1 className="mt-1 text-lg font-semibold leading-snug">{task.objective}</h1>
          <p className="mt-1 font-mono text-xs text-ink-faint">{task.id}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ACTIONS.map((a) => (
            <button
              key={a.action}
              type="button"
              className={a.className}
              disabled={actionBusy !== null}
              onClick={() => runAction(a.action)}
            >
              {actionBusy === a.action ? "…" : a.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <ErrorState message={error} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="label">Status</p>
          <StatusBadge status={task.status} />
        </Card>
        <Card>
          <p className="label">Risk</p>
          <RiskBadge level={task.riskLevel} />
        </Card>
        <Card>
          <p className="label">Agent</p>
          <p className="text-sm">{task.assignedAgentSlug ?? "unassigned"}</p>
        </Card>
        <Card>
          <p className="label">Cost / tokens</p>
          <p className="text-sm tabular-nums">
            ${task.costUsd.toFixed(4)} · {task.tokensUsed.toLocaleString()} tok
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Timeline">
          <ol className="relative space-y-3 border-l border-line/15 pl-4">
            {events.map((e) => (
              <li key={e.id} className="relative">
                <span
                  className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-accent/70"
                  aria-hidden
                />
                <p className="text-sm">
                  <span className="font-medium">{e.type.replace(/_/g, " ")}</span>
                  <span className="text-xs text-ink-faint"> · {e.actor}</span>
                </p>
                <p className="text-xs text-ink-faint">{formatDateTime(e.createdAt)}</p>
              </li>
            ))}
            {events.length === 0 ? <p className="text-sm text-ink-muted">No events yet.</p> : null}
          </ol>
        </Card>

        <div className="space-y-4">
          <Card title="Details">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Source</dt>
                <dd>{task.source}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Priority</dt>
                <dd className="capitalize">{task.priority}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Attempts</dt>
                <dd className="tabular-nums">{task.attemptCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Created</dt>
                <dd>{formatDateTime(task.createdAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Started</dt>
                <dd>{formatDateTime(task.startedAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Completed</dt>
                <dd>{formatDateTime(task.completedAt)}</dd>
              </div>
              {task.parentTaskId ? (
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Parent</dt>
                  <dd>
                    <Link href={`/tasks/${task.parentTaskId}`} className="font-mono text-xs text-accent hover:underline">
                      {task.parentTaskId.slice(0, 16)}…
                    </Link>
                  </dd>
                </div>
              ) : null}
            </dl>
          </Card>

          {task.error ? (
            <Card title="Error">
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-danger/10 p-3 text-xs text-danger">
                {task.error}
              </pre>
            </Card>
          ) : null}

          {parsedResult !== null ? (
            <Card title="Result">
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-bg-base/60 p-3 text-xs">
                {typeof parsedResult === "string"
                  ? parsedResult
                  : JSON.stringify(parsedResult, null, 2)}
              </pre>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
