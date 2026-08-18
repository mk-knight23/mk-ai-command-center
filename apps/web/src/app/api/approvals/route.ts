import { pendingApprovals } from "@mkcc/db";
import { errJson, okJson, requireUser } from "@/lib/api";
import { ensureDb } from "@/lib/db";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return errJson("unauthorized", "Not authenticated.", 401);
  const handle = await ensureDb();
  const items = await pendingApprovals(handle);
  return okJson({ items, total: items.length });
}
