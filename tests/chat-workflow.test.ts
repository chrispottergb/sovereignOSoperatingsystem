import {it,expect} from "vitest";
import {runChatWorkflow} from "../src/lib/chat-workflow";
import {type Turn,type ProviderId,type GenerateInput} from "../src/lib/contracts";
function fixture(fail?:ProviderId) {
 let turn:Turn={id:"t",prompt:"Build a campaign",createdAt:Date.now(),mode:"demo",context:{projectName:"Test",notes:""},answers:{}};
 const calls:string[]=[];
 const options={signal:new AbortController().signal,read:()=>turn,patch:(p:Partial<Turn>)=>{turn={...turn,...p};},update:(status:NonNullable<Turn["council"]>["status"],message:string)=>{turn.council={protocol:"chat",status,message,lead:"claude",participants:["openai","claude","perplexity","grok"]};},run:async(provider:ProviderId,phase:NonNullable<GenerateInput["reviewPhase"]>)=>{
  calls.push(`${provider}:${phase}`);
  const answer={provider,status:provider===fail?"error" as const:"complete" as const,text:provider===fail?"":"Useful answer",citations:[],finishReason:"stop"};
  if(phase==="research") turn.answers[provider]=answer;
  else if(phase==="refine") turn.revisions={...turn.revisions,[provider]:answer};
  else if(phase==="critique") turn.reviews={...turn.reviews,[provider]:answer};
  else if(phase==="adjudicate") turn.arbitration=answer; else turn.synthesis=answer;
 }};
 return {options,calls,read:()=>turn};
}
it("finishes one answer without votes or manual deadlock approval",async()=>{
 const f=fixture();await runChatWorkflow(f.options);
 expect(f.calls).toHaveLength(13);expect(f.calls.at(-1)).toBe("claude:resolve");
 expect(f.read().council?.status).toBe("complete");expect(f.read().lockedAt).toBeUndefined();
});
it("stops before review when one answer fails",async()=>{
 const f=fixture("grok");await runChatWorkflow(f.options);
 expect(f.read().council?.status).toBe("error");expect(f.calls).toHaveLength(6);
});
it("retries final synthesis without repeating completed research and critiques",async()=>{
 const f=fixture();await runChatWorkflow(f.options);f.calls.length=0;
 await runChatWorkflow({...f.options,resumeResearch:true});expect(f.calls).toEqual(["claude:resolve"]);
});
it("stopping before a run prevents all billable requests",async()=>{
 const f=fixture();await runChatWorkflow({...f.options,signal:AbortSignal.abort()});expect(f.calls).toEqual([]);
});

it("full council corrects all six contributions before the selected final editor",async()=>{
 const f=fixture();f.options.patch({spendingMode:"thorough"});
 const update=f.options.update;f.options.update=(status,message)=>{update(status,message);f.read().council!.lead="openai";};
 await runChatWorkflow(f.options);expect(f.calls).toHaveLength(19);expect(f.calls.slice(12,18)).toEqual(["openai:refine","claude:refine","perplexity:refine","grok:refine","gemini:refine","muse:refine"]);expect(f.calls.at(-1)).toBe("openai:resolve");
 f.calls.length=0;await runChatWorkflow({...f.options,resumeResearch:true});expect(f.calls).toEqual(["openai:resolve"]);
});
it("a failed correction blocks the final answer and retry reuses completed corrections",async()=>{
 const f=fixture();f.options.patch({spendingMode:"thorough"});const run=f.options.run;let failing=true;f.options.run=async(p,s)=>{await run(p,s);if(p==="grok"&&s==="refine"&&failing)f.read().revisions!.grok!.status="error";};
 await runChatWorkflow(f.options);expect(f.calls).toHaveLength(18);expect(f.read().council?.status).toBe("error");failing=false;f.calls.length=0;await runChatWorkflow({...f.options,resumeResearch:true});expect(f.calls).toEqual(["grok:refine","claude:resolve"]);
});

it("upgrades saved four-member research without repeating their assessments",async()=>{
 const f=fixture();for(const p of ['openai','claude','perplexity','grok'] as const)await f.options.run(p,'research');f.calls.length=0;
 await runChatWorkflow({...f.options,resumeResearch:true});
 expect(f.calls.filter(c=>c.endsWith(':research'))).toEqual(['gemini:research','muse:research']);expect(f.calls.filter(c=>c.endsWith(':critique'))).toHaveLength(6);expect(f.calls.at(-1)).toBe('claude:resolve');expect(f.read().council?.status).toBe('complete');
});

it("finishes with five only after explicit partial-council selection",async()=>{
 const f=fixture("gemini");await runChatWorkflow(f.options);expect(f.read().council?.status).toBe("error");expect(f.read().council?.message).toContain("Gemini");f.calls.length=0;
 f.options.patch({allowPartialCouncil:true});await runChatWorkflow({...f.options,resumeResearch:true});
 expect(f.calls.some(c=>c.startsWith("gemini:"))).toBe(false);expect(f.calls.filter(c=>c.endsWith(":research"))).toHaveLength(0);expect(f.calls.filter(c=>c.endsWith(":critique"))).toHaveLength(5);expect(f.calls.at(-1)).toBe("claude:resolve");expect(f.read().council?.status).toBe("complete");expect(f.read().council?.message).toContain("not a full six-model result");
});
it("single reporter uses only its report and Boss, including full-depth mode and retries",async()=>{const f=fixture();f.options.patch({singleReporter:"perplexity",spendingMode:"thorough"});await runChatWorkflow(f.options);expect(f.calls).toEqual(["perplexity:research","claude:resolve"]);expect(f.read().council?.status).toBe("complete");f.calls.length=0;await runChatWorkflow({...f.options,resumeResearch:true});expect(f.calls).toEqual(["claude:resolve"]);});
it("failed requested reporter never substitutes the council",async()=>{const f=fixture("gemini");f.options.patch({singleReporter:"gemini"});await runChatWorkflow(f.options);expect(f.calls).toEqual(["gemini:research"]);expect(f.read().council?.status).toBe("error");});
