const STATUS_STYLES: Record<string, string> = {
  draft: "bg-line/10 text-ink-muted",
  validating: "bg-accent/10 text-accent",
  planned: "bg-accent/10 text-accent",
  queued: "bg-accent/15 text-accent",
  running: "bg-accent/20 text-accent",
  waiting_dependency: "bg-warn/10 text-warn",
  waiting_approval: "bg-warn/15 text-warn",
  paused: "bg-line/15 text-ink-muted",
  retrying: "bg-warn/15 text-warn",
  completed: "bg-ok/15 text-ok",
  failed: "bg-danger/15 text-danger",
  cancelled: "bg-line/10 text-ink-faint",
  dead_lettered: "bg-danger/20 text-danger",
  archived: "bg-line/10 text-ink-faint",
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-line/10 text-ink-muted";
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${style}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

const RISK_STYLES: Record<string, string> = {
  level_0: "bg-ok/10 text-ok",
  level_1: "bg-accent/10 text-accent",
  level_2: "bg-warn/15 text-warn",
  level_3: "bg-danger/15 text-danger",
};

const RISK_LABELS: Record<string, string> = {
  level_0: "R0 read",
  level_1: "R1 internal",
  level_2: "R2 external",
  level_3: "R3 critical",
};

export function RiskBadge({ level }: { level: string }) {
  const style = RISK_STYLES[level] ?? "bg-line/10 text-ink-muted";
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${style}`}>
      {RISK_LABELS[level] ?? level}
    </span>
  );
}
