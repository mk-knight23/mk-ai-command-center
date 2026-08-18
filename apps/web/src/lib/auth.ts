import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { newId } from "@mkcc/core";
import { hashToken, sessions, users } from "@mkcc/db";
import type { DbHandle } from "@mkcc/db";
import { env } from "./env";

export const SESSION_COOKIE = "mkcc_session";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export async function createSession(
  handle: DbHandle,
  userId: string,
  meta: { userAgent?: string; ip?: string },
): Promise<{ token: string; expiresAt: number }> {
  const token = randomBytes(32).toString("hex");
  const ttlDays = env().SESSION_TTL_DAYS;
  const expiresAt = Date.now() + ttlDays * 24 * 60 * 60 * 1000;
  await handle.db.insert(sessions).values({
    id: newId("ses"),
    userId,
    tokenHash: hashToken(token),
    userAgent: meta.userAgent ?? null,
    ip: meta.ip ?? null,
    expiresAt,
    createdAt: Date.now(),
  });
  return { token, expiresAt };
}

export async function getUserFromToken(
  handle: DbHandle,
  token: string | undefined,
): Promise<AuthUser | null> {
  if (!token) return null;
  const row = await handle.db.query.sessions.findFirst({
    where: eq(sessions.tokenHash, hashToken(token)),
  });
  if (!row) return null;
  if (row.revokedAt || row.expiresAt < Date.now()) return null;
  const user = await handle.db.query.users.findFirst({ where: eq(users.id, row.userId) });
  if (!user) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export async function revokeSession(handle: DbHandle, token: string | undefined): Promise<void> {
  if (!token) return;
  await handle.db
    .update(sessions)
    .set({ revokedAt: Date.now() })
    .where(eq(sessions.tokenHash, hashToken(token)));
}

const loginAttempts = new Map<string, { count: number; windowStart: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export function rateLimitLogin(key: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    loginAttempts.set(key, { count: 1, windowStart: now });
    return true;
  }
  entry.count += 1;
  return entry.count <= MAX_ATTEMPTS;
}

export function sessionCookieOptions(expiresAt: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env().NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  };
}
