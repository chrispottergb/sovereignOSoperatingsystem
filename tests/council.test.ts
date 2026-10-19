import { afterEach, describe, expect, it, vi } from "vitest";
import { generateSchema, providerIds, type Answer, type ProviderId, type Turn } from "@/lib/contracts";
import { defaultEngine, fallbackAssignments, parseAssignments } from "@/lib/engine";
import { reviewCouncil } from "@/lib/council";
import { buildPrompt } from "@/lib/server/prompts";
import { providerConfig } from "@/lib/server/config";
import { adapters } from "@/lib/server/providers";
import { emptyWorkspace, restoreWorkspace } from "@/lib/history";
const answer = (provider: ProviderId): Answer => ({ provider, status: "complete", text: `${provider} answer`, citations: [] });
const input = { provider: "grok" as const, kind: "response" as const, mode: "live" as const, prompt: "Plan a website", history: [], context: { projectName: "Test", notes: "" } };
const source = (provider: ProviderId) => ({ provider, text: `${provider} evidence`, citations: [] });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("Grok integration", () => {
  it("recognizes a top-level OpenAI billing error without returning provider text or secrets", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-secret");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('data: {"type":"error","code":"insufficient_quota","message":"private upstream details"}\n\n', { headers: { "content-type": "text/event-stream" } })));
    let error: unknown;
    try { for await (const event of adapters.openai.stream({ ...input, provider: "openai" }, new AbortController().signal)) void event; } catch (e) { error = e; }
    expect(error).toMatchObject({ code: "PROVIDER_BILLING" }); expect(String(error)).not.toContain("private upstream details"); expect(String(error)).not.toContain("test-secret");
  });
  it("enables native search for each research adapter and uses exact escalation models", async () => {
    for (const provider of ["openai","claude","perplexity","grok"] as const) {
      vi.stubEnv(({ openai: "OPENAI_API_KEY", claude: "ANTHROPIC_API_KEY", perplexity: "PERPLEXITY_API_KEY", grok: "XAI_API_KEY" })[provider], "test-secret");
      const frame = provider === "claude" ? 'data: {"type":"message_stop"}\n\n' : 'data: {"type":"response.completed","response":{}}\n\n';
      const mock = vi.fn().mockImplementation(async () => new Response(frame, { headers: { "content-type": "text/event-stream" } })); vi.stubGlobal("fetch",mock);
      for await (const event of adapters[provider].stream({ ...input, provider, kind: "synthesis", reviewPhase: "research" }, new AbortController().signal)) void event;
      expect(JSON.parse(mock.mock.calls[0][1].body).tools[0].type).toContain("web_search");
      if (provider === "openai" || provider === "claude") {
        for await (const event of adapters[provider].stream({ ...input, provider, kind: "synthesis", reviewPhase: provider === "openai" ? "arbitrate" : "audit" }, new AbortController().signal)) void event;
        expect(JSON.parse(mock.mock.calls[1][1].body).model).toBe(provider === "openai" ? "gpt-6-astra" : "claude-fable-5-1");
      }
    }
  });
  it("streams xAI responses without storing prompts remotely or exposing the key in config", async () => {
    vi.stubEnv("XAI_API_KEY", "test-xai-secret"); vi.stubEnv("XAI_MODEL", "test-grok-model");
    const text = [{ type: "response.output_text.delta", delta: "Grok reply" }, { type: "response.completed", response: { model: "test-grok-model", usage: { input_tokens: 8, output_tokens: 2 } } }].map(e => `data: ${JSON.stringify(e)}\n\n`).join("");
    const mock = vi.fn().mockResolvedValue(new Response(text, { headers: { "content-type": "text/event-stream" } })); vi.stubGlobal("fetch", mock);
    const events = []; for await (const e of adapters.grok.stream(input, new AbortController().signal)) events.push(e);
    expect(mock.mock.calls[0][0]).toBe("https://api.x.ai/v1/responses");
    const init = mock.mock.calls[0][1]; expect(init.headers.Authorization).toBe("Bearer test-xai-secret");
    expect(JSON.parse(init.body)).toMatchObject({ model: "test-grok-model", store: false, stream: true, input: [{ role: "system" }, { role: "user", content: input.prompt }] });
    expect(events).toContainEqual({ type: "delta", text: "Grok reply" }); expect(events.at(-1)?.type).toBe("done");
    expect(providerConfig().find(p => p.id === "grok")).toMatchObject({ configured: true, model: "test-grok-model" });
    expect(JSON.stringify(providerConfig())).not.toContain("test-xai-secret");
  });
  it("reports a missing xAI key without contacting an upstream", async () => {
    vi.stubEnv("XAI_API_KEY", ""); const mock = vi.fn(); vi.stubGlobal("fetch", mock);
    await expect(adapters.grok.stream(input, new AbortController().signal).next()).rejects.toMatchObject({ code: "MISSING_KEY" }); expect(mock).not.toHaveBeenCalled();
  });
});
describe("routing and prompt boundaries", () => {
  it("validates assignments against the selected models exactly", () => {
    const valid = fallbackAssignments(["openai", "grok"], defaultEngine);
    expect(parseAssignments(JSON.stringify(valid), ["openai", "grok"])).toEqual(valid);
    expect(() => parseAssignments(JSON.stringify(valid), ["openai", "claude"])).toThrow();
    expect(() => parseAssignments(JSON.stringify({ ...valid, assignments: [valid.assignments[0], valid.assignments[0]] }), ["openai", "grok"])).toThrow();
  });
  it("accepts all four sources and rejects self-review and duplicate sources", () => {
    const base = { ...input, kind: "synthesis", sources: providerIds.map(source) };
    expect(generateSchema.safeParse(base).success).toBe(true);
    expect(generateSchema.safeParse({ ...base, reviewPhase: "critique" }).success).toBe(false);
    expect(generateSchema.safeParse({ ...base, sources: [source("openai"),source("openai")] }).success).toBe(false);
    expect(generateSchema.safeParse({ ...base, reviewPhase: "master", critiques: [] }).success).toBe(false);
  });
  it("routes without requiring prior answers, but requires selected models", () => {
    expect(generateSchema.safeParse({ ...input, kind: "synthesis", reviewPhase: "routing", participants: ["openai","grok"] }).success).toBe(true);
    expect(generateSchema.safeParse({ ...input, kind: "synthesis", reviewPhase: "routing" }).success).toBe(false);
  });
  it("uses owner skills for responses and separates critiques from evidence", async () => {
    const p = await buildPrompt({ ...input, engine: defaultEngine, assignment: { provider: "grok", role: "Reviewer", task: "Test the weakest assumption" } });
    expect(p.system).toContain("Test the weakest assumption"); expect(p.system).toContain("Assumption challenger bot");
    const m = await buildPrompt({ ...input, kind: "synthesis", reviewPhase: "master", sources: [source("openai")], critiques: [source("grok")] });
    expect(m.system).toContain("Consensus is not proof"); const data = JSON.parse(m.messages[0].content.split("CONTEXT AND EVIDENCE:\n")[1]); expect(data.referenceAnswers[0].provider).toBe("openai"); expect(data.adversarialCritiques[0].provider).toBe("grok");
  });
});
describe("automatic council", () => {
  function setup() {
    const turn: Turn = { id: "t", prompt: "test", createdAt: 1, mode: "demo", context: input.context, answers: { openai: answer("openai"), grok: answer("grok") }, reviews: {} };
    const update = vi.fn(); const controller = new AbortController();
    return { turn, update, controller, options: { participants: ["openai","grok"] as ProviderId[], lead: "openai" as const, signal: controller.signal, read: () => turn, update } };
  }
  it("waits for all critiques before generating the master plan", async () => {
    const { turn, update, options } = setup(); const calls: string[] = [];
    await reviewCouncil({ ...options, run: async (provider, phase) => { calls.push(`${phase}:${provider}`); if (phase === "critique") { await Promise.resolve(); turn.reviews![provider] = answer(provider); } else { expect(Object.keys(turn.reviews!)).toHaveLength(2); turn.synthesis = answer(provider); } } });
    expect(calls).toEqual(["critique:openai","critique:grok","master:openai"]); expect(update).toHaveBeenLastCalledWith("complete", expect.any(String));
  });
  it("never proceeds to master after cancellation", async () => {
    const { options, controller, turn } = setup(); const run = vi.fn(async (provider: ProviderId, phase: "critique" | "master") => { if (phase === "critique") turn.reviews![provider] = answer(provider); controller.abort(); });
    await reviewCouncil({ ...options, run }); expect(run.mock.calls.every(c => c[1] !== "master")).toBe(true);
  });
  it("stops without two completed original answers", async () => {
    const { turn, options, update } = setup(); turn.answers.grok!.status = "error"; const run = vi.fn();
    await reviewCouncil({ ...options, run }); expect(run).not.toHaveBeenCalled(); expect(update).toHaveBeenCalledWith("error", expect.any(String));
  });
  it("reports missing critiques without pretending full agreement", async () => {
    const { turn, options, update } = setup();
    await reviewCouncil({ ...options, run: async (provider, phase) => { if (phase === "master") turn.synthesis = answer(provider); else if (provider === "grok") turn.reviews!.grok = answer("grok"); } });
    expect(update).toHaveBeenLastCalledWith("complete", expect.stringContaining("1 answer or critique"));
  });
  it("preserves prior history and marks interrupted review as cancelled on reload", () => {
    const { turn } = setup(); turn.council = { status: "reviewing", participants: ["openai","grok"], lead: "openai" }; turn.reviews = { grok: { ...answer("grok"), status: "streaming" } };
    const w = emptyWorkspace(); w.engine = defaultEngine; w.conversations.push({ id: "c", projectId: "personal", title: "test", createdAt: 1, updatedAt: 1, turns: [turn] });
    const restored = restoreWorkspace(JSON.stringify(w)); expect(restored.engine).toEqual(defaultEngine); expect(restored.conversations[0].turns[0].council?.status).toBe("cancelled"); expect(restored.conversations[0].turns[0].reviews?.grok?.status).toBe("cancelled"); expect(restored.conversations[0].turns[0].answers.openai?.text).toBe("openai answer");
  });
});
