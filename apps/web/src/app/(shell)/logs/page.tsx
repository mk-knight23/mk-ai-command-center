"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, EmptyState, ErrorState, Spinner } from "@/components/ui";
import { api } from "@/lib/fetch";
import { formatDateTime } from "@/lib/types";

interface AuditLog {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  meta: string;
  createdAt: number;
}

export default function LogsPage() {
  const [items, setItems] = useState<AuditLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api<AuditLog[]>("/api/logs?kind=audit"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load logs");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!items) return <Spinner label="Loading audit logs…" />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Audit Logs</h1>
      <p className="max-w-2xl text-sm text-ink-muted">
        Every important action — task lifecycle, approvals, auth, commands — is recorded with
        actor and context for traceability.
      </p>

      {items.length === 0 ? (
        <EmptyState title="No audit entries yet" />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="table-base">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Actor</th>
                <th scope="col">Action</th>
                <th scope="col">Entity</th>
              </tr>
            </thead>
            <tbody>
              {items.map((log) => (
                <tr key={log.id}>
                  <td className="whitespace-nowrap text-xs text-ink-faint">
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="text-xs">{log.actor}</td>
                  <td className="font-mono text-xs text-accent">{log.action}</td>
                  <td className="text-xs text-ink-muted">
                    {log.entityType ? `${log.entityType}: ${log.entityId.slice(0, 16)}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
