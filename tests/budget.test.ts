import { afterEach, describe, expect, it, vi } from "vitest";
import { compactEvidence, outputLimit } from "@/lib/budget";
import { requestPolicy } from "@/lib/server/budget";
import { adapters, normalizeUsage } from "@/lib/server/providers";
import { buildPrompt } from "@/lib/server/prompts";
import { outputFormat } from "@/lib/server/output-format";
import { restoreWorkspace, emptyWorkspace } from "@/lib/history";
import type { GenerateInput } from "@/lib/contracts";
const input: GenerateInput = { provider: "openai", mode: "live", kind: "synthesis", reviewPhase: "research", prompt: "Test campaign", context: { projectName: "Test", notes: "" }, history: [] };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("API spending policy", () => {
  it("requires a single schema-constrained vote on the two providers that emitted invalid votes", () => {
    const openai = outputFormat({ ...input, reviewPhase: "vote" });
    expect(openai.text?.format).toMatchObject({ type: "json_schema", strict: true, schema: { additionalProperties: false } });
    const claude = outputFormat({ ...input, provider: "claude", reviewPhase: "vote" });
    expect(claude.output_config?.format).toMatchObject({ type: "json_schema", schema: { required: ["candidateId", "decision", "rationale", "objections", "checks"] } });
    expect(outputFormat(input)).toEqual({});
  });
  it("rejects oversized context before spending on a provider request", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only-key"); const mock = vi.fn(); vi.stubGlobal("fetch", mock);
    await expect((async () => { for await (const e of adapters.openai.stream({ ...input, prompt: "x".repeat(80000) }, new AbortController().signal)) void e; })()).rejects.toMatchObject({ code: "CONTEXT_BUDGET" });
    expect(mock).not.toHaveBeenCalled();
  });
  it("routes routine work economically and reserves named premium reviewers", () => {
    expect(requestPolicy(input).model).toBe("gpt-6-luna");
    expect(requestPolicy({ ...input, reviewPhase: "master" }).model).toBe("gpt-6.1-sol");
    expect(requestPolicy({ ...input, provider: "claude", reviewPhase: "vote" }).model).toBe("claude-haiku-4-5");
    expect(requestPolicy({ ...input, reviewPhase: "arbitrate" }).model).toBe("gpt-6-astra");
    expect(requestPolicy({ ...input, provider: "claude", reviewPhase: "audit" }).model).toBe("claude-fable-5-1");
    expect(requestPolicy({ ...input, provider: "grok" }).reasoning).toEqual({ effort: "low" });
    expect(outputLimit({ ...input, reviewPhase: "vote" })).toBeLessThan(outputLimit({ ...input, reviewPhase: "master" }));
    vi.stubEnv("MAX_OUTPUT_TOKENS", "900"); expect(requestPolicy(input).maxTokens).toBe(900);
  });
  it("labels excerpts and retains exact candidate, dissent and owner decisions", async () => {
    const sources = [{ provider: "claude" as const, text: "Start evidence. " + "x".repeat(14000) + "Final risk.", citations: [] }];
    const compact = compactEvidence(sources)!;
    expect(compact[0].text.length).toBeLessThanOrEqual(6000); expect(compact[0].abridged).toBe(true);
    expect(compact[0].text).toContain("Start evidence"); expect(compact[0].text).toContain("Final risk"); expect(compact[0].text).toContain("Middle omitted");
    const prompt = await buildPrompt({ ...input, reviewPhase: "critique", sources, critiques: [{ provider: "grok", text: "Material objection must survive intact.", citations: [] }] });
    expect(prompt.messages[0].content).toContain("Material objection must survive intact.");
    expect(prompt.system).toContain("raise an objection instead of approving");
    expect(sources[0].text.length).toBeGreaterThan(14000);
  });
  it("disables paid search during Perplexity review without inheriting a preset", async () => {
    vi.stubEnv("PERPLEXITY_API_KEY", "test-only-key");
    const mock = vi.fn().mockResolvedValue(new Response('data: {"type":"response.completed","response":{}}\n\n', { headers: { "content-type": "text/event-stream" } })); vi.stubGlobal("fetch", mock);
    for await (const event of adapters.perplexity.stream({ ...input, provider: "perplexity", reviewPhase: "critique" }, new AbortController().signal)) void event;
    const body = JSON.parse(mock.mock.calls[0][1].body);
    expect(body.preset).toBeUndefined(); expect(body.tools).toEqual([]); expect(body.max_steps).toBe(1); expect(body.max_output_tokens).toBe(1200);
  });
  it("caps native research calls and avoids automatic model fallback", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only-key");
    const mock = vi.fn().mockResolvedValue(new Response('data: {"type":"response.completed","response":{}}\n\n', { headers: { "content-type": "text/event-stream" } })); vi.stubGlobal("fetch", mock);
    for await (const event of adapters.openai.stream(input, new AbortController().signal)) void event;
    const body = JSON.parse(mock.mock.calls[0][1].body);
    expect(body.model).toBe("gpt-6-luna"); expect(body.max_tool_calls).toBe(2); expect(body.reasoning).toEqual({ effort: "none" }); expect(mock).toHaveBeenCalledTimes(1);
  });
  it("retains failed request usage and counts Claude cache tokens exactly once", async () => {
    expect(normalizeUsage({ input_tokens: 5, cache_read_input_tokens: 10, cache_creation_input_tokens: 20, output_tokens: 3 })).toMatchObject({ inputTokens: 35, cachedTokens: 10, outputTokens: 3 });
    vi.stubEnv("OPENAI_API_KEY", "test-only-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('data: {"type":"response.failed","response":{"usage":{"input_tokens":12,"output_tokens":4},"error":{"code":"rate_limit_exceeded"}}}\n\n', { headers: { "content-type": "text/event-stream" } })));
    const events = []; try { for await (const e of adapters.openai.stream(input, new AbortController().signal)) events.push(e); } catch { /* Expected rate limit. */ }
    expect(events).toContainEqual({ type: "usage", usage: { inputTokens: 12, outputTokens: 4 } });
    const w = emptyWorkspace(); w.conversations.push({ id: "c", projectId: "personal", title: "Test", createdAt: 1, updatedAt: 1, turns: [{ ...input, revisions:undefined, id: "t", createdAt: 1, answers: {}, attempts: [{ id: "a", provider: "openai", phase: "research", startedAt: 1, status: "error", usage: { inputTokens: 12, outputTokens: 4 } }] }] });
    expect(restoreWorkspace(JSON.stringify(w)).conversations[0].turns[0].attempts?.[0].usage?.inputTokens).toBe(12);
  });
});

it('enforces the specialist plan schema even when an exact orchestration prompt is supplied',async()=>{
 vi.stubEnv('OPENAI_API_KEY','test-only-key');const {symbiosisJsonSchema}=await import('../src/lib/symbiosis');
 const mock=vi.fn().mockResolvedValue(new Response('data: {"type":"response.completed","response":{}}\n\n',{headers:{'content-type':'text/event-stream'}}));vi.stubGlobal('fetch',mock);
 for await(const event of adapters.openai.stream({...input,reviewPhase:'routing',exactPrompt:'Build a task plan',responseSchema:symbiosisJsonSchema},new AbortController().signal))void event;
 const body=JSON.parse(mock.mock.calls[0][1].body);expect(body.text.format).toMatchObject({name:'specialist_plan',strict:true,schema:{additionalProperties:false,required:['objective','assignments','muse','grokbot','checks','limitations']}});expect(body.tools).toBeUndefined();
});
