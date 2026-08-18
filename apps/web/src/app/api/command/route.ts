import { parseCommand, approvalRequired } from "@mkcc/core";
import {
  addSchedule,
  audit,
  createTask,
  upsertWorkflow,
} from "@mkcc/db";
import { commandSchema } from "@mkcc/shared";
import { errJson, okJson, requireUser } from "@/lib/api";
import { ensureDb } from "@/lib/db";

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return errJson("unauthorized", "Not authenticated.", 401);

  let input;
  try {
    input = commandSchema.parse(await req.json());
  } catch {
    return errJson("invalid_input", "Command text is required.");
  }

  const handle = await ensureDb();
  const parsed = parseCommand(input.text);
  const requiresApproval = approvalRequired(parsed.riskLevel);

  if (parsed.isSchedule && parsed.scheduleCron) {
    const slug = `cmd-${Date.now().toString(36)}`;
    const workflow = await upsertWorkflow(handle, {
      slug,
      name: input.text.slice(0, 80),
      description: `Created from command: ${input.text}`,
      definition: {
        objectiveTemplate: parsed.normalizedObjective,
        agentSlug: parsed.agentSlug,
        riskLevel: parsed.riskLevel,
      },
    });
    const schedule = await addSchedule(handle, {
      workflowId: workflow.id,
      cronExpr: parsed.scheduleCron,
      timezone: parsed.scheduleTimezone,
    });
    await audit(handle, {
      actor: auth.user.email,
      action: "command.scheduled",
      entityType: "workflow",
      entityId: workflow.id,
      meta: { cron: parsed.scheduleCron, agent: parsed.agentSlug },
    });
    return okJson({
      mode: "scheduled",
      parsed,
      requiresApproval,
      workflow: { id: workflow.id, slug: workflow.slug, name: workflow.name },
      schedule: { id: schedule.id, nextRunAt: schedule.nextRunAt, cron: schedule.cronExpr },
    }, 201);
  }

  const task = await createTask(handle, {
    objective: parsed.normalizedObjective,
    source: input.source,
    creatorId: auth.user.id,
    assignedAgentSlug: parsed.agentSlug,
    riskLevel: parsed.riskLevel,
    meta: { intent: parsed.intent, via: "command" },
    actor: auth.user.email,
  });

  return okJson({
    mode: "task",
    parsed,
    requiresApproval,
    task: {
      id: task.id,
      objective: task.objective,
      status: task.status,
      riskLevel: task.riskLevel,
      assignedAgentSlug: task.assignedAgentSlug,
    },
  }, 201);
}
