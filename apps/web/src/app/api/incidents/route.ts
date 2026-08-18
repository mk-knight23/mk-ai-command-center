import { listIncidents, resolveIncident } from "@mkcc/db";
import { z } from "zod";
import { errJson, okJson, requireUser } from "@/lib/api";
import { ensureDb } from "@/lib/db";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return errJson("unauthorized", "Not authenticated.", 401);
  const handle = await ensureDb();
  return okJson(await listIncidents(handle, 100));
}

const resolveSchema = z.object({ id: z.string(), resolution: z.string().min(3).max(2000) });

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return errJson("unauthorized", "Not authenticated.", 401);
  let input;
  try {
    input = resolveSchema.parse(await req.json());
  } catch {
    return errJson("invalid_input", "id and resolution are required.");
  }
  const handle = await ensureDb();
  await resolveIncident(handle, input.id, input.resolution);
  return okJson({ resolved: input.id });
}
