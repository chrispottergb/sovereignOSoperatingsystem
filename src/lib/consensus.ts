import { candidateSchema, providerIds, voteSchema, type Answer, type Candidate, type GenerateInput, type ProviderId, type Turn } from "./contracts";
import { debateLimit } from "./budget";
import { parseAssignments } from "./engine";
const json = (text: string) => JSON.parse(text.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, ""));
const complete = (a?: Answer) => !!a && a.status === "complete" && !!a.text.trim() && !["max_tokens", "max_output_tokens", "length", "incomplete", "pause_turn"].includes(a.finishReason || "");
export const researchComplete = (turn: Turn, id: ProviderId) => complete(turn.answers[id]) && (turn.mode === "demo" || !!turn.answers[id]?.citations.length);
export function canResumeResearch(turn: Turn, now = Date.now()) {
  return !!turn.council && ["error", "cancelled"].includes(turn.council.status) && !turn.rounds?.length && !turn.routing && !turn.lockedAt && now >= turn.createdAt && now - turn.createdAt < 86400000;
}
export function validBallot(turn: Turn, provider: ProviderId) {
  try {
    if (!complete(turn.votes?.[provider]) || !turn.candidate) return false;
    return voteSchema.parse(json(turn.votes![provider]!.text)).candidateId === turn.candidate.id;
  } catch { return false; }
}
export function canResumeVotes(turn: Turn, now = Date.now()) {
  return !!turn.council && ["error", "cancelled"].includes(turn.council.status) && !!turn.candidate && !turn.lockedAt && !turn.arbitration && !turn.audit
    && now >= turn.createdAt && now - turn.createdAt < 86400000 && complete(turn.routing)
    && turn.rounds?.at(-1)?.candidate?.id === turn.candidate.id
    && providerIds.every(id => researchComplete(turn, id) && complete(turn.reviews?.[id]));
}
export function parseCandidate(text: string, id: string): Candidate {
  const proposal = json(text); parseAssignments(text, [...providerIds]);
  return candidateSchema.parse({ id, proposal });
}
export function readBallots(turn: Turn) {
  if (!turn.candidate) throw new Error("Missing proposal");
  return providerIds.map(provider => {
    if (!complete(turn.votes?.[provider])) throw new Error("A vote did not complete");
    const vote = voteSchema.parse(json(turn.votes![provider]!.text));
    if (vote.candidateId !== turn.candidate!.id) throw new Error("Vote refers to a different proposal");
    return { provider, vote };
  });
}
export function unanimous(ballots: ReturnType<typeof readBallots>) {
  return ballots.length === providerIds.length && new Set(ballots.map(b => b.provider)).size === providerIds.length && ballots.every(b => b.vote.decision === "approve" && !b.vote.objections.length && Object.values(b.vote.checks).every(Boolean));
}
export async function runConsensus(options: {
  lead: ProviderId; signal: AbortSignal; read: () => Turn | undefined; patch: (values: Partial<Turn>) => void;
  run: (provider: ProviderId, phase: NonNullable<GenerateInput["reviewPhase"]>) => Promise<void>;
  update: (status: NonNullable<Turn["council"]>["status"], message: string) => void;
  resumeResearch?: boolean;
}) {
  const { lead, signal, read, patch, run, update } = options;
  if (signal.aborted) return;
  const previous = read();
  const retryAt = Math.max(0, ...[...Object.values(previous?.answers || {}), ...Object.values(previous?.votes || {})].map(a => a?.retryAfter || 0));
  if (retryAt > Date.now()) { update("error", `Provider cooldown: wait ${Math.ceil((retryAt - Date.now()) / 1000)} seconds before retrying. Your completed research is preserved.`); return; }
  const resumeVoting = options.resumeResearch && previous && canResumeVotes(previous);
  const reuse = options.resumeResearch && previous && canResumeResearch(previous);
  if (!resumeVoting) {
  const pending = reuse ? providerIds.filter(id => !researchComplete(previous, id)) : [...providerIds];
  patch({ answers: reuse ? previous.answers : {}, reviews: {}, votes: {}, rounds: [], routing: undefined, assignments: undefined, candidate: undefined, ballots: undefined, lockedAt: undefined, synthesis: undefined, botRuns: undefined, arbitration: undefined, audit: undefined, userDecision: undefined });
  update("researching", reuse ? `Retrying ${pending.length} incomplete research request(s). Completed research is preserved; no peer answers are shared during research.` : "Stage 1 of 4: independent research. These are research briefs, not the final plan. Debate, agreement and final synthesis follow only after all six succeed.");
  await Promise.all(pending.map(id => run(id, "research")));
  if (signal.aborted) return;
  const turn = read();
  const missing = providerIds.filter(id => !turn || !researchComplete(turn, id));
  if (missing.length) { update("error", `Research incomplete for ${missing.join(", ")}. Every model needs a complete answer and provider-supplied source links. No debate, lock or final plan was created.`); return; }
  }
  const rounds = debateLimit(read()?.spendingMode);
  const startRound = resumeVoting ? previous!.rounds!.at(-1)!.number : 1;
  for (let round = startRound; round <= rounds; round++) {
    const reuseVotes = resumeVoting && round === startRound;
    let candidate: Candidate;
    if (reuseVotes) candidate = read()!.candidate!;
    else {
    update("reviewing", `Debate round ${round}/${rounds}: challenge evidence, expected outcomes and task fit; respond to earlier objections.`);
    await Promise.all(providerIds.map(id => run(id, "critique")));
    if (signal.aborted) return;
    if (providerIds.some(id => !complete(read()?.reviews?.[id]))) { update("error", "All six critiques are required. Review the failed model before restarting."); return; }
    update("routing", `Round ${round}/${rounds}: preparing a proposal and task assignments for all six models to evaluate.`);
    await run(lead, "routing");
    if (signal.aborted) return;
    try { if (!complete(read()?.routing)) throw new Error(); candidate = parseCandidate(read()!.routing!.text, crypto.randomUUID()); }
    catch { update("error", "The coordinator did not return a complete, valid proposal. No tasks were locked."); return; }
    patch({ candidate, votes: {}, ballots: undefined });
    }
    const voters = reuseVotes ? providerIds.filter(id => !validBallot(read()!, id)) : [...providerIds];
    update("voting", reuseVotes ? `Retrying ${voters.length} invalid vote(s). Research, critiques, exact proposal and valid votes are preserved.` : `Round ${round}/${rounds}: each model independently approves or rejects this exact proposal. All five checks must pass.`);
    await Promise.all(voters.map(id => run(id, "vote")));
    if (signal.aborted) return;
    const latest = read()!;
    patch({ rounds: [...(latest.rounds || []).filter(r => r.number !== round), { number: round, reviews: latest.reviews || {}, routing: latest.routing, candidate, votes: latest.votes || {} }] });
    let ballots;
    try { ballots = readBallots(read()!); }
    catch { update("error", "A vote was missing, incomplete or invalid. No agreement was recorded and no tasks were locked."); return; }
    patch({ ballots });
    if (unanimous(ballots)) {
      patch({ assignments: candidate.proposal, lockedAt: Date.now() });
      update("planning", "All six approved the same proposal with no open objections. Tasks are locked; final synthesis must preserve them.");
      await run(lead, "master");
      if (signal.aborted) return;
      if (complete(read()?.synthesis)) update("complete", "Six-model agreement recorded. Review the locked assignments and suggested bot trigger. Agreement is not proof of effectiveness.");
      else update("error", "Tasks were agreed, but final synthesis failed. Deployment suggestions are disabled. Restart to research and agree again.");
      return;
    }
  }
  update("arbitrating", `No agreement after ${rounds} debate round(s). GPT Astra is reviewing the evidence and objections and proposing a resolution.`);
  await run("openai", "arbitrate");
  if (signal.aborted) return;
  try { if (!complete(read()?.arbitration)) throw new Error(); patch({ candidate: parseCandidate(read()!.arbitration!.text, crypto.randomUUID()) }); }
  catch { update("error", "Astra could not produce a valid resolution. Earlier debate is preserved; tasks remain unlocked."); return; }
  update("auditing", "Claude Fable 5.1 is checking Astra’s exact proposed resolution before your decision.");
  await run("claude", "audit");
  if (signal.aborted) return;
  if (!complete(read()?.audit)) { update("error", "Claude Fable 5.1’s review did not complete. Tasks remain unlocked."); return; }
  update("awaiting_decision", "Astra and Claude Fable 5.1 have reviewed the deadlock. Read their resolution and remaining objections, then approve with a reason or leave it blocked. This is not unanimous agreement.");
}
