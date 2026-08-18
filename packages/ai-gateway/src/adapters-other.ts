import { defaultModel } from "./catalog.js";
import {
  buildResult,
  countRequestTokens,
  fetchWithTimeout,
  type ProviderAdapter,
} from "./provider.js";
import { GatewayError, type CompletionRequest, type CompletionResult } from "./types.js";

export class GeminiAdapter implements ProviderAdapter {
  readonly name = "gemini" as const;

  constructor(
    private apiKey: string | undefined,
    private baseUrl: string = "https://generativelanguage.googleapis.com/v1beta",
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    if (!this.apiKey) throw new GatewayError("Gemini not configured", this.name);
    const model = req.model ?? defaultModel(this.name);
    const startedAt = Date.now();
    const system = req.messages.find((m) => m.role === "system");
    const contents = req.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
    const res = await fetchWithTimeout(
      `${this.baseUrl}/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify({
          contents,
          systemInstruction: system ? { parts: [{ text: system.content }] } : undefined,
          generationConfig: {
            maxOutputTokens: req.maxTokens ?? 2048,
            temperature: req.temperature ?? 0.2,
          },
        }),
      },
      req.timeoutMs ?? 60_000,
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new GatewayError(
        `Gemini error ${res.status}: ${body.slice(0, 300)}`,
        this.name,
        res.status >= 500 || res.status === 429,
      );
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    const content = parts.map((p) => p.text ?? "").join("");
    return buildResult(
      this.name,
      model,
      content,
      json.usageMetadata?.promptTokenCount ?? countRequestTokens(req),
      json.usageMetadata?.candidatesTokenCount ?? 0,
      startedAt,
    );
  }
}

export class AnthropicAdapter implements ProviderAdapter {
  readonly name = "anthropic" as const;

  constructor(
    private apiKey: string | undefined,
    private baseUrl: string = "https://api.anthropic.com/v1",
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    if (!this.apiKey) throw new GatewayError("Anthropic not configured", this.name);
    const model = req.model ?? defaultModel(this.name);
    const startedAt = Date.now();
    const system = req.messages.find((m) => m.role === "system");
    const messages = req.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));
    const res = await fetchWithTimeout(
      `${this.baseUrl}/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: req.maxTokens ?? 2048,
          temperature: req.temperature ?? 0.2,
          system: system?.content,
          messages,
        }),
      },
      req.timeoutMs ?? 90_000,
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new GatewayError(
        `Anthropic error ${res.status}: ${body.slice(0, 300)}`,
        this.name,
        res.status >= 500 || res.status === 429,
      );
    }
    const json = (await res.json()) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const content = (json.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
    return buildResult(
      this.name,
      model,
      content,
      json.usage?.input_tokens ?? countRequestTokens(req),
      json.usage?.output_tokens ?? 0,
      startedAt,
    );
  }
}
