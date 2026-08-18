"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { RiskBadge, StatusBadge } from "@/components/Badges";
import { Card, EmptyState, ErrorState, Spinner, StatCard } from "@/components/ui";
import { api } from "@/lib/fetch";
import { timeAgo } from "@/lib/types";

interface OverviewData {
  tasks: Record<string, number>;
  pendingApprovals: number;
  approvals: { id: string; actionSummary: string; riskLevel: string; createdAt: number }[];
  queue: Record<string, number>;
  budget: {
    dailyLimitUsd: number;
    monthlyLimitUsd: number;
    spentTodayUsd: number;
    spentThisMonthUsd: number;
  };
  recentEvents: { id: string; taskId: string; type: string; createdAt: number }[];
  openIncidents: { id: string; title: string; severity: string; openedAt: number }[];
  worker: { alive: boolean; lastSeenAt: number | null };
}

export default function OverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveTick, setLiveTick] = useState(0);
  const esRef = useRef<EventSource | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<OverviewData>("/api/overview"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load overview");
    }
  }, []);

  useEffect(() => {
    load();
    const es = new EventSource("/api/stream");
    esRef.current = es;
    es.addEventListener("task_event", () => setLiveTick((t) => t + 1));
    es.addEventListener("snapshot", () => setLiveTick((t) => t + 1));
    es.onerror = () => es.close();
    return () => es.close();
  }, [load]);

  useEffect(() => {
    if (liveTick > 0) {
      const timer = setTimeout(load, 400);
      return () => clearTimeout(timer);
    }
  }, [liveTick, load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <Spinner label="Loading overview…" />;

  const t = data.tasks;
  const active = (t.running ?? 0) + (t.queued ?? 0) + (t.retrying ?? 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="flex items-center gap-2 text-xs text-ink-muted">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              data.worker.alive ? "bg-ok" : "bg-danger"
            }`}
            aria-hidden
          />
          Worker {data.worker.alive ? "online" : "offline"} · live updates on
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Active tasks" value={active} tone="accent" hint={`${t.queued ?? 0} queued · ${t.running ?? 0} running`} />
        <StatCard
          label="Awaiting approval"
          value={data.pendingApprovals}
          tone={data.pendingApprovals > 0 ? "warn" : "default"}
        />
        <StatCard
          label="Completed"
          value={t.completed ?? 0}
          tone="ok"
          hint={`${t.failed ?? 0} failed · ${t.dead_lettered ?? 0} dead-lettered`}
        />
        <StatCard
          label="Spend today"
          value={`$${data.budget.spentTodayUsd.toFixed(2)}`}
          hint={`of $${data.budget.dailyLimitUsd.toFixed(0)} daily · $${data.budget.spentThisMonthUsd.toFixed(2)} / $${data.budget.monthlyLimitUsd.toFixed(0)} monthly`}
          tone={
            data.budget.spentTodayUsd > data.budget.dailyLimitUsd * 0.8 ? "warn" : "default"
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Queue" className="lg:col-span-1">
          <dl className="space-y-2 text-sm">
            {(["pending", "running", "completed", "dead"] as const).map((k) => (
              <div key={k} className="flex items-center justify-between">
                <dt className="capitalize text-ink-muted">{k}</dt>
                <dd className="font-medium tabular-nums">{data.queue[k] ?? 0}</dd>
              </div>
            ))}
          </dl>
          {data.openIncidents.length > 0 ? (
            <div className="mt-4 rounded-lg bg-danger/10 p-3 text-sm">
              <p className="font-medium text-danger">
                {data.openIncidents.length} open incident
                {data.openIncidents.length > 1 ? "s" : ""}
              </p>
              <ul className="mt-1 space-y-1 text-xs text-ink-muted">
                {data.openIncidents.slice(0, 3).map((inc) => (
                  <li key={inc.id} className="truncate">
                    [{inc.severity}] {inc.title}
                  </li>
                ))}
              </ul>
              <Link href="/incidents" className="mt-2 inline-block text-xs text-accent hover:underline">
                View incidents
              </Link>
            </div>
          ) : null}
        </Card>

        <Card
          title="Pending approvals"
          className="lg:col-span-1"
          action={<Link href="/approvals" className="text-xs text-accent hover:underline">All</Link>}
        >
          {data.approvals.length === 0 ? (
            <EmptyState title="Nothing waiting" hint="Sensitive actions will appear here for approval." />
          ) : (
            <ul className="space-y-2">
              {data.approvals.map((a) => (
                <li key={a.id} className="rounded-lg border border-line/10 p-2">
                  <p className="line-clamp-2 text-sm">{a.actionSummary}</p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-ink-faint">
                    <RiskBadge level={a.riskLevel} />
                    <span>{timeAgo(a.createdAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent activity" className="lg:col-span-1">
          {data.recentEvents.length === 0 ? (
            <EmptyState title="No activity yet" hint="Create a task from the Command Center." />
          ) : (
            <ul className="space-y-1.5 text-sm">
              {data.recentEvents.slice(0, 10).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <StatusBadge status={e.type.replace("task_", "").replace("approval_", "appr_")} />
                    <Link
                      href={`/tasks/${e.taskId}`}
                      className="truncate font-mono text-xs text-ink-muted hover:text-accent"
                    >
                      {e.taskId.slice(0, 14)}
                    </Link>
                  </span>
                  <span className="shrink-0 text-xs text-ink-faint">{timeAgo(e.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
