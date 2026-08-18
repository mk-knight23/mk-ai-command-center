import { getTask } from "@mkcc/db";
import { errJson, okJson, requireUser } from "@/lib/api";
import { ensureDb } from "@/lib/db";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if (!auth) return errJson("unauthorized", "Not authenticated.", 401);
  const { id } = await ctx.params;
  const handle = await ensureDb();
  const task = await getTask(handle, id);
  if (!task) return errJson("not_found", "Task not found.", 404);
  return okJson(task);
}
