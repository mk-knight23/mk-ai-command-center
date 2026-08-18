"use client";

import { useEffect, useState } from "react";
import { Card, ErrorState, Spinner, StatCard } from "@/components/ui";
import { api } from "@/lib/fetch";

interface CostsData {
  budget: {
    dailyLimitUsd: number;
    monthlyLimitUsd: number;
    spentTodayUsd: number;
    spentThisMonthUsd: number;
  };
  breakdown: {
    byDay: { day: string; total: number; tin: number; tout: number }[];
    byProvider: { provider: string; model: string; total: number; calls: number }[];
  };
}

export default function CostsPage() {
  const [data, setData] = useState<CostsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<CostsData>("/api/costs")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load costs"));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!data) return <Spinner label="Loading costs…" />;

  const dailyPct = Math.min(100, (data.budget.spentTodayUsd / data.budget.dailyLimitUsd) * 100);
  const monthlyPct = Math.min(100, (data.budget.spentThisMonthUsd / data.budget.monthlyLimitUsd) * 100);
  const maxDay = Math.max(...data.breakdown.byDay.map((d) => d.total), 0.0001);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Costs</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Today" value={`$${data.budget.spentTodayUsd.toFixed(3)}`} hint={`limit $${data.budget.dailyLimitUsd}`} />
        <StatCard label="This month" value={`$${data.budget.spentThisMonthUsd.toFixed(2)}`} hint={`limit $${data.budget.monthlyLimitUsd}`} />
        <StatCard label="Daily usage" value={`${dailyPct.toFixed(0)}%`} tone={dailyPct > 80 ? "warn" : "default"} />
        <StatCard label="Monthly usage" value={`${monthlyPct.toFixed(0)}%`} tone={monthlyPct > 80 ? "warn" : "default"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Spend by day (14d)">
          {data.breakdown.byDay.length === 0 ? (
            <p className="text-sm text-ink-muted">No recorded spend yet.</p>
          ) : (
            <ul className="space-y-2">
              {data.breakdown.byDay.map((d) => (
                <li key={d.day} className="text-sm">
                  <div className="flex justify-between text-xs text-ink-muted">
                    <span className="font-mono">{d.day}</span>
                    <span className="tabular-nums">${d.total.toFixed(4)}</span>
                  </div>
                  <div className="mt-1 h-2 rounded bg-bg-raised/60">
                    <div
                      className="h-2 rounded bg-accent/70"
                      style={{ width: `${Math.max(2, (d.total / maxDay) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="By provider / model">
          {data.breakdown.byProvider.length === 0 ? (
            <p className="text-sm text-ink-muted">No provider usage recorded yet.</p>
          ) : (
            <table className="table-base">
              <thead>
                <tr>
                  <th scope="col">Provider</th>
                  <th scope="col">Model</th>
                  <th scope="col">Calls</th>
                  <th scope="col">Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.breakdown.byProvider.map((p) => (
                  <tr key={`${p.provider}:${p.model}`}>
                    <td className="text-sm">{p.provider}</td>
                    <td className="font-mono text-xs">{p.model}</td>
                    <td className="tabular-nums text-xs">{p.calls}</td>
                    <td className="tabular-nums text-xs">${p.total.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
