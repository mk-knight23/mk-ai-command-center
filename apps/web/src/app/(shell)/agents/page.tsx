"use client";

import { useEffect, useState } from "react";
import { Card, ErrorState, Spinner } from "@/components/ui";
import { api } from "@/lib/fetch";
import type { AgentItem } from "@/lib/types";

export default function AgentsPage() {
  const [items, setItems] = useState<AgentItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ items: AgentItem[] }>("/api/agents")
      .then((res) => setItems(res.items))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load agents"));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!items) return <Spinner label="Loading agents…" />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Agents</h1>
      <p className="max-w-2xl text-sm text-ink-muted">
        Each agent has bounded runtime, iteration and cost limits, scoped tool permissions, and
        escalation rules. Limits are enforced by the worker at execution time.
      </p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((agent) => {
          let tools: string[] = [];
          try {
            tools = JSON.parse(agent.allowedTools) as string[];
          } catch {
            tools = [];
          }
          return (
            <Card key={agent.id}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">{agent.name}</h2>
                <span className="rounded-md bg-ok/10 px-2 py-0.5 text-xs capitalize text-ok">
                  {agent.status}
                </span>
              </div>
              <p className="mt-1 font-mono text-xs text-ink-faint">{agent.slug}</p>
              <p className="mt-2 line-clamp-3 text-sm text-ink-muted">{agent.description}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink-muted">
                <div>
                  <dt className="text-ink-faint">Max cost</dt>
                  <dd className="tabular-nums">${agent.maxCostUsd.toFixed(2)}</dd>
                </div>
                <div>
                  <dt className="text-ink-faint">Max iterations</dt>
                  <dd className="tabular-nums">{agent.maxIterations}</dd>
                </div>
              </dl>
              {tools.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1">
                  {tools.map((t) => (
                    <span key={t} className="rounded bg-bg-raised/70 px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
