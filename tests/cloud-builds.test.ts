import {it,expect,vi,afterEach} from 'vitest';
const mocks=vi.hoisted(()=>({db:vi.fn(),store:vi.fn(),read:vi.fn(),readArtifact:vi.fn(),create:vi.fn(),destroy:vi.fn(),exec:vi.fn(),write:vi.fn(),mkdir:vi.fn(),complete:vi.fn()}));
vi.mock('../src/lib/server/astra-store',()=>({db:mocks.db,storeArtifact:mocks.store,readArtifact:mocks.readArtifact}));
vi.mock('../src/lib/server/model-completion',()=>({completion:()=>mocks.complete}));
vi.mock('railway',()=>({Sandbox:{create:mocks.create},SandboxNotFoundError:class extends Error{}}));
import {runCloudBuildTick,finalizeCloudBuild,enqueueCloudBuild,cloudBuilderCommand} from '../src/lib/server/cloud-builds';
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});
it('does not touch the build queue without sandbox configuration',async()=>{vi.stubEnv('RAILWAY_BUILD_TOKEN','');expect(await runCloudBuildTick()).toBe(false);expect(mocks.db).not.toHaveBeenCalled();});
it('never imports local file paths into cloud jobs',async()=>{vi.stubEnv('RAILWAY_BUILD_TOKEN','test');await expect(enqueueCloudBuild({task:'build',builder:'codex',environment:'cloud',files:['private.txt'],minutes:2,claude_budget_usd:1},'id')).rejects.toMatchObject({code:'CLOUD_FILES_UNAVAILABLE'});expect(mocks.db).not.toHaveBeenCalled();});
it('quotes model configuration instead of interpolating shell syntax',()=>{expect(cloudBuilderCommand('codex',"x';touch /tmp/owned;'")).toContain("'x'\\'';touch /tmp/owned;'\\''' ");});
it('uses an isolated VM and temporary model token, saves actual checks, then checkpoints for review',async()=>{
 vi.stubEnv('RAILWAY_BUILD_TOKEN','management-secret');vi.stubEnv('OPENAI_API_KEY','provider-secret');
 const job={id:'12345678-1234-4234-9234-123456789abc',input:{builder:'codex',task:'Build add()',minutes:2}};
 mocks.db.mockImplementation(async(p:string)=>p.includes('started_at=lt')?[]:p==='rpc/astra_claim_cloud_build'?[job]:p.endsWith('select=status')?[{status:'running'}]:[]);
 mocks.create.mockResolvedValue({id:'sandbox',files:{mkdir:mocks.mkdir,write:mocks.write,read:mocks.read},exec:mocks.exec,destroy:mocks.destroy});mocks.exec.mockResolvedValue({exitCode:0,timedOut:false,stdout:''});mocks.read.mockResolvedValueOnce('Implemented').mockResolvedValueOnce(JSON.stringify({files:[{path:'index.js',content:'ok'}],checks:[{status:'passed'}],omitted:[]}));
 expect(await runCloudBuildTick()).toBe(true);expect(mocks.create.mock.calls[0][0]).toMatchObject({networkIsolation:'ISOLATED',resources:{cpu:1,memoryGB:2},idleTimeoutMinutes:10});
 const env=mocks.exec.mock.calls[0][1].env;expect(env.OPENAI_API_KEY).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(env)).not.toContain('provider-secret');expect(JSON.stringify(env)).not.toContain('management-secret');
 expect(mocks.store).toHaveBeenCalledOnce();expect(mocks.destroy).toHaveBeenCalledOnce();expect(mocks.complete).not.toHaveBeenCalled();
 const last=mocks.db.mock.calls.at(-1)?.[1].body;expect(last).toContain('"status":"reviewing"');expect(last).toContain('"outcome":"completed"');
});
it('destroys the VM even when execution fails and never reruns the model automatically',async()=>{
 vi.stubEnv('RAILWAY_BUILD_TOKEN','management-secret');mocks.db.mockImplementation(async(p:string)=>p.includes('started_at=lt')?[]:p==='rpc/astra_claim_cloud_build'?[{id:'job',input:{builder:'codex',task:'build',minutes:2}}]:p.endsWith('select=status')?[{status:'running'}]:[]);
 mocks.create.mockResolvedValue({id:'sandbox',files:{mkdir:mocks.mkdir,write:mocks.write},exec:mocks.exec,destroy:mocks.destroy});mocks.exec.mockRejectedValue(Error('disconnect'));
 expect(await runCloudBuildTick()).toBe(true);expect(mocks.exec).toHaveBeenCalledOnce();expect(mocks.destroy).toHaveBeenCalledOnce();expect(mocks.db.mock.calls.at(-1)?.[1].body).toContain('"status":"failed"');
});
it('runs one bounded correction pass when a check fails, then checkpoints for review',async()=>{
 vi.stubEnv('RAILWAY_BUILD_TOKEN','management-secret');vi.stubEnv('OPENAI_API_KEY','provider-secret');
 const job={id:'22345678-1234-4234-9234-123456789abc',input:{builder:'codex',task:'Build add()',minutes:2}};
 mocks.db.mockImplementation(async(p:string)=>p.includes('started_at=lt')?[]:p==='rpc/astra_claim_cloud_build'?[job]:p.endsWith('select=status')?[{status:'running'}]:[]);
 mocks.create.mockResolvedValue({id:'sandbox',files:{mkdir:mocks.mkdir,write:mocks.write,read:mocks.read},exec:mocks.exec,destroy:mocks.destroy});mocks.exec.mockResolvedValue({exitCode:0,timedOut:false,stdout:''});
 // build report, first artifacts (a failed check), corrected artifacts (passing)
 mocks.read.mockResolvedValueOnce('Implemented')
  .mockResolvedValueOnce(JSON.stringify({files:[{path:'index.js',content:'ok'}],checks:[{name:'test',status:'failed',output:'1 failing'}],omitted:[]}))
  .mockResolvedValueOnce(JSON.stringify({files:[{path:'index.js',content:'fixed'}],checks:[{name:'test',status:'passed'}],omitted:[]}));
 expect(await runCloudBuildTick()).toBe(true);
 // initial code + verify, then correction code + re-verify = 4 sandbox exec calls
 expect(mocks.exec).toHaveBeenCalledTimes(4);
 const last=mocks.db.mock.calls.at(-1)?.[1].body;expect(last).toContain('"status":"reviewing"');expect(last).toContain('"corrected":true');expect(last).toContain('"outcome":"completed"');
});
it('reviews with the opposite provider, checkpoints the review, then writes one final answer',async()=>{
 vi.stubEnv('RAILWAY_BUILD_TOKEN','management-secret');vi.stubEnv('OPENAI_API_KEY','k');vi.stubEnv('ANTHROPIC_API_KEY','k');
 const build={builder:'codex',outcome:'completed',corrected:false,report:'did it',checks:[{name:'test',status:'passed'}],fileCount:1};
 const reviewJob={id:'32345678-1234-4234-9234-123456789abc',input:{task:'Build add()',builder:'codex'},result:{build},artifact_path:'cloud-builds/x/y.json'};
 // stale [] , review claim returns the job; subsequent db calls are PATCHes
 mocks.db.mockImplementation(async(p:string)=>p.includes('started_at=lt')?[]:p==='rpc/astra_claim_cloud_build_review'?[reviewJob]:[]);
 mocks.readArtifact.mockResolvedValue({files:[{path:'index.js',content:'ok'}],omitted:[]});
 mocks.complete.mockResolvedValue({response:'REVIEW/FINAL TEXT',model:'m',tokens:{}});
 expect(await runCloudBuildTick()).toBe(true);
 // codex builder => reviewer must be claude; synthesizer defaults to claude
 expect(mocks.complete.mock.calls[0]).toEqual(['claude',expect.any(String),'review']);
 expect(mocks.complete.mock.calls[1][2]).toBe('final');
 expect(mocks.create).not.toHaveBeenCalled();
 const bodies=mocks.db.mock.calls.map(c=>c[1]?.body||'');
 expect(bodies.some(b=>b.includes('"review":"REVIEW/FINAL TEXT"')&&!b.includes('"final"'))).toBe(true); // review checkpoint before final
 const last=bodies.at(-1)!;expect(last).toContain('"status":"completed"');expect(last).toContain('"final":"REVIEW/FINAL TEXT"');
});
it('leaves a failed build visible: terminal status failed, final answer still written',async()=>{
 vi.stubEnv('RAILWAY_BUILD_TOKEN','management-secret');vi.stubEnv('ANTHROPIC_API_KEY','k');vi.stubEnv('OPENAI_API_KEY','k');
 const build={builder:'claude-code',outcome:'failed',corrected:false,report:'blocked',checks:[{name:'test',status:'failed'}],fileCount:1};
 const reviewJob={id:'42345678-1234-4234-9234-123456789abc',input:{task:'x',builder:'claude-code'},result:{build},artifact_path:null};
 mocks.db.mockImplementation(async(p:string)=>p.includes('started_at=lt')?[]:p==='rpc/astra_claim_cloud_build_review'?[reviewJob]:[]);
 mocks.complete.mockResolvedValue({response:'honest failure writeup',model:'m',tokens:{}});
 expect(await runCloudBuildTick()).toBe(true);
 expect(mocks.complete.mock.calls[0][0]).toBe('openai'); // claude-code builder => openai reviews
 expect(mocks.readArtifact).not.toHaveBeenCalled(); // null artifact_path: review proceeds from checks/report
 const last=mocks.db.mock.calls.at(-1)?.[1].body;expect(last).toContain('"status":"failed"');expect(last).toContain('"final":"honest failure writeup"');
});
it('stops as uncertain without re-billing when final synthesis fails',async()=>{
 vi.stubEnv('RAILWAY_BUILD_TOKEN','management-secret');vi.stubEnv('ANTHROPIC_API_KEY','k');vi.stubEnv('OPENAI_API_KEY','k');
 const build={builder:'codex',outcome:'completed',corrected:false,report:'ok',checks:[{status:'passed'}],fileCount:1};
 mocks.readArtifact.mockResolvedValue({files:[],omitted:[]});
 mocks.complete.mockResolvedValueOnce({response:'the review',model:'m',tokens:{}}).mockRejectedValueOnce(Error('provider down'));
 await finalizeCloudBuild({id:'52345678-1234-4234-9234-123456789abc',input:{task:'x',builder:'codex'} as never,result:{build} as never,artifact_path:'cloud-builds/x/y.json'});
 const last=mocks.db.mock.calls.at(-1)?.[1].body;expect(last).toContain('"status":"uncertain"');expect(last).toContain('"review":"the review"'); // completed review preserved for an explicit retry
});
