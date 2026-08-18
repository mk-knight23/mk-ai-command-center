import { estimateCostUsd, estimateTokens } from "./catalog.js";
import type {
  CompletionRequest,
  CompletionResult,
  ProviderName,
} from "./types.js";

export interface ProviderAdapter {
  name: ProviderName;
  isConfigured(): boolean;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function buildResult(
  provider: ProviderName,
  model: string,
  content: string,
  inputTokens: number,
  outputTokens: number,
  startedAt: number,
): CompletionResult {
  return {
    content,
    provider,
    model,
    usage: { inputTokens, outputTokens },
    costUsd: estimateCostUsd(provider, model, inputTokens, outputTokens),
    latencyMs: Date.now() - startedAt,
  };
}

export function countRequestTokens(req: CompletionRequest): number {
  return req.messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
}

const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bghp_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bAIza[A-Za-z0-9_-]{30,}\b/g,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g,
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, "[REDACTED]");
  }
  return out;
}
