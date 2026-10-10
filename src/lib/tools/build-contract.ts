import {z} from 'zod';
export const buildShape={councilBrief:z.string().max(65000).optional(),synthesizer:z.enum(["claude","openai"]).optional(),task:z.string().min(3).max(12000),builder:z.enum(['codex','claude-code']),environment:z.enum(['local','cloud']).default('local'),files:z.array(z.string().min(1)).max(30).default([]),minutes:z.number().int().min(1).max(20).default(10),claude_budget_usd:z.number().min(0.1).max(20).default(3)};
export type BuildInput=z.infer<ReturnType<typeof buildSchema>>;
export function buildSchema(){return z.object(buildShape).strict();}
