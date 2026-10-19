import type { GenerateInput } from "@/lib/contracts";
const text = { type: "string" };
const list = { type: "array", items: text };
const object = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const vote = object({ candidateId: text, decision: { type: "string", enum: ["approve", "revise"] }, rationale: { ...text, description: "Short justification, under 500 characters" }, objections: { ...list, description: "Concise material objections only; combine related issues. Under 120 words total." }, checks: object({ evidence: { type: "boolean" }, feasibility: { type: "boolean" }, impact: { type: "boolean" }, efficiency: { type: "boolean" }, taskFit: { type: "boolean" } }) });
const proposal = object({ assignments: { type: "array", items: object({ provider: { type: "string", enum: ["openai", "claude", "perplexity", "grok", "gemini", "muse"] }, role: text, task: text }) }, rationale: text, approach: text, successCriteria: list, risks: list });
export function outputFormat(input: GenerateInput) {
  const schema = input.reviewPhase === "vote" ? vote : ["routing", "arbitrate"].includes(input.reviewPhase || "") ? proposal : undefined;
  if (!schema) return {};
  if (input.provider === "openai") return { text: { format: { type: "json_schema", name: input.reviewPhase === "vote" ? "council_vote" : "council_proposal", strict: true, schema } } };
  if (input.provider === "claude") return { output_config: { format: { type: "json_schema", schema } } };
  return {};
}
