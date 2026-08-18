"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RiskBadge, StatusBadge } from "@/components/Badges";
import { Card, EmptyState, ErrorState, Spinner } from "@/components/ui";
import { api } from "@/lib/fetch";
import { timeAgo, type TaskSummary } from "@/lib/types";

const FILTERS = ["", "queued", "running", "waiting_approval", "paused", "completed", "failed", "dead_lettered"];

interface TasksResponse {
  items: TaskSummary[];
  total: number;
  counts: Record<string, number>;
}

export default function TasksPage() {
  const [status, setStatus] = useState("");
  const [data, setData] = useState<TasksResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [objective, setObjective] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const qs = status ? `?status=${status}&limit=100` : "?limit=100";
      setData(await api<TasksResponse>(`/api/tasks${qs}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tasks");
    }
  }, [status]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, [load]);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!objective.trim()) return;
    setCreating(true);
    try {
      await api("/api/tasks", {
        method: "POST",
        body: JSON.stringify({ objective, source: "dashboard" }),
      });
      setObjective("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Tasks</h1>

      <form onSubmit={createTask} className="card flex flex-col gap-2 p-4 sm:flex-row">
        <input
          className="input flex-1"
          placeholder="Quick task: describe the objective…"
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          aria-label="New task objective"
        />
        <button type="submit" disabled={creating || !objective.trim()} className="btn btn-primary">
          {creating ? "Creating…" : "Create task"}
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter tasks by status">
        {FILTERS.map((f) => (
          <button
            key={f || "all"}
            role="tab"
            aria-selected={status === f}
            onClick={() => setStatus(f)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              status === f
                ? "bg-accent/20 text-accent"
                : "bg-bg-raised/50 text-ink-muted hover:text-ink"
            }`}
          >
            {f === "" ? "All" : f.replace(/_/g, " ")}
            {data?.counts[f] ? ` (${data.counts[f]})` : ""}
          </button>
        ))}
      </div>

      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!data && !error ? <Spinner label="Loading tasks…" /> : null}

      {data && data.items.length === 0 ? (
        <EmptyState
          title="No tasks found"
          hint="Create one above or send a command from the Command Center."
        />
      ) : null}

      {data && data.items.length > 0 ? (
        <Card className="overflow-x-auto p-0">
          <table className="table-base">
            <thead>
              <tr>
                <th scope="col">Objective</th>
                <th scope="col">Status</th>
                <th scope="col">Risk</th>
                <th scope="col">Agent</th>
                <th scope="col">Source</th>
                <th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((task) => (
                <tr key={task.id} className="transition-colors hover:bg-bg-raised/40">
                  <td className="max-w-md">
                    <Link href={`/tasks/${task.id}`} className="line-clamp-1 hover:text-accent">
                      {task.objective}
                    </Link>
                  </td>
                  <td>
                    <StatusBadge status={task.status} />
                  </td>
                  <td>
                    <RiskBadge level={task.riskLevel} />
                  </td>
                  <td className="text-xs text-ink-muted">{task.assignedAgentSlug ?? "—"}</td>
                  <td className="text-xs text-ink-muted">{task.source}</td>
                  <td className="whitespace-nowrap text-xs text-ink-faint">
                    {timeAgo(task.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  );
}
