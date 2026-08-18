"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, EmptyState, ErrorState, Spinner } from "@/components/ui";
import { api } from "@/lib/fetch";
import { formatDateTime } from "@/lib/types";

interface Incident {
  id: string;
  title: string;
  severity: string;
  status: string;
  source: string;
  details: string;
  resolution: string;
  openedAt: number;
  resolvedAt: number | null;
}

const SEVERITY_TONE: Record<string, string> = {
  low: "bg-line/10 text-ink-muted",
  medium: "bg-warn/10 text-warn",
  high: "bg-warn/20 text-warn",
  critical: "bg-danger/20 text-danger",
};

export default function IncidentsPage() {
  const [items, setItems] = useState<Incident[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      setItems(await api<Incident[]>("/api/incidents"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load incidents");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function resolve(id: string) {
    setResolving(id);
    try {
      await api("/api/incidents", {
        method: "POST",
        body: JSON.stringify({ id, resolution: note || "Resolved manually" }),
      });
      setNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Resolve failed");
    } finally {
      setResolving(null);
    }
  }

  if (error && !items) return <ErrorState message={error} onRetry={load} />;
  if (!items) return <Spinner label="Loading incidents…" />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Incidents</h1>
      <p className="max-w-2xl text-sm text-ink-muted">
        Opened automatically on repeated failures, budget breaches, or integration outages.
        Self-healing is bounded — the system retries, falls back, pauses, and reports; it never
        rewrites production code or deletes data on its own.
      </p>

      {error ? <ErrorState message={error} /> : null}

      {items.length === 0 ? (
        <EmptyState title="No incidents" hint="All systems nominal." />
      ) : (
        <ul className="space-y-3">
          {items.map((inc) => (
            <li key={inc.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${SEVERITY_TONE[inc.severity] ?? "bg-line/10 text-ink-muted"}`}>
                      {inc.severity}
                    </span>
                    <span className={`rounded-md px-2 py-0.5 text-xs ${inc.status === "open" ? "bg-danger/10 text-danger" : "bg-ok/10 text-ok"}`}>
                      {inc.status}
                    </span>
                    <span className="text-xs text-ink-faint">{formatDateTime(inc.openedAt)}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium">{inc.title}</p>
                  {inc.details ? <p className="mt-1 text-xs text-ink-muted">{inc.details}</p> : null}
                  {inc.resolution ? (
                    <p className="mt-1 text-xs text-ok">Resolution: {inc.resolution}</p>
                  ) : null}
                </div>
                {inc.status === "open" ? (
                  <div className="flex shrink-0 flex-col gap-2">
                    <input
                      className="input w-48"
                      placeholder="Resolution note"
                      value={resolving === inc.id ? note : note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={resolving !== null}
                      onClick={() => resolve(inc.id)}
                    >
                      {resolving === inc.id ? "Resolving…" : "Mark resolved"}
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
