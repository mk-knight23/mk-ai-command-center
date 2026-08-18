import { budgetSnapshot, costBreakdown } from "@mkcc/db";
import { errJson, okJson, requireUser } from "@/lib/api";
import { ensureDb } from "@/lib/db";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return errJson("unauthorized", "Not authenticated.", 401);
  const handle = await ensureDb();
  const [budget, breakdown] = await Promise.all([
    budgetSnapshot(handle),
    costBreakdown(handle, 14),
  ]);
  return okJson({ budget, breakdown });
}
