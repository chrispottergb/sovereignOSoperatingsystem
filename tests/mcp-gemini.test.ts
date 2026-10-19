import {it,expect,vi,afterEach} from 'vitest';
import {mkdtemp} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const m=vi.hoisted(()=>({plan:vi.fn(),grok:vi.fn(),muse:vi.fn(),gemini:vi.fn()}));
vi.mock('../src/lib/server/symbiosis',()=>({planSymbiosis:m.plan,runGrokbot:m.grok}));
vi.mock('../src/lib/server/muse',()=>({askMuse:m.muse,museConfig:()=>({configured:true})}));
import {runSharedCouncil} from '../src/lib/server/mcp-runtime';
import {SharedHub} from '../src/lib/tools/shared-hub';
import type {Complete} from '../src/lib/tools/structured-synthesis';
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});

vi.mock('../src/lib/server/gemini',()=>({askGemini:m.gemini,geminiConfig:()=>({configured:true})}));
it('shares Gemini with every council stage and reuses it after an interrupted run',async()=>{
 vi.stubEnv('SOVEREIGN_ORIGIN','');vi.stubEnv('WORKER_SECRET','');m.gemini.mockResolvedValue({text:'Gemini evidence'});
 const root=await mkdtemp(path.join(os.tmpdir(),'mcp-gemini-'));const hub=new SharedHub(root,async()=>({projectName:'Test',notes:''}));
 const complete=vi.fn<Complete>().mockRejectedValueOnce(Error('Interrupted')).mockImplementation(async(_p,_prompt,stage)=>({model:'test',tokens:{},response:stage==='final'?JSON.stringify({final:'Combined answer',not_checked:[]}):'SCOPE: Explain'}));
 let id='';try{await runSharedCouncil({task:'Explain'},hub,new AbortController().signal,[],complete,false,undefined,'economy',false,true);}catch(e){id=(e as Error).message.match(/Saved run: ([0-9a-f-]+)/)![1];}
 expect(id).toBeTruthy();const result=await runSharedCouncil({task:'Explain'},hub,new AbortController().signal,[],complete,false,id,'economy',false,true);
 expect(result.final).toBe('Combined answer');expect(m.gemini).toHaveBeenCalledTimes(1);
 for(const call of complete.mock.calls)expect(call[1]).toContain('Gemini evidence');
});
