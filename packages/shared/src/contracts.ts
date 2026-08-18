import { z } from "zod";

export const TASK_STATES = [
  "draft",
  "validating",
  "planned",
  "queued",
  "running",
  "waiting_dependency",
  "waiting_approval",
  "paused",
  "retrying",
  "completed",
  "failed",
  "cancelled",
  "dead_lettered",
  "archived",
] as const;
export type TaskState = (typeof TASK_STATES)[number];

export const TERMINAL_TASK_STATES: readonly TaskState[] = [
  "completed",
  "failed",
  "cancelled",
  "dead_lettered",
  "archived",
];

export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const RISK_LEVELS = [
  "level_0",
  "level_1",
  "level_2",
  "level_3",
] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  level_0: "Read-only",
  level_1: "Reversible internal change",
  level_2: "External / consequential change",
  level_3: "Destructive / privileged / financial",
};

export const TASK_SOURCES = [
  "dashboard",
  "telegram",
  "webhook",
  "schedule",
  "api",
  "system",
  "agent",
] as const;
export type TaskSource = (typeof TASK_SOURCES)[number];

export const EVENT_TYPES = [
  "task_created",
  "task_planned",
  "task_queued",
  "task_started",
  "task_progress",
  "tool_requested",
  "tool_completed",
  "approval_requested",
  "approval_granted",
  "approval_rejected",
  "approval_expired",
  "task_paused",
  "task_resumed",
  "task_retrying",
  "task_completed",
  "task_failed",
  "task_cancelled",
  "workflow_triggered",
  "integration_degraded",
  "budget_threshold_reached",
  "incident_opened",
  "incident_resolved",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const JOB_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "dead",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const APPROVAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "expired",
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const INTEGRATION_STATUSES = [
  "enabled",
  "disabled",
  "degraded",
  "error",
] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];

export const NOTIFICATION_CHANNELS = ["telegram", "email", "dashboard"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const MEMORY_SCOPES = [
  "conversation",
  "task",
  "project",
  "client",
  "preference",
  "operational",
  "knowledge",
] as const;
export type MemoryScope = (typeof MEMORY_SCOPES)[number];

export const INCIDENT_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const AGENT_STATUSES = ["active", "idle", "busy", "disabled", "error"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export const WORKFLOW_STATUSES = ["enabled", "disabled"] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const createTaskSchema = z.object({
  objective: z.string().min(3).max(4000),
  description: z.string().max(20000).optional(),
  priority: z.enum(TASK_PRIORITIES).default("normal"),
  source: z.enum(TASK_SOURCES).default("dashboard"),
  parentTaskId: z.string().uuid().optional(),
  assignedAgentSlug: z.string().min(1).max(100).optional(),
  riskLevel: z.enum(RISK_LEVELS).optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
  meta: z.record(z.unknown()).optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const commandSchema = z.object({
  text: z.string().min(1).max(8000),
  source: z.enum(TASK_SOURCES).default("dashboard"),
  executeIfSafe: z.boolean().default(true),
});
export type CommandInput = z.infer<typeof commandSchema>;

export const approvalDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().max(2000).optional(),
});
export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;

export const taskActionSchema = z.object({
  action: z.enum([
    "pause",
    "resume",
    "retry",
    "cancel",
    "archive",
    "requeue_dead_letter",
  ]),
  reason: z.string().max(2000).optional(),
});
export type TaskActionInput = z.infer<typeof taskActionSchema>;

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(TASK_STATES).optional(),
  agentSlug: z.string().optional(),
  source: z.enum(TASK_SOURCES).optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export function ok<T>(data: T): ApiEnvelope<T> {
  return { ok: true, data };
}

export function err(code: string, message: string): ApiEnvelope<never> {
  return { ok: false, error: { code, message } };
}
