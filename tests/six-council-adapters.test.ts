import {it,expect,vi,afterEach} from 'vitest';
import {adapters} from '../src/lib/server/providers';
import {generateSchema,providerIds} from '../src/lib/contracts';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
for(const provider of ['gemini','muse'] as const)it(provider+' uses stage instructions and all five peer sources',async()=>{
 vi.stubEnv(provider==='gemini'?'GEMINI_API_KEY':'MODEL_API_KEY','test-secret');
 const mock=vi.fn().mockResolvedValue(Response.json({model:'reported-model',choices:[{message:{content:'Complete review'},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:30}}));vi.stubGlobal('fetch',mock);
 const input=generateSchema.parse({provider,kind:'synthesis',mode:'live',reviewPhase:'critique',prompt:'Design a parser',context:{projectName:'Test',notes:''},sources:providerIds.filter(p=>p!==provider).map(p=>({provider:p,text:'SOURCE_'+p,citations:[]}))});
 const events=[];for await(const event of adapters[provider].stream(input,new AbortController().signal))events.push(event);
 const body=JSON.parse(mock.mock.calls[0][1].body);expect(mock.mock.calls[0][0]).toContain(provider==='gemini'?'generativelanguage.googleapis.com':'api.meta.ai');
 for(const peer of providerIds.filter(p=>p!==provider))expect(JSON.stringify(body.messages)).toContain('SOURCE_'+peer);
 expect(JSON.stringify(body.messages)).not.toContain('SOURCE_'+provider);expect(body.tools).toBeUndefined();expect(events.at(-1)).toMatchObject({type:'done',finishReason:'stop'});expect(events).toContainEqual({type:'usage',usage:{inputTokens:100,outputTokens:30}});
});
it('final evaluation requires all six unique assessments and reviews',()=>{
 const sources=providerIds.map(provider=>({provider,text:'Evidence',citations:[]}));const input={provider:'claude',kind:'synthesis',mode:'live',reviewPhase:'resolve',prompt:'Design a parser',context:{projectName:'Test',notes:''},sources,critiques:sources};
 expect(generateSchema.safeParse(input).success).toBe(true);expect(generateSchema.safeParse({...input,sources:sources.slice(0,4)}).success).toBe(false);expect(generateSchema.safeParse({...input,critiques:[...sources.slice(0,5),sources[0]]}).success).toBe(false);
});
