import { MockAdapter } from "./adapter-mock.js";
import { GeminiAdapter, AnthropicAdapter } from "./adapters-other.js";
import {
  GroqAdapter,
  OpenAIAdapter,
  OllamaAdapter,
  OpenAICompatCustomAdapter,
} from "./adapters-openai-compat.js";
import { CircuitBreaker } from "./circuit-breaker.js";
import { redactSecrets, type ProviderAdapter } from "./provider.js";
import {
  BudgetExceededError,
  GatewayError,
  type CompletionRequest,
  type CompletionResult,
  type ProviderName,
} from "./types.js";

export interface GatewayOptions {
  openaiApiKey?: string;
  geminiApiKey?: string;
  groqApiKey?: string;
  anthropicApiKey?: string;
  // --- Local (Ollama) + Chinese open-weight providers ---
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  deepseekApiKey?: string;
  qwenApiKey?: string;
  glmApiKey?: string;
  defaultProvider?: ProviderName;
  fallbackChain?: ProviderName[];
  budgetCheck?: (estimatedUsd: number) => boolean;
  onResult?: (result: CompletionResult, req: CompletionRequest) => void;
}

export class AiGateway {
  private adapters = new Map<ProviderName, ProviderAdapter>();
  private breakers = new Map<ProviderName, CircuitBreaker>();
  private defaultProvider: ProviderName;
  private fallbackChain: ProviderName[];

  constructor(private opts: GatewayOptions = {}) {
    const register = (adapter: ProviderAdapter) => {
      this.adapters.set(adapter.name, adapter);
      this.breakers.set(adapter.name, new CircuitBreaker());
    };
    register(new OpenAIAdapter(opts.openaiApiKey));
    register(new GeminiAdapter(opts.geminiApiKey));
    register(new GroqAdapter(opts.groqApiKey));
    register(new AnthropicAdapter(opts.anthropicApiKey));
    register(new OllamaAdapter(opts.ollamaBaseUrl, opts.ollamaModel));
    register(new OpenAICompatCustomAdapter("deepseek", opts.deepseekApiKey, "https://api.deepseek.com/v1"));
    register(new OpenAICompatCustomAdapter("qwen", opts.qwenApiKey, "https://dashscope.aliyuncs.com/compatible-mode/v1"));
    register(new OpenAICompatCustomAdapter("glm", opts.glmApiKey, "https://open.bigmodel.cn/api/paas/v4"));
    register(new MockAdapter());
    this.defaultProvider = opts.defaultProvider ?? "mock";
    this.fallbackChain = opts.fallbackChain ?? [
      "ollama",
      "openai",
      "gemini",
      "groq",
      "anthropic",
      "deepseek",
      "qwen",
      "glm",
      "mock",
    ];
  }

  configuredProviders(): ProviderName[] {
    return [...this.adapters.entries()]
      .filter(([, a]) => a.isConfigured())
      .map(([name]) => name);
  }

  providerHealth(): { provider: ProviderName; configured: boolean; circuit: string }[] {
    return [...this.adapters.entries()].map(([name, adapter]) => ({
      provider: name,
      configured: adapter.isConfigured(),
      circuit: this.breakers.get(name)?.currentState ?? "closed",
    }));
  }

  private candidateOrder(req: CompletionRequest): ProviderName[] {
    const preferred = req.provider ?? this.defaultProvider;
    const order: ProviderName[] = [preferred];
    for (const p of this.fallbackChain) {
      if (!order.includes(p)) order.push(p);
    }
    return order;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const budgetOk = this.opts.budgetCheck?.(0.05) ?? true;
    if (!budgetOk) {
      throw new BudgetExceededError("AI budget exceeded; request blocked before provider call");
    }

    const sanitized: CompletionRequest = {
      ...req,
      messages: req.messages.map((m) => ({ ...m, content: redactSecrets(m.content) })),
    };

    const errors: string[] = [];
    for (const providerName of this.candidateOrder(sanitized)) {
      const adapter = this.adapters.get(providerName);
      const breaker = this.breakers.get(providerName);
      if (!adapter || !breaker) continue;
      if (!adapter.isConfigured()) continue;
      if (!breaker.allowRequest()) {
        errors.push(`${providerName}: circuit open`);
        continue;
      }
      try {
        const result = await adapter.complete(sanitized);
        breaker.recordSuccess();
        this.opts.onResult?.(result, sanitized);
        return result;
      } catch (error) {
        breaker.recordFailure();
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${providerName}: ${message}`);
        const retryable = error instanceof GatewayError ? error.retryable : true;
        if (!retryable && providerName === (sanitized.provider ?? this.defaultProvider)) {
          throw new GatewayError(message, providerName, false);
        }
      }
    }
    throw new GatewayError(`All providers failed: ${errors.join(" | ")}`, undefined, true);
  }
}
