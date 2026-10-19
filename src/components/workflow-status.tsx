"use client";
import { useEffect, useState } from "react";
import { providerIds, type Turn } from "@/lib/contracts";
import { councilActive } from "@/lib/council";
import { canResumeResearch, canResumeVotes, researchComplete } from "@/lib/consensus";
export function WorkflowStatus({ turn, busy, onStop, onRetry }: { turn: Turn; busy: boolean; onStop: () => void; onRetry: (reuse: boolean) => void }) {
  const retryAt = Math.max(0, ...[...Object.values(turn.answers), ...Object.values(turn.votes || {})].map(a => a?.retryAfter || 0));
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (retryAt <= Date.now()) return;
    const timer = setInterval(() => { const time = Date.now(); setNow(time); if (time >= retryAt) clearInterval(timer); }, 1000);
    return () => clearInterval(timer);
  }, [retryAt]);
  if (!turn.council) return null;
  const active = councilActive(turn);
  const creditBlocked = turn.answers.openai?.status === "error" && /credit_balance_exhausted|API credit|API billing/i.test(turn.answers.openai.error || "");
  const count = providerIds.filter(id => researchComplete(turn,id)).length;
  const resumable = canResumeResearch(turn);
  const resumeVotes = canResumeVotes(turn);
  const attempts = turn.attempts || [];
  const measured = attempts.filter(a => a.usage?.inputTokens !== undefined || a.usage?.outputTokens !== undefined);
  const extras=[turn.orchestration,turn.muse,turn.gemini,turn.grokbot].filter(x=>!!x);
  const extraTokens=extras.reduce((n,x)=>n+(x?.usage.inputTokens||0)+(x?.usage.outputTokens||0),0);
  const tokens = extraTokens + measured.reduce((n,a) => n + (a.usage?.inputTokens || 0) + (a.usage?.outputTokens || 0), 0);
  if (turn.council.protocol === "chat") return <section className="council-status workflow-summary" role="status" aria-label="Synthesis progress">
    <strong>{active ? "Working on your answer" : turn.council.status === "complete" ? "Research and review complete" : "Workflow paused"}</strong><p>{turn.council.message}</p>
    {turn.orchestration && <details><summary>Symbiosis plan and specialist prompts</summary><p>{turn.orchestration.plan.objective}</p><p>Muse: {turn.orchestration.plan.muse.reason}</p><p>Grokbot: {turn.orchestration.plan.grokbot.reason}</p>{turn.orchestration.plan.muse.needed&&<p>Muse prompt: {turn.orchestration.plan.muse.prompt}</p>}{turn.orchestration.plan.grokbot.needed&&<p>Grokbot prompt: {turn.orchestration.plan.grokbot.prompt}</p>}<p>{turn.orchestration.plan.limitations.join(' ')}</p><p>Specialist outputs feed the shared council answer. No publishing or deployment is performed by these calls.</p></details>}
    {active && <button className="secondary-button" onClick={onStop}>Stop</button>}
    {turn.council.status === "complete" && <button className="secondary-button" disabled={busy} onClick={()=>onRetry(true)}>Regenerate final outcome</button>}
    {!active && ["error","cancelled"].includes(turn.council.status) && <button className="secondary-button" disabled={busy || retryAt > now} onClick={()=>onRetry(true)}>{retryAt > now ? "Waiting for provider cooldown" : "Continue with saved work"}</button>}
    {(!!attempts.length||extras.length>0) && <details><summary>Usage · {attempts.length} council requests · {extras.length} saved specialist results · {tokens.toLocaleString()} reported tokens</summary><p>Missing usage is unknown, including failed specialist calls. Provider search fees may apply.</p></details>}
  </section>;
  return <section className="council-status workflow-summary" role="status" aria-label="Campaign workflow status">
    <strong>{turn.council.status === "error" ? "Final plan blocked" : "Master workflow · " + turn.council.status}</strong>
    {creditBlocked ? <><p><strong>OpenAI API credit is exhausted.</strong> This run stopped before debate and the final plan. {count} completed research briefs are saved below.</p><a className="inline-link" href="https://platform.openai.com/settings/organization/billing/overview" target="_blank" rel="noreferrer">Open OpenAI API billing ↗</a><p className="settings-note">After adding API credit, retry the incomplete research. A ChatGPT subscription is separate from API credit.</p></> : <p>{turn.council.message}</p>}
    <p className="settings-note"><strong>{turn.spendingMode === "thorough" ? "Thorough · up to 3 debate rounds" : "Economy · 1 debate round"}</strong> · Phase-specific output limits. Completed research is reused on research retry. Premium deadlock review: Astra → Fable → your decision.</p>
    {!!attempts.length && <details><summary>API usage · {tokens.toLocaleString()} reported tokens · {attempts.length} tracked requests</summary><p className="settings-note">Tracked since this update, including retries. {attempts.length - measured.length} request(s) have no reported usage yet. Missing usage is unknown, not free. Search fees and provider billing may differ.</p>{attempts.map(a => <p className="settings-note" key={a.id}>{a.provider} · {a.phase} · {a.model || "model pending"} · {a.status} · {a.usage ? `${((a.usage.inputTokens || 0) + (a.usage.outputTokens || 0)).toLocaleString()} reported tokens` : "usage unavailable"}</p>)}</details>}
    <p className="settings-note">One shared result: research → specialist review → task allocation → agreement → final plan. Expand the evidence and debate records to inspect each model’s contribution.</p>
    {!turn.analytics && <p className="settings-note">Instagram/Facebook account analytics are not connected. Public research can support a campaign draft with stated assumptions. Account analytics and automatic publishing need separate authorized connections.</p>}
    {active && <button className="secondary-button" onClick={onStop}>Stop workflow</button>}
    {!active && ["error", "cancelled", "unresolved"].includes(turn.council.status) && <button className="secondary-button" disabled={busy || retryAt > now} onClick={() => onRetry(resumable || !!resumeVotes)}>{retryAt > now ? `Provider cooldown · retry in ${Math.ceil((retryAt - now) / 1000)}s` : resumeVotes ? "Retry invalid votes only & continue" : resumable ? "Retry incomplete research & continue" : "Restart all six · new research & votes"}</button>}
  </section>;
}
