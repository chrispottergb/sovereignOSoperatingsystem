import { describe, expect, it } from "vitest";
import { generateSchema, providerIds, type Answer, type GenerateInput, type ProviderId, type Turn } from "@/lib/contracts";
import { canResumeResearch, canResumeVotes, runConsensus } from "@/lib/consensus";
import { defaultEngine, fallbackAssignments } from "@/lib/engine";
import { buildPrompt } from "@/lib/server/prompts";
const proposal = { ...fallbackAssignments([...providerIds], defaultEngine), approach: "Test a bounded content experiment", successCriteria: ["Compare against a measured baseline"], risks: ["Metrics must be supplied"] };
const answer = (provider: ProviderId, text = "research"): Answer => ({ provider, text, status: "complete", citations: [{ url: "https://example.com/evidence", title: "Test evidence" }] });
function setup(rejectRounds = 0) {
  const turn: Turn = { spendingMode: "thorough", id: "t", prompt: "Test a content experiment", createdAt: 1, context: { projectName: "test", notes: "" }, mode: "live", answers: {} };
  const controller = new AbortController(); const calls: string[] = [];
  const run = async (provider: ProviderId, phase: NonNullable<GenerateInput["reviewPhase"]>) => {
    calls.push(`${phase}:${provider}`);
    if (phase === "research") turn.answers[provider] = answer(provider);
    if (phase === "critique") turn.reviews = { ...turn.reviews, [provider]: answer(provider, "Challenge unsupported metrics") };
    if (phase === "arbitrate") turn.arbitration = answer(provider, JSON.stringify(proposal));
    if (phase === "audit") turn.audit = answer(provider, "Fable: check unresolved metrics before owner approval");
    if (phase === "routing") turn.routing = answer(provider, JSON.stringify(proposal));
    if (phase === "vote") {
      const reject = provider === "grok" && (turn.rounds?.length || 0) < rejectRounds;
      turn.votes = { ...turn.votes, [provider]: answer(provider, JSON.stringify({ candidateId: turn.candidate!.id, decision: reject ? "revise" : "approve", rationale: "Evidence evaluated", objections: reject ? ["Resolve feasibility"] : [], checks: { evidence: true, feasibility: !reject, impact: true, efficiency: true, taskFit: true } })) };
    }
    if (phase === "master") { expect(turn.lockedAt).toBeDefined(); expect(turn.ballots).toHaveLength(4); turn.synthesis = answer(provider, "Final plan"); }
  };
  const options = { lead: "openai" as const, signal: controller.signal, read: () => turn, patch: (values: Partial<Turn>) => Object.assign(turn, values), update: (status: NonNullable<Turn["council"]>["status"], message: string) => { turn.council = { status, message, participants: [...providerIds], lead: "openai" }; }, run };
  return { turn, controller, calls, options, run };
}
describe("research, debate and agreement gates", () => {
  it("preserves a complete long objection and resumes without regenerating any valid votes", async () => {
    const { turn, calls, options, run } = setup(3); turn.createdAt = Date.now(); turn.spendingMode = "economy";
    await runConsensus({ ...options, run: async (id,phase) => { await run(id,phase); if (phase === "vote" && id === "claude") { const ballot = JSON.parse(turn.votes!.claude!.text); ballot.decision = "revise"; ballot.objections = ["Material dissent. ".repeat(70)]; ballot.checks.evidence = false; turn.votes!.claude!.text = JSON.stringify(ballot); } } });
    expect(turn.council?.status).toBe("awaiting_decision");
    expect(turn.ballots?.find(b => b.provider === "claude")?.vote.objections[0].length).toBeGreaterThan(600);
    turn.arbitration = undefined; turn.audit = undefined; turn.candidate = turn.rounds![0].candidate;
    turn.council!.status = "error"; calls.length = 0;
    await runConsensus({ ...options, resumeResearch: true });
    expect(calls).toEqual(["arbitrate:openai", "audit:claude"]);
  });
  it("retries only invalid votes while preserving the proposal and valid dissent", async () => {
    const { turn, calls, options, run } = setup(3); turn.createdAt = Date.now(); turn.spendingMode = "economy";
    await runConsensus({ ...options, run: async (id,phase) => { await run(id,phase); if (phase === "vote" && ["openai","claude"].includes(id)) turn.votes![id]!.text = '{"decision":"approve"}{"decision":"revise"}'; } });
    expect(canResumeVotes(turn)).toBe(true);
    const dissent = turn.votes!.grok!.text;
    const sources = JSON.stringify(turn.answers); calls.length = 0;
    await runConsensus({ ...options, resumeResearch: true });
    expect(calls).toEqual(["vote:openai", "vote:claude", "arbitrate:openai", "audit:claude"]);
    expect(turn.votes!.grok!.text).toBe(dissent); expect(JSON.stringify(turn.answers)).toBe(sources); expect(turn.rounds).toHaveLength(1);
    expect(turn.council?.status).toBe("awaiting_decision"); expect(turn.lockedAt).toBeUndefined();
    expect(canResumeVotes(turn)).toBe(false);
  });
  it("defaults to one round and preserves the Astra then Fable escalation order", async () => {
    const { turn, calls, options } = setup(3); turn.spendingMode = undefined; await runConsensus(options);
    expect(turn.rounds).toHaveLength(1); expect(calls).toHaveLength(15); expect(calls.slice(-2)).toEqual(["arbitrate:openai", "audit:claude"]); expect(turn.lockedAt).toBeUndefined(); expect(turn.council?.status).toBe("awaiting_decision");
  });
  it("does not call providers during their reported research cooldown", async () => {
    const { turn, calls, options } = setup();
    turn.answers.openai = { ...answer("openai"), status: "error", retryAfter: Date.now() + 60000 };
    await runConsensus({ ...options, resumeResearch: true });
    expect(calls).toHaveLength(0); expect(turn.council?.message).toContain("cooldown"); expect(turn.answers.openai.text).toBe("research");
  });
  it("resumes only incomplete research and retains the other three reports", async () => {
    const { turn, calls, options } = setup();
    turn.createdAt = Date.now(); turn.council = { status: "error", lead: "openai", participants: [...providerIds] };
    turn.answers = { openai: { ...answer("openai"), status: "error" }, claude: answer("claude", "saved Claude research"), grok: answer("grok"), perplexity: answer("perplexity") };
    await runConsensus({ ...options, resumeResearch: true });
    expect(calls.filter(c => c.startsWith("research:"))).toEqual(["research:openai"]);
    expect(turn.answers.claude?.text).toBe("saved Claude research"); expect(turn.council?.status).toBe("complete");
  });
  it("does not reuse old research or ordinary independent responses", async () => {
    const { turn, calls, options } = setup(); turn.createdAt = Date.now() - 86400001;
    turn.council = { status: "error", lead: "openai", participants: [...providerIds] };
    for (const id of providerIds) turn.answers[id] = answer(id);
    expect(canResumeResearch(turn)).toBe(false);
    await runConsensus({ ...options, resumeResearch: true });
    expect(calls.filter(c => c.startsWith("research:"))).toHaveLength(4);
    turn.createdAt = Date.now(); turn.council = undefined; expect(canResumeResearch(turn)).toBe(false);
  });
  it("requires four independent research calls before debate, four approvals before lock, then synthesis", async () => {
    const { turn, calls, options } = setup(); await runConsensus(options);
    expect(calls.slice(0,4)).toEqual(providerIds.map(p => `research:${p}`));
    expect(calls.slice(4,8)).toEqual(providerIds.map(p => `critique:${p}`));
    expect(calls.slice(9,13)).toEqual(providerIds.map(p => `vote:${p}`));
    expect(calls.at(-1)).toBe("master:openai"); expect(calls).toHaveLength(14);
    expect(turn.council?.status).toBe("complete"); expect(turn.assignments).toEqual(proposal); expect(turn.rounds).toHaveLength(1);
  });
  it("stops if one research provider fails or lacks provider-supplied citations", async () => {
    for (const failure of ["error", "no-citations", "truncated"]) {
      const { turn, calls, options, run } = setup();
      await runConsensus({ ...options, run: async (id, phase) => { await run(id,phase); if (id === "grok") { if (failure === "error") turn.answers.grok!.status = "error"; if (failure === "no-citations") turn.answers.grok!.citations = []; if (failure === "truncated") turn.answers.grok!.finishReason = "max_output_tokens"; } } });
      expect(calls).toHaveLength(4); expect(turn.council?.status).toBe("error"); expect(turn.lockedAt).toBeUndefined();
    }
  });
  it("revises a rejected proposal and preserves the debate and exact proposal votes", async () => {
    const { turn, options } = setup(1); await runConsensus(options);
    expect(turn.rounds).toHaveLength(2); expect(turn.rounds![0].candidate?.id).not.toBe(turn.rounds![1].candidate?.id);
    expect(turn.rounds![0].votes.grok?.text).toContain("revise"); expect(turn.council?.status).toBe("complete");
  });
  it("never fabricates agreement after the three-round limit", async () => {
    const { turn, calls, options } = setup(3); await runConsensus(options);
    expect(turn.rounds).toHaveLength(3); expect(calls).toHaveLength(33); expect(calls.slice(-2)).toEqual(["arbitrate:openai", "audit:claude"]); expect(turn.council?.status).toBe("awaiting_decision");
    expect(turn.lockedAt).toBeUndefined(); expect(turn.synthesis).toBeUndefined(); expect(turn.assignments).toBeUndefined();
  });
  it("rejects stale votes and malformed output", async () => {
    for (const text of ['{"candidateId":"stale"}', "I approve"]) {
      const { turn, options, run } = setup(); await runConsensus({ ...options, run: async (id,phase) => { await run(id,phase); if (phase === "vote" && id === "grok") turn.votes!.grok!.text = text; } });
      expect(turn.council?.status).toBe("error"); expect(turn.lockedAt).toBeUndefined();
    }
  });
  it("does not synthesize or lock after cancellation while voting", async () => {
    const { turn, options, controller, run, calls } = setup();
    await runConsensus({ ...options, run: async (id,phase) => { await run(id,phase); if (phase === "vote") controller.abort(); } });
    expect(turn.lockedAt).toBeUndefined(); expect(calls.some(c => c.startsWith("master"))).toBe(false);
  });
  it("requires exact unanimous ballots at the server for master and task execution", async () => {
    const { turn, options } = setup(); await runConsensus(options);
    const input = { provider: "grok", mode: "live", kind: "synthesis", prompt: turn.prompt, context: turn.context, sources: Object.values(turn.answers), critiques: Object.values(turn.reviews!), candidate: turn.candidate, ballots: turn.ballots };
    for (const reviewPhase of ["master", "execute"]) {
      expect(generateSchema.safeParse({ ...input, reviewPhase }).success).toBe(true);
      expect(generateSchema.safeParse({ ...input, reviewPhase, ballots: turn.ballots!.slice(0,3) }).success).toBe(false);
      expect(generateSchema.safeParse({ ...input, reviewPhase, candidate: { ...turn.candidate, id: "changed" } }).success).toBe(false);
    }
  });
  it("keeps independent answers focused on the request without forcing a domain", async () => {
    const p = await buildPrompt({ provider: "grok", mode: "live", kind: "synthesis", reviewPhase: "research", prompt: "content", context: { projectName: "test", notes: "" }, history: [], sources: [{ provider: "claude", text: "peer secret answer", citations: [] }] });
    expect(JSON.stringify(p)).not.toContain("peer secret answer"); expect(p.messages[0].content).not.toContain("Instagram"); expect(p.system).toContain("only when current external facts are needed");
  });
  it("permits an explicit owner decision only for the reviewed candidate and with both advisor records", async () => {
    const { turn, options } = setup(3); await runConsensus(options);
    const input = { provider: "openai", mode: "live", kind: "synthesis", reviewPhase: "master", prompt: turn.prompt, context: turn.context, sources: Object.values(turn.answers), critiques: Object.values(turn.reviews!), candidate: turn.candidate, ballots: turn.ballots, userDecision: { candidateId: turn.candidate!.id, rationale: "Accept a bounded experiment with the documented gaps", decidedAt: 1 }, advisorReviews: [turn.arbitration,turn.audit] };
    expect(generateSchema.safeParse(input).success).toBe(true);
    expect(generateSchema.safeParse({ ...input, userDecision: undefined }).success).toBe(false);
    expect(generateSchema.safeParse({ ...input, advisorReviews: [turn.arbitration] }).success).toBe(false);
    expect(generateSchema.safeParse({ ...input, candidate: { ...turn.candidate, id: "different" } }).success).toBe(false);
  });
});

