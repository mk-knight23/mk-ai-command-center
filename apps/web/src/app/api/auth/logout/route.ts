import { audit } from "@mkcc/db";
import { okJson, readCookie } from "@/lib/api";
import { revokeSession, SESSION_COOKIE } from "@/lib/auth";
import { ensureDb } from "@/lib/db";

export async function POST(req: Request) {
  const handle = await ensureDb();
  const token = readCookie(req, SESSION_COOKIE);
  await revokeSession(handle, token);
  await audit(handle, { actor: "session", action: "auth.logout" });
  const res = okJson({ loggedOut: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
