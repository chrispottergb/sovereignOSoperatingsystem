import { providers, providerIds, type Answer, type GenerateInput, type ProviderId, type Turn } from "./contracts";
export const usable = (a?: Answer) => !!a?.text.trim() && a.status === "complete" && ["stop","end_turn","stop_sequence"].includes(a.finishReason || "stop");
export async function runChatWorkflow(o: {
 signal:AbortSignal; read:()=>Turn|undefined; patch:(p:Partial<Turn>)=>void;
 update:(s:NonNullable<Turn["council"]>["status"],m:string)=>void;
 run:(p:ProviderId,s:NonNullable<GenerateInput["reviewPhase"]>)=>Promise<void>;
 resumeResearch?:boolean;
}) {
 const {signal,read,patch,update,run}=o;
 if(signal.aborted) return;
 if(!o.resumeResearch) patch({answers:{},reviews:{},revisions:{}});
 patch({candidate:undefined,ballots:undefined,votes:undefined,rounds:undefined,routing:undefined,assignments:undefined,lockedAt:undefined,arbitration:undefined,audit:undefined,userDecision:undefined,botRuns:undefined});
 update("researching","Six models are independently answering your original request…");
 const partial=read()?.allowPartialCouncil===true && o.resumeResearch;
 const pending=partial?[]:providerIds.filter(id=>!usable(read()?.answers[id]));
 await Promise.all(pending.map(id=>run(id,"research")));
 if(signal.aborted) return;
 const available=providerIds.filter(id=>usable(read()?.answers[id]));
 if(available.length < (partial?3:providerIds.length)) { const missing=providerIds.filter(id=>!usable(read()?.answers[id]));update("error",`Paused before cross-review: ${missing.map(id=>providers[id].name+": "+(read()?.answers[id]?.error||"incomplete response")).join("; ")} ${available.length} completed answers are saved. Retry the missing models, or explicitly choose to finish with the available models.`); return; }
 update("reviewing","Comparing evidence and challenging the proposed approach behind the scenes…");
 const reviewers=available;
 // Changed research invalidates earlier critiques. Otherwise preserve completed reviews on retry.
 if(pending.length) patch({reviews:{},revisions:{}});
 const pendingReviews=reviewers.filter(id=>!usable(read()?.reviews?.[id]));
 if(pendingReviews.length) patch({revisions:{}});
 await Promise.all(pendingReviews.map(id=>run(id,"critique")));
 if(signal.aborted) return;
 if(reviewers.some(id=>!usable(read()?.reviews?.[id]))){update("error",`Cross-review incomplete: ${reviewers.filter(id=>!usable(read()?.reviews?.[id])).map(id=>providers[id].name+": "+(read()?.reviews?.[id]?.error||"incomplete response")).join("; ")}. Retry reuses completed work.`);return;}
 if(read()?.spendingMode === "thorough"){
  update("reviewing","Participating models are correcting their work against the cross-review…");
  await Promise.all(reviewers.filter(id=>!usable(read()?.revisions?.[id])).map(id=>run(id,"refine")));
  if(signal.aborted)return;
  if(reviewers.some(id=>!usable(read()?.revisions?.[id]))){update("error",`Corrections incomplete: ${reviewers.filter(id=>!usable(read()?.revisions?.[id])).map(id=>providers[id].name).join(", ")}. Retry preserves completed work.`);return;}
 }
 const editor=read()?.council?.lead === "openai" ? "openai" : "claude";
 update("planning",`${editor === "openai" ? "GPT Astra" : "Claude Fable 5.1"} is integrating the evidence, reviews and corrected work into one deliverable…`);
 await run(editor,"resolve");
 if(signal.aborted) return;
 if(!usable(read()?.synthesis)) { update("error",read()?.synthesis?.error || "The final answer did not finish. Its partial response is shown below. Retry to reuse the saved research and reviews."); return; }
 const missing=providerIds.filter(id=>!usable(read()?.answers[id]) || !usable(read()?.reviews?.[id]));
 update("complete",missing.length ? `Answer ready using ${available.length} models. Unavailable: ${missing.map(id=>providers[id].name).join(", ")}. This is not a full six-model result.` : "Answer ready. Research and peer review are saved in the process details.");
}
