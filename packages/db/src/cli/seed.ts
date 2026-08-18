import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { dbPathFor, loadEnv } from "@mkcc/shared";
import { createDb } from "../client.js";
import { ensureMigrated } from "../migrate.js";
import { seed } from "../seed.js";

loadDotenv({ path: resolve(process.cwd(), "../../.env") });
loadDotenv({ path: resolve(process.cwd(), ".env") });

const env = loadEnv();
if (!env.OWNER_PASSWORD) {
  console.error(
    "[seed] OWNER_PASSWORD is not set. Add it to .env (see .env.example) and retry.",
  );
  process.exit(1);
}
const handle = createDb(dbPathFor(env));
await ensureMigrated(handle);
await seed(handle, {
  ownerEmail: env.OWNER_EMAIL,
  ownerPassword: env.OWNER_PASSWORD,
  ownerName: env.APP_OWNER_NAME,
  dailyBudgetUsd: env.AI_DAILY_BUDGET_USD,
  monthlyBudgetUsd: env.AI_MONTHLY_BUDGET_USD,
});
console.log(`[seed] completed for owner ${env.OWNER_EMAIL}`);
handle.close();
