"use client";

import { useEffect, useState } from "react";
import { Card, ErrorState, Spinner } from "@/components/ui";
import { api } from "@/lib/fetch";

interface HealthInfo {
  ok: boolean;
  app: string;
  db: string;
  latencyMs: number;
}

interface IntegrationsData {
  items: { slug: string; name: string; configured: boolean }[];
}

export default function SettingsPage() {
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/health").then((r) => r.json() as Promise<HealthInfo>),
      api<IntegrationsData>("/api/integrations"),
    ])
      .then(([h, integ]) => {
        setHealth(h);
        setIntegrations(integ);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load settings"));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!health || !integrations) return <Spinner label="Loading settings…" />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="System">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Application</dt>
              <dd>{health.app}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">Database</dt>
              <dd className={health.db === "up" ? "text-ok" : "text-danger"}>{health.db}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">Health latency</dt>
              <dd className="tabular-nums">{health.latencyMs} ms</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-ink-faint">
            Branding, owner info, budgets, and provider keys are configured via environment
            variables (<code>.env</code>). Secrets stay server-side and are never rendered here.
          </p>
        </Card>

        <Card title="Integration configuration">
          <ul className="space-y-2 text-sm">
            {integrations.items.map((i) => (
              <li key={i.slug} className="flex items-center justify-between">
                <span>{i.name}</span>
                <span className={i.configured ? "text-ok" : "text-ink-faint"}>
                  {i.configured ? "configured" : "not configured"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="How to configure">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-muted">
          <li>Copy <code>.env.example</code> to <code>.env</code> at the repo root.</li>
          <li>Set <code>AUTH_SECRET</code>, <code>OWNER_EMAIL</code>, and <code>OWNER_PASSWORD</code>.</li>
          <li>Add any provider keys (OpenAI / Gemini / Groq / Anthropic) you want active.</li>
          <li>Add <code>TELEGRAM_BOT_TOKEN</code> and allowed chat IDs to enable Telegram.</li>
          <li>Run <code>pnpm db:migrate</code> then <code>pnpm db:seed</code>, and restart.</li>
        </ol>
      </Card>
    </div>
  );
}
