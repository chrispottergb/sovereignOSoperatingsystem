import {z} from 'zod';
const line=z.string().min(1).max(1000).refine(s=>s.trim().length>0&&!/[\r\n\0]/.test(s),'Use one non-empty line.');
export const ayaShape={task_name:line,action:line,destination:line,content:z.string().min(1).max(50000).refine(s=>s.trim().length>0&&!/\0/.test(s),'Content must be readable text.'),timing:line,approval:z.enum(['Chris approved',"needs Chris's approval",'draft only'])};
export const ayaInput=z.object(ayaShape).strict();
export type AyaInput=z.infer<typeof ayaInput>;
export function ayaBody(input:AyaInput){return ['ACTION: '+input.action,'DESTINATION: '+input.destination,'CONTENT: '+input.content,'TIMING: '+input.timing+' (timezone America/Chicago)','APPROVAL: '+input.approval].join('\n');}
export const ayaHelp="Submit ONE task by email to Aya only when Chris authorizes the handoff. Never invent Chris approved: use it only with explicit approval for the exact action; otherwise use needs Chris's approval or draft only. No batching. submitted means email accepted, NOT task completed: wait for Aya's same-thread reply with proof. No automatic retries after uncertain results.";
