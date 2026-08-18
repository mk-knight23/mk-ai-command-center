import type { RiskLevel } from "@mkcc/shared";

export interface ParsedCommand {
  intent: string;
  agentSlug: string;
  riskLevel: RiskLevel;
  isSchedule: boolean;
  scheduleCron?: string;
  scheduleTimezone?: string;
  writesExternal: boolean;
  normalizedObjective: string;
}

interface Rule {
  intent: string;
  agentSlug: string;
  pattern: RegExp;
  risk: RiskLevel;
  externalRisk?: RiskLevel;
  externalPattern?: RegExp;
  writesExternal?: boolean;
}

const RULES: Rule[] = [
  {
    intent: "pause_automation",
    agentSlug: "chief-orchestrator",
    pattern: /\b(pause|stop|disable)\b.*\b(automation|workflow|automations)\b/i,
    risk: "level_1",
  },
  {
    intent: "incident_review",
    agentSlug: "incident-response",
    pattern: /\b(incident|failed tasks?|failures?|outage|broken)\b/i,
    risk: "level_0",
  },
  {
    intent: "cost_review",
    agentSlug: "cost-controller",
    pattern: /\b(costs?|spend|spending|budget|api spend)\b/i,
    risk: "level_0",
  },
  {
    intent: "seo_audit",
    agentSlug: "seo-aeo-agent",
    pattern: /\b(seo|aeo|metadata|structured data|sitemap|canonical)\b/i,
    risk: "level_0",
  },
  {
    intent: "content_draft",
    agentSlug: "content-agent",
    pattern: /\b(linkedin|blog|newsletter|post|content|article|tweet)\b/i,
    risk: "level_0",
    externalPattern: /\b(publish|post it|schedule post)\b/i,
    externalRisk: "level_2",
    writesExternal: true,
  },
  {
    intent: "email_assist",
    agentSlug: "email-agent",
    pattern: /\b(email|e-mail|inbox|mail)\b/i,
    risk: "level_0",
    externalPattern: /\b(send|reply to|forward)\b/i,
    externalRisk: "level_2",
    writesExternal: true,
  },
  {
    intent: "calendar_assist",
    agentSlug: "calendar-agent",
    pattern: /\b(calendar|meeting|agenda)\b/i,
    risk: "level_0",
    externalPattern: /\b(create|schedule|book|move|cancel)\b.*\b(meeting|event)\b/i,
    externalRisk: "level_2",
    writesExternal: true,
  },
  {
    intent: "github_ops",
    agentSlug: "devops-agent",
    pattern: /\b(github|repositories|repo|pull request|pr\b|issues?|deployment|deployments)\b/i,
    risk: "level_0",
    externalPattern: /\b(merge|deploy|force[- ]push|delete)\b/i,
    externalRisk: "level_3",
    writesExternal: true,
  },
  {
    intent: "coding",
    agentSlug: "coding-agent",
    pattern: /\b(code|coding|implement|build|fix|bug|refactor|feature)\b/i,
    risk: "level_1",
    externalPattern: /\bdeploy to production\b/i,
    externalRisk: "level_3",
    writesExternal: true,
  },
  {
    intent: "research",
    agentSlug: "research-agent",
    pattern: /\b(research|analyze|audit|report|summarize|investigate|find)\b/i,
    risk: "level_0",
  },
];

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function parseTime(text: string): { hour: number; minute: number } | null {
  const m = text.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2] ?? "0");
  const mer = m[3]?.toLowerCase();
  if (mer === "pm" && hour < 12) hour += 12;
  if (mer === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

export function parseCommand(text: string, timezone: string = "Asia/Kolkata"): ParsedCommand {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  let scheduleCron: string | undefined;
  const time = parseTime(lower);

  const everyDay = /\bevery\s+day\b|\bdaily\b/i.test(lower);
  const weekdayNames = Object.keys(WEEKDAYS).filter((d) => lower.includes(d));
  const everyWeekday = /\bevery\s+weekday\b/i.test(lower);
  const hourly = /\bevery\s+hour\b/i.test(lower);
  const everyNMinutes = lower.match(/\bevery\s+(\d+)\s+minutes?\b/i);

  if (hourly) {
    scheduleCron = "0 * * * *";
  } else if (everyNMinutes) {
    const n = Math.max(1, Math.min(59, Number(everyNMinutes[1])));
    scheduleCron = `*/${n} * * * *`;
  } else if (everyDay && time) {
    scheduleCron = `${time.minute} ${time.hour} * * *`;
  } else if (everyWeekday && time) {
    scheduleCron = `${time.minute} ${time.hour} * * 1-5`;
  } else if (weekdayNames.length > 0 && time) {
    const dow = weekdayNames.map((d) => WEEKDAYS[d]).join(",");
    scheduleCron = `${time.minute} ${time.hour} * * ${dow}`;
  }

  for (const rule of RULES) {
    if (rule.pattern.test(trimmed)) {
      let risk = rule.risk;
      if (rule.externalPattern && rule.externalPattern.test(trimmed) && rule.externalRisk) {
        risk = rule.externalRisk;
      }
      if (scheduleCron && risk === "level_0") risk = "level_1";
      return {
        intent: rule.intent,
        agentSlug: rule.agentSlug,
        riskLevel: risk,
        isSchedule: Boolean(scheduleCron),
        scheduleCron,
        scheduleTimezone: timezone,
        writesExternal: Boolean(rule.writesExternal),
        normalizedObjective: trimmed,
      };
    }
  }

  return {
    intent: "general",
    agentSlug: "chief-orchestrator",
    riskLevel: scheduleCron ? "level_1" : "level_0",
    isSchedule: Boolean(scheduleCron),
    scheduleCron,
    scheduleTimezone: timezone,
    writesExternal: false,
    normalizedObjective: trimmed,
  };
}
