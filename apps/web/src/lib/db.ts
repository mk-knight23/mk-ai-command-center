import { createDb, ensureMigrated, type DbHandle } from "@mkcc/db";
import { dbPathFor } from "@mkcc/shared";
import { env } from "./env";

const KEY = "__mkcc_db_handle__";

export function getDb(): DbHandle {
  const g = globalThis as unknown as Record<string, DbHandle | undefined>;
  let handle = g[KEY];
  if (!handle) {
    handle = createDb(dbPathFor(env()));
    g[KEY] = handle;
  }
  return handle;
}

let migrated = false;

export async function ensureDb(): Promise<DbHandle> {
  const handle = getDb();
  if (!migrated) {
    await ensureMigrated(handle);
    migrated = true;
  }
  return handle;
}
