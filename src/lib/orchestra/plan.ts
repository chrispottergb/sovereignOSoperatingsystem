import {z} from "zod";
import type {Step} from "../astra";
export const orchestraInput=z.object({prompt:z.string().trim().min(3).max(12000),intent:z.enum(["auto","research","writing","campaign","build"]).default("auto"),builder:z.enum(["codex","claude-code"]).default("codex"),environment:z.enum(["local","cloud"]).default("local"),repository:z.string().max(200).default(""),connectorIds:z.array(z.string().uuid()).max(20).default([]),research:z.boolean().default(true),maxReportedTokens:z.number().int().min(10000).max(200000).default(80000),buildMinutes:z.number().int().min(1).max(20).default(10),buildBudgetUsd:z.number().min(0.1).max(20).default(3),requestId:z.string().uuid()}).superRefine((v,c)=>{if(v.repository&&!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(v.repository))c.addIssue({code:"custom",message:"Use a public GitHub repository URL without credentials, query or branch path."});});
export type OrchestraInput=z.infer<typeof orchestraInput>;
export type OrchestraStep=Step&{executor?:"codex"|"claude-code"};
export function classify(prompt:string):"research"|"writing"|"campaign"|"build" {
 if(/\b(build|implement|debug|fix|refactor|code|develop)\b[\s\S]*\b(app|website|software|api|code|bug|repository|dashboard|backend|frontend)\b/i.test(prompt))return "build";
 if(/\b(campaign|marketing|social media|launch plan)\b/i.test(prompt))return "campaign";
 if(/\b(write|rewrite|copy|email|article|caption)\b/i.test(prompt))return "writing";
 return "research";
}
export const hierarchy=[
 {role:"Conductor",owner:"SovereignOS backend",purpose:"Route intent, enforce dependencies and budgets, preserve artifacts, and report real execution state.",limit:"Does not treat a model's claim as proof that a tool ran."},
 {role:"Evidence",owner:"Perplexity",purpose:"Dated research, source provenance, version checks and supplied analytics.",limit:"Search coverage is incomplete; citations still need checking."},
 {role:"Challenge",owner:"Grok",purpose:"Alternative hypotheses, audience reaction, creative angles and overlooked assumptions.",limit:"Social sentiment is not verified fact or private account analytics."},
 {role:"Build",owner:"Your choice: Codex or Claude Code",purpose:"One coding agent owns the isolated checkout and implementation.",limit:"Tests and actual artifacts determine progress; two agents never write the same checkout simultaneously."},
 {role:"Review",owner:"A different provider from the builder",purpose:"Examine changes, test evidence, failure cases and acceptance criteria.",limit:"A review is not a substitute for tests, and model agreement is not correctness."},
 {role:"Resolution",owner:"Astra, then Claude review",purpose:"Resolve material objections and deliver one coherent result with uncertainty intact.",limit:"Cannot authorize publishing, merging or production deployment."},
];
export function orchestraPlan(input:OrchestraInput):{intent:string;steps:OrchestraStep[]} {
 const intent=input.intent==="auto"?classify(input.prompt):input.intent,steps:OrchestraStep[]=[];
 const add=(s:OrchestraStep)=>steps.push(s);
 if(input.research)add({id:"evidence",provider:"perplexity",stage:"ground",title:"Evidence and source checks",depends:[],search:true,instruction:"Research the actual request using dated primary sources. Verify relevant APIs or factual claims. Include conflicting findings, unknowns and source links. Use supplied account data honestly; never invent metrics. Maximum 500 words."});
 const evidence=steps.map(s=>s.id),builder=input.builder==="codex"?"openai":"claude",reviewer=builder==="openai"?"claude":"openai";
 add({id:"proposal",provider:intent==="build"?reviewer:"claude",stage:"draft",title:intent==="build"?"Architecture and acceptance criteria":"Draft the approach",depends:evidence,instruction:`Develop the ${intent} deliverable: scope, assumptions, concrete approach, dependencies and measurable acceptance criteria. For software produce an implementation brief, not a claim of execution. Use only capabilities actually connected. Maximum 700 words.`});
 add({id:"challenge",provider:"grok",stage:"critique",title:"Challenge assumptions",depends:[...evidence,"proposal"],instruction:"Challenge the proposal with specific evidence, alternative approaches and practical or audience risks. Separate fact from sentiment. Quote material issues and suggest corrections; do not manufacture objections. Maximum 300 words."});
 add({id:"resolution",provider:"openai",stage:"synthesize",title:"Astra resolves the plan",depends:[...evidence,"proposal","challenge"],instruction:"Resolve objections using evidence, feasibility and the owner's request. Provide the final actionable brief and acceptance criteria. Preserve uncertainty; no votes, permission escalation or fictitious tool execution. Maximum 700 words."});
 if(intent==="build"){
  add({id:"build",provider:builder,executor:input.builder,stage:"draft",title:`Build with ${input.builder==="codex"?"Codex":"Claude Code"}`,depends:["resolution"],instruction:"Implement the approved brief in the isolated checkout. Do not publish, push, deploy, access secrets or modify credentials. Follow project instructions. Run available checks and distinguish passed, failed and unexecuted tests. Return a concise implementation report."});
  add({id:"independent-review",provider:reviewer,stage:"audit",title:"Independent implementation review",depends:["resolution","build"],instruction:"Review the actual build artifacts and verification evidence against the plan. You are not the builder. Identify concrete defects and remaining gaps. Do not claim tests ran unless the runner records them. If build failed, explain the blocker, not an imagined success. Maximum 500 words."});
 }
 add({id:"final",provider:"claude",stage:"revision",title:"Claude review and one final answer",depends:[...evidence,"resolution",...(intent==="build"?["build","independent-review"]:[])],instruction:"Review Astra's resolution and the independent evidence. Return ONE useful answer tailored to the original prompt. Preserve material dissent and uncertainty. For builds, describe actual saved changes and independently reviewed results, list real test outcomes and blockers; never label incomplete or failed builds successful. No model-by-model transcript. No external deployment occurred. Maximum 900 words."});
 return {intent,steps};
}
