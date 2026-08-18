import type { ModelInfo, ProviderName } from "./types.js";

export const MODEL_CATALOG: Record<ProviderName, ModelInfo[]> = {
  openai: [
    { model: "gpt-4o-mini", inputPer1k: 0.00015, outputPer1k: 0.0006, contextWindow: 128000, supportsTools: true },
    { model: "gpt-4o", inputPer1k: 0.0025, outputPer1k: 0.01, contextWindow: 128000, supportsTools: true },
  ],
  gemini: [
    { model: "gemini-2.5-flash", inputPer1k: 0.0003, outputPer1k: 0.0025, contextWindow: 1048576, supportsTools: true },
    { model: "gemini-2.5-flash-lite", inputPer1k: 0.0001, outputPer1k: 0.0004, contextWindow: 1048576, supportsTools: true },
  ],
  groq: [
    { model: "llama-3.3-70b-versatile", inputPer1k: 0.00059, outputPer1k: 0.00079, contextWindow: 131072, supportsTools: true },
  ],
  anthropic: [
    { model: "claude-sonnet-4-20250514", inputPer1k: 0.003, outputPer1k: 0.015, contextWindow: 200000, supportsTools: true },
  ],
  ollama: [
    { model: "qwen2.5:3b", inputPer1k: 0, outputPer1k: 0, contextWindow: 32768, supportsTools: false },
    { model: "deepseek-r1:1.5b", inputPer1k: 0, outputPer1k: 0, contextWindow: 32768, supportsTools: false },
  ],
  deepseek: [
    { model: "deepseek-chat", inputPer1k: 0.00027, outputPer1k: 0.0011, contextWindow: 64000, supportsTools: true },
  ],
  qwen: [
    { model: "qwen-plus", inputPer1k: 0.00011, outputPer1k: 0.00035, contextWindow: 131072, supportsTools: true },
  ],
  glm: [
    { model: "glm-4-flash", inputPer1k: 0, outputPer1k: 0, contextWindow: 128000, supportsTools: true },
  ],
  mock: [
    { model: "mock-1", inputPer1k: 0, outputPer1k: 0, contextWindow: 128000, supportsTools: false },
  ],
};

export function modelInfo(provider: ProviderName, model: string): ModelInfo | undefined {
  return MODEL_CATALOG[provider].find((m) => m.model === model);
}

export function defaultModel(provider: ProviderName): string {
  const first = MODEL_CATALOG[provider][0];
  return first ? first.model : "unknown";
}

export function estimateCostUsd(
  provider: ProviderName,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const info = modelInfo(provider, model);
  if (!info) return 0;
  return (inputTokens / 1000) * info.inputPer1k + (outputTokens / 1000) * info.outputPer1k;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
