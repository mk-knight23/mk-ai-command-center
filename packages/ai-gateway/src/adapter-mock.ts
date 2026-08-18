import { createHash } from "node:crypto";
import { buildResult, countRequestTokens, type ProviderAdapter } from "./provider.js";
import { estimateTokens } from "./catalog.js";
import type { CompletionRequest, CompletionResult } from "./types.js";

export class MockAdapter implements ProviderAdapter {
  readonly name = "mock" as const;

  isConfigured(): boolean {
    return true;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const startedAt = Date.now();
    const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
    const input = lastUser?.content ?? "";
    const digest = createHash("sha256").update(input).digest("hex").slice(0, 8);
    const content = `[mock:${digest}] Deterministic response for: ${input.slice(0, 120)}`;
    await new Promise((r) => setTimeout(r, 5));
    return buildResult(
      this.name,
      "mock-1",
      content,
      countRequestTokens(req),
      estimateTokens(content),
      startedAt,
    );
  }
}
