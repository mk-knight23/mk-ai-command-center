import { recentAuditLogs, recentEvents } from "@mkcc/db";
import { errJson, okJson, requireUser } from "@/lib/api";
import { ensureDb } from "@/lib/db";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return errJson("unauthorized", "Not authenticated.", 401);
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? "audit";
  const handle = await ensureDb();
  if (kind === "events") {
    const since = Number(url.searchParams.get("since") ?? Date.now() - 24 * 3600_000);
    return okJson(await recentEvents(handle, since, 200));
  }
  return okJson(await recentAuditLogs(handle, 200));
}
