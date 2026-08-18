import { afterEach, describe, expect, it, vi } from "vitest";
import { AiGateway } from "../src/gateway.js";
import { BudgetExceededError, GatewayError } from "../src/types.js";
import { estimateCostUsd, estimateTokens } from "../src/catalog.js";
import { redactSecrets } from "../src/provider.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mock provider routing", () => {
  it("uses mock provider offline and is deterministic", async () => {
    const gw = new AiGateway({ defaultProvider: "mock" });
    const req = { messages: [{ role: "user" as const, content: "hello world" }] };
    const a = await gw.complete(req);
    const b = await gw.complete(req);
    expect(a.provider).toBe("mock");
    expect(a.content).toBe(b.content);
    expect(a.costUsd).toBe(0);
  });

  it("reports configured providers only", () => {
    const gw = new AiGateway({ openaiApiKey: "sk-test-1234567890abcdef" });
    const configured = gw.configuredProviders();
    expect(configured).toContain("openai");
    expect(configured).toContain("mock");
    expect(configured).not.toContain("anthropic");
  });
});

describe("fallback behavior", () => {
  it("falls back to mock when preferred provider errors", async () => {
    const fetchMock = vi.fn(async () => new Response("boom", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const gw = new AiGateway({
      openaiApiKey: "sk-test-1234567890abcdef",
      defaultProvider: "openai",
    });
    const res = await gw.complete({
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.provider).toBe("mock");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("throws GatewayError when nothing can serve", async () => {
    const gw = new AiGateway({
      defaultProvider: "anthropic",
      fallbackChain: ["anthropic"],
    });
    await expect(
      gw.complete({ messages: [{ role: "user", content: "hi" }], provider: "anthropic" }),
    ).rejects.toThrow(GatewayError);
  });
});

describe("budget gate", () => {
  it("blocks requests when budget check fails", async () => {
    const gw = new AiGateway({
      defaultProvider: "mock",
      budgetCheck: () => false,
    });
    await expect(
      gw.complete({ messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow(BudgetExceededError);
  });
});

describe("cost and redaction helpers", () => {
  it("estimates cost from token counts", () => {
    const cost = estimateCostUsd("openai", "gpt-4o-mini", 1000, 1000);
    expect(cost).toBeCloseTo(0.00015 + 0.0006, 8);
  });

  it("estimates tokens from text length", () => {
    expect(estimateTokens("abcdabcd")).toBe(2);
  });

  it("redacts common secret shapes", () => {
    const text =
      "key sk-abcdefghijklmnop1234 and token ghp_abcdefghij1234567890 and jwt eyJabcdefghij1234567890.eyJabcdefghij1234567890.sig1234567";
    const out = redactSecrets(text);
    expect(out).not.toContain("sk-abcdefghijklmnop1234");
    expect(out).not.toContain("ghp_abcdefghij1234567890");
    expect(out).toContain("[REDACTED]");
  });
});
