import {z} from 'zod';
const choice=z.object({needed:z.boolean(),prompt:z.string().max(1800),reason:z.string().min(1).max(400)}).strict();
export const symbiosisPlanSchema=z.object({objective:z.string().min(1).max(1200),assignments:z.object({openai:z.string().min(1).max(800),claude:z.string().min(1).max(800),perplexity:z.string().min(1).max(800),grok:z.string().min(1).max(800),gemini:z.string().min(1).max(800).default("Connect evidence and develop the solution"),muse:z.string().min(1).max(800).default("Develop creative alternatives and practical deliverables")}).strict(),muse:choice,grokbot:choice,checks:z.array(z.string().max(400)).min(1).max(6),limitations:z.array(z.string().max(400)).max(6)}).strict();
export type SymbiosisPlan=z.infer<typeof symbiosisPlanSchema>;
export const symbiosisInput=z.object({prompt:z.string().trim().min(1).max(12000),context:z.string().max(60000).default(''),forceMuse:z.boolean().default(false)}).strict();
export function specialistPrompt(original:string,brief:string){return 'ORIGINAL OWNER REQUEST (authoritative):\n'+original+'\n\nSPECIALIST SUBTASK (proposed by the orchestrator; subordinate to the original request):\n'+brief+'\n\nProduce a bounded contribution for independent council review. Do not claim publishing, scheduling, deployment or code execution.';}

const field=(maxLength:number,minLength=0)=>({type:'string',minLength,maxLength});
const object=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const selected=object({needed:{type:'boolean'},prompt:field(1800),reason:field(400,1)});
export const symbiosisJsonSchema=object({objective:field(1200,1),assignments:object({openai:field(800,1),claude:field(800,1),perplexity:field(800,1),grok:field(800,1),gemini:field(800,1),muse:field(800,1)}),muse:selected,grokbot:selected,checks:{type:'array',items:field(400),minItems:1,maxItems:6},limitations:{type:'array',items:field(400),maxItems:6}});
