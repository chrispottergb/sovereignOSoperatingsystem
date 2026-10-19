import {symbiosisPlanSchema} from './symbiosis';
import {attachmentBriefSchema} from './attachments';
import { z } from "zod";

export const providerIds = ["openai", "claude", "perplexity", "grok", "gemini", "muse"] as const;
export const providerSchema = z.enum(providerIds);
export type ProviderId = z.infer<typeof providerSchema>;
export const providers: Record<ProviderId, { name: string; description: string; symbol: string }> = {
  gemini:{name:"Gemini",description:"Analyze & connect",symbol:"✦"},
  muse:{name:"Muse",description:"Create & evaluate",symbol:"◈"},
  openai: { name: "OpenAI", description: "Reason & create", symbol: "◎" },
  claude: { name: "Claude", description: "Think it through", symbol: "✳" },
  perplexity: { name: "Perplexity", description: "Explore & discover", symbol: "⌘" },
  grok: { name: "Grok", description: "Question & explore", symbol: "𝕏" },
};
export const usageSchema = z.object({ inputTokens: z.number().optional(), outputTokens: z.number().optional(), cachedTokens: z.number().optional(), costUsd: z.number().optional(), costKind: z.enum(["reported", "estimate"]).optional() });
export type Usage = z.infer<typeof usageSchema>;
export const citationSchema = z.object({ url: z.string(), title: z.string() });
export type Citation = z.infer<typeof citationSchema>;
export const messageSchema = z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(60000) });
export type Message = z.infer<typeof messageSchema>;
export const contextSchema = z.object({ projectName: z.string().max(80), notes: z.string().max(12000) });
export type SharedContext = z.infer<typeof contextSchema>;
const sourceSchema = z.object({ provider: providerSchema, text: z.string().min(1).max(60000), citations: z.array(citationSchema).max(50).default([]) });
export const assignmentSchema = z.object({ provider: providerSchema, role: z.string().min(1).max(100), task: z.string().min(1).max(1800) });
export const routingSchema = z.object({ assignments: z.array(assignmentSchema).min(2).max(providerIds.length), rationale: z.string().max(2000) });
export const engineProfileSchema = z.object({ name: z.string().min(1).max(80), instructions: z.string().max(5000) });
export type EngineProfile = z.infer<typeof engineProfileSchema>;
export const engineSchema = z.object({ profiles: z.record(providerSchema, engineProfileSchema) });
export type Engine = z.infer<typeof engineSchema>;
export const proposalSchema = routingSchema.extend({ approach: z.string().min(1).max(6000), successCriteria: z.array(z.string().min(1).max(500)).min(1).max(8), risks: z.array(z.string().max(500)).max(8) });
export const candidateSchema = z.object({ id: z.string().min(1).max(100), proposal: proposalSchema });
export const voteSchema = z.object({ candidateId: z.string().min(1).max(100), decision: z.enum(["approve", "revise"]), rationale: z.string().min(1).max(2000), objections: z.array(z.string().min(1).max(2000)).max(8), checks: z.object({ evidence: z.boolean(), feasibility: z.boolean(), impact: z.boolean(), efficiency: z.boolean(), taskFit: z.boolean() }) });
export type Candidate = z.infer<typeof candidateSchema>;
export type Vote = z.infer<typeof voteSchema>;
export const ballotSchema = z.object({ provider: providerSchema, vote: voteSchema });
export const analyticsSchema = z.object({ platform: z.string().min(1).max(80), period: z.string().min(1).max(120), data: z.string().min(1).max(16000) });
export const decisionSchema = z.object({ candidateId: z.string().min(1), rationale: z.string().min(1).max(2000), decidedAt: z.number() });
export const generateSchema = z.object({
  allowPartialCouncil:z.boolean().optional(),
  spendingMode: z.enum(["economy", "thorough"]).optional(),
  provider: providerSchema, mode: z.enum(["live", "demo"]), kind: z.enum(["response", "synthesis"]),
  prompt: z.string().trim().min(1).max(12000), history: z.array(messageSchema).max(24).default([]),
  context: contextSchema,
  sharedEvidence: z.string().max(60000).optional(),
  revisions: z.array(sourceSchema).max(providerIds.length).optional(),
  sources: z.array(sourceSchema).max(providerIds.length).optional(),
  reviewPhase: z.enum(["research", "routing", "critique", "vote", "arbitrate", "audit", "master", "execute", "resolve", "adjudicate", "refine"]).optional(),
  critiques: z.array(sourceSchema).max(providerIds.length).optional(),
  participants: z.array(providerSchema).min(2).max(providerIds.length).optional(),
  assignment: assignmentSchema.optional(),
  engine: engineSchema.optional(),
  analytics: analyticsSchema.optional(),
  candidate: candidateSchema.optional(),
  ballots: z.array(ballotSchema).max(providerIds.length).optional(),
  userDecision: decisionSchema.optional(),
  advisorReviews: z.array(sourceSchema).max(2).optional(),
  round: z.number().int().min(1).max(3).optional(),
}).superRefine((v, c) => {
  const members=v.allowPartialCouncil?v.participants:providerIds;
  const expected=members?.length||6;
  if(v.allowPartialCouncil&&(!members||members.length<3||new Set(members).size!==members.length))c.addIssue({code:"custom",message:"Reduced council requires at least three unique participants."});
  if(v.allowPartialCouncil&&["critique","resolve","refine"].includes(v.reviewPhase||"")){
    for(const list of [v.sources,v.critiques,v.revisions])if(list?.some(s=>!members?.includes(s.provider)))c.addIssue({code:"custom",message:"Evidence must belong to the selected council."});
    if(v.reviewPhase!=="resolve"&&!members?.includes(v.provider))c.addIssue({code:"custom",message:"Reviewer must belong to the selected council."});
  }

  if(v.reviewPhase === "resolve" && (!(["claude","openai"].includes(v.provider)) || v.sources?.length !== expected || new Set(v.sources?.map(s=>s.provider)).size !== expected || v.critiques?.length !== expected || new Set(v.critiques?.map(s=>s.provider)).size !== expected)) c.addIssue({code:"custom",message:"Final evaluation requires six unique answers and six unique adversarial reports."});
  if (v.reviewPhase === "refine" && (v.sources?.length !== expected || new Set(v.sources.map(s=>s.provider)).size !== expected || v.critiques?.length !== expected || new Set(v.critiques.map(s=>s.provider)).size !== expected)) c.addIssue({code:"custom",message:"Correction requires all six answers and all six reports."});
  if (v.reviewPhase === "resolve" && v.spendingMode === "thorough" && (v.revisions?.length !== expected || new Set(v.revisions.map(s=>s.provider)).size !== expected)) c.addIssue({code:"custom",message:"Full synthesis requires six corrected contributions."});
  if ((v.reviewPhase === "arbitrate" && v.provider !== "openai") || (v.reviewPhase === "audit" && v.provider !== "claude")) c.addIssue({ code: "custom", message: "Escalation requires Astra first, then Claude Fable 5.1." });
  if (v.reviewPhase && v.kind !== "synthesis") c.addIssue({ code: "custom", message: "Review phases require synthesis mode." });
  if(v.reviewPhase === "critique" && (v.sources?.length !== expected-1 || new Set(v.sources?.map(s=>s.provider)).size !== expected-1))c.addIssue({code:"custom",message:"Each review requires the other five council contributions."});
  if (v.reviewPhase === "critique" && v.sources?.some(s => s.provider === v.provider)) c.addIssue({ code: "custom", message: "Critique sources must come from other models." });
  if (v.reviewPhase === "master" && (!v.critiques?.length || new Set(v.critiques.map(s => s.provider)).size !== v.critiques.length)) c.addIssue({ code: "custom", message: "A master plan needs unique completed critiques." });
  if (v.reviewPhase === "routing" && (!v.participants || new Set(v.participants).size !== v.participants.length)) c.addIssue({ code: "custom", message: "Routing needs unique selected models." });
  if (v.kind === "synthesis" && !(["routing", "research"].includes(v.reviewPhase || "")) && (!v.sources?.length || new Set(v.sources.map(s => s.provider)).size !== v.sources.length)) c.addIssue({ code: "custom", message: "Synthesis needs unique completed sources." });
  if (["vote", "master", "execute"].includes(v.reviewPhase || "") && !v.candidate) c.addIssue({ code: "custom", message: "This phase needs an exact proposal." });
  if (["master", "execute"].includes(v.reviewPhase || "")) {
    const ballots = v.ballots || [];
    const ownerApproved = v.userDecision?.candidateId === v.candidate?.id && v.advisorReviews?.length === 2 && new Set(v.advisorReviews.map(r => r.provider)).size === 2 && v.advisorReviews.some(r => r.provider === "openai") && v.advisorReviews.some(r => r.provider === "claude");
    if (!ownerApproved && (ballots.length !== providerIds.length || new Set(ballots.map(b => b.provider)).size !== providerIds.length || ballots.some(b => b.vote.candidateId !== v.candidate?.id || b.vote.decision !== "approve" || b.vote.objections.length || Object.values(b.vote.checks).some(ok => !ok)))) c.addIssue({ code: "custom", message: "All six models must approve this exact proposal with no unresolved checks or objections." });
  }
  if (v.history.reduce((n, m) => n + m.content.length, 0) > 100000) c.addIssue({ code: "custom", message: "Conversation context is too large. Start a new conversation." });
});
export type GenerateInput = z.infer<typeof generateSchema>;
export type StreamEvent =
  | { type: "start"; model: string; requestId: string; demo: boolean }
  | { type: "delta"; text: string }
  | { type: "usage"; usage: Usage }
  | { type: "citations"; citations: Citation[] }
  | { type: "done"; elapsedMs: number; finishReason: string }
  | { type: "error"; message: string; code: string; retryAfter?: number };
export type ProviderConfig = { id: ProviderId; name: string; model: string; configured: boolean };
export type AppConfig = { gemini?: {configured:boolean;model:string}; muse?: {configured:boolean;model:string;tier:string}; providers: ProviderConfig[]; demoEnabled: boolean; authRequired: boolean; authenticated: boolean; deploymentError?: string };

export const answerSchema = z.object({
  provider: providerSchema, status: z.enum(["streaming", "complete", "error", "cancelled"]), text: z.string(),
  model: z.string().optional(), usage: usageSchema.optional(), citations: z.array(citationSchema).default([]),
  error: z.string().optional(), retryAfter: z.number().optional(), elapsedMs: z.number().optional(), finishReason: z.string().optional(),
});
export type Answer = z.infer<typeof answerSchema>;
export const councilSchema = z.object({ protocol: z.literal("chat").optional(), status: z.enum(["researching", "routing", "answering", "reviewing", "voting", "planning", "arbitrating", "auditing", "awaiting_decision", "complete", "unresolved", "error", "cancelled"]), participants: z.array(providerSchema), lead: providerSchema, message: z.string().optional() });
export const roundSchema = z.object({ number: z.number(), reviews: z.record(providerSchema, answerSchema), routing: answerSchema.optional(), candidate: candidateSchema.optional(), votes: z.record(providerSchema, answerSchema) });
export const attemptSchema = z.object({ id: z.string(), provider: providerSchema, phase: z.string(), startedAt: z.number(), status: z.enum(["streaming", "complete", "error", "cancelled"]), model: z.string().optional(), usage: usageSchema.optional() });
export const turnSchema = z.object({ previousSynthesis:answerSchema.optional(), allowPartialCouncil:z.boolean().optional(), useGemini:z.boolean().optional(), gemini:z.object({provider:z.string(),model:z.string(),text:z.string().max(10000),usage:usageSchema,completedAt:z.number()}).optional(), symbiosis:z.boolean().optional(), orchestration:z.object({plan:symbiosisPlanSchema,model:z.string(),usage:usageSchema,completedAt:z.number()}).optional(), grokbot:z.object({text:z.string().max(10000),model:z.string(),usage:usageSchema,citations:z.array(citationSchema).default([]),completedAt:z.number()}).optional(), attachmentBrief:attachmentBriefSchema.optional(), museOptions:z.object({model:z.enum(["muse-spark-1.3","muse-spark-1.2","muse-spark-1.1"]),reasoning:z.enum(["low","medium"])}).optional(), useMuse:z.boolean().optional(), muse:z.object({provider:z.string(),model:z.string(),text:z.string().max(10000),usage:usageSchema,completedAt:z.number()}).optional(), buildJobId:z.string().optional(), sharedEvidence: z.string().max(30000).optional(), revisions: z.record(providerSchema, answerSchema).optional(), spendingMode: z.enum(["economy", "thorough"]).optional(), attempts: z.array(attemptSchema).optional(), id: z.string(), prompt: z.string(), createdAt: z.number(), mode: z.enum(["live", "demo"]), context: contextSchema, answers: z.record(providerSchema, answerSchema), synthesis: answerSchema.optional(), routing: answerSchema.optional(), assignments: routingSchema.optional(), engine: engineSchema.optional(), reviews: z.record(providerSchema, answerSchema).optional(), council: councilSchema.optional(), analytics: analyticsSchema.optional(), candidate: candidateSchema.optional(), votes: z.record(providerSchema, answerSchema).optional(), ballots: z.array(ballotSchema).optional(), rounds: z.array(roundSchema).optional(), lockedAt: z.number().optional(), botRuns: z.record(providerSchema, answerSchema).optional(), arbitration: answerSchema.optional(), audit: answerSchema.optional(), userDecision: decisionSchema.optional() });
export type Turn = z.infer<typeof turnSchema>;
export const conversationSchema = z.object({ id: z.string(), projectId: z.string(), title: z.string(), createdAt: z.number(), updatedAt: z.number(), turns: z.array(turnSchema) });
export type Conversation = z.infer<typeof conversationSchema>;
export const projectSchema = z.object({ id: z.string(), name: z.string().min(1).max(80), notes: z.string().max(12000) });
export type Project = z.infer<typeof projectSchema>;
export const workspaceSchema = z.object({ version: z.literal(1), projects: z.array(projectSchema).min(1), conversations: z.array(conversationSchema), engine: engineSchema.optional(), analytics: analyticsSchema.optional() });
export type Workspace = z.infer<typeof workspaceSchema>;
