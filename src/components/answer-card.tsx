"use client";
import { parseBoss } from "@/lib/boss";
import { BossActions } from "./boss-actions";
import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, ExternalLink, RotateCcw, Square, AlertCircle, Sparkles } from "lucide-react";
import { providers, type Answer, type ProviderId } from "@/lib/contracts";
export function AnswerCard({ provider, answer, model, onRetry, onCancel, synthesis = false, retryDisabled = false, title }: { provider: ProviderId; answer?: Answer; model?: string; onRetry?: () => void; onCancel?: () => void; synthesis?: boolean; retryDisabled?: boolean; title?: string }) {
  const [copied, setCopied] = useState(false), [copyError, setCopyError] = useState(false), [remaining, setRemaining] = useState(0);
  useEffect(() => { if (!copied) return; const id = setTimeout(() => setCopied(false), 2000); return () => clearTimeout(id); }, [copied]);
  useEffect(() => { const tick = () => setRemaining(Math.max(0, Math.ceil(((answer?.retryAfter ?? 0) - Date.now()) / 1000))); const id = setInterval(tick, 500); tick(); return () => clearInterval(id); }, [answer?.retryAfter]);
  const p = providers[provider], running = answer?.status === "streaming";
  const lengthLimited = ["max_tokens", "max_output_tokens", "length"].includes(answer?.finishReason || "");
  const tokens = answer?.usage?.inputTokens !== undefined || answer?.usage?.outputTokens !== undefined ? (answer.usage.inputTokens ?? 0) + (answer.usage.outputTokens ?? 0) : undefined;
  return <article className={`answer-card ${provider} ${synthesis ? "synthesis-card" : ""}`} aria-label={`${title || (synthesis ? "Synthesis" : p.name)} response`}>
    <header className="card-head"><div className="provider-icon">{synthesis ? <Sparkles size={19}/> : p.symbol}</div><div className="card-name"><h3>{title || (synthesis ? "Synthesis" : p.name)}</h3><span title={answer?.model || model}>{answer?.model || model || p.description}</span></div><span className={`status-dot ${running ? "pulse" : ""} ${answer?.status || "idle"}`} title={answer?.status || "Ready"}/></header>
    <div className="answer-body">
      {!answer && <div className="card-empty"><span className="ghost-symbol">{p.symbol}</span><p>A different perspective.<br/>The same starting point.</p><span>{p.description}</span></div>}
      {answer?.text && <div className="prose"><Markdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => /^https?:\/\//i.test(href || "") ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>, img: ({ alt }) => <span className="image-placeholder">[Image: {alt || "external image"}]</span> }}>{synthesis ? parseBoss(answer.text).deliverable : answer.text}</Markdown></div>}
      {synthesis && answer?.status === "complete" && <BossActions key={answer.text} text={answer.text}/>}
      {running && !answer?.text && <div className="thinking"><span/><span/><span/><p>Connecting ideas…</p></div>}
      {running && answer?.text && <span className="stream-cursor" aria-hidden="true"/>}
      {answer?.error && <div className="response-error" role="alert"><AlertCircle size={16}/><span>{answer.error}</span></div>}
      {answer?.status === "cancelled" && <p className="muted">Response stopped. You can retry when ready.</p>}
      {answer?.finishReason && !["stop", "end_turn", "stop_sequence"].includes(answer.finishReason) && <p className="response-warning">{lengthLimited ? "Answer length limit reached. This response is incomplete. This is not an API credit-balance error." : `Provider stopped: ${answer.finishReason}. This answer may be incomplete.`}</p>}
      {!!answer?.citations.length && <div className="citations"><span className="eyebrow">Sources</span>{answer.citations.map((c, i) => /^https?:\/\//i.test(c.url) ? <a href={c.url} key={c.url} target="_blank" rel="noopener noreferrer"><span>{i + 1}</span>{c.title}<ExternalLink size={12}/></a> : null)}</div>}
    </div>
    <footer className="card-footer"><span className="usage" title={answer?.usage ? `Input: ${answer.usage.inputTokens ?? "unknown"} · Output: ${answer.usage.outputTokens ?? "unknown"} · Cached: ${answer.usage.cachedTokens ?? "unknown"}` : undefined}>
      {running ? "Generating" : answer ? lengthLimited ? "Incomplete · length limit" : answer.status === "complete" ? "Complete" : answer.status === "cancelled" ? "Stopped" : "Needs attention" : "Awaiting your prompt"}
      {tokens !== undefined && ` · ${tokens.toLocaleString()} tokens`}{answer?.elapsedMs !== undefined && ` · ${(answer.elapsedMs / 1000).toFixed(1)}s`}
      {answer?.usage?.costUsd !== undefined && <span className="cost">{answer.usage.costKind === "estimate" ? "est. " : ""}${answer.usage.costUsd.toFixed(4)}</span>}
    </span><div className="card-actions">
      {answer?.text && <button className="icon-button" aria-label={`Copy ${synthesis ? "synthesis" : p.name} response`} title={copyError ? "Copy unavailable in this browser" : "Copy response"} onClick={() => { void navigator.clipboard.writeText(answer.text).then(() => setCopied(true)).catch(() => setCopyError(true)); }}>{copied ? <Check size={15}/> : <Copy size={15}/>}</button>}
      {running && onCancel ? <button className="icon-button" onClick={onCancel} aria-label={`Cancel ${synthesis ? "synthesis" : p.name}`}><Square size={14}/></button> : answer && onRetry && <button className="icon-button" onClick={onRetry} disabled={remaining > 0 || retryDisabled} aria-label={`Retry ${synthesis ? "synthesis" : p.name}`} title={remaining ? `Retry in ${remaining}s` : "Generate a new response"}>{remaining > 0 ? <span>{remaining}s</span> : <RotateCcw size={15}/>}</button>}
    </div></footer>
  </article>;
}
