import {describe,it,expect,vi} from 'vitest';
import {completion} from '../src/lib/server/model-completion';
import {adapters} from '../src/lib/server/providers';
import type {StreamEvent} from '../src/lib/contracts';
vi.mock('../src/lib/server/providers',()=>({adapters:{claude:{stream:vi.fn()}}}));
describe('MCP completion diagnostics',()=>{
 it('retains requested/reported models and applies explicit spending policy',async()=>{
  vi.mocked(adapters.claude.stream).mockImplementation(async function*():AsyncGenerator<StreamEvent>{yield {type:'start',model:'alias',requestId:'req1',demo:false};yield {type:'start',model:'resolved',requestId:'req1',demo:false};yield {type:'delta',text:'Ready'};yield {type:'usage',usage:{inputTokens:12,outputTokens:2}};yield {type:'done',elapsedMs:1,finishReason:'end_turn'};});
  const r=await completion(new AbortController().signal,'economy')('claude','Check','review');expect(r.provenance).toEqual({requestedModel:'alias',reportedModel:'resolved',requestId:'req1'});expect(adapters.claude.stream).toHaveBeenLastCalledWith(expect.objectContaining({spendingMode:'economy',reviewPhase:'critique'}),expect.any(AbortSignal));
 });
 it('classifies truncation instead of mislabeling it a network failure, retaining known usage',async()=>{
  vi.mocked(adapters.claude.stream).mockImplementation(async function*():AsyncGenerator<StreamEvent>{yield {type:'delta',text:'Partial'};yield {type:'usage',usage:{inputTokens:12,outputTokens:1200}};yield {type:'done',elapsedMs:1,finishReason:'max_tokens'};});
  await expect(completion(new AbortController().signal)('claude','Check','review')).rejects.toMatchObject({code:'INCOMPLETE',details:{tokens:{inputTokens:12,outputTokens:1200},partialCharacters:7}});
 });
});

it('reserves bounded Claude cross-review headroom without increasing other stage budgets',async()=>{
 const {outputLimit}=await import('../src/lib/budget');
 expect(outputLimit({provider:'claude',reviewPhase:'critique',spendingMode:'economy'})).toBe(4096);
 expect(outputLimit({provider:'claude',reviewPhase:'research',spendingMode:'economy'})).toBe(1800);
 expect(outputLimit({provider:'openai',reviewPhase:'critique',spendingMode:'economy'})).toBe(1200);
});
