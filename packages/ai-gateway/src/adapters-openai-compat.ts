import { defaultModel } from "./catalog.js";
import {
  buildResult,
  countRequestTokens,
  fetchWithTimeout,
  type ProviderAdapter,
} from "./provider.js";
import { GatewayError, type CompletionRequest, type CompletionResult } from "./types.js";

export class OpenAIAdapter implements ProviderAdapter {
  readonly name = "openai" as const;

  constructor(
    private apiKey: string | undefined,
    private baseUrl: string = "https://api.openai.com/v1",
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    if (!this.apiKey) throw new GatewayError("OpenAI not configured", this.name);
    const model = req.model ?? defaultModel(this.name);
    const startedAt = Date.now();
    const res = await fetchWithTimeout(
      `${this.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: req.messages,
          max_tokens: req.maxTokens ?? 2048,
          temperature: req.temperature ?? 0.2,
        }),
      },
      req.timeoutMs ?? 60_000,
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new GatewayError(
        `OpenAI error ${res.status}: ${body.slice(0, 300)}`,
        this.name,
        res.status >= 500 || res.status === 429,
      );
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    return buildResult(
      this.name,
      model,
      content,
      json.usage?.prompt_tokens ?? countRequestTokens(req),
      json.usage?.completion_tokens ?? 0,
      startedAt,
    );
  }
}

export class GroqAdapter implements ProviderAdapter {
  readonly name = "groq" as const;

  constructor(
    private apiKey: string | undefined,
    private baseUrl: string = "https://api.groq.com/openai/v1",
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    if (!this.apiKey) throw new GatewayError("Groq not configured", this.name);
    const model = req.model ?? defaultModel(this.name);
    const startedAt = Date.now();
    const res = await fetchWithTimeout(
      `${this.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: req.messages,
          max_tokens: req.maxTokens ?? 2048,
          temperature: req.temperature ?? 0.2,
        }),
      },
      req.timeoutMs ?? 60_000,
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new GatewayError(
        `Groq error ${res.status}: ${body.slice(0, 300)}`,
        this.name,
        res.status >= 500 || res.status === 429,
      );
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    return buildResult(
      this.name,
      model,
      content,
      json.usage?.prompt_tokens ?? countRequestTokens(req),
      json.usage?.completion_tokens ?? 0,
      startedAt,
    );
  }
}

/**
 * Ollama adapter — free local model, no API key. Uses Ollama's OpenAI-compatible
 * endpoint (http://localhost:11434/v1/chat/completions). Always "configured"
 * so it acts as the zero-cost local brain/fallback.
 */
export class OllamaAdapter implements ProviderAdapter {
  readonly name = "ollama" as const;

  constructor(
    private baseUrl: string = "http://localhost:11434/v1",
    private defaultModel: string = "qwen2.5:3b",
  ) {}

  isConfigured(): boolean {
    return true;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const model = req.model ?? this.defaultModel;
    const startedAt = Date.now();
    const res = await fetchWithTimeout(
      `${this.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          messages: req.messages,
          max_tokens: req.maxTokens ?? 2048,
          temperature: req.temperature ?? 0.2,
        }),
      },
      req.timeoutMs ?? 90_000,
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new GatewayError(
        `Ollama error ${res.status}: ${body.slice(0, 300)}`,
        this.name,
        // Treat model-missing/any 4xx as retryable so the gateway falls through
        // to backup providers (e.g. mock) instead of hard-failing the pipeline.
        res.status >= 400,
      );
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    return buildResult(
      this.name,
      model,
      content,
      json.usage?.prompt_tokens ?? countRequestTokens(req),
      json.usage?.completion_tokens ?? 0,
      startedAt,
    );
  }
}

/**
 * Generic OpenAI-compatible adapter for Chinese open-weight providers
 * (DeepSeek, Qwen/DashScope, Zhipu GLM…). Configured only when a key is set.
 */
export class OpenAICompatCustomAdapter implements ProviderAdapter {
  constructor(
    readonly name: "deepseek" | "qwen" | "glm",
    private apiKey: string | undefined,
    private baseUrl: string,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    if (!this.apiKey) throw new GatewayError(`${this.name} not configured`, this.name);
    const model = req.model ?? defaultModel(this.name);
    const startedAt = Date.now();
    const res = await fetchWithTimeout(
      `${this.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: req.messages,
          max_tokens: req.maxTokens ?? 2048,
          temperature: req.temperature ?? 0.2,
        }),
      },
      req.timeoutMs ?? 60_000,
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new GatewayError(
        `${this.name} error ${res.status}: ${body.slice(0, 300)}`,
        this.name,
        res.status >= 500 || res.status === 429,
      );
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    return buildResult(
      this.name,
      model,
      content,
      json.usage?.prompt_tokens ?? countRequestTokens(req),
      json.usage?.completion_tokens ?? 0,
      startedAt,
    );
  }
}
