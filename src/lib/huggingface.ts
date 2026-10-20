import {z} from 'zod';
export const hfModelIds=['deepseek-ai/DeepSeek-V4-Pro','Qwen/Qwen3.8-2.4T-A95B','zai-org/GLM-5.3','moonshotai/Kimi-K3','MiniMaxAI/MiniMax-M3'] as const;
export const hfModelSchema=z.enum(hfModelIds);
export const hfModels=[
 {id:hfModelIds[0],name:'DeepSeek V4 Pro',role:'Reasoning and technical analysis',license:'MIT'},
 {id:hfModelIds[1],name:'Qwen3.8',role:'General research and coding',license:'Qwen3.8-Max custom'},
 {id:hfModelIds[2],name:'GLM-5.3',role:'Complex coding and task planning',license:'GLM-5.3 custom'},
 {id:hfModelIds[3],name:'Kimi K3',role:'Long-context knowledge work',license:'Kimi K3 custom'},
 {id:hfModelIds[4],name:'MiniMax M3',role:'Efficient drafting and coding',license:'MiniMax community'},
];
export const hfReportSchema=z.object({model:hfModelSchema,reportedModel:z.string(),text:z.string().min(1).max(60000),inputTokens:z.number().optional(),outputTokens:z.number().optional(),completedAt:z.number()});
export type HfModel=z.infer<typeof hfModelSchema>;
