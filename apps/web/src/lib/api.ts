import { NextResponse } from "next/server";
import { err, ok, type ApiEnvelope } from "@mkcc/shared";
import { getUserFromToken, SESSION_COOKIE, type AuthUser } from "./auth";
import { ensureDb } from "./db";

export function json<T>(envelope: ApiEnvelope<T>, status = 200): NextResponse {
  return NextResponse.json(envelope, { status: envelope.ok ? status : status >= 400 ? status : 400 });
}

export function okJson<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(ok(data), { status });
}

export function errJson(code: string, message: string, status = 400): NextResponse {
  return NextResponse.json(err(code, message), { status });
}

export interface AuthedRequest {
  user: AuthUser;
  token?: string;
  ip?: string;
}

export async function requireUser(req: Request): Promise<AuthedRequest | null> {
  const handle = await ensureDb();
  const token = readCookie(req, SESSION_COOKIE);
  const user = await getUserFromToken(handle, token);
  if (!user) return null;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
  return { user, token, ip };
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export async function readJson<T>(req: Request, parser: (raw: unknown) => T): Promise<T> {
  const raw: unknown = await req.json();
  return parser(raw);
}
