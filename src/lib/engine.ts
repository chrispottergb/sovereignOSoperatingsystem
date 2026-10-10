import { type Engine, type ProviderId, routingSchema } from "./contracts";
export const defaultEngine: Engine = { profiles: {
  openai: { name: "Plan architect", instructions: "Structure the goal into decisions, dependencies, implementation steps and measurable acceptance criteria. State tradeoffs and unknowns." },
  claude: { name: "Implementation review skill", instructions: "Review requirements and proposed implementation deeply. Identify edge cases, consistency problems, security boundaries and meaningful tests. Return precise corrections and readable specifications." },
  perplexity: { name: "Evidence researcher", instructions: "Research claims requiring fresh evidence. Prefer primary sources, give URLs and publication dates when available, separate verified facts from inference, and report gaps. Never invent sources." },
  grok: { name: "Assumption challenger bot", instructions: "Challenge the strongest assumptions constructively. Propose alternative approaches, stress-test failure scenarios, and identify the cheapest decisive experiment. Do not claim access to X, web search, deployment tools, or execution unless actually provided." },
} };
export function fallbackAssignments(participants: ProviderId[], engine: Engine) {
  return { assignments: participants.map(provider => ({ provider, role: engine.profiles[provider]?.name || defaultEngine.profiles[provider]!.name, task: (engine.profiles[provider]?.instructions || defaultEngine.profiles[provider]!.instructions).slice(0,1800) })), rationale: "Using the saved model roles. These are editable task assignments, not verified model rankings." };
}
export function parseAssignments(text: string, participants: ProviderId[]) {
  const parsed = routingSchema.parse(JSON.parse(text.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "")));
  if (parsed.assignments.length !== participants.length || new Set(parsed.assignments.map(a => a.provider)).size !== participants.length || parsed.assignments.some(a => !participants.includes(a.provider))) throw new Error("Routing must assign each selected model exactly once.");
  return parsed;
}
