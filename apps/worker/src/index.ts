import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { repoRoot } from "@mkcc/shared";

loadDotenv({ path: resolve(repoRoot(), ".env") });

import { createDb, ensureMigrated, type DbHandle } from "@mkcc/db";
import { dbPathFor, loadEnv, type Env } from "@mkcc/shared";
import { AiGateway } from "@mkcc/ai-gateway";
import { runExecutorLoop } from "./executor.js";
import { runSchedulerLoop } from "./scheduler.js";
import { startTelegramBot } from "./telegram.js";
import { recordHealthCheck } from "@mkcc/db";

interface WorkerContext {
  env: Env;
  handle: DbHandle;
  gateway: AiGateway;
  shutdown: { requested: boolean };
}

async function main() {
  const env = loadEnv();
  const handle = createDb(dbPathFor(env));
  await ensureMigrated(handle);

  const gateway = new AiGateway({
    openaiApiKey: env.OPENAI_API_KEY,
    geminiApiKey: env.GEMINI_API_KEY,
    groqApiKey: env.GROQ_API_KEY,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    ollamaBaseUrl: `${env.OLLAMA_BASE_URL}/v1`,
    ollamaModel: env.OLLAMA_MODEL,
    deepseekApiKey: env.DEEPSEEK_API_KEY,
    qwenApiKey: env.QWEN_API_KEY,
    glmApiKey: env.GLM_API_KEY,
    defaultProvider: env.AI_DEFAULT_PROVIDER,
  });

  const shutdown = { requested: false };
  const ctx: WorkerContext = { env, handle, gateway, shutdown };

  console.log(
    `[worker] started · db=${dbPathFor(env)} · provider=${env.AI_DEFAULT_PROVIDER} · configured=[${gateway.configuredProviders().join(",")}]`,
  );

  const stop = async (signal: string) => {
    if (shutdown.requested) return;
    shutdown.requested = true;
    console.log(`[worker] ${signal} received — shutting down gracefully`);
    try {
      await recordHealthCheck(handle, {
        name: "worker-heartbeat",
        status: "shutdown",
        details: signal,
      });
    } catch {
      /* best effort */
    }
    setTimeout(() => {
      handle.close();
      process.exit(0);
    }, 1_500);
  };
  process.on("SIGINT", () => void stop("SIGINT"));
  process.on("SIGTERM", () => void stop("SIGTERM"));

  void runExecutorLoop(ctx);
  void runSchedulerLoop(ctx);
  await startTelegramBot(ctx);
}

main().catch((error) => {
  console.error("[worker] fatal startup error:", error);
  process.exit(1);
});

export type { WorkerContext };
