import { z } from "zod";
import { providerSchema, type ProviderId } from "./contracts";
export const laneIds = ["research","decision","writing","code","data","image","video","audio","action","multimodal","street"] as const;
export const laneSchema = z.enum(laneIds);
export const depthSchema = z.enum(["quick","standard","deep"]);
export type Lane = z.infer<typeof laneSchema>;
export type Depth = z.infer<typeof depthSchema>;
export const projectInput = z.object({ name: z.string().trim().min(1).max(80), brief: z.string().max(12000).default(""), audience: z.string().max(1000).default(""), voice: z.string().max(1000).default(""), objective: z.string().max(1000).default("") });
export const launchInput = z.object({ projectId: z.string().uuid(), prompt: z.string().trim().min(3).max(12000), lane: laneSchema, depth: depthSchema.default("standard"), connectorIds: z.array(z.string().max(60)).max(20).default([]), maxCalls: z.number().int().min(1).max(32).default(18), maxReportedTokens: z.number().int().min(1000).max(1000000).default(180000), botId: z.string().uuid().optional() });
export type Launch = z.infer<typeof launchInput>;
export type Step = { id: string; provider: ProviderId; stage: "ground"|"draft"|"critique"|"verify"|"rebuttal"|"synthesize"|"audit"|"revision"; title: string; depends: string[]; instruction: string; search?: boolean; conditional?: "critical"|"discrepancy"; inputIds?: string[] };
export const strengths: Record<ProviderId,string> = { perplexity: "Evidence desk · deep research and claim verification", grok: "Contrarian · alternative hypotheses and social sentiment", openai: "Builder · actionable drafts and independent audit", claude: "Synthesizer · reasoning, writing and synthesis" };
export function suggestLane(prompt: string): Lane {
  if (/\b(generate|create|design)\b.*\b(image|logo|thumbnail|illustration)\b/i.test(prompt)) return "image";
  if (/\b(video|storyboard|shot list)\b/i.test(prompt)) return "video";
  if (/\b(voiceover|soundtrack|music|song|lyrics)\b/i.test(prompt)) return "audio";
  if (/\b(debug|code|implement|software|api|typescript|python)\b/i.test(prompt)) return "code";
  if (/\b(spreadsheet|calculate|dataset|regression)\b/i.test(prompt)) return "data";
  if (/\b(write|rewrite|caption|copywriting|email draft)\b/i.test(prompt)) return "writing";
  if (/\b(research|fact.check|sources|who is|what is)\b/i.test(prompt)) return "research";
  return "decision";
}
const critique = "Give at least three specific objections quoting the exact line attacked. Do not invent problems to reach a quota: label a remaining concern untested if evidence is insufficient. Identify unsupported claims, missing evidence and practical constraints. Never grade your own draft.";
const verify = "Identify every factual claim in the supplied artifacts. Mark VERIFIED with a dated supporting source, CONTRADICTED with a dated source, or UNSUPPORTED. A source is not verified merely because another model cited it. Check the original material using search. List unverified citations honestly. Distinguish social sentiment from evidence.";
const synthesize = "Merge only material that survives the reviews. Drop conceded or contradicted claims. Label unsupported claims and missing model contributions. Give FINAL ANSWER, CONSENSUS WITH EVIDENCE, CONTESTED POINTS, KEY CLAIMS TABLE (claim | confidence High/Medium/Low | source), RISKS, WHAT WOULD CHANGE THE CONCLUSION and NEXT ACTIONS. Confidence is an assessment, not a measured probability. Do not call agreement proof. Produce one useful deliverable tailored to the brief.";
export function planWorkflow(lane: Lane, depth: Depth): Step[] {
  const steps: Step[] = [];
  const add = (id: string, provider: ProviderId, stage: Step["stage"], title: string, depends: string[], instruction: string, extra: Partial<Step> = {}) => { steps.push({ id,provider,stage,title,depends,instruction,...extra }); };
  const ground = () => {
    add("evidence","perplexity","ground","Deep evidence research",[],"Build a dated, cited evidence pack for the actual question and claims to resolve. Prefer primary sources. Include conflicting findings, keywords and relevant trends when the brief calls for them. Review supplied account analytics; never fabricate missing metrics. No opinions presented as fact.",{search:true});
    if(depth !== "quick") add("counter","grok","ground","Counterarguments and social signal",[],"Find the strongest case against the obvious answer. When relevant, research current social discussion with the available tools, label it SENTIMENT, and date sources. Do not treat popularity as truth or claim account access that is not supplied.",{search:true});
  };
  if(depth === "quick") {
    ground(); add("draft","claude","draft","Focused draft",["evidence"],"Answer the brief using the evidence pack. State assumptions, meaningful limitations and what would change the answer. Deliver a concise useful result.");
    add("verify","perplexity","verify","Verify the draft",["draft"],verify,{search:true});
    return steps;
  }
  if(lane === "research") {
    ground(); add("synthesis","claude","synthesize","Reconcile evidence packs",["evidence","counter"],synthesize + " List every conflict between the two packs.");
    add("verify","perplexity","verify","Re-verify the reconciled answer",["synthesis"],verify,{search:true}); return steps;
  }
  if(["image","video","audio"].includes(lane)) {
    if(lane === "video") ground();
    const deps = steps.map(s=>s.id);
    add("creative","claude","draft","Creative brief and generation prompt",deps,`Prepare a ${lane} production package from the brief: audience, purpose, platform, dimensions or duration, brand rules, must-haves and must-nots. Explicitly list missing inputs. For video include script and shot list; for audio include lyrics/script and sound direction. This deployment currently provides text planning only: do not claim an image, video or audio was generated.`);
    add("review-openai","openai","critique","Creative clarity review",["creative"],critique + " Focus on ambiguity, clichés and omissions against the brief.");
    add("review-grok","grok","critique","Audience and originality review",["creative"],critique + " Focus on audience fit and alternative creative angles.");
    add("synthesis","claude","synthesize","Final production package",["creative","review-openai","review-grok"],synthesize + " Deliver generation-ready prompts and production instructions. Label actual media generation and blind visual judging unavailable until a capable generator adapter is connected."); return steps;
  }
  if(lane === "action" || lane === "street") {
    add("plan","claude","draft",lane === "street" ? "Draft the public street test" : "Plan external actions",[],lane === "street" ? "Draft the exact proposed public X post and neutral test question. Exclude confidential details, client names, pricing, contracts, unreleased IP and legal matters. Label crowd replies sentiment. Set a collection window; do not claim anything was posted." : "Draft the exact actions, recipients, payloads, dependencies and tool requirements. Identify irreversible steps and approvals. Do not execute or claim execution.");
    add("audit","openai","audit","Check recipients, privacy and side effects",["plan"],critique + " Check confidentiality, wrong recipients, irreversible effects and missing authorization. Return severity CRITICAL/MAJOR/MINOR for each finding.");
    if(lane === "street") add("reaction","grok","critique","Predict reception privately",["plan"],"Challenge the framing and predict likely reception, clearly as a hypothesis rather than observed crowd reaction.");
    add("synthesis","claude","synthesize","Approval-ready action package",steps.map(s=>s.id),synthesize + " End with the exact proposed payload and required human approval. Nothing has been sent, posted or deployed."); return steps;
  }
  if(lane === "multimodal") {
    add("extract-claude","claude","draft","Independent document analysis",[],"Independently extract the supplied text or transcript faithfully, quoting uncertain passages. Only analyze provided content. If the asset is an image/PDF without an extracted text representation, report that this text-only adapter cannot inspect the file; never invent its contents.");
    add("extract-openai","openai","draft","Independent extraction check",[],"Independently extract the supplied text or transcript faithfully and list uncertainty. Do not claim to have seen binary files or images unless their contents are actually provided.");
    add("verify","perplexity","verify","Verify external document claims",["extract-claude","extract-openai"],verify,{search:true});
    add("synthesis","claude","synthesize","Reconcile document findings",["extract-claude","extract-openai","verify"],synthesize + " Quote extraction disagreements verbatim."); return steps;
  }
  if(lane === "data" || lane === "code") {
    for(const provider of ["claude","openai"] as const) add(`draft-${provider}`,provider,"draft",`${provider === "claude" ? "Claude" : "OpenAI"} independent ${lane === "code" ? "implementation" : "calculation"}`,[],lane === "code" ? "Implement the requested spec independently, with complete relevant code and meaningful tests. State dependencies and assumptions. No execution tool is attached; generated code and tests are not verified execution." : "Compute independently from supplied data. Show formulas, inputs, units and intermediate calculations. Never invent missing data. No code execution tool is attached, so label arithmetic as model-produced and not runtime-verified.");
    for(const [reviewer,target] of [["claude","openai"],["openai","claude"]] as const) add(`review-${reviewer}`,reviewer,"critique",`${reviewer} cross-check`,[`draft-${target}`],critique + (lane === "code" ? " Inspect bugs, security, edge cases and missing tests." : " Identify every numerical or methodological disagreement. Never average mismatched results."));
    add("verify","perplexity","verify","Verify technical sources",["draft-claude","draft-openai"],verify + " For code verify library versions and API signatures against official documentation.",{search:true});
    add("synthesis","claude","synthesize","Reconciled technical deliverable",steps.map(s=>s.id),synthesize + " Tests decide only if executed. Otherwise include the test plan and label it unexecuted. For data, report unmatched numbers explicitly rather than averaging.");
    add("audit","openai","audit","Independent final technical audit",["synthesis"],critique + " Mark each finding CRITICAL, MAJOR or MINOR."); return steps;
  }
  if(lane === "decision") ground();
  const evidence = steps.map(s=>s.id);
  for(const provider of ["claude","openai","grok"] as const) add(`draft-${provider}`,provider,"draft",`${provider} blind draft`,evidence,`Produce an independent ${lane === "writing" ? "draft using a rubric of voice, clarity, audience fit and persuasion" : "answer: three-sentence conclusion, reasoning, practical steps, assumptions, confidence and what would prove it wrong"}. Your specialty: ${strengths[provider]}. You have no access to peer drafts at this stage.`);
  for(const [reviewer,target] of [["claude","openai"],["openai","grok"],["grok","claude"]] as const) add(`review-${reviewer}`,reviewer,"critique",`${reviewer} examines ${target}`,[`draft-${target}`],critique + (lane === "writing" ? " Score the peer draft against voice, clarity, audience fit and persuasion, 1–10 with one-line reasons. Never score yourself." : ""));
  add("factcheck","perplexity","verify","Fact-check all blind drafts",["draft-claude","draft-openai","draft-grok"],verify,{search:true});
  for(let round=1;round<=(depth === "deep" ? 2 : 1);round++) for(const [provider,reviewer] of [["claude","grok"],["openai","claude"],["grok","openai"]] as const) add(`rebuttal-${round}-${provider}`,provider,"rebuttal",`${provider} rebuttal ${round}`,round === 1 ? [`draft-${provider}`,`review-${reviewer}`,"factcheck"] : [`rebuttal-1-${provider}`,"factcheck",`review-${reviewer}`],"Respond to each objection: DEFEND with evidence or CONCEDE. Log concessions explicitly. Revise the answer and confidence. No new topics. On a second pass, test the surviving defenses against the strongest unresolved objections; do not repeat them unchanged.");
  add("synthesis","claude","synthesize","Synthesize surviving material",steps.map(s=>s.id),synthesize);
  add("audit","openai","audit","Independent red-team audit",["synthesis"],critique + " Mark findings CRITICAL, MAJOR or MINOR. Do not manufacture critical flaws. Review the synthesis as the intended audience.");
  add("citation-audit","perplexity","verify","Re-verify final citations",["synthesis"],verify,{search:true});
  add("revision","claude","revision","One correction pass",["synthesis","audit","citation-audit"],synthesize + " Correct the audit's critical or contradicted claims. Keep all unresolved dissent visible. This is the single permitted revision.",{conditional:"critical"});
  if(depth === "deep") add("final-audit","openai","audit","Second independent audit",["revision","audit"],critique + " Audit the corrected synthesis if a revision exists; otherwise recheck the original synthesis. Report remaining critical findings plainly. No more revision loops.",{inputIds:["synthesis","revision","audit"]});
  return steps;
}
export const botInput = z.object({ id:z.string().uuid().optional(), projectId:z.string().uuid(), name:z.string().trim().min(1).max(80), purpose:z.string().trim().min(3).max(12000), voice:z.string().max(1000).default(""), lane:laneSchema, depth:depthSchema, connectorIds:z.array(z.string().max(60)).max(20), enabled:z.boolean().default(false), intervalHours:z.number().int().min(6).max(720).default(24), maxCalls:z.number().int().min(1).max(32).default(18), maxReportedTokens:z.number().int().min(1000).max(1000000).default(180000) });
export const presets = [
  {id:"trends",name:"Research emerging topics",lane:"research" as Lane,prompt:"Research emerging topics and audience questions for this project. Prioritize dated primary evidence and label sentiment separately."},
  {id:"campaign",name:"Build a social campaign",lane:"decision" as Lane,prompt:"Build a measurable social campaign for this project's audience and objective. Include a content calendar, captions, scripts, creative briefs and measurement plan. Flag missing inputs."},
  {id:"reddit",name:"Monitor Reddit discussions",lane:"research" as Lane,prompt:"Analyze the connected Reddit discussion snapshot for audience problems, recurring questions and useful content opportunities. Quote sources, avoid personal profiling, and do not post replies."},
  {id:"copy",name:"Draft platform content",lane:"writing" as Lane,prompt:"Write platform-specific content for the project's audience and brand voice. Produce publication-ready drafts and label facts that need verification."},
  {id:"press",name:"Prepare a press release",lane:"writing" as Lane,prompt:"Prepare a factual press-release package and short pitches. Use only supplied, verifiable news. List missing quotes and contact details instead of inventing them. Distribution is a separate approved action."},
  {id:"mentions",name:"Monitor brand mentions",lane:"research" as Lane,prompt:"Research dated public mentions of this project. Separate verified claims from sentiment, list inaccuracies needing review, and never claim exhaustive coverage."},
  {id:"performance",name:"Review campaign performance",lane:"data" as Lane,prompt:"Analyze the supplied campaign data using explicit denominators and comparable periods. Identify missing data and show calculations. Do not invent account analytics."},
];
export const providerChoice = providerSchema;
