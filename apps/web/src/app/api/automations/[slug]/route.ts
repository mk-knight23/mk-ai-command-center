import { getWorkflowBySlug, setWorkflowStatus, triggerWorkflow } from "@mkcc/db";
import { z } from "zod";
import { errJson, okJson, requireUser } from "@/lib/api";
import { ensureDb } from "@/lib/db";

const bodySchema = z.object({
  action: z.enum(["run", "enable", "disable"]),
});

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const auth = await requireUser(req);
  if (!auth) return errJson("unauthorized", "Not authenticated.", 401);
  const { slug } = await ctx.params;

  let input;
  try {
    input = bodySchema.parse(await req.json());
  } catch {
    return errJson("invalid_input", "Action must be run, enable, or disable.");
  }

  const handle = await ensureDb();
  const workflow = await getWorkflowBySlug(handle, slug);
  if (!workflow) return errJson("not_found", "Workflow not found.", 404);

  if (input.action === "enable" || input.action === "disable") {
    await setWorkflowStatus(handle, slug, input.action === "enable" ? "enabled" : "disabled");
    return okJson({ slug, status: input.action === "enable" ? "enabled" : "disabled" });
  }

  try {
    const { runId, taskId } = await triggerWorkflow(handle, workflow.id, "manual");
    return okJson({ runId, taskId }, 201);
  } catch (error) {
    return errJson("trigger_failed", error instanceof Error ? error.message : "Run failed", 409);
  }
}
