import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/sqlite-proxy/migrator";
import type { DbHandle } from "./client.js";

export function migrationsFolder(): string {
  if (process.env.MKCC_MIGRATIONS_DIR) return process.env.MKCC_MIGRATIONS_DIR;
  const metaUrl: string = import.meta.url;
  return fileURLToPath(new URL("../drizzle", metaUrl));
}

export async function ensureMigrated(handle: DbHandle): Promise<void> {
  const folder = migrationsFolder();
  if (!existsSync(folder)) {
    throw new Error(`Migrations folder not found: ${folder}. Run pnpm db:generate first.`);
  }
  const { sqlite } = handle;
  await migrate(handle.db, async (queries) => {
    for (const q of queries) {
      if (q.trim()) sqlite.exec(q);
    }
  }, { migrationsFolder: folder });
}

export function isMigrated(handle: DbHandle): boolean {
  const row = handle.sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'")
    .get();
  return row !== undefined;
}
