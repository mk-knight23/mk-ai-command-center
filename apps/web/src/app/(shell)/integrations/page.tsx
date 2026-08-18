"use client";

import { useEffect, useState } from "react";
import { Card, ErrorState, Spinner } from "@/components/ui";
import { api } from "@/lib/fetch";

interface Integration {
  slug: string;
  name: string;
  category: string;
  status: string;
  configured: boolean;
}

export default function IntegrationsPage() {
  const [items, setItems] = useState<Integration[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ items: Integration[] }>("/api/integrations")
      .then((res) => setItems(res.items))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load integrations"));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!items) return <Spinner label="Loading integrations…" />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Integrations</h1>
      <p className="max-w-2xl text-sm text-ink-muted">
        Each integration is independently configurable and disableable. Unconfigured
        integrations stay disabled and never block the core platform.
      </p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((integration) => (
          <Card key={integration.slug}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">{integration.name}</h2>
              <span
                className={`rounded-md px-2 py-0.5 text-xs ${
                  integration.configured ? "bg-ok/10 text-ok" : "bg-line/10 text-ink-muted"
                }`}
              >
                {integration.configured ? "configured" : "not configured"}
              </span>
            </div>
            <p className="mt-1 text-xs capitalize text-ink-faint">{integration.category}</p>
            <p className="mt-2 text-xs text-ink-muted">
              {integration.configured
                ? "Active — health monitored by the worker."
                : "Add credentials in .env to activate."}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
