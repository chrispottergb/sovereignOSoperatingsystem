import {describe,it,expect,vi} from 'vitest';
import {mkdtemp,readFile,readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {CouncilCheckpoint} from '../src/lib/tools/council-checkpoint';
import {createOrchestrator,type Complete} from '../src/lib/tools/structured-synthesis';
const result=(stage:string)=>({model:'fixture',tokens:{inputTokens:10,outputTokens:5},response:stage==='final'?JSON.stringify({final:'Supported result',not_checked:[]}):'SCOPE: Explain'});
describe('durable council recovery',()=>{
 it('waits for in-flight reviews and resumes only missing review and final across instances',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'council-'));const first=new CouncilCheckpoint(root);await first.acquire();await first.bind({task:'Explain'});
  let lateFinished=false;const calls:string[]=[];
  const complete:Complete=async(p,_prompt,stage)=>{calls.push(p+':'+stage);if(stage==='review'&&p==='claude')throw Error('interrupted');if(stage==='review'&&p==='grok'){await new Promise(r=>setTimeout(r,20));lateFinished=true;}return result(stage);};
  await expect(createOrchestrator(first.wrap(complete))({task:'Explain'})).rejects.toThrow('interrupted');expect(lateFinished).toBe(true);expect(calls).toHaveLength(8);await first.release();
  const resumed=new CouncilCheckpoint(root,first.id);await resumed.acquire(true);await resumed.bind({task:'Explain'});const retry=vi.fn<Complete>(async(_p,_prompt,stage)=>result(stage));
  const output=await createOrchestrator(resumed.wrap(retry))({task:'Explain'});expect(output.final).toBe('Supported result');expect(retry.mock.calls.map(c=>c[0]+':'+c[2])).toEqual(['claude:review','claude:final']);await resumed.release();
  const done=new CouncilCheckpoint(root,first.id);await done.acquire(true);const noCalls=vi.fn<Complete>();expect((await createOrchestrator(done.wrap(noCalls))({task:'Explain'})).final).toBe('Supported result');expect(noCalls).not.toHaveBeenCalled();await done.release();
 });
 it('preserves invalid final output and retries only final',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'council-'));const cp=new CouncilCheckpoint(root);await cp.acquire();await cp.bind({task:'Explain'});
  await expect(createOrchestrator(cp.wrap(async(_p,_q,s)=>({...result(s),response:s==='final'?'bad-json':result(s).response})))({task:'Explain'})).rejects.toThrow('invalid JSON');
  const files=await readdir(cp.directory);const entries=await Promise.all(files.filter(f=>f.endsWith('.json')).map(f=>readFile(path.join(cp.directory,f),'utf8')));expect(entries.some(e=>e.includes('bad-json'))).toBe(true);
  const retry=vi.fn<Complete>(async(_p,_q,s)=>result(s));await createOrchestrator(cp.wrap(retry))({task:'Explain'});expect(retry).toHaveBeenCalledTimes(1);expect(retry.mock.calls[0][2]).toBe('final');await cp.release();
 });
 it('rejects altered requests and concurrent resumes; freezes saved shared evidence',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'council-'));const cp=new CouncilCheckpoint(root);await cp.acquire();await cp.bind({task:'original'});
  await expect(cp.bind({task:'changed'})).rejects.toThrow('original request');await expect(new CouncilCheckpoint(root,cp.id).acquire(true)).rejects.toThrow('already active');
  expect(await cp.snapshot('tool:source',async()=>({text:'original'}))).toEqual({text:'original'});expect(await cp.snapshot('tool:source',async()=>({text:'changed'}))).toEqual({text:'original'});await cp.release();
 });
});
