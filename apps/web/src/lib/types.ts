export interface TaskSummary {
  id: string;
  objective: string;
  status: string;
  priority: string;
  riskLevel: string;
  source: string;
  assignedAgentSlug: string | null;
  parentTaskId: string | null;
  costUsd: number;
  tokensUsed: number;
  attemptCount: number;
  error: string | null;
  result: string | null;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

export interface ApprovalItem {
  id: string;
  taskId: string;
  actionSummary: string;
  riskLevel: string;
  status: string;
  requestedBy: string;
  expiresAt: number;
  createdAt: number;
}

export interface AgentItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: string;
  maxCostUsd: number;
  maxIterations: number;
  allowedTools: string;
}

export function timeAgo(ts: number | null): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatDateTime(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}
