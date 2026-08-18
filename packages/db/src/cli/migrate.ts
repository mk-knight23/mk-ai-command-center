import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { dbPathFor, loadEnv } from "@mkcc/shared";
import { createDb } from "../client.js";
import { ensureMigrated } from "../migrate.js";

loadDotenv({ path: resolve(process.cwd(), "../../.env") });
loadDotenv({ path: resolve(process.cwd(), ".env") });

const env = loadEnv();
const handle = createDb(dbPathFor(env));
await ensureMigrated(handle);
console.log(`[db] migrations applied to ${dbPathFor(env)}`);
handle.close();
