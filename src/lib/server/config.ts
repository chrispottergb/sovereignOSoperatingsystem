import "server-only";
import { providers, providerIds, type ProviderId } from "@/lib/contracts";
export const keyNames: Record<ProviderId, string> = { openai: "OPENAI_API_KEY", claude: "ANTHROPIC_API_KEY", perplexity: "PERPLEXITY_API_KEY", grok: "XAI_API_KEY", gemini:"GEMINI_API_KEY", muse:"MODEL_API_KEY" };
export function modelFor(id: ProviderId): string {
  if(id==="gemini")return process.env.GEMINI_MODEL || "gemini-3.8-flash";
  if(id==="muse")return process.env.MUSE_MODEL || "muse-spark-1.3";
  return id === "openai" ? process.env.OPENAI_MODEL || "gpt-6.1-sol" : id === "claude" ? process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5" : id === "grok" ? process.env.XAI_MODEL || "grok-4.7" : process.env.PERPLEXITY_PRESET || "fast";
}
export function providerConfig() {
  return providerIds.map(id => ({ id, name: providers[id].name, model: modelFor(id), configured: Boolean((id==="muse"?process.env.MUSE_API_KEY||process.env.MODEL_API_KEY:process.env[keyNames[id]])?.trim()) }));
}
export function boundedEnv(name: string, fallback: number, min: number, max: number) {
  const n = Number(process.env[name] || fallback); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;
}
export function demoEnabled() { return process.env.ENABLE_DEMO !== "false"; }
