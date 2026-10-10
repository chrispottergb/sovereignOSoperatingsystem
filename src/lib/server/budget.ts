import "server-only";
import { createHash } from "node:crypto";
import type { GenerateInput } from "@/lib/contracts";
import { outputLimit } from "@/lib/budget";
import { boundedEnv, modelFor } from "./config";

export function requestPolicy(input: GenerateInput) {
  const phase = input.reviewPhase;
  const economy = input.spendingMode !== "thorough";
  let model = modelFor(input.provider);
  if ((phase === "arbitrate" || phase === "adjudicate")) model = "gpt-6-astra";
  else if (phase === "resolve" && input.provider === "openai") model = "gpt-6-astra";
  else if (!economy && phase === "research" && input.provider === "perplexity") model = "medium";
  else if (phase === "audit" || (phase === "resolve" && input.provider === "claude")) model = "claude-fable-5-1";
  else if (economy && input.provider === "openai" && ["research", "vote"].includes(phase || "")) model = process.env.OPENAI_ECONOMY_MODEL || "gpt-6-luna";
  else if (economy && input.provider === "claude" && phase === "vote") model = process.env.ANTHROPIC_ECONOMY_MODEL || "claude-haiku-4-5";
  // A preset implicitly enables search. Review phases must use an explicit model.
  if (input.provider === "perplexity" && phase && phase !== "research") model = process.env.PERPLEXITY_REVIEW_MODEL || "openai/gpt-6-luna";
  const reasoning = input.provider === "grok" && model.startsWith("grok-4.7") ? { effort: economy ? "low" : "medium" }
    : input.provider === "openai" && model.startsWith("gpt-6") ? { effort: phase === "arbitrate" ? "medium" : model.includes("luna") ? "none" : economy ? "low" : "high" }
    : input.provider === "perplexity" && phase && phase !== "research" && model === "openai/gpt-6-luna" ? { effort: "none" } : undefined;
  return { model, maxTokens: Math.min(outputLimit(input), boundedEnv("MAX_OUTPUT_TOKENS", economy ? 8192 : 16384, 256, 16384)), reasoning,
    searchCalls: economy ? 2 : 3,
    cacheKey: createHash("sha256").update(JSON.stringify([input.context, input.prompt])).digest("hex") };
}
