import {z} from 'zod';
import {providerIds} from './contracts';
import {hfModelIds,hfModels} from './huggingface';

export const engineModelIds=[...providerIds,...hfModelIds] as const;
export const engineModelSchema=z.enum(engineModelIds);
export type EngineModel=z.infer<typeof engineModelSchema>;
export const engineInput=z.object({
 request:z.string().trim().min(1).max(12000),context:z.string().max(40000).default(''),
 reporter:engineModelSchema.optional(),editor:z.enum(['openai','claude']).default('claude'),
 depth:z.enum(['economy','thorough']).default('economy'),
 candidates:z.array(engineModelSchema).min(1).max(11).optional(),
 projectId:z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).default('personal'),
 clientId:z.string().uuid(), maxCalls:z.number().int().min(2).max(24).default(14),
 maxInputCharacters:z.number().int().min(20000).max(800000).default(320000),
});
export type EngineInput=z.infer<typeof engineInput>;
export const assignmentSchema=z.object({model:engineModelSchema,task:z.string().min(1).max(1600),acceptance:z.string().min(1).max(1000)});
export const planSchema=z.object({objective:z.string().min(1).max(1600),criteria:z.array(z.string().min(1).max(600)).min(1).max(8),assignments:z.array(assignmentSchema).min(1).max(11)});
export const peerDecisionSchema=z.object({candidateHash:z.string().regex(/^[a-f0-9]{64}$/),decision:z.enum(['ACCEPT','REVISE']),blockers:z.array(z.string().max(1600)).max(8),changes:z.array(z.string().max(1600)).max(8),notChecked:z.array(z.string().max(1000)).max(8),evidenceQuestion:z.string().max(1200).optional()}).refine(v=>v.decision!=='ACCEPT'||v.blockers.length===0,'Acceptance cannot have blocking issues');
export type EnginePlan=z.infer<typeof planSchema>;
export type PeerDecision=z.infer<typeof peerDecisionSchema>;
export type ModelReceipt={model:string;requestedModel?:string;family:string;inputTokens?:number;outputTokens?:number;elapsedMs:number;citations?:{url:string;title:string}[]};
export type EngineRecord={kind:'plan'|'report'|'draft'|'review'|'evidence'|'revision';model:EngineModel;text:string;receipt?:ModelReceipt;error?:string;candidateHash?:string;round?:number};
export type EngineState={requestHash?:string;observations?:{model:string;samples:number;successRate:number;meanLatencyMs:number}[];version:1;phase:'plan'|'report'|'draft'|'review'|'evidence'|'revision'|'done';eligible:EngineModel[];plan?:EnginePlan;records:EngineRecord[];candidate?:{text:string;hash:string;revision:number};reviews:{model:'openai'|'claude';round:number;decision?:PeerDecision;error?:string}[];round:number;calls:number;inputCharacters:number;warnings:string[];final?:string;agreement?:'accepted'|'unresolved'|'single_reporter';evidenceUsed?:boolean};
export type EngineRun={id:string;owner:string;input:EngineInput;state:EngineState;status:'queued'|'running'|'complete'|'paused'|'cancelled';claim:string|null;claimed_at:string|null;created_at:string;updated_at:string};
export const rolePriors:Record<EngineModel,string>={openai:'Architecture, reasoning, integration and decision analysis',claude:'Instruction fidelity, critique and coherent deliverables',perplexity:'Current evidence and source retrieval',grok:'Alternative hypotheses and counterexamples',gemini:'Cross-domain synthesis and supplied multimodal briefs',muse:'Creative alternatives and supplied multimodal briefs',...Object.fromEntries(hfModels.map(m=>[m.id,m.role]))} as Record<EngineModel,string>;
export function familyOf(model:string):string {
 const id=model.toLowerCase();if(id.includes('gpt')||id.includes('openai'))return 'openai';if(id.includes('claude'))return 'anthropic';if(id.includes('gemini'))return 'google';if(id.includes('muse'))return 'meta';if(id.includes('grok'))return 'xai';if(id.includes('deepseek'))return 'deepseek';if(id.includes('qwen'))return 'qwen';if(id.includes('glm')||id.includes('zai'))return 'zai';if(id.includes('kimi')||id.includes('moonshot'))return 'moonshot';if(id.includes('minimax'))return 'minimax';if(id.includes('sonar'))return 'perplexity';return 'unresolved';
}
export function parseObject(text:string):unknown {return JSON.parse(text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}
export function validPlan(raw:unknown,eligible:EngineModel[],max:number):EnginePlan {
 const plan=planSchema.parse(raw);if(plan.assignments.length>max||new Set(plan.assignments.map(a=>a.model)).size!==plan.assignments.length||plan.assignments.some(a=>!eligible.includes(a.model)))throw Error('Plan assigned unavailable, duplicate or excess models.');return plan;
}
export function sameRevisionAccepted(state:EngineState){return Boolean(state.candidate&&(['openai','claude'] as const).every(model=>state.reviews.some(r=>r.model===model&&r.round===state.round&&r.decision?.decision==='ACCEPT'&&r.decision.candidateHash===state.candidate!.hash)));}
export function fallbackPlan(input:EngineInput,eligible:EngineModel[]):EnginePlan {
 const limit=Math.min(input.depth==='thorough'?6:3,input.maxCalls-8);
 const preferred:EngineModel[]=/code|build|implement|debug|software/i.test(input.request)?['openai',hfModelIds[0],hfModelIds[1],'claude','gemini','grok']:/music|art|creative|story|lyrics/i.test(input.request)?['muse','claude','grok','gemini']:['perplexity','openai','gemini','grok','claude'];
 const selected=input.reporter?[input.reporter]:[...new Set([...preferred,...eligible])].filter(m=>eligible.includes(m)).slice(0,Math.max(1,limit));
 return {objective:input.request,criteria:['Complete the requested deliverable.','Support claims and disclose unverified assumptions.','Keep external actions held for owner selection.'],assignments:selected.map(model=>({model,task:rolePriors[model],acceptance:'Provide a concrete contribution, cite evidence actually consulted, and identify gaps or a better task allocation.'}))};
}
export function terminalText(state:EngineState):string {
 const text=state.candidate?.text||state.records.filter(r=>r.kind==='report'&&!r.error).map(r=>r.text).join('\n\n')||'No model produced a usable deliverable. Check provider availability and resume this saved run.';
 const limitations=[...state.warnings,...state.reviews.filter(r=>r.round===state.round).flatMap(r=>r.error?[r.model+': '+r.error]:r.decision?.decision==='REVISE'?r.decision.blockers:[])];
 return text+(state.agreement==='accepted'?'\n\nReview: Astra and Fable accepted this same revision.':state.agreement==='single_reporter'?'\n\nReview: requested specialist report reviewed by Boss.':'\n\nReview: dual acceptance was not reached. This is the best saved deliverable, with unresolved review limitations.')+(limitations.length?'\n\nLimitations:\n'+[...new Set(limitations)].map(v=>'- '+v).join('\n'):'');
}
