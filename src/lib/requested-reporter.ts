import type {ProviderId} from './contracts';
const aliases:Record<string,ProviderId>={openai:'openai',chatgpt:'openai',astra:'openai',claude:'claude',perplexity:'perplexity',grok:'grok',gemini:'gemini',muse:'muse'};
// Only direct delegation/addressing, not a model mentioned as the subject of research.
export function requestedReporter(prompt:string,selected:ProviderId[]):ProviderId|undefined{
 const match=prompt.trim().match(/^(?:please\s+)?(?:(?:ask|have|let|use)\s+(?:only\s+)?|(?:i\s+(?:want|need)\s+)(?:only\s+)?)(openai|chatgpt|astra|claude|perplexity|grok|gemini|muse)\b/i)||prompt.trim().match(/^(openai|chatgpt|astra|claude|perplexity|grok|gemini|muse)\s*(?:[:,]|\s+(?:please|report|research|analyze|analyse|write|review)\b)/i);
 if(match){const remainder=prompt.slice((match.index||0)+match[0].length);if(!/^\s*(?:and|\+|&)\s*(?:openai|chatgpt|astra|claude|perplexity|grok|gemini|muse)\b/i.test(remainder))return aliases[match[1].toLowerCase()];}
 return selected.length===1?selected[0]:undefined;
}
