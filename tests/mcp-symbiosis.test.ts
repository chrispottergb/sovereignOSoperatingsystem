import {it,expect,vi,afterEach} from 'vitest';
import {mkdtemp} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const m=vi.hoisted(()=>({plan:vi.fn(),grok:vi.fn(),muse:vi.fn()}));
vi.mock('../src/lib/server/symbiosis',()=>({planSymbiosis:m.plan,runGrokbot:m.grok}));
vi.mock('../src/lib/server/muse',()=>({askMuse:m.muse,museConfig:()=>({configured:true})}));
import {runSharedCouncil} from '../src/lib/server/mcp-runtime';
import {SharedHub} from '../src/lib/tools/shared-hub';
import type {Complete} from '../src/lib/tools/structured-synthesis';
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
it('MCP automatically dispatches planned specialists and resumes without repeating successful ones',async()=>{
 vi.stubEnv('SOVEREIGN_ORIGIN','');vi.stubEnv('WORKER_SECRET','');const plan={objective:'Explain',assignments:{openai:'Architect',claude:'Validate',perplexity:'Sources',grok:'Challenge'},muse:{needed:true,prompt:'Muse subtask',reason:'Useful'},grokbot:{needed:true,prompt:'Bot subtask',reason:'Useful'},checks:['Check facts'],limitations:[]};m.plan.mockResolvedValue({plan,model:'planner',usage:{},completedAt:1});m.muse.mockResolvedValue({text:'Muse contribution'});m.grok.mockRejectedValueOnce(Error('Bot interrupted')).mockResolvedValue({text:'Bot contribution'});
 const root=await mkdtemp(path.join(os.tmpdir(),'mcp-auto-'));const hub=new SharedHub(root,async()=>({projectName:'Test',notes:''}));const complete=vi.fn<Complete>(async(_p,_prompt,stage)=>({model:'test',tokens:{},response:stage==='final'?JSON.stringify({final:'Combined answer',not_checked:[]}):'SCOPE: Explain'}));let id='';try{await runSharedCouncil({task:'Explain'},hub,new AbortController().signal,[],complete,false,undefined,'economy',true);}catch(e){id=(e as Error).message.match(/Saved run: ([0-9a-f-]+)/)![1];}expect(complete).not.toHaveBeenCalled();
 const result=await runSharedCouncil({task:'Explain'},hub,new AbortController().signal,[],complete,false,id,'economy',true);expect(result.final).toBe('Combined answer');expect(m.plan).toHaveBeenCalledTimes(1);expect(m.muse).toHaveBeenCalledTimes(1);expect(m.muse.mock.calls[0][0].prompt).toContain('Muse subtask');expect(m.grok).toHaveBeenCalledTimes(2);expect(complete).toHaveBeenCalledTimes(9);for(const call of complete.mock.calls){expect(call[1]).toContain('Muse contribution');expect(call[1]).toContain('Bot contribution');}expect(complete.mock.calls[0][1]).toContain('Architect');
});
