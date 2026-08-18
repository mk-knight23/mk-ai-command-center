import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";

const booleanish = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1")
  .optional();

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  MKCC_DATA_DIR: z.string().default("./data"),
  MKCC_DB_PATH: z.string().optional(),
  WEB_PORT: z.coerce.number().int().default(3100),
  PUBLIC_APP_URL: z.string().url().default("http://localhost:3100"),

  APP_NAME: z.string().default("MK AI Command Center"),
  NEXT_PUBLIC_APP_NAME: z.string().default("MK AI Command Center"),
  APP_OWNER_NAME: z.string().default("Musharraf Kazi"),
  APP_OWNER_EMAIL: z.string().optional(),

  AUTH_SECRET: z.string().min(32).optional(),
  OWNER_EMAIL: z.string().email().default("owner@mkcc.local"),
  OWNER_PASSWORD: z.string().optional(),
  SESSION_TTL_DAYS: z.coerce.number().int().default(30),

  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  // Local + Chinese open-weight providers
  OLLAMA_BASE_URL: z.string().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().default("qwen2.5:3b"),
  DEEPSEEK_API_KEY: z.string().optional(),
  QWEN_API_KEY: z.string().optional(),
  GLM_API_KEY: z.string().optional(),
  AI_DEFAULT_PROVIDER: z
    .enum(["openai", "gemini", "groq", "anthropic", "ollama", "deepseek", "qwen", "glm", "mock"])
    .default("mock"),
  AI_DAILY_BUDGET_USD: z.coerce.number().positive().default(20),
  AI_MONTHLY_BUDGET_USD: z.coerce.number().positive().default(300),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_ALLOWED_CHAT_IDS: z.string().optional(),
  TELEGRAM_DASHBOARD_BASE_URL: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  NOTIFY_EMAIL_TO: z.string().optional(),

  WORKER_POLL_MS: z.coerce.number().int().min(250).default(2000),
  SCHEDULER_POLL_MS: z.coerce.number().int().min(5000).default(15000),
  JOB_LEASE_MS: z.coerce.number().int().min(10000).default(300000),
  ENABLE_WORKER: booleanish,
  ENABLE_TELEGRAM: booleanish,
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}

export function repoRoot(start: string = process.cwd()): string {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

export function dbPathFor(env: Env): string {
  const raw = env.MKCC_DB_PATH ?? `${env.MKCC_DATA_DIR}/mkcc.db`;
  if (isAbsolute(raw)) return raw;
  return resolve(repoRoot(), raw);
}
