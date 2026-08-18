import { loadEnv, type Env } from "@mkcc/shared";

let cached: Env | null = null;

export function env(): Env {
  if (!cached) cached = loadEnv();
  return cached;
}
