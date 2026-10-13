import type { GenerateInput } from "./contracts";

export type SpendingMode = "economy" | "thorough";
export const debateLimit = (mode?: SpendingMode) => mode === "thorough" ? 3 : 1;
export function outputLimit(input: Pick<GenerateInput, "reviewPhase" | "spendingMode" | "provider">) {
  const limits = { refine: 4000, research: 1800, critique: 1200, vote: 1800, routing: 2600, arbitrate: 4800, audit: 2400, master: 3200, resolve: 6000, adjudicate: 4000, execute: 3200 };
  if(input.spendingMode === "thorough" && ["research","refine","resolve"].includes(input.reviewPhase || "")) return input.reviewPhase === "resolve" ? 16000 : 6000;
  // Claude's review output allowance can include reasoning; 1200 truncated live cross-reviews.
  // Keep the increase limited to this stage/provider, not the entire council.
  if(input.provider === "claude" && input.reviewPhase === "critique") return input.spendingMode === "thorough" ? 6144 : 4096;
  const base = limits[input.reviewPhase || "execute"];
  // Grok's allowance includes reasoning as well as the visible answer.
  return Math.ceil(base * (input.spendingMode === "thorough" ? 1.5 : 1) * (input.provider === "grok" ? 1.5 : 1));
}

export function compactEvidence(sources: GenerateInput["sources"], mode?: SpendingMode) {
  const limit = mode === "thorough" ? 12000 : 6000;
  return sources?.map(source => {
    const abridged = source.text.length > limit;
    const marker = "\n[Middle omitted to conserve tokens. This is an excerpt, not a complete summary.]\n";
    const head = Math.floor((limit - marker.length) * .65);
    return { ...source, text: abridged ? source.text.slice(0, head) + marker + source.text.slice(-(limit - marker.length - head)) : source.text,
      abridged, originalCharacters: source.text.length,
      citations: source.citations.slice(0, 8), omittedCitationCount: Math.max(0, source.citations.length - 8) };
  });
}
