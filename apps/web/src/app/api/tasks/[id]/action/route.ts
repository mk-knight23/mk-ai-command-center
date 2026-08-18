import {
  archiveTask,
  cancelTask,
  getTask,
  pauseTask,
  resumeTask,
  retryTask,
  transitionTask,
  enqueueJob,
} from "@mkcc/db";
import { taskActionSchema } from "@mkcc/shared";
import { errJson, okJson, requireUser } from "@/lib/api";
import { ensureDb } from "@/lib/db";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if (!auth) return errJson("unauthorized", "Not authenticated.", 401);
  const { id } = await ctx.params;

  let input;
  try {
    input = taskActionSchema.parse(await req.json());
  } catch {
    return errJson("invalid_input", "Invalid action payload.");
  }

  const handle = await ensureDb();
  const task = await getTask(handle, id);
  if (!task) return errJson("not_found", "Task not found.", 404);

  try {
    switch (input.action) {
      case "pause":
        return okJson(await pauseTask(handle, id, auth.user.email));
      case "resume":
        return okJson(await resumeTask(handle, id, auth.user.email));
      case "cancel":
        return okJson(await cancelTask(handle, id, auth.user.email, input.reason));
      case "retry":
        return okJson(await retryTask(handle, id, auth.user.email));
      case "archive":
        return okJson(await archiveTask(handle, id, auth.user.email));
      case "requeue_dead_letter": {
        const updated = await transitionTask(handle, id, {
          to: "queued",
          actor: auth.user.email,
          note: input.reason ?? "manual requeue from dead-letter",
        });
        enqueueJob(handle, "task.execute", {
          taskId: id,
          idempotencyKey: `exec:${id}:requeue:${Date.now()}`,
        });
        return okJson(updated);
      }
    }
  } catch (error) {
    return errJson(
      "invalid_transition",
      error instanceof Error ? error.message : "Action failed",
      409,
    );
  }
}
