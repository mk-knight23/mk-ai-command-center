import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema.js";

export type Db = SqliteRemoteDatabase<typeof schema>;

export interface DbHandle {
  db: Db;
  sqlite: DatabaseSync;
  close(): void;
}

function valuesRows(sqlite: DatabaseSync, sql: string, params: unknown[]): unknown[][] {
  const stmt = sqlite.prepare(sql);
  let cols: string[] = [];
  try {
    cols = stmt.columns().map((c) => c.name);
  } catch {
    cols = [];
  }
  const rows = stmt.all(...(params as never[])) as Record<string, unknown>[];
  if (cols.length === 0) return rows.map(() => []);
  return rows.map((row) => cols.map((c) => row[c]));
}

export function createDb(path: string): DbHandle {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const sqlite = new DatabaseSync(path);
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec("PRAGMA busy_timeout = 5000;");
  sqlite.exec("PRAGMA synchronous = NORMAL;");

  const db = drizzle(
    async (sql, params, method) => {
      if (method === "run") {
        sqlite.prepare(sql).run(...(params as never[]));
        return { rows: [] };
      }
      if (method === "get") {
        const rows = valuesRows(sqlite, sql, params);
        return { rows: (rows[0] ?? null) as unknown[] };
      }
      return { rows: valuesRows(sqlite, sql, params) };
    },
    async (batch) => {
      const results: { rows: unknown[] }[] = [];
      for (const q of batch) {
        if (q.method === "run") {
          sqlite.prepare(q.sql).run(...(q.params as never[]));
          results.push({ rows: [] });
        } else if (q.method === "get") {
          const rows = valuesRows(sqlite, q.sql, q.params);
          results.push({ rows: rows.slice(0, 1) });
        } else {
          results.push({ rows: valuesRows(sqlite, q.sql, q.params) });
        }
      }
      return results;
    },
    { schema },
  );

  return {
    db,
    sqlite,
    close: () => sqlite.close(),
  };
}

export * from "./schema.js";
