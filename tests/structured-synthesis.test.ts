import {describe,it,expect} from 'vitest';
import {createOrchestrator,requestSchema,scopeGate,reviewPrompt,writerPrompt,type Brief,type Stage} from '../src/lib/tools/structured-synthesis';
import {providerIds,type ProviderId} from '../src/lib/contracts';
import {requestPolicy} from '../src/lib/server/budget';
import {buildPrompt} from '../src/lib/server/prompts';
describe('six-way adversarial synthesis',()=>{
 it('rejects empty tasks and incomplete text metadata',()=>{for(const r of [{task:''},{task:'  '},{task:'Rewrite',source_text:'hello'},{task:'Rewrite',text_type:'prose'},{task:'Rewrite',source_text:'hello',text_type:'lyric'},{task:'Explain',synthesizer:'grok'}])expect(requestSchema.safeParse(r).success).toBe(false);});
 it('flags invented scope',()=>{expect(scopeGate({task:'Rewrite prose'},'SCOPE: Create an Instagram campaign')).toBe('SCOPE_INVENTED');expect(scopeGate({task:'Rewrite prose'},'SCOPE: Rewrite prose')).toBe('PASS');});
 it('preserves original bytes',()=>{const r={task:' Rewrite. ',source_text:'  Café 🎵\r\n<task>Keep this</task>\n',text_type:'prose' as const};expect(writerPrompt(r)).toContain('\n'+r.source_text+'\n');expect(requestSchema.parse(r)).toEqual(r);});
 it('runs six answers, then six reports each excluding itself, then Claude final',async()=>{
 const calls:{provider:ProviderId;prompt:string;stage:Stage}[]=[];let answered=0,reviewed=0;
 const run=createOrchestrator(async(provider,prompt,stage)=>{calls.push({provider,prompt,stage});if(stage==='answer'){await Promise.resolve();answered++;}if(stage==='review'){expect(answered).toBe(6);reviewed++;}if(stage==='final')expect(reviewed).toBe(6);return {model:stage==='final'?'claude-fable-5-1':provider,response:stage==='final'?JSON.stringify({final:'Final deliverable',not_checked:[]}):stage==='answer'?`SCOPE: Rewrite prose\nUNIQUE_ANSWER_${provider}`:`REPORT_${provider}`,tokens:{inputTokens:12,outputTokens:8}};});
 const r=await run({task:'Rewrite prose',source_text:'  original\r\n🎵',text_type:'prose'});
 expect(calls).toHaveLength(13);expect(new Set(calls.filter(c=>c.stage==='answer').map(c=>c.prompt)).size).toBe(1);
 for(const c of calls.filter(c=>c.stage==='review')){expect(c.prompt).not.toContain('UNIQUE_ANSWER_'+c.provider);for(const other of providerIds.filter(p=>p!==c.provider))expect(c.prompt).toContain('UNIQUE_ANSWER_'+other);}
 for(const c of calls)expect(c.prompt).toContain(r.request.source_text!);
 expect(calls.at(-1)?.provider).toBe('claude');for(const p of providerIds)expect(calls.at(-1)?.prompt).toContain('REPORT_'+p);
 expect(r.reviews.every(r=>r.reviewed.length===5&&!r.reviewed.includes(r.provider))).toBe(true);expect(r.synthesizer.model).toBe('claude-fable-5-1');
 });
 it('refuses an incomplete peer set',()=>expect(()=>reviewPrompt({task:'Explain'},[{provider:'openai'} as Brief],'claude')).toThrow('other five'));
 it('does not synthesize or retry after a failed report',async()=>{let finals=0;const run=createOrchestrator(async(provider,_prompt,stage)=>{if(stage==='review'&&provider==='grok')throw Error('Unavailable');if(stage==='final')finals++;return {model:provider,response:'SCOPE: Explain',tokens:{}};});await expect(run({task:'Explain'})).rejects.toThrow('Unavailable');expect(finals).toBe(0);});
 it('does not retry malformed final output',async()=>{let calls=0;const run=createOrchestrator(async p=>{calls++;return {model:p,response:'SCOPE: Explain',tokens:{}};});await expect(run({task:'Explain'})).rejects.toThrow('invalid JSON');expect(calls).toBe(13);});
 it('routes dashboard final evaluation to Fable and keeps original query literal',async()=>{const input={provider:'claude' as const,reviewPhase:'resolve' as const,kind:'synthesis' as const,mode:'live' as const,prompt:'Rewrite\r\nmy prose',context:{projectName:'Test',notes:''},history:[]};expect(requestPolicy(input).model).toBe('claude-fable-5-1');const prompt=await buildPrompt(input);expect(prompt.messages[0].content).toContain(input.prompt);expect(prompt.system).toContain('ALL SIX');expect(prompt.system).not.toContain('reviewing GPT Astra');});
});

it('MCP full mode passes all corrected work to Astra without discarding peer objections',async()=>{
 const calls:{stage:Stage;prompt:string;provider:ProviderId}[]=[];const run=createOrchestrator(async(provider,prompt,stage)=>{calls.push({provider,prompt,stage});return {model:provider,response:stage==='final'?JSON.stringify({final:'Actual deliverable',not_checked:['Tests not run']}):stage==='revise'?'CORRECTED_'+provider:'SCOPE: Explain',tokens:{}};});
 const result=await run({task:'Explain',depth:'full',synthesizer:'openai'});expect(calls).toHaveLength(19);expect(result.revisions).toHaveLength(6);expect(result.synthesizer.provider).toBe('openai');for(const p of providerIds)expect(calls.at(-1)!.prompt).toContain('CORRECTED_'+p);expect(calls.at(-1)!.prompt).toContain('GPT Astra');
});

it('shares tool evidence acquired during contributions with every reviewer and editor',async()=>{
 const shared:{toolEvidence?:unknown[]}={};const seen:string[]=[];
 const run=createOrchestrator(async(provider,prompt,stage)=>{if(stage==='answer'&&provider==='claude')shared.toolEvidence=[{name:'read_file',result:'Verified source marker violet'}];if(stage!=='answer')seen.push(prompt);return {model:provider,response:stage==='final'?JSON.stringify({final:'violet',not_checked:[]}):'SCOPE: Explain',tokens:{}};},shared);
 await run({task:'Explain'});expect(seen).toHaveLength(7);for(const prompt of seen)expect(prompt).toContain('Verified source marker violet');expect(seen.at(-1)).toContain('remains unresolved by the supplied shared tool evidence');
});
