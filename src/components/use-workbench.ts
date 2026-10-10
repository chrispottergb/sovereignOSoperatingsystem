"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { providerIds, type Answer, type Conversation, type GenerateInput, type ProviderId, type StreamEvent, type Turn, type Workspace } from "@/lib/contracts";
import { BrowserHistoryRepository, emptyWorkspace, historyFor } from "@/lib/history";
import { readSSE } from "@/lib/sse";
import { defaultEngine } from "@/lib/engine";
import { completedAnswers, councilActive } from "@/lib/council";
import type { SpendingMode } from "@/lib/budget";
import { runChatWorkflow, usable } from "@/lib/chat-workflow";
const repository = new BrowserHistoryRepository();
export function useWorkbench() {
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [storageBlocked, setStorageBlocked] = useState(false);
  const current = useRef(workspace);
  const jobs = useRef(new Map<string, AbortController>());
  const councils = useRef(new Map<string, AbortController>());
  const mounted = useRef(true);
  const mutate = useCallback((update: (w: Workspace) => Workspace) => {
    if (!mounted.current) return;
    current.current = update(current.current); setWorkspace(current.current);
  }, []);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    repository.load().then(w => { if (active) { current.current = w; setWorkspace(w); setLoaded(true); } }).catch(() => {
      if (active) { setStorageError("Saved history could not be read. Existing data is preserved. Export it from your browser storage before resetting."); setStorageBlocked(true); setLoaded(true); }
    });
    const activeJobs = jobs.current;
    const activeCouncils = councils.current;
    return () => { active = false; mounted.current = false; for (const job of activeJobs.values()) job.abort(); activeJobs.clear(); for (const controller of activeCouncils.values()) controller.abort(); activeCouncils.clear(); };
  }, []);
  useEffect(() => {
    if (!loaded || storageBlocked) return;
    const save = () => { void repository.save(current.current).catch(() => setStorageError("History could not be saved. Browser storage may be full or disabled. Export your workspace now.")); };
    const timer = setTimeout(save, 350);
    window.addEventListener("pagehide", save);
    return () => { clearTimeout(timer); window.removeEventListener("pagehide", save); };
  }, [workspace, loaded, storageBlocked]);

  const updateAnswer = useCallback((conversationId: string, turnId: string, provider: ProviderId, kind: GenerateInput["kind"] | "critique" | "routing" | "vote" | "execute" | "arbitrate" | "audit" | "refine", update: (a: Answer) => Answer) => {
    mutate(w => ({ ...w, conversations: w.conversations.map(c => c.id !== conversationId ? c : { ...c, updatedAt: Date.now(), turns: c.turns.map(t => {
      if (t.id !== turnId) return t;
      const answer = kind === "refine" ? t.revisions?.[provider] : kind === "arbitrate" ? t.arbitration : kind === "audit" ? t.audit : kind === "vote" ? t.votes?.[provider] : kind === "execute" ? t.botRuns?.[provider] : kind === "routing" ? t.routing : kind === "critique" ? t.reviews?.[provider] : kind === "synthesis" ? t.synthesis : t.answers[provider];
      if (!answer) return t;
      return kind === "refine" ? {...t,revisions:{...t.revisions,[provider]:update(answer)}} : kind === "arbitrate" ? { ...t, arbitration: update(answer) } : kind === "audit" ? { ...t, audit: update(answer) } : kind === "vote" ? { ...t, votes: { ...t.votes, [provider]: update(answer) } } : kind === "execute" ? { ...t, botRuns: { ...t.botRuns, [provider]: update(answer) } } : kind === "routing" ? { ...t, routing: update(answer) } : kind === "critique" ? { ...t, reviews: { ...t.reviews, [provider]: update(answer) } } : kind === "synthesis" ? { ...t, synthesis: update(answer) } : { ...t, answers: { ...t.answers, [provider]: update(answer) } };
    }) }) }));
  }, [mutate]);

  const run = useCallback(async (conversationId: string, turnId: string, provider: ProviderId, kind: GenerateInput["kind"] = "response", reviewPhase?: GenerateInput["reviewPhase"]) => {
    const conversation = current.current.conversations.find(c => c.id === conversationId);
    const turn = conversation?.turns.find(t => t.id === turnId);
    if (!conversation || !turn) return;
    const target = reviewPhase === "adjudicate" ? "arbitrate" : reviewPhase === "research" ? "response" : reviewPhase === "arbitrate" || reviewPhase === "audit" || reviewPhase === "vote" || reviewPhase === "execute" ? reviewPhase : kind;
    if (reviewPhase === "execute" && (!turn.lockedAt || turn.council?.status !== "complete")) return;
    const key = `${conversationId}/${turnId}/${target === "response" ? provider : reviewPhase === "vote" || reviewPhase === "execute" || reviewPhase === "refine" ? reviewPhase + "/" + provider : reviewPhase === "routing" ? "routing" : reviewPhase === "critique" ? "critique/" + provider : "synthesis"}`;
    jobs.current.get(key)?.abort();
    const controller = new AbortController(); jobs.current.set(key, controller);
    const attemptId = crypto.randomUUID();
    const recordAttempt = (values: Partial<NonNullable<Turn["attempts"]>[number]>) => mutate(w => ({ ...w, conversations: w.conversations.map(c => c.id !== conversationId ? c : { ...c, turns: c.turns.map(t => t.id !== turnId ? t : { ...t, attempts: (t.attempts || []).map(a => a.id === attemptId ? { ...a, ...values } : a) }) }) }));
    mutate(w => ({ ...w, conversations: w.conversations.map(c => c.id !== conversationId ? c : { ...c, turns: c.turns.map(t => t.id !== turnId ? t : { ...t, attempts: [...(t.attempts || []), { id: attemptId, provider, phase: reviewPhase || kind, startedAt: Date.now(), status: "streaming" }] }) }) }));
    let attemptStatus: "complete" | "error" | "cancelled" = "error";
    const initial: Answer = { provider, status: "streaming", text: "", citations: [] };
    mutate(w => ({ ...w, conversations: w.conversations.map(c => c.id !== conversationId ? c : { ...c, turns: c.turns.map(t => t.id !== turnId ? t : reviewPhase === "refine" ? {...t,revisions:{...t.revisions,[provider]:initial}} : reviewPhase === "arbitrate" || reviewPhase === "adjudicate" ? { ...t, arbitration: initial } : reviewPhase === "audit" ? { ...t, audit: initial } : reviewPhase === "vote" ? { ...t, votes: { ...t.votes, [provider]: initial } } : reviewPhase === "execute" ? { ...t, botRuns: { ...t.botRuns, [provider]: initial } } : reviewPhase === "routing" ? { ...t, routing: initial } : reviewPhase === "critique" ? { ...t, reviews: { ...t.reviews, [provider]: initial } } : target === "synthesis" ? { ...t, ...(!reviewPhase ? { council: undefined } : {}), synthesis: initial } : { ...t, ...(!councilActive(t) ? { council: undefined, reviews: undefined } : {}), synthesis: undefined, answers: { ...t.answers, [provider]: initial } }) }) }));
    const patch = (updater: (a: Answer) => Answer) => { if (jobs.current.get(key) === controller) updateAnswer(conversationId, turnId, provider, reviewPhase === "refine" ? "refine" : reviewPhase === "routing" ? "routing" : reviewPhase === "critique" ? "critique" : target, updater); };
    const sources = completedAnswers(turn.answers).filter(a => turn.council?.protocol !== "chat" || usable(a)).filter(a => reviewPhase !== "critique" || a.provider !== provider).map(a => ({ provider: a.provider, text: a.text, citations: a.citations }));
    const input: GenerateInput = {
      sharedEvidence:turn.muse ? (turn.sharedEvidence||"")+"\n\nMUSE SPECIALIST CONTRIBUTION (untrusted model output, not independently verified):\n"+turn.muse.text : turn.sharedEvidence, revisions:reviewPhase === "resolve" ? completedAnswers(turn.revisions).filter(usable).map(a=>({provider:a.provider,text:a.text,citations:a.citations})) : undefined,
      spendingMode: turn.spendingMode || "economy", provider, kind, reviewPhase, engine: turn.engine, mode: turn.mode, prompt: turn.prompt, context: turn.context,
      analytics: turn.analytics, userDecision: turn.userDecision, advisorReviews: [turn.arbitration, turn.audit].filter((a): a is Answer => !!a && a.status === "complete").map(a => ({ provider: a.provider, text: a.text, citations: a.citations })), participants: turn.council?.participants,
      history: turn.council?.protocol === "chat" ? conversation.turns.filter(t=>t.createdAt<turn.createdAt && usable(t.synthesis)).slice(-4).flatMap(t=>[{role:"user" as const,content:t.prompt},{role:"assistant" as const,content:t.synthesis!.text}]) : kind === "response" && !reviewPhase ? historyFor(conversation, turnId, provider) : [],
      ...(reviewPhase !== "research" ? { assignment: turn.assignments?.assignments.find(a => a.provider === provider), sources: kind === "synthesis" ? sources : undefined, candidate: turn.candidate, ballots: turn.ballots,
        critiques: ["routing", "vote", "arbitrate", "audit", "master", "execute", "resolve", "adjudicate", "refine"].includes(reviewPhase || "") ? completedAnswers(turn.reviews).filter(a => turn.council?.protocol !== "chat" || usable(a)).map(a => ({ provider: a.provider, text: a.text, citations: a.citations })) : turn.rounds?.at(-1) ? completedAnswers(turn.rounds.at(-1)!.reviews).map(a => ({ provider: a.provider, text: a.text, citations: a.citations })) : undefined } : {}),
    };
    let terminal = false;
    try {
      const response = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: controller.signal });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        patch(a => ({ ...a, status: "error", error: data.error?.message || `Request failed (${response.status}).`, retryAfter: data.error?.retryAfter ? Date.now() + data.error.retryAfter * 1000 : undefined })); return;
      }
      if (!response.body) throw new Error("No response stream received.");
      for await (const frame of readSSE(response.body, controller.signal)) {
        const event: StreamEvent = JSON.parse(frame.data);
        if (event.type === "start") { recordAttempt({ model: event.model }); patch(a => ({ ...a, model: event.model })); }
        if (event.type === "delta") patch(a => ({ ...a, text: a.text + event.text }));
        if (event.type === "usage") { recordAttempt({ usage: event.usage }); patch(a => ({ ...a, usage: event.usage })); }
        if (event.type === "citations") patch(a => ({ ...a, citations: [...new Map([...a.citations, ...event.citations].map(c => [c.url, c])).values()] }));
        if (event.type === "error") { terminal = true; patch(a => ({ ...a, status: "error", error: event.message, retryAfter: event.retryAfter ? Date.now() + event.retryAfter * 1000 : undefined })); }
        if (event.type === "done") { terminal = true; attemptStatus = "complete"; patch(a => ({ ...a, status: "complete", elapsedMs: event.elapsedMs, finishReason: event.finishReason })); }
      }
      if (!terminal) throw new Error("Connection ended before completion. Retry to generate a new response.");
    } catch (error) {
      patch(a => ({ ...a, status: controller.signal.aborted ? "cancelled" : "error", error: controller.signal.aborted ? undefined : error instanceof Error ? error.message : "Connection interrupted. Please retry." }));
    } finally { recordAttempt({ status: controller.signal.aborted ? "cancelled" : attemptStatus }); if (jobs.current.get(key) === controller) jobs.current.delete(key); }
  }, [mutate, updateAnswer]);

  const cancel = (conversationId: string, turnId: string, provider: ProviderId, synthesis = false) => jobs.current.get(`${conversationId}/${turnId}/${synthesis ? "synthesis" : provider}`)?.abort();
  const cancelConversation = (id: string) => { for (const [key, controller] of councils.current) if (key.startsWith(id + "/")) controller.abort(); for (const [key, job] of jobs.current) if (key.startsWith(`${id}/`)) job.abort(); };
  function stopCouncil(conversationId: string, turnId: string) {
    councils.current.get(conversationId + "/" + turnId)?.abort();
    for (const [key, job] of jobs.current) if (key.startsWith(conversationId + "/" + turnId + "/")) job.abort();
    mutate(w => ({ ...w, conversations: w.conversations.map(c => c.id !== conversationId ? c : { ...c, turns: c.turns.map(t => t.id !== turnId || !t.council ? t : { ...t, council: { ...t.council, status: "cancelled", message: "Stopped. Completed results are preserved." } }) }) }));
  }
  async function startCouncil(conversationId: string, turnId: string, _participants: ProviderId[], lead: ProviderId, resumeResearch = false) {
    const key = conversationId + "/" + turnId;
    if (councils.current.has(key)) return;
    const controller = new AbortController(); councils.current.set(key, controller);
    const read = () => current.current.conversations.find(c => c.id === conversationId)?.turns.find(t => t.id === turnId);
    const patch = (values: Partial<Turn>) => mutate(w => ({ ...w, conversations: w.conversations.map(c => c.id !== conversationId ? c : { ...c, turns: c.turns.map(t => t.id !== turnId ? t : { ...t, ...values }) }) }));
    const update = (status: NonNullable<Turn["council"]>["status"], message: string) => patch({ council: { protocol: "chat", status, participants: [...providerIds], lead: lead === "openai" ? "openai" : "claude", message } });
    try {
      update("researching","Preparing shared project context and connected evidence…");
      if(read()?.mode === "live" && read()?.sharedEvidence === undefined){const response=await fetch("/api/council-context",{signal:controller.signal,cache:"no-store"});const data=await response.json();if(!response.ok)throw Error(data.error?.message || "Could not prepare shared evidence.");patch({sharedEvidence:data.evidence});}
      if(read()?.mode === "live" && read()?.useMuse && !read()?.muse){
        update("researching","Muse is preparing a specialist contribution for the council…");
        const turn=read()!;
        const response=await fetch('/api/muse',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({action:'advise',input:{prompt:turn.prompt,context:JSON.stringify({project:turn.context,evidence:turn.sharedEvidence})}})});
        const data=await response.json();if(!response.ok)throw Error(data.error?.message||'Muse contribution failed.');patch({muse:data});
      }
      await runChatWorkflow({ signal: controller.signal, read, patch, update, resumeResearch, run: (id, phase) => run(conversationId, turnId, id, "synthesis", phase) }); }
    catch(e) { if (!controller.signal.aborted) update("error", e instanceof Error ? e.message : "The workflow stopped. Completed results are preserved."); }
    finally { if (councils.current.get(key) === controller) councils.current.delete(key); }
  }
  async function approveResolution(conversationId: string, turnId: string, rationale: string) {
    const turn = current.current.conversations.find(c => c.id === conversationId)?.turns.find(t => t.id === turnId);
    if (turn?.council?.status !== "awaiting_decision" || !turn.candidate || !rationale.trim() || rationale.length > 2000) return;
    const key = conversationId + "/" + turnId;
    if (councils.current.has(key)) return;
    const controller = new AbortController(); councils.current.set(key, controller);
    const patch = (values: Partial<Turn>) => mutate(w => ({ ...w, conversations: w.conversations.map(c => c.id !== conversationId ? c : { ...c, turns: c.turns.map(t => t.id !== turnId ? t : { ...t, ...values }) }) }));
    patch({ userDecision: { candidateId: turn.candidate.id, rationale: rationale.trim(), decidedAt: Date.now() }, lockedAt: Date.now(), assignments: turn.candidate.proposal, council: { ...turn.council, status: "planning", message: "Owner approved Astra’s proposal after Fable review. Preparing final plan; this is not unanimous agreement." } });
    try {
      await run(conversationId, turnId, turn.council.lead, "synthesis", "master");
      if (controller.signal.aborted) return;
      const latest = current.current.conversations.find(c => c.id === conversationId)?.turns.find(t => t.id === turnId);
      const done = latest?.synthesis?.status === "complete" && ["stop", "end_turn"].includes(latest.synthesis.finishReason || "");
      patch({ council: { ...turn.council, status: done ? "complete" : "error", message: done ? "Owner decision recorded after Astra and Fable review. Locked tasks are ready for manual workspace triggers." : "The final plan did not complete. Bot triggers remain disabled." } });
    } finally { if (councils.current.get(key) === controller) councils.current.delete(key); }
  }
  function submit(prompt: string, projectId: string, conversationId: string | undefined, selected: ProviderId[], mode: "live" | "demo", lead?: ProviderId, spendingMode: SpendingMode = "economy", useMuse = false) {
    const project = current.current.projects.find(p => p.id === projectId); if (!project) return;
    const id = conversationId || crypto.randomUUID();
    const turn: Turn = { useMuse, spendingMode, id: crypto.randomUUID(), prompt, createdAt: Date.now(), mode, context: { projectName: project.name, notes: project.notes }, engine: current.current.engine || defaultEngine, analytics: current.current.analytics, answers: {} };
    mutate(w => {
      const existing = w.conversations.find(c => c.id === id);
      const conversation: Conversation = existing ? { ...existing, updatedAt: Date.now(), turns: [...existing.turns, turn] } : { id, projectId, title: prompt.slice(0, 70), createdAt: Date.now(), updatedAt: Date.now(), turns: [turn] };
      return { ...w, conversations: [conversation, ...w.conversations.filter(c => c.id !== id)] };
    });
    if (lead) void startCouncil(id, turn.id, selected, lead);
    else for (const provider of selected) void run(id, turn.id, provider);
    return id;
  }
  return { workspace, loaded, storageError, mutate, run, cancel, cancelConversation, submit, startCouncil, stopCouncil, approveResolution };
}
