import { isMigrated } from "@mkcc/db";
import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    const handle = await ensureDb();
    const migrated = isMigrated(handle);
    const row = handle.sqlite.prepare("SELECT 1 as ok").get();
    return NextResponse.json({
      ok: true,
      app: env().APP_NAME,
      db: migrated && row ? "up" : "degraded",
      latencyMs: Date.now() - startedAt,
      time: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        db: "down",
        error: error instanceof Error ? error.message : "unknown",
        time: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
