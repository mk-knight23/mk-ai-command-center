"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RiskBadge } from "@/components/Badges";
import { Card, EmptyState, ErrorState, Spinner } from "@/components/ui";
import { api } from "@/lib/fetch";
import { formatDateTime, type ApprovalItem } from "@/lib/types";

export default function ApprovalsPage() {
  const [items, setItems] = useState<ApprovalItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ items: ApprovalItem[] }>("/api/approvals");
      setItems(res.items);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load approvals");
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 8_000);
    return () => clearInterval(interval);
  }, [load]);

  async function decide(id: string, decision: "approved" | "rejected") {
    setBusyId(id);
    setNotice(null);
    try {
      await api(`/api/approvals/${id}`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      });
      setNotice(decision === "approved" ? "Approved — task re-queued for execution." : "Rejected — task cancelled.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Decision failed");
    } finally {
      setBusyId(null);
    }
  }

  if (error && !items) return <ErrorState message={error} onRetry={load} />;
  if (!items) return <Spinner label="Loading approvals…" />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Approvals</h1>
      <p className="max-w-2xl text-sm text-ink-muted">
        Level 2+ actions pause here. Approvals expire; the task state is re-validated before
        execution so a stale approval cannot authorize a changed action.
      </p>

      {error ? <ErrorState message={error} /> : null}
      {notice ? (
        <p role="status" className="rounded-lg bg-ok/10 px-3 py-2 text-sm text-ok">
          {notice}
        </p>
      ) : null}

      {items.length === 0 ? (
        <EmptyState title="No pending approvals" hint="Sensitive actions will wait here." />
      ) : (
        <ul className="space-y-3">
          {items.map((a) => (
            <li key={a.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{a.actionSummary}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                    <RiskBadge level={a.riskLevel} />
                    <span>requested by {a.requestedBy}</span>
                    <span>· {formatDateTime(a.createdAt)}</span>
                    <span>· expires {formatDateTime(a.expiresAt)}</span>
                    <Link href={`/tasks/${a.taskId}`} className="font-mono text-accent hover:underline">
                      {a.taskId.slice(0, 14)}…
                    </Link>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busyId !== null}
                    onClick={() => decide(a.id, "approved")}
                  >
                    {busyId === a.id ? "…" : "Approve"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={busyId !== null}
                    onClick={() => decide(a.id, "rejected")}
                  >
                    Reject
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
