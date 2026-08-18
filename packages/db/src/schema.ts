import {
  type AnySQLiteColumn,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("owner"),
  telegramChatId: text("telegram_chat_id"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    tokenHash: text("token_hash").notNull().unique(),
    userAgent: text("user_agent"),
    ip: text("ip"),
    expiresAt: integer("expires_at").notNull(),
    revokedAt: integer("revoked_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  responsibilities: text("responsibilities").notNull().default(""),
  allowedTools: text("allowed_tools").notNull().default("[]"),
  prohibitedTools: text("prohibited_tools").notNull().default("[]"),
  maxRuntimeMs: integer("max_runtime_ms").notNull().default(1800000),
  maxIterations: integer("max_iterations").notNull().default(12),
  maxTokens: integer("max_tokens").notNull().default(200000),
  maxCostUsd: real("max_cost_usd").notNull().default(5),
  memoryAccess: text("memory_access").notNull().default("[]"),
  approvalPolicy: text("approval_policy").notNull().default("{}"),
  escalation: text("escalation").notNull().default(""),
  fallbackBehavior: text("fallback_behavior").notNull().default("notify_owner"),
  modelPreference: text("model_preference").notNull().default("[]"),
  status: text("status").notNull().default("active"),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    parentTaskId: text("parent_task_id").references((): AnySQLiteColumn => tasks.id),
    objective: text("objective").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("draft"),
    priority: text("priority").notNull().default("normal"),
    riskLevel: text("risk_level").notNull().default("level_0"),
    source: text("source").notNull().default("dashboard"),
    creatorId: text("creator_id").references(() => users.id),
    assignedAgentSlug: text("assigned_agent_slug"),
    workflowRunId: text("workflow_run_id"),
    idempotencyKey: text("idempotency_key").unique(),
    depth: integer("depth").notNull().default(0),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    tokensUsed: integer("tokens_used").notNull().default(0),
    costUsd: real("cost_usd").notNull().default(0),
    result: text("result"),
    error: text("error"),
    meta: text("meta").notNull().default("{}"),
    approvedActionHash: text("approved_action_hash"),
    startedAt: integer("started_at"),
    completedAt: integer("completed_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("tasks_status_idx").on(t.status),
    index("tasks_created_idx").on(t.createdAt),
    index("tasks_parent_idx").on(t.parentTaskId),
    index("tasks_workflow_run_idx").on(t.workflowRunId),
  ],
);

export const taskEvents = sqliteTable(
  "task_events",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").notNull().references(() => tasks.id),
    type: text("type").notNull(),
    actor: text("actor").notNull().default("system"),
    correlationId: text("correlation_id"),
    payload: text("payload").notNull().default("{}"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("task_events_task_idx").on(t.taskId, t.createdAt)],
);

export const taskDependencies = sqliteTable(
  "task_dependencies",
  {
    taskId: text("task_id").notNull().references(() => tasks.id),
    dependsOnTaskId: text("depends_on_task_id").notNull().references(() => tasks.id),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("task_deps_pk").on(t.taskId, t.dependsOnTaskId)],
);

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    taskId: text("task_id"),
    payload: text("payload").notNull().default("{}"),
    status: text("status").notNull().default("pending"),
    attempt: integer("attempt").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    availableAt: integer("available_at").notNull(),
    leasedAt: integer("leased_at"),
    leaseExpiresAt: integer("lease_expires_at"),
    lastError: text("last_error"),
    idempotencyKey: text("idempotency_key").unique(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("jobs_queue_idx").on(t.status, t.availableAt)],
);

export const workflows = sqliteTable("workflows", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  definition: text("definition").notNull().default("{}"),
  approvalPolicy: text("approval_policy").notNull().default("{}"),
  retryPolicy: text("retry_policy").notNull().default("{}"),
  timeoutMs: integer("timeout_ms").notNull().default(1800000),
  status: text("status").notNull().default("enabled"),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const workflowRuns = sqliteTable(
  "workflow_runs",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id").notNull().references(() => workflows.id),
    workflowVersion: integer("workflow_version").notNull(),
    trigger: text("trigger").notNull().default("manual"),
    status: text("status").notNull().default("queued"),
    taskId: text("task_id"),
    error: text("error"),
    startedAt: integer("started_at"),
    finishedAt: integer("finished_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("workflow_runs_workflow_idx").on(t.workflowId, t.createdAt)],
);

export const schedules = sqliteTable(
  "schedules",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id").notNull().references(() => workflows.id),
    cronExpr: text("cron_expr").notNull(),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    nextRunAt: integer("next_run_at").notNull(),
    lastRunAt: integer("last_run_at"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("schedules_next_run_idx").on(t.enabled, t.nextRunAt)],
);

export const approvals = sqliteTable(
  "approvals",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").notNull().references(() => tasks.id),
    actionSummary: text("action_summary").notNull(),
    actionHash: text("action_hash").notNull(),
    riskLevel: text("risk_level").notNull(),
    status: text("status").notNull().default("pending"),
    requestedBy: text("requested_by").notNull().default("system"),
    decidedBy: text("decided_by"),
    decisionNote: text("decision_note"),
    decidedAt: integer("decided_at"),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("approvals_status_idx").on(t.status), index("approvals_task_idx").on(t.taskId)],
);

export const integrations = sqliteTable("integrations", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull().default("general"),
  status: text("status").notNull().default("disabled"),
  config: text("config").notNull().default("{}"),
  health: text("health").notNull().default("{}"),
  lastCheckAt: integer("last_check_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    channel: text("channel").notNull(),
    recipient: text("recipient").notNull(),
    subject: text("subject").notNull().default(""),
    body: text("body").notNull(),
    status: text("status").notNull().default("pending"),
    taskId: text("task_id"),
    error: text("error"),
    sentAt: integer("sent_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("notifications_status_idx").on(t.status)],
);

export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    channel: text("channel").notNull().default("telegram"),
    externalChatId: text("external_chat_id").notNull().unique(),
    userId: text("user_id").references(() => users.id),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull().references(() => conversations.id),
    direction: text("direction").notNull(),
    body: text("body").notNull(),
    meta: text("meta").notNull().default("{}"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

export const memories = sqliteTable(
  "memories",
  {
    id: text("id").primaryKey(),
    scope: text("scope").notNull(),
    ownerId: text("owner_id"),
    key: text("key").notNull(),
    content: text("content").notNull(),
    source: text("source").notNull().default("system"),
    confidence: real("confidence").notNull().default(1),
    sensitivity: text("sensitivity").notNull().default("internal"),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    relatedTaskId: text("related_task_id"),
    relatedProjectId: text("related_project_id"),
    expiresAt: integer("expires_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("memories_scope_idx").on(t.scope, t.key)],
);

export const artifacts = sqliteTable(
  "artifacts",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").references(() => tasks.id),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("file"),
    path: text("path"),
    url: text("url"),
    sizeBytes: integer("size_bytes"),
    mime: text("mime"),
    meta: text("meta").notNull().default("{}"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("artifacts_task_idx").on(t.taskId)],
);

export const clients = sqliteTable("clients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  company: text("company").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").references(() => clients.id),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    status: text("status").notNull().default("active"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
);

export const costs = sqliteTable(
  "costs",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    costUsd: real("cost_usd").notNull().default(0),
    day: text("day").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("costs_day_idx").on(t.day), index("costs_task_idx").on(t.taskId)],
);

export const budgets = sqliteTable("budgets", {
  id: text("id").primaryKey(),
  scope: text("scope").notNull().unique(),
  limitUsd: real("limit_usd").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull().default(""),
    entityId: text("entity_id").notNull().default(""),
    ip: text("ip"),
    meta: text("meta").notNull().default("{}"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt)],
);

export const incidents = sqliteTable(
  "incidents",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    severity: text("severity").notNull().default("medium"),
    status: text("status").notNull().default("open"),
    source: text("source").notNull().default("system"),
    taskId: text("task_id"),
    details: text("details").notNull().default(""),
    resolution: text("resolution").notNull().default(""),
    openedAt: integer("opened_at").notNull(),
    resolvedAt: integer("resolved_at"),
  },
  (t) => [index("incidents_status_idx").on(t.status)],
);

export const healthChecks = sqliteTable(
  "health_checks",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    status: text("status").notNull(),
    latencyMs: integer("latency_ms"),
    details: text("details").notNull().default(""),
    checkedAt: integer("checked_at").notNull(),
  },
  (t) => [index("health_checks_name_idx").on(t.name, t.checkedAt)],
);

export const featureFlags = sqliteTable("feature_flags", {
  key: text("key").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  description: text("description").notNull().default(""),
  updatedAt: integer("updated_at").notNull(),
});

export const telegramChats = sqliteTable("telegram_chats", {
  chatId: text("chat_id").primaryKey(),
  label: text("label").notNull().default(""),
  role: text("role").notNull().default("owner"),
  createdAt: integer("created_at").notNull(),
});
