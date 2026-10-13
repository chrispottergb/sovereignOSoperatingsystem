import {it,expect,vi,afterEach} from 'vitest';
const mocks=vi.hoisted(()=>({db:vi.fn(),store:vi.fn(),create:vi.fn(),destroy:vi.fn(),exec:vi.fn(),write:vi.fn(),read:vi.fn(),mkdir:vi.fn()}));
vi.mock('../src/lib/server/astra-store',()=>({db:mocks.db,storeArtifact:mocks.store}));
vi.mock('railway',()=>({Sandbox:{create:mocks.create},SandboxNotFoundError:class extends Error{}}));
import {runCloudBuildTick,enqueueCloudBuild,cloudBuilderCommand} from '../src/lib/server/cloud-builds';
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});
it('does not touch the build queue without sandbox configuration',async()=>{vi.stubEnv('RAILWAY_BUILD_TOKEN','');expect(await runCloudBuildTick()).toBe(false);expect(mocks.db).not.toHaveBeenCalled();});
it('never imports local file paths into cloud jobs',async()=>{vi.stubEnv('RAILWAY_BUILD_TOKEN','test');await expect(enqueueCloudBuild({task:'build',builder:'codex',environment:'cloud',files:['private.txt'],minutes:2,claude_budget_usd:1},'id')).rejects.toMatchObject({code:'CLOUD_FILES_UNAVAILABLE'});expect(mocks.db).not.toHaveBeenCalled();});
it('quotes model configuration instead of interpolating shell syntax',()=>{expect(cloudBuilderCommand('codex',"x';touch /tmp/owned;'")).toContain("'x'\\'';touch /tmp/owned;'\\''' ");});
it('uses an isolated VM and temporary model token, saves actual checks, then destroys it',async()=>{
 vi.stubEnv('RAILWAY_BUILD_TOKEN','management-secret');vi.stubEnv('OPENAI_API_KEY','provider-secret');
 const job={id:'12345678-1234-4234-9234-123456789abc',input:{builder:'codex',task:'Build add()',minutes:2}};
 mocks.db.mockImplementation(async(p:string)=>p.includes('started_at=lt')?[]:p==='rpc/astra_claim_cloud_build'?[job]:p.endsWith('select=status')?[{status:'running'}]:[]);
 mocks.create.mockResolvedValue({id:'sandbox',files:{mkdir:mocks.mkdir,write:mocks.write,read:mocks.read},exec:mocks.exec,destroy:mocks.destroy});mocks.exec.mockResolvedValue({exitCode:0,timedOut:false,stdout:''});mocks.read.mockResolvedValueOnce('Implemented').mockResolvedValueOnce(JSON.stringify({files:[{path:'index.js',content:'ok'}],checks:[{status:'passed'}],omitted:[]}));
 expect(await runCloudBuildTick()).toBe(true);expect(mocks.create.mock.calls[0][0]).toMatchObject({networkIsolation:'ISOLATED',resources:{cpu:1,memoryGB:2},idleTimeoutMinutes:10});
 const env=mocks.exec.mock.calls[0][1].env;expect(env.OPENAI_API_KEY).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(env)).not.toContain('provider-secret');expect(JSON.stringify(env)).not.toContain('management-secret');expect(mocks.store).toHaveBeenCalledOnce();expect(mocks.destroy).toHaveBeenCalledOnce();expect(mocks.db.mock.calls.at(-1)?.[1].body).toContain('"status":"completed"');
});
it('destroys the VM even when execution fails and never reruns the model automatically',async()=>{
 vi.stubEnv('RAILWAY_BUILD_TOKEN','management-secret');mocks.db.mockImplementation(async(p:string)=>p.includes('started_at=lt')?[]:p==='rpc/astra_claim_cloud_build'?[{id:'job',input:{builder:'codex',task:'build',minutes:2}}]:p.endsWith('select=status')?[{status:'running'}]:[]);
 mocks.create.mockResolvedValue({id:'sandbox',files:{mkdir:mocks.mkdir,write:mocks.write},exec:mocks.exec,destroy:mocks.destroy});mocks.exec.mockRejectedValue(Error('disconnect'));
 expect(await runCloudBuildTick()).toBe(true);expect(mocks.exec).toHaveBeenCalledOnce();expect(mocks.destroy).toHaveBeenCalledOnce();expect(mocks.db.mock.calls.at(-1)?.[1].body).toContain('"status":"failed"');
});
