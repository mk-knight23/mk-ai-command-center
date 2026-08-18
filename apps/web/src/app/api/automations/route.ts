import {
  addSchedule,
  listRuns,
  listSchedules,
  listWorkflows,
  setScheduleEnabled,
  setWorkflowStatus,
  triggerWorkflow,
  upsertWorkflow,
} from "@mkcc/db";
import { z } from "zod";
import { errJson, okJson, requireUser } from "@/lib/api";
import { ensureDb } from "@/lib/db";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return errJson("unauthorized", "Not authenticated.", 401);
  const handle = await ensureDb();
  const [workflows, schedules, runs] = await Promise.all([
    listWorkflows(handle),
    listSchedules(handle),
    listRuns(handle, undefined, 30),
  ]);
  return okJson({ workflows, schedules, runs });
}

const createSchema = z.object({
  name: z.string().min(3).max(200),
  slug: z.string().min(3).max(100).regex(/^[a-z0-9-]+$/).optional(),
  objectiveTemplate: z.string().min(3).max(4000),
  agentSlug: z.string().optional(),
  riskLevel: z.enum(["level_0", "level_1", "level_2", "level_3"]).default("level_0"),
  cronExpr: z.string().optional(),
  timezone: z.string().default("Asia/Kolkata"),
});

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return errJson("unauthorized", "Not authenticated.", 401);

  let input;
  try {
    input = createSchema.parse(await req.json());
  } catch (error) {
    return errJson("invalid_input", error instanceof Error ? error.message : "Invalid payload");
  }

  const handle = await ensureDb();
  const slugFromName = input.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  const slug = input.slug ?? (slugFromName || `wf-${Date.now().toString(36)}`);

  const workflow = await upsertWorkflow(handle, {
    slug,
    name: input.name,
    definition: {
      objectiveTemplate: input.objectiveTemplate,
      agentSlug: input.agentSlug,
      riskLevel: input.riskLevel,
    },
  });

  let schedule = null;
  if (input.cronExpr) {
    try {
      schedule = await addSchedule(handle, {
        workflowId: workflow.id,
        cronExpr: input.cronExpr,
        timezone: input.timezone,
      });
    } catch (error) {
      return errJson(
        "invalid_cron",
        error instanceof Error ? error.message : "Invalid cron expression",
      );
    }
  }

  return okJson({ workflow, schedule }, 201);
}
