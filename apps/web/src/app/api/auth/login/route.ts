import { eq } from "drizzle-orm";
import { verifyPassword, users, audit } from "@mkcc/db";
import { z } from "zod";
import { errJson, okJson } from "@/lib/api";
import { createSession, rateLimitLogin, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { ensureDb } from "@/lib/db";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  const handle = await ensureDb();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimitLogin(ip)) {
    return errJson("rate_limited", "Too many login attempts. Try again later.", 429);
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return errJson("invalid_input", "Email and password are required.");
  }

  const user = await handle.db.query.users.findFirst({
    where: eq(users.email, body.email.toLowerCase()),
  });
  if (!user || !verifyPassword(body.password, user.passwordHash)) {
    await audit(handle, { actor: body.email, action: "auth.login_failed", ip });
    return errJson("invalid_credentials", "Invalid email or password.", 401);
  }

  const { token, expiresAt } = await createSession(handle, user.id, {
    userAgent: req.headers.get("user-agent") ?? undefined,
    ip,
  });
  await audit(handle, { actor: user.email, action: "auth.login", ip });

  const res = okJson({ id: user.id, email: user.email, name: user.name, role: user.role });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  return res;
}
