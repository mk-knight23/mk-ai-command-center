import { eq } from "drizzle-orm";
import { newId } from "@mkcc/core";
import type { DbHandle } from "./client.js";
import { hashPassword } from "./passwords.js";
import { agents, budgets, featureFlags, integrations, users } from "./schema.js";

export interface SeedOptions {
  ownerEmail: string;
  ownerPassword: string;
  ownerName: string;
  dailyBudgetUsd: number;
  monthlyBudgetUsd: number;
}

interface AgentSeed {
  slug: string;
  name: string;
  description: string;
  allowedTools: string[];
  maxCostUsd: number;
}

const AGENT_SEEDS: AgentSeed[] = [
  { slug: "chief-orchestrator", name: "Chief Orchestrator", description: "Normalizes requests, classifies intent and risk, builds dependency graphs, coordinates agents, and produces final reports.", allowedTools: ["task.create", "task.route", "agent.delegate"], maxCostUsd: 2 },
  { slug: "task-classifier", name: "Task Classifier", description: "Classifies intent, complexity, and risk level of incoming commands.", allowedTools: ["classify"], maxCostUsd: 0.2 },
  { slug: "planning-agent", name: "Planning Agent", description: "Turns objectives into structured step plans with dependencies.", allowedTools: ["plan"], maxCostUsd: 0.5 },
  { slug: "research-agent", name: "Research Agent", description: "Performs read-only research and produces sourced summaries.", allowedTools: ["web.search", "web.fetch", "report.write"], maxCostUsd: 1 },
  { slug: "coding-agent", name: "Coding Agent", description: "Implements code changes across the stack with tests.", allowedTools: ["repo.read", "repo.write", "shell.run", "tests.run"], maxCostUsd: 3 },
  { slug: "frontend-agent", name: "Frontend Agent", description: "Implements UI components, pages, and responsive layouts.", allowedTools: ["repo.read", "repo.write", "tests.run"], maxCostUsd: 2 },
  { slug: "backend-agent", name: "Backend Agent", description: "Implements APIs, services, data models, and background jobs.", allowedTools: ["repo.read", "repo.write", "shell.run", "tests.run"], maxCostUsd: 2 },
  { slug: "devops-agent", name: "DevOps Agent", description: "Handles CI/CD, deployments (with approval), and infrastructure tasks.", allowedTools: ["repo.read", "ci.status", "deploy.propose"], maxCostUsd: 1 },
  { slug: "qa-agent", name: "QA Agent", description: "Runs test suites, verifies acceptance criteria, and reports defects.", allowedTools: ["tests.run", "repo.read", "report.write"], maxCostUsd: 1 },
  { slug: "security-reviewer", name: "Security Reviewer", description: "Reviews changes and configurations for security issues.", allowedTools: ["repo.read", "scan.secrets", "report.write"], maxCostUsd: 1 },
  { slug: "content-agent", name: "Content Agent", description: "Drafts posts, articles, newsletters; never publishes without approval.", allowedTools: ["draft.write", "web.research"], maxCostUsd: 1 },
  { slug: "seo-aeo-agent", name: "SEO/AEO Agent", description: "Audits metadata, structured data, and content gaps; recommends changes.", allowedTools: ["web.fetch", "report.write"], maxCostUsd: 1 },
  { slug: "email-agent", name: "Email & Communication Agent", description: "Classifies, summarizes, and drafts email; sends only after approval.", allowedTools: ["email.read", "email.draft", "email.send"], maxCostUsd: 0.5 },
  { slug: "calendar-agent", name: "Calendar & Scheduling Agent", description: "Agendas, conflict detection, meeting prep; writes need approval.", allowedTools: ["calendar.read", "calendar.propose"], maxCostUsd: 0.5 },
  { slug: "data-analyst", name: "Data Analyst", description: "Analyzes structured data and produces charts/insights.", allowedTools: ["db.query.readonly", "report.write"], maxCostUsd: 1 },
  { slug: "documentation-agent", name: "Documentation Agent", description: "Writes and maintains documentation and runbooks.", allowedTools: ["repo.read", "docs.write"], maxCostUsd: 0.5 },
  { slug: "cost-controller", name: "Cost Controller", description: "Monitors spend, enforces budgets, flags anomalies.", allowedTools: ["costs.read", "notify.owner"], maxCostUsd: 0.2 },
  { slug: "output-verifier", name: "Output Verifier", description: "Validates agent outputs against acceptance criteria before delivery.", allowedTools: ["verify"], maxCostUsd: 0.3 },
  { slug: "incident-response", name: "Incident Response Agent", description: "Triages incidents, gathers evidence, recommends recovery actions.", allowedTools: ["logs.read", "incident.update", "notify.owner"], maxCostUsd: 0.5 },
];

const INTEGRATION_SEEDS = [
  { slug: "telegram", name: "Telegram", category: "messaging" },
  { slug: "email-smtp", name: "Email (SMTP)", category: "messaging" },
  { slug: "github", name: "GitHub", category: "development" },
  { slug: "google-calendar", name: "Google Calendar", category: "productivity" },
  { slug: "webhooks", name: "Inbound Webhooks", category: "automation" },
  { slug: "local-storage", name: "Local Artifact Storage", category: "storage" },
  { slug: "n8n", name: "n8n", category: "automation" },
];

export async function seed(handle: DbHandle, opts: SeedOptions): Promise<void> {
  const { db } = handle;
  const now = Date.now();

  const existingOwner = await db.query.users.findFirst({
    where: eq(users.email, opts.ownerEmail),
  });
  if (!existingOwner) {
    await db.insert(users).values({
      id: newId("usr"),
      email: opts.ownerEmail,
      name: opts.ownerName,
      passwordHash: hashPassword(opts.ownerPassword),
      role: "owner",
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const a of AGENT_SEEDS) {
    const existing = await db.query.agents.findFirst({ where: eq(agents.slug, a.slug) });
    if (!existing) {
      await db.insert(agents).values({
        id: newId("agt"),
        slug: a.slug,
        name: a.name,
        description: a.description,
        allowedTools: JSON.stringify(a.allowedTools),
        maxCostUsd: a.maxCostUsd,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  for (const i of INTEGRATION_SEEDS) {
    const existing = await db.query.integrations.findFirst({
      where: eq(integrations.slug, i.slug),
    });
    if (!existing) {
      await db.insert(integrations).values({
        id: newId("int"),
        slug: i.slug,
        name: i.name,
        category: i.category,
        status: "disabled",
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  const daily = await db.query.budgets.findFirst({ where: eq(budgets.scope, "daily") });
  if (!daily) {
    await db.insert(budgets).values({
      id: newId("bdg"),
      scope: "daily",
      limitUsd: opts.dailyBudgetUsd,
      createdAt: now,
      updatedAt: now,
    });
  }
  const monthly = await db.query.budgets.findFirst({ where: eq(budgets.scope, "monthly") });
  if (!monthly) {
    await db.insert(budgets).values({
      id: newId("bdg"),
      scope: "monthly",
      limitUsd: opts.monthlyBudgetUsd,
      createdAt: now,
      updatedAt: now,
    });
  }

  const flags = [
    { key: "auto_execute_level_1", enabled: true, description: "Auto-execute reversible internal changes" },
    { key: "telegram_natural_language", enabled: true, description: "Parse natural-language Telegram commands" },
    { key: "parallel_workstreams", enabled: true, description: "Run independent task branches concurrently" },
  ];
  for (const f of flags) {
    const existing = await db.query.featureFlags.findFirst({
      where: eq(featureFlags.key, f.key),
    });
    if (!existing) {
      await db.insert(featureFlags).values({ ...f, updatedAt: now });
    }
  }
}
