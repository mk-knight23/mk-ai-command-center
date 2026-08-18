import { integrations } from "@mkcc/db";
import { errJson, okJson, requireUser } from "@/lib/api";
import { ensureDb } from "@/lib/db";
import { env } from "@/lib/env";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return errJson("unauthorized", "Not authenticated.", 401);
  const handle = await ensureDb();
  const rows = await handle.db.query.integrations.findMany();
  const e = env();
  const live = rows.map((row) => {
    let configured = false;
    switch (row.slug) {
      case "telegram":
        configured = Boolean(e.TELEGRAM_BOT_TOKEN);
        break;
      case "email-smtp":
        configured = Boolean(e.SMTP_HOST && e.SMTP_USER);
        break;
      case "local-storage":
        configured = true;
        break;
      default:
        configured = false;
    }
    return { ...row, configured };
  });
  return okJson({ items: live });
}
