import { createTask, listTasks, taskCountsByStatus } from "@mkcc/db";
import { createTaskSchema, listQuerySchema } from "@mkcc/shared";
import { errJson, okJson, requireUser } from "@/lib/api";
import { ensureDb } from "@/lib/db";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return errJson("unauthorized", "Not authenticated.", 401);

  const url = new URL(req.url);
  const query = listQuerySchema.parse(Object.fromEntries(url.searchParams));
  const handle = await ensureDb();
  const { items, total } = await listTasks(handle, {
    status: query.status,
    agentSlug: query.agentSlug,
    limit: query.limit,
    offset: query.offset,
  });
  const counts = await taskCountsByStatus(handle);
  return okJson({ items, total, counts });
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return errJson("unauthorized", "Not authenticated.", 401);

  let input;
  try {
    input = createTaskSchema.parse(await req.json());
  } catch (error) {
    return errJson("invalid_input", error instanceof Error ? error.message : "Invalid payload");
  }

  const handle = await ensureDb();
  const task = await createTask(handle, {
    objective: input.objective,
    description: input.description,
    priority: input.priority,
    riskLevel: input.riskLevel,
    source: input.source,
    creatorId: auth.user.id,
    parentTaskId: input.parentTaskId,
    assignedAgentSlug: input.assignedAgentSlug,
    idempotencyKey: input.idempotencyKey,
    meta: input.meta,
    actor: auth.user.email,
  });
  return okJson(task, 201);
}
