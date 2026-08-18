"use client";

import Link from "next/link";
import { useState } from "react";
import { RiskBadge, StatusBadge } from "@/components/Badges";
import { Card, ErrorState } from "@/components/ui";
import { api } from "@/lib/fetch";
import { timeAgo } from "@/lib/types";

interface CommandResult {
  mode: "task" | "scheduled";
  parsed: {
    intent: string;
    agentSlug: string;
    riskLevel: string;
    isSchedule: boolean;
    scheduleCron?: string;
    writesExternal: boolean;
  };
  requiresApproval: boolean;
  task?: { id: string; objective: string; status: string; riskLevel: string; assignedAgentSlug: string | null };
  workflow?: { slug: string; name: string };
  schedule?: { cron: string; nextRunAt: number };
}

const EXAMPLES = [
  "Research five AI automation opportunities and prepare a report",
  "Draft a client follow-up email and wait for my approval",
  "Every weekday at 9:00 AM, send my calendar and priority brief",
  "Show failed tasks from the last 24 hours and recommend fixes",
];

export default function CommandPage() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CommandResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await api<CommandResult>("/api/command", {
        method: "POST",
        body: JSON.stringify({ text, source: "dashboard" }),
      });
      setResult(res);
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Command failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Command Center</h1>
      <p className="max-w-2xl text-sm text-ink-muted">
        Describe what you need. The system classifies intent and risk, routes to the right
        agent, and stops for your approval before any external or destructive action.
      </p>

      <form onSubmit={submit} className="card p-4">
        <label htmlFor="command" className="label">
          Command
        </label>
        <textarea
          id="command"
          rows={3}
          className="input resize-y"
          placeholder='e.g. "Research AI automation trends and draft a summary"'
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ink-faint">⌘/Ctrl + Enter to submit</p>
          <button type="submit" disabled={busy || !text.trim()} className="btn btn-primary">
            {busy ? "Routing…" : "Execute command"}
          </button>
        </div>
      </form>

      {error ? <ErrorState message={error} /> : null}

      {result ? (
        <Card title="Interpretation">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="label">Intent</dt>
              <dd className="font-medium">{result.parsed.intent}</dd>
            </div>
            <div>
              <dt className="label">Assigned agent</dt>
              <dd className="font-medium">{result.parsed.agentSlug}</dd>
            </div>
            <div>
              <dt className="label">Risk level</dt>
              <dd>
                <RiskBadge level={result.parsed.riskLevel} />
              </dd>
            </div>
            <div>
              <dt className="label">Approval</dt>
              <dd className={result.requiresApproval ? "font-medium text-warn" : "text-ok"}>
                {result.requiresApproval
                  ? "Required — pauses before external action"
                  : "Not required (safe / internal)"}
              </dd>
            </div>
            {result.parsed.isSchedule ? (
              <div className="sm:col-span-2">
                <dt className="label">Schedule</dt>
                <dd className="font-mono text-xs">
                  cron {result.parsed.scheduleCron} · next run{" "}
                  {result.schedule ? new Date(result.schedule.nextRunAt).toLocaleString() : "—"}
                </dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            {result.task ? (
              <Link href={`/tasks/${result.task.id}`} className="btn btn-primary">
                Open task <StatusBadge status={result.task.status} />
              </Link>
            ) : null}
            {result.workflow ? (
              <Link href="/automations" className="btn">
                View automation
              </Link>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card title="Try one of these">
        <ul className="space-y-2">
          {EXAMPLES.map((example) => (
            <li key={example}>
              <button
                type="button"
                onClick={() => setText(example)}
                className="w-full rounded-lg border border-line/10 px-3 py-2 text-left text-sm text-ink-muted transition-colors hover:border-accent/40 hover:text-ink"
              >
                {example}
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
