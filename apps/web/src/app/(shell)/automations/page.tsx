"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, EmptyState, ErrorState, Spinner } from "@/components/ui";
import { api } from "@/lib/fetch";
import { formatDateTime } from "@/lib/types";

interface Workflow {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: string;
  version: number;
  updatedAt: number;
}

interface Schedule {
  id: string;
  workflowId: string;
  cronExpr: string;
  timezone: string;
  nextRunAt: number;
  lastRunAt: number | null;
  enabled: boolean;
}

interface Run {
  id: string;
  workflowId: string;
  trigger: string;
  status: string;
  taskId: string | null;
  createdAt: number;
  error: string | null;
}

interface AutomationsData {
  workflows: Workflow[];
  schedules: Schedule[];
  runs: Run[];
}

export default function AutomationsPage() {
  const [data, setData] = useState<AutomationsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", objectiveTemplate: "", cronExpr: "", agentSlug: "" });
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<AutomationsData>("/api/automations"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load automations");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setNotice(null);
    try {
      await api("/api/automations", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          objectiveTemplate: form.objectiveTemplate,
          cronExpr: form.cronExpr || undefined,
          agentSlug: form.agentSlug || undefined,
        }),
      });
      setForm({ name: "", objectiveTemplate: "", cronExpr: "", agentSlug: "" });
      setNotice("Automation created.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create automation");
    } finally {
      setCreating(false);
    }
  }

  async function runWorkflow(slug: string) {
    setNotice(null);
    try {
      await api(`/api/automations/${slug}`, { method: "POST", body: JSON.stringify({ action: "run" }) });
      setNotice(`Triggered ${slug}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
    }
  }

  async function toggle(slug: string, current: string) {
    try {
      await api(`/api/automations/${slug}`, {
        method: "POST",
        body: JSON.stringify({ action: current === "enabled" ? "disable" : "enable" }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Toggle failed");
    }
  }

  if (error && !data) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <Spinner label="Loading automations…" />;

  const scheduleByWorkflow = new Map(data.schedules.map((s) => [s.workflowId, s]));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Automations</h1>

      {error ? <ErrorState message={error} /> : null}
      {notice ? <p role="status" className="rounded-lg bg-ok/10 px-3 py-2 text-sm text-ok">{notice}</p> : null}

      <form onSubmit={create} className="card grid gap-3 p-4 md:grid-cols-2">
        <div>
          <label htmlFor="wf-name" className="label">Name</label>
          <input id="wf-name" className="input" required value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label htmlFor="wf-agent" className="label">Agent slug (optional)</label>
          <input id="wf-agent" className="input" placeholder="research-agent" value={form.agentSlug}
            onChange={(e) => setForm({ ...form, agentSlug: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="wf-objective" className="label">Objective template</label>
          <input id="wf-objective" className="input" required value={form.objectiveTemplate}
            placeholder="What should each run accomplish?"
            onChange={(e) => setForm({ ...form, objectiveTemplate: e.target.value })} />
        </div>
        <div>
          <label htmlFor="wf-cron" className="label">Schedule (cron, optional)</label>
          <input id="wf-cron" className="input font-mono" placeholder="0 9 * * 1-5" value={form.cronExpr}
            onChange={(e) => setForm({ ...form, cronExpr: e.target.value })} />
        </div>
        <div className="flex items-end">
          <button type="submit" disabled={creating} className="btn btn-primary w-full">
            {creating ? "Creating…" : "Create automation"}
          </button>
        </div>
      </form>

      {data.workflows.length === 0 ? (
        <EmptyState title="No automations yet" hint="Create one above, or send a scheduled command." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.workflows.map((wf) => {
            const schedule = scheduleByWorkflow.get(wf.id);
            return (
              <Card key={wf.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold">{wf.name}</h2>
                    <p className="font-mono text-xs text-ink-faint">{wf.slug} · v{wf.version}</p>
                  </div>
                  <span className={`rounded-md px-2 py-0.5 text-xs ${wf.status === "enabled" ? "bg-ok/10 text-ok" : "bg-line/10 text-ink-muted"}`}>
                    {wf.status}
                  </span>
                </div>
                {schedule ? (
                  <p className="mt-2 text-xs text-ink-muted">
                    <span className="font-mono">{schedule.cronExpr}</span> ({schedule.timezone}) ·
                    next {formatDateTime(schedule.nextRunAt)} · last {formatDateTime(schedule.lastRunAt)}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-ink-faint">No schedule — manual trigger only.</p>
                )}
                <div className="mt-3 flex gap-2">
                  <button type="button" className="btn btn-primary" onClick={() => runWorkflow(wf.slug)}>
                    Run now
                  </button>
                  <button type="button" className="btn" onClick={() => toggle(wf.slug, wf.status)}>
                    {wf.status === "enabled" ? "Disable" : "Enable"}
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card title="Recent runs" className="overflow-x-auto p-0">
        {data.runs.length === 0 ? (
          <div className="p-4"><EmptyState title="No runs yet" /></div>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th scope="col">Workflow</th>
                <th scope="col">Trigger</th>
                <th scope="col">Status</th>
                <th scope="col">Task</th>
                <th scope="col">When</th>
              </tr>
            </thead>
            <tbody>
              {data.runs.map((run) => {
                const wf = data.workflows.find((w) => w.id === run.workflowId);
                return (
                  <tr key={run.id}>
                    <td className="text-sm">{wf?.name ?? run.workflowId}</td>
                    <td className="text-xs text-ink-muted">{run.trigger}</td>
                    <td className="text-xs capitalize">{run.status}</td>
                    <td className="font-mono text-xs text-ink-muted">{run.taskId?.slice(0, 14) ?? "—"}</td>
                    <td className="whitespace-nowrap text-xs text-ink-faint">{formatDateTime(run.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
