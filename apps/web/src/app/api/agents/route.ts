import { agents } from "@mkcc/db";
import { desc } from "drizzle-orm";
import { errJson, okJson, requireUser } from "@/lib/api";
import { ensureDb } from "@/lib/db";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return errJson("unauthorized", "Not authenticated.", 401);
  const handle = await ensureDb();
  const items = await handle.db.query.agents.findMany({ orderBy: [desc(agents.createdAt)] });
  return okJson({ items, total: items.length });
}
