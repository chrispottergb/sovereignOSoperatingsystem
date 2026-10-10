import type {ProviderId} from './contracts';

// Task-fit priorities, not claims that a provider is universally best.
export const specialties: Record<ProviderId,string> = {
 openai:'Develop the solution architecture, calculations, algorithms, implementation approach and acceptance checks. Connect dependencies and identify executable steps.',
 claude:'Develop the substantive deliverable, precise writing or implementation details. Check requirements, coherence, edge cases and source fidelity.',
 perplexity:'Lead evidence gathering. Use available research tools for current facts, primary sources, competing explanations and dated evidence. Separate retrieved evidence from assumptions.',
 grok:'Explore alternatives and stress-test assumptions, failure modes and overlooked opportunities. Use current public signals only when relevant and actually retrieved.',
};
export const deliverableRules='Deliver the actual requested answer, solution, research, idea, document or code, not a description of what another agent should do. For code, include coherent files or patches, dependencies and verification steps; distinguish generated code from executed and tested code. For research, reconcile sources, dates and contradictory evidence. For ideas, supply concrete options and a justified choice. Preserve uncertainty; agreement among models is not independent verification. Ask only for information that truly blocks useful work; otherwise state reasonable assumptions and proceed. Never invent tool access, execution, tests or deployment.';
export const correctionRules='Read all original contributions and all four adversarial reports. Address every material objection relevant to your contribution with a concrete correction or an evidence-backed reason to reject it. Incorporate useful peer discoveries without voting or manufacturing agreement. Return the corrected substantive work, plus a concise record of resolved objections and remaining uncertainties. Do not merely promise to revise.';
export function editorName(provider:ProviderId){return provider==='openai'?'GPT Astra':'Claude Fable 5.1';}
