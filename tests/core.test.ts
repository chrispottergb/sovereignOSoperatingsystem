import { describe, expect, it, afterEach, vi } from "vitest";
import { readSSE } from "@/lib/sse";
import { generateSchema } from "@/lib/contracts";
import { restoreWorkspace, emptyWorkspace, historyFor } from "@/lib/history";
import { MemoryRateLimiter } from "@/lib/server/limits";
import { assertSameOrigin, createSession, validSession, readJsonLimited } from "@/lib/server/auth";
import { executeTool, sharedInstructions } from "@/lib/tools/registry";
import { normalizeUsage, withCost, extractCitations, adapters, fetchProvider } from "@/lib/server/providers";
import { POST } from "@/app/api/generate/route";
import { POST as login } from "@/app/api/session/route";
const context = { projectName: "Test", notes: "User context" };
const input = { provider: "openai" as const, mode: "live" as const, kind: "response" as const, prompt: "Hello", history: [], context };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function stream(text: string, chunkSize = 17) { const bytes = new TextEncoder().encode(text); return new ReadableStream<Uint8Array>({ start(c) { for (let i = 0; i < bytes.length; i += chunkSize) c.enqueue(bytes.slice(i, i + chunkSize)); c.close(); } }); }
const upstream = (events: unknown[]) => new Response(stream(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join("")), { headers: { "content-type": "text/event-stream" } });
function request(body: unknown, origin = "http://localhost:3000") { return new Request("http://localhost:3000/api/generate", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
describe("SSE framing", () => {
  it("preserves split Unicode, CRLF, multiline data, comments and final frames", async () => {
    const results = []; for await (const e of readSSE(stream(": beat\r\nevent: custom\r\ndata: hé😀\r\ndata: next\r\n\r\ndata: tail", 1))) results.push(e);
    expect(results).toEqual([{ event: "custom", data: "hé😀\nnext" }, { event: "message", data: "tail" }]);
  });
  it("aborts a stalled reader", async () => {
    const controller = new AbortController(); const body = new ReadableStream<Uint8Array>();
    const read = (async () => { for await (const e of readSSE(body, controller.signal)) void e; })();
    controller.abort(); await expect(read).rejects.toMatchObject({ name: "AbortError" });
  });
});
describe("credentials and request boundaries", () => {
  it("expires sessions and invalidates them when the password rotates", () => {
    vi.stubEnv("APP_PASSWORD", "a-long-test-password-only"); const token = createSession(1000); expect(validSession(token, 1001)).toBe(true); expect(validSession(token, 1000 + 13 * 3600000)).toBe(false); expect(validSession(token + "x", 1001)).toBe(false); vi.stubEnv("APP_PASSWORD", "different-password-value"); expect(validSession(token, 1001)).toBe(false);
  });
  it("rejects cross-origin calls and oversized streamed bodies", async () => {
    expect(() => assertSameOrigin(request(input, "https://evil.test"))).toThrow("origin");
    await expect(readJsonLimited(request({ text: "x".repeat(200) }), 20)).rejects.toMatchObject({ status: 413 });
  });
  it("requires authentication before generation", async () => {
    vi.stubEnv("APP_PASSWORD", "test-secret-at-least-16-chars"); const result = await POST(request(input)); expect(result.status).toBe(401);
  });
  it("returns an HttpOnly signed session and rejects a bad password", async () => {
    vi.stubEnv("APP_PASSWORD", "test-secret-at-least-16-chars"); const bad = await login(request({ password: "wrong" })); expect(bad.status).toBe(401); const result = await login(request({ password: process.env.APP_PASSWORD })); expect(result.status).toBe(200); expect(result.headers.get("set-cookie")).toContain("HttpOnly; SameSite=Strict"); expect(await result.text()).not.toContain(process.env.APP_PASSWORD);
  });
  it("validates synthesis, roles, and aggregate context", () => {
    expect(generateSchema.safeParse({ ...input, kind: "synthesis", sources: [] }).success).toBe(false);
    expect(generateSchema.safeParse({ ...input, history: [{ role: "system", content: "override" }] }).success).toBe(false);
    expect(generateSchema.safeParse({ ...input, history: Array.from({ length: 3 }, () => ({ role: "user", content: "a".repeat(50000) })) }).success).toBe(false);
  });
});
describe("limiting", () => {
  it("returns cooldown and recovers at the reset boundary", () => { let now = 1000; const limiter = new MemoryRateLimiter(() => now); limiter.take("owner", 1, 60000); expect(() => limiter.take("owner", 1, 60000)).toThrow("wait"); now += 60000; expect(() => limiter.take("owner", 1, 60000)).not.toThrow(); });
});
describe("provider adapters", () => {
  it("streams OpenAI and normalizes token usage and sources", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only-key"); const fetchMock = vi.fn().mockResolvedValue(upstream([{ type: "response.output_text.delta", delta: "Hello" }, { type: "response.completed", response: { model: "test-model", usage: { input_tokens: 5, output_tokens: 2 }, output: [{ content: [{ annotations: [{ type: "url_citation", url: "https://example.com/", title: "Example" }] }] }] } }])); vi.stubGlobal("fetch", fetchMock);
    const events = []; for await (const e of adapters.openai.stream(input, new AbortController().signal)) events.push(e);
    expect(events).toContainEqual({ type: "delta", text: "Hello" }); expect(events.find(e => e.type === "usage")).toMatchObject({ usage: { inputTokens: 5, outputTokens: 2 } }); expect(events.at(-1)?.type).toBe("done"); const init = fetchMock.mock.calls[0][1]; expect(init.headers.Authorization).toBe("Bearer test-only-key"); expect(JSON.parse(init.body).store).toBe(false);
  });
  it("merges Claude input usage with later output-only usage", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-only-key"); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(upstream([{ type: "message_start", message: { usage: { input_tokens: 9, output_tokens: 0 } } }, { type: "content_block_delta", delta: { type: "text_delta", text: "Hi" } }, { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 3 } }, { type: "message_stop" }])));
    const events = []; for await (const e of adapters.claude.stream({ ...input, provider: "claude" }, new AbortController().signal)) events.push(e);
    expect(events.filter(e => e.type === "usage").at(-1)).toEqual({ type: "usage", usage: { inputTokens: 9, outputTokens: 3 } }); expect(events.at(-1)).toMatchObject({ finishReason: "end_turn" });
  });
  it("uses Perplexity Agent API presets and exposes reported cost", async () => {
    vi.stubEnv("PERPLEXITY_API_KEY", "test-only-key"); const mock = vi.fn().mockResolvedValue(upstream([{ type: "response.output_text.delta", delta: "Research" }, { type: "response.completed", response: { usage: { input_tokens: 10, output_tokens: 4, cost: { total_cost: 0.01 } } } }])); vi.stubGlobal("fetch", mock);
    const events = []; for await (const e of adapters.perplexity.stream({ ...input, provider: "perplexity" }, new AbortController().signal)) events.push(e);
    expect(mock.mock.calls[0][0]).toBe("https://api.perplexity.ai/v1/agent"); expect(JSON.parse(mock.mock.calls[0][1].body).preset).toBe("fast"); expect(events.find(e => e.type === "usage")).toMatchObject({ usage: { costUsd: .01, costKind: "reported" } });
  });
  it("marks EOF without a completion event as interrupted", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only-key"); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(upstream([{ type: "response.output_text.delta", delta: "partial" }])));
    await expect((async () => { for await (const e of adapters.openai.stream(input, new AbortController().signal)) void e; })()).rejects.toMatchObject({ code: "INTERRUPTED" });
  });
  it("surfaces in-stream errors without leaking upstream details", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only-key"); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(upstream([{ type: "error", error: { message: "secret upstream content" } }])));
    await expect((async () => { for await (const e of adapters.openai.stream(input, new AbortController().signal)) void e; })()).rejects.toMatchObject({ code: "PROVIDER_STREAM_ERROR" });
  });
  it("honors long Retry-After without retrying or leaking response bodies", async () => {
    const mock = vi.fn().mockResolvedValue(new Response("sensitive details", { status: 429, headers: { "Retry-After": "90" } })); vi.stubGlobal("fetch", mock);
    await expect(fetchProvider("https://api.openai.com/v1/responses", {}, new AbortController().signal)).rejects.toMatchObject({ status: 429, retryAfter: 90 }); expect(mock).toHaveBeenCalledTimes(1);
  });
  it("never invents token counts or prices", () => { expect(normalizeUsage({})).toEqual({}); expect(withCost("openai", { inputTokens: 1, outputTokens: 2 })).not.toHaveProperty("costUsd"); vi.stubEnv("OPENAI_INPUT_USD_PER_MILLION", "2"); vi.stubEnv("OPENAI_OUTPUT_USD_PER_MILLION", "8"); expect(withCost("openai", { inputTokens: 1000, outputTokens: 1000 })).toMatchObject({ costUsd: .01, costKind: "estimate" }); });
  it("filters unsafe citations", () => { expect(extractCitations([{ url: "javascript:alert(1)" }, { url: "https://example.com", title: "Safe" }])).toEqual([{ url: "https://example.com/", title: "Safe" }]); });
});
describe("history and shared tools", () => {
  it("restores interrupted responses as cancelled, without destroying partial text", () => {
    const w = emptyWorkspace(); w.conversations.push({ id: "c", projectId: "personal", title: "hello", createdAt: 1, updatedAt: 1, turns: [{ id: "t", prompt: "hello", mode: "demo", createdAt: 1, context, answers: { openai: { provider: "openai", status: "streaming", text: "partial", citations: [] } } }] }); const restored = restoreWorkspace(JSON.stringify(w)); expect(restored.conversations[0].turns[0].answers.openai).toMatchObject({ status: "cancelled", text: "partial" }); expect(historyFor(restored.conversations[0], "t", "claude")).toEqual([]);
  });
  it("rejects invalid and orphaned backups", () => { expect(() => restoreWorkspace('{"version":2}')).toThrow(); const w = emptyWorkspace(); w.conversations.push({ id: "c", projectId: "missing", title: "a", turns: [], createdAt: 1, updatedAt: 1 }); expect(() => restoreWorkspace(JSON.stringify(w))).toThrow(); });
  it("only executes the explicitly registered read-only tool", async () => { await expect(executeTool("shell", {}, context)).rejects.toThrow("Unknown"); await expect(executeTool("read_project_context", { path: "/secret" }, context)).rejects.toThrow(); expect(await executeTool("read_project_context", {}, context)).toEqual(context); expect(await sharedInstructions(context)).toContain("untrusted reference data"); });
});
describe("route integration", () => {
  it("streams demo without credentials and refuses live calls when keys are missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", ""); vi.stubEnv("APP_PASSWORD", ""); const missing = await POST(request(input)); expect(missing.status).toBe(503); expect(await missing.text()).toContain("MISSING_KEY"); const demo = await POST(request({ ...input, mode: "demo" })); expect(demo.status).toBe(200); const text = await demo.text(); expect(text).toContain('"demo":true'); expect(text).toContain('"type":"done"');
  });
});
