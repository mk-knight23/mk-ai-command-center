export type ProviderName = "openai" | "gemini" | "groq" | "anthropic" | "ollama" | "deepseek" | "qwen" | "glm" | "mock";

export type Purpose =
  | "classify"
  | "plan"
  | "execute"
  | "verify"
  | "summarize"
  | "chat";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  messages: ChatMessage[];
  provider?: ProviderName;
  model?: string;
  purpose?: Purpose;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  taskId?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface CompletionResult {
  content: string;
  provider: ProviderName;
  model: string;
  usage: TokenUsage;
  costUsd: number;
  latencyMs: number;
}

export interface ModelInfo {
  model: string;
  inputPer1k: number;
  outputPer1k: number;
  contextWindow: number;
  supportsTools: boolean;
}

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly provider?: ProviderName,
    readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

export class BudgetExceededError extends GatewayError {
  constructor(message: string) {
    super(message, undefined, false);
    this.name = "BudgetExceededError";
  }
}
