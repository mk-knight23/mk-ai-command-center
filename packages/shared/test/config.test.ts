import { describe, expect, it } from "vitest";
import { dbPathFor, envSchema, loadEnv } from "../src/config.js";

describe("env validation", () => {
  it("parses a minimal valid environment with defaults", () => {
    const env = loadEnv({});
    expect(env.AI_DEFAULT_PROVIDER).toBe("mock");
    expect(env.NODE_ENV).toBe("development");
    expect(env.WORKER_POLL_MS).toBe(2000);
    expect(env.AI_DAILY_BUDGET_USD).toBe(20);
  });

  it("rejects an invalid provider", () => {
    const result = envSchema.safeParse({ AI_DEFAULT_PROVIDER: "bad-provider" });
    expect(result.success).toBe(false);
  });

  it("rejects a short AUTH_SECRET", () => {
    const result = envSchema.safeParse({ AUTH_SECRET: "short" });
    expect(result.success).toBe(false);
  });
});

describe("dbPathFor", () => {
  it("resolves a relative data dir against the repo root", () => {
    const env = loadEnv({ MKCC_DATA_DIR: "./data" });
    const path = dbPathFor(env);
    expect(path.endsWith("data/mkcc.db")).toBe(true);
  });

  it("honours an explicit absolute DB path", () => {
    const env = loadEnv({ MKCC_DB_PATH: "/tmp/custom.db" });
    expect(dbPathFor(env)).toBe("/tmp/custom.db");
  });
});
