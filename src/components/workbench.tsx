"use client";
import {EngineRunPanel,SavedEngineRuns} from "./engine-run-panel";
import {hfModels,type HfModel} from "@/lib/huggingface";
import {requestedReporter} from "@/lib/requested-reporter";

import {AttachmentTray,useAttachments} from './attachment-tray';
import {CouncilBuild} from "./council-build";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowUp, ArrowUpRight, Boxes, ChevronDown, ChevronRight, CircleHelp, Download, Folder, Layers3, LockKeyhole, Menu, MessageSquare, Plus, Search, Settings2, ShieldCheck, Sparkles, WandSparkles, X, Zap, FileText, Trash2, Pencil, Check, LogOut } from "lucide-react";
import { providers, providerIds, type AppConfig, type ProviderId, type Workspace } from "@/lib/contracts";
import type { SpendingMode } from "@/lib/budget";
import { restoreWorkspace } from "@/lib/history";
import { useWorkbench } from "./use-workbench";
import { AnswerCard } from "./answer-card";
import { councilActive } from "@/lib/council";
import { EngineEditor } from "./engine-editor";
import { AnalyticsEditor } from "./analytics-editor";
import { WorkflowStatus } from "./workflow-status";
import { ConsensusPanel } from "./consensus-panel";
import { Modal } from "./modal";
import { IntelligenceOrbit } from "./intelligence-orbit";

const ideas = [
  { icon: Zap, title: "Find the next move", prompt: "Help me turn an ambitious idea into an actionable 30-day plan. Start by asking about my goal and constraints." },
  { icon: Search, title: "Go a little deeper", prompt: "What are the most important questions to ask when evaluating an AI product idea? Compare technical feasibility, user need, and sustainable economics." },
  { icon: WandSparkles, title: "Make something better", prompt: "Help me improve a piece of writing. Ask me for the draft, intended audience, and the one thing I want readers to remember." },
];
function download(name: string, text: string, type: string) { const url = URL.createObjectURL(new Blob([text], { type })); const link = document.createElement("a"); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

export function Workbench() {
  const wb = useWorkbench();
  const attachments=useAttachments(); const [preparingAttachments,setPreparingAttachments]=useState(false);
  const [config, setConfig] = useState<AppConfig>();
  const [configError, setConfigError] = useState("");
  const [selected, setSelected] = useState<ProviderId[]>([...providerIds]);
  const [mode, setMode] = useState<"live" | "demo">("demo");
  const [finalEditor,setFinalEditor]=useState<"claude"|"openai">("claude");
  const [masterMode, setMasterMode] = useState(true);
  const [hfModel,setHfModel]=useState<HfModel|"">("");
  const [symbiosis,setSymbiosis]=useState(true);
  const [museStatus,setMuseStatus]=useState("");
  const [museTesting,setMuseTesting]=useState(false);
  const [spendingMode, setSpendingMode] = useState<SpendingMode>("thorough");
  const [projectId, setProjectId] = useState("personal");
  const [conversationId, setConversationId] = useState<string>();
  const [prompt, setPrompt] = useState("");
  const [search, setSearch] = useState("");
  const [synthProvider, setSynthProvider] = useState<ProviderId>("openai");
  const [modal, setModal] = useState<"settings" | "project" | "new-project" | "rename" | "delete" | "help" | "engine" | "analytics" | undefined>();
  const [draftName, setDraftName] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [importData, setImportData] = useState<Workspace>();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const project = wb.workspace.projects.find(p => p.id === projectId) || wb.workspace.projects[0];
  const conversation = wb.workspace.conversations.find(c => c.id === conversationId);
  const busy = conversation?.turns.some(t => councilActive(t) || Object.values(t.botRuns || {}).some(a => a?.status === "streaming") || Object.values(t.answers).some(a => a?.status === "streaming") || t.synthesis?.status === "streaming") ?? false;
  const anyBusy = wb.workspace.conversations.some(c => c.turns.some(t => councilActive(t) || Object.values(t.botRuns || {}).some(a => a?.status === "streaming") || Object.values(t.answers).some(a => a?.status === "streaming") || t.synthesis?.status === "streaming"));
  const reporter=requestedReporter(prompt,selected);
  const requiredModels=hfModel?[finalEditor]:reporter?[reporter,finalEditor]:config?.engine?.enabled?[finalEditor]:[...providerIds];
  const missingRequired=(Boolean(hfModel)&&!config?.huggingface?.configured)||requiredModels.some(id=>!config?.providers.find(p=>p.id===id)?.configured);
  const liveCount = config?.providers.filter(p => p.configured).length ?? 0;
  const activeMode = conversation?.turns[0]?.mode || mode;
  const conversations = wb.workspace.conversations.filter(c => c.projectId === project.id && c.title.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.updatedAt - a.updatedAt);
  async function refreshConfig() {
    try { const response = await fetch("/api/config", { cache: "no-store" }); if (!response.ok) throw new Error(); const data: AppConfig = await response.json(); setConfig(data); setConfigError(""); return data; } catch { setConfigError("Could not connect to the server. Refresh to try again."); }
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/config", { cache: "no-store", signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(); return response.json() as Promise<AppConfig>; })
      .then(data => {
        if (controller.signal.aborted) return;
        setConfig(data); setConfigError("");
        if (!data.demoEnabled || data.providers.some(p => p.configured)) setMode("live");
      })
      .catch(() => { if (!controller.signal.aborted) setConfigError("Could not connect to the server. Refresh to try again."); });
    return () => controller.abort();
  }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 5000); return () => clearTimeout(timer); }, [notice]);
  function newConversation() { setConversationId(undefined); setPrompt(""); setSidebarOpen(false); textarea.current?.focus(); }
  function toggleProvider(id: ProviderId) { if (masterMode) {setSelected([id]);return;} setSelected(ids => ids.includes(id) ? ids.filter(p => p !== id) : [...ids, id]); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if(attachments.busy||preparingAttachments)return;
    if ((hfModel&&activeMode!=="live") || !prompt.trim() || prompt.length > 12000 || !selected.length || (masterMode && activeMode === "live" && missingRequired) || busy || !wb.loaded || !config?.authenticated) return;
    if(attachments.files.length && activeMode!=="live"){setNotice("Use Live mode to send attachments.");return;}
    setPreparingAttachments(true);try{const attachmentBrief=await attachments.prepare(prompt.trim());
    const id = wb.submit(prompt.trim(), project.id, conversationId, selected, activeMode, masterMode ? finalEditor : undefined, spendingMode, attachmentBrief, symbiosis, hfModel||undefined,Boolean(config?.engine?.enabled));
    if (id) { attachments.clear(); setConversationId(id); setPrompt(""); setTimeout(() => bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50); }
    }catch(e){setNotice(e instanceof Error?e.message:"Could not read attachments.");}finally{setPreparingAttachments(false);}
  }
  function openProject() { setDraftName(project.name); setDraftNotes(project.notes); setModal("project"); }
  function saveProject(event: FormEvent) {
    event.preventDefault(); if (!draftName.trim()) return;
    if (modal === "new-project") {
      const id = crypto.randomUUID(); wb.mutate(w => ({ ...w, projects: [...w.projects, { id, name: draftName.trim(), notes: draftNotes }] })); setProjectId(id); newConversation();
    } else wb.mutate(w => ({ ...w, projects: w.projects.map(p => p.id === project.id ? { ...p, name: draftName.trim(), notes: draftNotes } : p) }));
    setModal(undefined);
  }
  async function unlock(event: FormEvent) {
    event.preventDefault(); setAuthBusy(true); setAuthError("");
    try { const response = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }); const body = await response.json(); if (!response.ok) setAuthError(body.error?.message || "Could not unlock the workspace."); else { setPassword(""); await refreshConfig(); } } catch { setAuthError("Connection failed. Please try again."); } finally { setAuthBusy(false); }
  }
  function exportConversation() {
    if (!conversation) return;
    const text = `# ${conversation.title}\n\n` + conversation.turns.map(t => `## Prompt\n${t.prompt}\n\nMode: ${t.mode}\n\n` + [...Object.values(t.answers), ...Object.values(t.reviews ?? {}), ...Object.values(t.revisions ?? {}), ...(t.synthesis ? [t.synthesis] : [])].map(a => a ? `### ${a === t.synthesis ? (t.council ? "Master plan · " : "Synthesis · ") : Object.values(t.reviews ?? {}).includes(a) ? "Critique · " : ""}${providers[a.provider].name} (${a.status})\n\n${a.text}\n\n${a.citations.map(c => `- [${c.title}](${c.url})`).join("\n")}` : "").join("\n\n")).join("\n\n---\n\n");
    download("sovereign-conversation.md", text, "text/markdown");
  }
  function exportWorkspace() { download("sovereign-workspace.json", JSON.stringify(wb.workspace, null, 2), "application/json"); }

  return <div className="app-shell">
    <a href="#main" className="skip-link">Skip to workspace</a>
    {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close navigation"/>}
    <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
      <Link href="/" className="brand"><span className="brand-mark"><Layers3 size={22}/></span><span>sovereign<span className="brand-os">OS</span><small>YOUR INTELLIGENCE, CONNECTED</small></span></Link>
      <div className="workspace-label"><span className="workspace-avatar">S</span><span>My workspace<small>Local & personal</small></span><ShieldCheck size={16}/></div>
      <button className="new-chat" onClick={newConversation}><Plus size={17}/>New conversation<span>↗</span></button>
      <label className="sidebar-search"><Search size={15}/><input aria-label="Search conversations" placeholder="Search conversations" value={search} onChange={e => setSearch(e.target.value)}/></label>
      <div className="sidebar-section-title"><span>PROJECTS</span><button className="icon-button" aria-label="New project" onClick={() => { setDraftName(""); setDraftNotes(""); setModal("new-project"); }}><Plus size={15}/></button></div>
      <nav className="projects" aria-label="Projects">{wb.workspace.projects.map(p => <button key={p.id} className={`project-button ${project.id === p.id ? "active" : ""}`} onClick={() => { setProjectId(p.id); newConversation(); }}><Folder size={16}/><span>{p.name}</span><ChevronRight size={13}/></button>)}</nav>
      <div className="sidebar-section-title"><span>CONVERSATIONS</span><span>{conversations.length.toString().padStart(2, "0")}</span></div>
      <nav className="conversation-list" aria-label="Conversations">
        {!conversations.length && <p className="sidebar-empty">{search ? "No matching conversations." : "Your next great idea starts here."}</p>}
        {conversations.map(c => <button key={c.id} className={`conversation-button ${c.id === conversationId ? "active" : ""}`} onClick={() => { setConversationId(c.id); setSidebarOpen(false); setPrompt(""); }}><MessageSquare size={15}/><span>{c.title}</span>{c.turns.some(t => councilActive(t) || Object.values(t.botRuns || {}).some(a => a?.status === "streaming") || Object.values(t.answers).some(a => a?.status === "streaming")) && <i className="live-dot"/>}</button>)}
      </nav>
      <div className="sidebar-bottom"><div className="connection-summary"><span className="connection-glyph"><Boxes size={20}/></span><div><strong>Connected intelligence</strong><span>{liveCount+(config?.huggingface?.configured?5:0)} of 11 model routes configured</span></div><button aria-label="Manage connections" className="icon-button" onClick={() => setModal("settings")}><ArrowUpRight size={16}/></button></div>
        <button className="sidebar-link" onClick={() => setModal("settings")}><Settings2 size={16}/>Connections & settings</button><button className="sidebar-link" onClick={() => setModal("help")}><CircleHelp size={16}/>A little guidance<ArrowUpRight size={14}/></button>
        <Link className="sidebar-link" href="/muse"><Sparkles size={16}/>Muse · tasks &amp; metrics</Link><Link className="sidebar-link" href="/music"><Boxes size={16}/>Music Studio</Link><Link className="sidebar-link" href="/emergent"><Layers3 size={16}/>Emergent · build workspace</Link><Link className="sidebar-link" href="/cloud"><Layers3 size={16}/>Cloud execution</Link><Link className="sidebar-link" href="/orchestra"><Layers3 size={16}/>Orchestra · research &amp; builds</Link><Link className="sidebar-link" href="/studio"><Boxes size={16}/>Grokbot Studio &amp; connectors</Link><button className="sidebar-link" onClick={() => setModal("analytics")}><Boxes size={16}/>Social analytics & connectors</button><button className="sidebar-link" onClick={() => setModal("engine")}><Boxes size={16}/>Model roles, bots & skills</button><div className="profile"><span className="profile-avatar">YO</span><div>You<small>Personal workspace</small></div><span className="local-tag">LOCAL</span></div>
      </div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={20}/></button><Layers3 size={16}/><span>Workspace</span><ChevronRight size={13}/><strong>{conversation ? "Conversation" : "New conversation"}</strong></div><div className="topbar-right"><span className="private-label"><ShieldCheck size={14}/>Private by design</span><span className="topbar-divider"/><button className={`mode-button ${activeMode}`} onClick={() => setModal("settings")}><span className="live-dot"/>{activeMode === "demo" ? "Demo mode" : "Live mode"}<ChevronDown size={13}/></button></div></header>
      <main id="main" className={`main-content ${conversation ? "has-conversation" : ""}`}>
        <div className="page-heading"><div className="project-crumb"><Folder size={14}/>{project.name}</div><div className="heading-actions"><button className="text-button" onClick={openProject}><FileText size={15}/>Project context{project.notes && <span className="context-dot"/>}</button>{conversation && <><button className="icon-button" aria-label="Export conversation" title="Export Markdown" onClick={exportConversation}><Download size={17}/></button><button className="icon-button" aria-label="Rename conversation" onClick={() => { setDraftName(conversation.title); setModal("rename"); }}><Pencil size={16}/></button><button className="icon-button" aria-label="Delete conversation" onClick={() => setModal("delete")}><Trash2 size={16}/></button></>}</div></div>
        {(configError || config?.deploymentError || wb.storageError) && <div className="global-warning" role="alert">{configError || config?.deploymentError || wb.storageError}</div>}
        {config?.engine?.enabled && <SavedEngineRuns onOpen={run=>{const id=wb.openEngineRun(run);const c=wb.workspace.conversations.find(c=>c.id===id);if(c)setProjectId(c.projectId);else setProjectId(wb.workspace.projects[0].id);setConversationId(id);}}/>}
        {!conversation ? <>
          <section className="hero"><div className="hero-badge"><span className="hero-spark">✦</span>THE WORKSPACE FOR YOUR NEXT BIG IDEA</div><h1>Your ambition.<br/><span>Amplified.</span></h1><IntelligenceOrbit/></section>
          <div className="starter-section"><span className="eyebrow">A PLACE TO START</span><div className="starter-grid">{ideas.map(idea => <button key={idea.title} className="starter-card" onClick={() => { setPrompt(idea.prompt); textarea.current?.focus(); }}><idea.icon size={17}/><span>{idea.title}</span><ArrowUpRight size={14}/></button>)}</div></div>
        </> : <div className="turns">{conversation.turns.map((turn, index) => {
          const completed = Object.values(turn.answers).filter(a => a?.status === "complete" && a.text.trim()).length;
          const turnBusy = councilActive(turn) || Object.values(turn.botRuns || {}).some(a => a?.status === "streaming") || Object.values(turn.answers).some(a => a?.status === "streaming") || turn.synthesis?.status === "streaming";
          return <section key={turn.id} className="turn"><div className="prompt-label"><span className="you-badge">YOU</span><span>{new Date(turn.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>{turn.mode === "demo" && <span className="demo-label">DEMO · SAMPLE OUTPUTS</span>}</div><h2 className="user-prompt">{turn.prompt}</h2><div className="turn-toolbar"><span className="eyebrow">{turn.council ? "SYNTHESIS WORKSPACE" : `${Object.keys(turn.answers).length} PERSPECTIVES`}</span><span className="turn-number">{String(index + 1).padStart(2, "0")}</span></div>
            {turn.attachmentBrief && <details className="review-details"><summary>Attached sources · {turn.attachmentBrief.files.length} files · {turn.attachmentBrief.model}</summary>{turn.attachmentBrief.files.map(f=><p key={f.id}><a href={"/api/attachments?id="+f.id} target="_blank" rel="noreferrer">{f.name}</a></p>)}<p style={{whiteSpace:"pre-wrap"}}>{turn.attachmentBrief.text}</p><small>Input {turn.attachmentBrief.usage.inputTokens??"—"} / output {turn.attachmentBrief.usage.outputTokens??"—"} tokens</small></details>}
            {turn.gemini && <details className="review-details"><summary>Gemini adviser · {turn.gemini.model} · {((turn.gemini.usage.inputTokens||0)+(turn.gemini.usage.outputTokens||0)).toLocaleString()} reported tokens</summary><p style={{whiteSpace:"pre-wrap"}}>{turn.gemini.text}</p></details>}
            {turn.muse && <details className="review-details"><summary>Muse adviser · {turn.muse.model} · {((turn.muse.usage.inputTokens||0)+(turn.muse.usage.outputTokens||0)).toLocaleString()} reported tokens</summary><p style={{whiteSpace:"pre-wrap"}}>{turn.muse.text}</p></details>}<WorkflowStatus turn={turn} busy={turnBusy} onPartial={()=>void wb.startCouncil(conversation.id,turn.id,turn.council!.participants,turn.council!.lead,true,true)} onStop={() => wb.stopCouncil(conversation.id, turn.id)} onRetry={reuse => void wb.startCouncil(conversation.id, turn.id, turn.council!.participants, turn.council!.lead, reuse)}/>
            {turn.hfReport&&<details className="review-details"><summary>Hugging Face report · {turn.hfReport.model}</summary><p style={{whiteSpace:"pre-wrap"}}>{turn.hfReport.text}</p><small>{(turn.hfReport.inputTokens||0)+(turn.hfReport.outputTokens||0)} reported tokens · Reported model: {turn.hfReport.reportedModel}</small></details>}{turn.previousSynthesis && turn.synthesis?.status !== "complete" && <details className="review-details"><summary>Previous completed answer — preserved during retry</summary><AnswerCard provider={turn.previousSynthesis.provider} answer={turn.previousSynthesis} synthesis title="Previous Boss answer"/></details>}
            {turn.engineRunId && <EngineRunPanel id={turn.engineRunId}/>}
            {turn.synthesis && <section id={`final-${turn.id}`} className="final-outcome" aria-label="Final outcome"><h2 className="final-outcome-heading">{turn.synthesis.status === "streaming" ? "Final editor is writing your outcome" : turn.synthesis.status === "error" || turn.synthesis.status === "cancelled" ? "Final outcome needs attention" : "Final outcome"}</h2><AnswerCard title={turn.council ? "SovereignOS" : undefined} provider={turn.synthesis.provider} answer={turn.synthesis} synthesis onCancel={() => turn.council ? wb.stopCouncil(conversation.id, turn.id) : wb.cancel(conversation.id, turn.id, turn.synthesis!.provider, true)} onRetry={() => turn.council ? void wb.startCouncil(conversation.id, turn.id, turn.council.participants, turn.council.lead, true) : void wb.run(conversation.id, turn.id, turn.synthesis!.provider, "synthesis")} retryDisabled={councilActive(turn) || Object.values(turn.answers).some(a => a?.status === "streaming")}/></section>}
            {turn.council?.status === "complete" && turn.synthesis && <CouncilBuild turn={turn} onQueued={id=>wb.mutate(w=>({...w,conversations:w.conversations.map(c=>c.id!==conversation.id?c:{...c,turns:c.turns.map(t=>t.id!==turn.id?t:{...t,buildJobId:id})})}))}/>}
            {!!Object.keys(turn.revisions||{}).length&&<details className="review-details"><summary>Corrected contributions</summary>{providerIds.map(id=>turn.revisions?.[id]&&<AnswerCard key={id} provider={id} answer={turn.revisions[id]} title={providers[id].name+" corrected contribution"}/>)}</details>}
            <details className="review-details"><summary>Process details · research and review</summary>
            {turn.council ? <details className="review-details"><summary>Research &amp; evidence · {Object.keys(turn.answers).length} saved briefs</summary><p className="settings-note">These are inputs to the shared plan. The final editor weighs evidence and specialist critiques to produce one useful answer. Agreement alone is not proof.</p><div className={`response-grid count-${Object.keys(turn.answers).length}`}>{providerIds.filter(id => turn.answers[id]).map(id => <AnswerCard key={id} provider={id} title={turn.council ? providers[id].name + " research brief" : undefined} answer={turn.answers[id]} onCancel={() => wb.cancel(conversation.id, turn.id, id)} onRetry={() => void wb.run(conversation.id, turn.id, id)} retryDisabled={!!turn.council || Boolean(turn.synthesis?.status === "streaming")}/>)}</div></details> : <div className={`response-grid count-${Object.keys(turn.answers).length}`}>{providerIds.filter(id => turn.answers[id]).map(id => <AnswerCard key={id} provider={id} title={turn.council ? providers[id].name + " research brief" : undefined} answer={turn.answers[id]} onCancel={() => wb.cancel(conversation.id, turn.id, id)} onRetry={() => void wb.run(conversation.id, turn.id, id)} retryDisabled={!!turn.council || Boolean(turn.synthesis?.status === "streaming")}/>)}</div>}
            {turn.assignments && <details className="review-details"><summary>{turn.lockedAt ? "Locked task assignments" : "Task assignments"} · {providers[turn.council?.lead || "openai"].name} coordinator</summary><p className="settings-note">{turn.assignments.rationale}</p>{turn.assignments.assignments.map(a => <p className="settings-note" key={a.provider}><strong>{providers[a.provider].name} · {a.role}</strong><br/>{a.task}</p>)}</details>}

            {!!Object.keys(turn.reviews ?? {}).length && <details className="review-details"><summary>Adversarial critiques ({Object.keys(turn.reviews ?? {}).length})</summary><div className="response-grid">{providerIds.filter(id => turn.reviews?.[id]).map(id => <AnswerCard key={id} provider={id} answer={turn.reviews![id]} title={providers[id].name + " critique"}/>)}</div></details>}
            {!turn.council && <div className="synthesize-bar"><div className="synthesize-description"><Sparkles size={18}/><span>Find the signal in every perspective.<small>{completed ? `Combine ${completed} completed ${completed === 1 ? "answer" : "answers"} into one clear response.` : "Synthesis becomes available when a response is complete."}</small></span></div><div className="synthesize-controls"><label className="sr-only" htmlFor={`synth-${turn.id}`}>Synthesis model</label><select id={`synth-${turn.id}`} value={synthProvider} onChange={e => setSynthProvider(e.target.value as ProviderId)}>{providerIds.map(id => <option key={id} value={id}>{providers[id].name}</option>)}</select><button className="secondary-button" disabled={completed < 2 || turnBusy} onClick={() => void wb.startCouncil(conversation.id, turn.id, providerIds.filter(id => turn.answers[id]), synthProvider)}>Research all six &amp; seek agreement</button><button className="synthesize-button" disabled={!completed || turnBusy} onClick={() => void wb.run(conversation.id, turn.id, synthProvider, "synthesis")}><Sparkles size={15}/>{turn.synthesis ? "Regenerate final outcome" : "Generate final outcome"}</button></div></div>}
            </details>
            <ConsensusPanel turn={turn} busy={turnBusy} onApprove={reason => void wb.approveResolution(conversation.id, turn.id, reason)} onRun={id => void wb.run(conversation.id, turn.id, id, "synthesis", "execute")}/>
          </section>;
        })}</div>}
        <div ref={bottom}/>
      </main>
      <div className="composer-wrap"><form className="composer" onSubmit={submit}><div className="composer-attachments composer-attachments-top"><button type="button" className="context-button" onClick={openProject}><Plus size={16}/>{project.notes ? "Context attached" : "Add project context"}</button><AttachmentTray compact files={attachments.files} onChange={attachments.setFiles} disabled={busy||attachments.busy||preparingAttachments||!config?.authenticated} onBusy={attachments.setBusy}/></div>
        <details className="composer-options"><summary>Options</summary><div className="council-options"><label>Hugging Face specialist<select aria-label="Hugging Face specialist" value={hfModel} onChange={e=>{setHfModel(e.target.value as HfModel|"");if(e.target.value)setMasterMode(true);}}><option value="">Use selected council models</option>{hfModels.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label><input type="checkbox" checked={masterMode} onChange={e => { setMasterMode(e.target.checked); if (e.target.checked) setSelected([...providerIds]); else setHfModel(""); }}/>One combined answer</label>{masterMode && <><label><input type="checkbox" checked={symbiosis} onChange={e=>setSymbiosis(e.target.checked)}/>Auto specialist orchestration</label><label>Answer depth<select aria-label="API spending" value={spendingMode} onChange={e => setSpendingMode(e.target.value as SpendingMode)}><option value="economy">Focused</option><option value="thorough">Full council</option></select></label><label>Final editor<select aria-label="Final editor" value={finalEditor} onChange={e=>setFinalEditor(e.target.value as "claude"|"openai")}><option value="claude">Claude Fable 5.1</option><option value="openai">GPT Astra</option></select></label></>}</div></details>
        {preparingAttachments&&<p role="status">Reading attachments before generation…</p>}
        <textarea ref={textarea} value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} placeholder={conversation ? "Keep the conversation going…" : "What’s on your mind? Give your models something to think about…"} aria-label="Your prompt" rows={2} maxLength={12000}/>
        {hfModel&&!config?.huggingface?.configured&&<p role="status">Hugging Face needs a connection. Open settings to activate it.</p>}<div className="composer-bottom"><div className="composer-models-bottom"><span className="composer-label">SEND TO</span><div className="model-toggles"><button type="button" aria-pressed={selected.length === providerIds.length} className={`all-toggle ${selected.length === providerIds.length ? "selected" : ""}`} onClick={() => setSelected([...providerIds])}><Layers3 size={13}/>All six</button>{providerIds.map(id => <button type="button" key={id} aria-pressed={selected.includes(id)} className={`model-toggle ${id} ${selected.includes(id) ? "selected" : ""}`} onClick={() => toggleProvider(id)}><span>{providers[id].symbol}</span>{providers[id].name}{selected.includes(id) && <Check size={11}/>}</button>)}</div><span className="parallel-label">{masterMode ? hfModel ? "HF specialist → Boss" : reporter ? `${providers[reporter].name} → Boss` : "Cooperative engine → Boss" : "Parallel responses"}<Zap size={12}/></span></div><div className="send-controls"><span className="keyboard-hint">{prompt.length > 10000 ? `${prompt.length.toLocaleString()} / 12,000` : "Enter to send · Shift + Enter for a new line"}</span><button className="send-button" type="submit" disabled={(Boolean(hfModel)&&activeMode!=="live") || attachments.busy || preparingAttachments || !prompt.trim() || !selected.length || (masterMode && activeMode === "live" && missingRequired) || busy || !wb.loaded || !config?.authenticated} aria-label="Send prompt"><ArrowUp size={19}/></button></div></div>
      </form><div className="composer-disclaimer"><span className="live-dot"/>{activeMode === "demo" ? "Demo mode · Sample responses. No API calls or charges." : "Responses may be inaccurate. Verify important information."}<span className="footer-brand">sovereignOS</span></div></div>
    </div>
    {notice && <div className="toast" role="status">{notice}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice("")}><X size={14}/></button></div>}

    {config?.authRequired && !config.authenticated && !config.deploymentError && <div className="auth-screen"><form className="auth-card" onSubmit={unlock}><span className="auth-logo"><LockKeyhole size={25}/></span><span className="eyebrow">SOVEREIGN OS</span><h1>Your space.<br/>Your intelligence.</h1><p>Enter your workspace password to connect.</p><label>Workspace password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required autoFocus/></label>{authError && <p role="alert" className="form-error">{authError}</p>}<button className="primary-button" disabled={authBusy}>{authBusy ? "Unlocking…" : "Unlock workspace"}<ArrowUpRight size={16}/></button></form></div>}

    {modal === "analytics" && <Modal title="Social analytics & connectors" onClose={() => setModal(undefined)}><AnalyticsEditor analytics={wb.workspace.analytics} onSave={analytics => { wb.mutate(w => ({ ...w, analytics })); setModal(undefined); setNotice(analytics ? "Analytics snapshot saved for future runs." : "Analytics snapshot removed."); }}/></Modal>}
    {modal === "engine" && <Modal title="Model roles, bots & skills" onClose={() => setModal(undefined)}><EngineEditor engine={wb.workspace.engine} onSave={engine => { wb.mutate(w => ({ ...w, engine })); setModal(undefined); setNotice("Engine profiles saved for future prompts."); }}/></Modal>}
    {modal === "settings" && <Modal title="Connections & settings" onClose={() => setModal(undefined)}><p className="modal-intro">Your keys live on the server. New combined runs are saved privately in cloud storage; browser history also keeps a local copy.</p><div className="settings-providers">{config?.providers.map(p => <div key={p.id} className={`settings-provider ${p.id}`}><div className="provider-icon">{providers[p.id].symbol}</div><div><strong>{p.name}</strong><code>{p.model}</code></div><span className={p.configured ? "configured" : "not-configured"}>{p.configured ? "Key configured" : "Key needed"}</span></div>)}</div><div className="settings-section"><div><strong>Meta Muse · {config?.muse?.model || "muse-spark-1.3"}</strong><p>{config?.muse?.configured ? "Key configured · full council participant" : "Add MUSE_API_KEY in Production and redeploy"}</p><p role="status">{museStatus}</p></div><button className="secondary-button" disabled={!config?.muse?.configured || museTesting} onClick={async()=>{setMuseTesting(true);setMuseStatus("Testing Meta connection…");try{const r=await fetch("/api/muse",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"probe"})});const d=await r.json();setMuseStatus(r.ok?"Live response verified · "+d.model:d.error?.message||"Connection test failed");}catch{setMuseStatus("Connection test failed");}finally{setMuseTesting(false);}}}>{museTesting?"Testing…":"Test Muse connection"}</button></div><div className="settings-section"><strong>Gemini · {config?.gemini?.model}</strong><p>{config?.gemini?.configured ? "Key configured · full council participant" : "Add GEMINI_API_KEY in Production and redeploy"}</p></div><p className="settings-note">Set OPENAI_API_KEY, ANTHROPIC_API_KEY, PERPLEXITY_API_KEY, and XAI_API_KEY in your server environment, then redeploy. “Key configured” means present, not yet verified by a live call.</p><a className="inline-link" href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">OpenAI keys ↗</a><a className="inline-link" href="https://platform.claude.com" target="_blank" rel="noreferrer">Claude Console ↗</a><a className="inline-link" href="https://www.perplexity.ai/account/api" target="_blank" rel="noreferrer">Perplexity API ↗</a><a className="inline-link" href="https://console.x.ai/" target="_blank" rel="noreferrer">Grok API ↗</a>
      <div className="settings-section"><div><strong>Response mode</strong><p>Changing mode starts a new conversation.</p></div><div className="segmented">{(["demo", "live"] as const).map(m => <button key={m} disabled={m === "demo" && !config?.demoEnabled} className={activeMode === m ? "active" : ""} onClick={() => { setMode(m); newConversation(); }}>{m === "demo" ? "Demo" : "Live"}</button>)}</div></div><div className="settings-section"><div><strong>Workspace backup</strong><p>Export projects, context, and all conversations.</p></div><button className="secondary-button" onClick={exportWorkspace}><Download size={15}/>Export JSON</button></div><div className="settings-section"><div><strong>Restore a backup</strong><p>Preview and confirm before replacing local history.</p></div><button className="secondary-button" disabled={anyBusy} onClick={() => fileInput.current?.click()}>Import JSON</button><input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={async e => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; if (file.size > 10_000_000) { setNotice("Backup exceeds the 10 MB import limit."); return; } try { setImportData(restoreWorkspace(await file.text())); setModal(undefined); } catch { setNotice("That file is not a valid sovereignOS workspace backup."); } }}/></div>
      <div className="settings-section"><div><strong>Shared tools</strong><p>Project context is shared with every selected model. Enabled connector evidence is shared once per council run. Local MCP adds shared files, memory and coding tools.</p></div><span className="local-tag">MCP READY</span></div>
      {config?.authRequired && <button className="secondary-button" disabled={anyBusy} onClick={async () => { const r = await fetch("/api/session", { method: "DELETE" }); if (r.ok) { await refreshConfig(); setModal(undefined); } else setNotice("Could not lock the workspace. Please try again."); }}><LogOut size={15}/>Lock workspace</button>}
    </Modal>}
    {(modal === "project" || modal === "new-project") && <Modal title={modal === "new-project" ? "Create a project" : "Project context"} onClose={() => setModal(undefined)}><form onSubmit={saveProject} className="modal-form"><p className="modal-intro">Give all selected models the same starting point. Notes are included in future prompts and saved with each turn.</p><label>Project name<input value={draftName} onChange={e => setDraftName(e.target.value)} maxLength={80} required/></label><label>Shared context<textarea rows={9} value={draftNotes} onChange={e => setDraftNotes(e.target.value)} maxLength={12000} placeholder="Goals, audience, constraints, useful background…"/></label><p className="settings-note">Context is sent to selected providers in live mode. Keep API keys and passwords out of these notes.</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModal(undefined)}>Cancel</button><button className="primary-button" disabled={!draftName.trim()}>{modal === "new-project" ? "Create project" : "Save context"}</button></div></form></Modal>}
    {modal === "rename" && conversation && <Modal title="Rename conversation" onClose={() => setModal(undefined)}><form className="modal-form" onSubmit={e => { e.preventDefault(); if (!draftName.trim()) return; wb.mutate(w => ({ ...w, conversations: w.conversations.map(c => c.id === conversation.id ? { ...c, title: draftName.trim() } : c) })); setModal(undefined); }}><label>Conversation title<input value={draftName} onChange={e => setDraftName(e.target.value)} maxLength={100} required/></label><button className="primary-button">Save title</button></form></Modal>}
    {modal === "delete" && conversation && <Modal title="Delete this conversation?" onClose={() => setModal(undefined)}><p className="modal-intro">“{conversation.title}” will be removed from this browser. Export it first if you want to keep a copy.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setModal(undefined)}>Keep conversation</button><button className="danger-button" onClick={() => { wb.cancelConversation(conversation.id); wb.mutate(w => ({ ...w, conversations: w.conversations.filter(c => c.id !== conversation.id) })); newConversation(); setModal(undefined); }}>Delete conversation</button></div></Modal>}
    {modal === "help" && <Modal title="Make room for better thinking" onClose={() => setModal(undefined)}><div className="help-steps"><div><span>01</span><section><h3>Ask once. Explore together.</h3><p>Select any combination of the six providers. Responses arrive independently, so you can stop or retry any one.</p></section></div><div><span>02</span><section><h3>Bring your context.</h3><p>Organize conversations in projects and add reference notes. Each provider remembers its own completed answers within the conversation.</p></section></div><div><span>03</span><section><h3>Connect the perspectives.</h3><p>Choose a synthesis model to combine completed answers. Synthesis sends those answers to the selected provider and uses an additional API request in live mode.</p></section></div></div><p className="settings-note">Demo samples are not real answers. Live usage requires API keys and billing for each provider. CLI subscriptions help with development; this app uses server-side APIs. History is stored in this browser, so export a backup before clearing site data.</p></Modal>}
    {importData && <Modal title="Restore this workspace?" onClose={() => setImportData(undefined)}><p className="modal-intro">This backup contains {importData.projects.length} projects and {importData.conversations.length} conversations. Restoring replaces this browser’s current workspace.</p><div className="modal-actions"><button className="secondary-button" onClick={exportWorkspace}>Back up current</button><button className="primary-button" onClick={() => { wb.mutate(() => importData); setProjectId(importData.projects[0].id); newConversation(); setImportData(undefined); setNotice("Workspace restored."); }}>Restore backup</button></div></Modal>}
  </div>;
}






