import { providerIds, type Answer, type GenerateInput, type ProviderId, type Turn } from "./contracts";
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
 patch({synthesis:undefined,candidate:undefined,ballots:undefined,votes:undefined,rounds:undefined,routing:undefined,assignments:undefined,lockedAt:undefined,arbitration:undefined,audit:undefined,userDecision:undefined,botRuns:undefined});
 update("researching","Six models are independently answering your original request…");
 const pending=providerIds.filter(id=>!usable(read()?.answers[id]));
 await Promise.all(pending.map(id=>run(id,"research")));
 if(signal.aborted) return;
 const available=providerIds.filter(id=>usable(read()?.answers[id]));
 if(available.length!== providerIds.length) { update("error","All six answers must finish before cross-review. Check the saved errors and retry; completed answers will be reused."); return; }
 update("reviewing","Comparing evidence and challenging the proposed approach behind the scenes…");
 const reviewers=providerIds;
 // Changed research invalidates earlier critiques. Otherwise preserve completed reviews on retry.
 if(pending.length) patch({reviews:{},revisions:{}});
 const pendingReviews=reviewers.filter(id=>!usable(read()?.reviews?.[id]));
 if(pendingReviews.length) patch({revisions:{}});
 await Promise.all(pendingReviews.map(id=>run(id,"critique")));
 if(signal.aborted) return;
 if(providerIds.some(id=>!usable(read()?.reviews?.[id]))){update("error","All six adversarial reports must finish before final evaluation. Retry to reuse completed work.");return;}
 if(read()?.spendingMode === "thorough"){
  update("reviewing","All six models are correcting their work against the full cross-review…");
  await Promise.all(providerIds.filter(id=>!usable(read()?.revisions?.[id])).map(id=>run(id,"refine")));
  if(signal.aborted)return;
  if(providerIds.some(id=>!usable(read()?.revisions?.[id]))){update("error","Correction is incomplete. Retry to preserve completed work and finish the missing contributions.");return;}
 }
 const editor=read()?.council?.lead === "openai" ? "openai" : "claude";
 update("planning",`${editor === "openai" ? "GPT Astra" : "Claude Fable 5.1"} is integrating the evidence, reviews and corrected work into one deliverable…`);
 await run(editor,"resolve");
 if(signal.aborted) return;
 if(!usable(read()?.synthesis)) { update("error",read()?.synthesis?.error || "The final answer did not finish. Its partial response is shown below. Retry to reuse the saved research and reviews."); return; }
 const missing=providerIds.filter(id=>!usable(read()?.answers[id]) || !usable(read()?.reviews?.[id]));
 update("complete",missing.length ? `Answer ready with limited contributions from ${missing.join(", ")}. Review details are saved.` : "Answer ready. Research and peer review are saved in the process details.");
}
