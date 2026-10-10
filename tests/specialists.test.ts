import {it,expect,vi,afterEach} from 'vitest';
import {AceStep,aceOrigin,acePayload} from '../src/lib/tools/ace-step';
import {musicInput} from '../src/lib/specialists';
const mocks=vi.hoisted(()=>({db:vi.fn(),ready:vi.fn(()=>true)}));
vi.mock('../src/lib/server/astra-store',()=>({db:mocks.db,storageReady:mocks.ready,storageSettings:()=>({origin:'https://storage.test',key:'test-only'})}));
import {queueMusic,listSpecialists} from '../src/lib/server/specialists';
import {POST} from '../src/app/api/specialists/route';
import {POST as upload,GET as download} from '../src/app/api/specialists/audio/route';
const id='12345678-1234-4234-9234-123456789abc';
const input=musicInput.parse({requestId:id,prompt:'Quiet instrumental piano'});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks();mocks.ready.mockReturnValue(true);});
function owner(){vi.stubEnv('APP_LOCAL_ONLY','true');vi.stubEnv('APP_PASSWORD','');vi.stubEnv('APP_ORIGIN','http://127.0.0.1:3100');}
function request(body:unknown,bearer?:string){return new Request('http://127.0.0.1:3100/api/specialists',{method:'POST',headers:{'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{Origin:'http://127.0.0.1:3100'})},body:JSON.stringify(body)});}
it('refuses cloud inference before any queue access',async()=>{await expect(queueMusic({...input,environment:'cloud'})).rejects.toMatchObject({code:'CLOUD_DISABLED'});expect(mocks.db).not.toHaveBeenCalled();});
it('rejects non-loopback model endpoints including credentials and redirects by origin',()=>{for(const url of ['https://example.com','http://localhost:8001','http://127.0.0.1.evil.test','http://user:pass@127.0.0.1','http://127.0.0.1/api'])expect(()=>aceOrigin(url)).toThrow();expect(aceOrigin('http://127.0.0.1:8001')).toBe('http://127.0.0.1:8001');});
it('does not replay a job when the client retries its request ID',async()=>{mocks.db.mockResolvedValue([{id,input}]);expect(await queueMusic(input)).toEqual({id});expect(mocks.db).toHaveBeenCalledOnce();});
it('rejects reuse of an ID with different settings',async()=>{mocks.db.mockResolvedValue([{id,input}]);await expect(queueMusic({...input,seconds:60})).rejects.toMatchObject({code:'REQUEST_CONFLICT'});});
it('reports migration/storage unavailability without inventing a ready worker',async()=>{mocks.db.mockRejectedValue(Error('offline'));expect(await listSpecialists()).toMatchObject({configured:false,runnerOnline:false,enabled:false});});
it('refuses queueing when worker is offline',async()=>{mocks.db.mockImplementation(async(p:string)=>p.includes('settings')?[{enabled:true}]:[]);await expect(queueMusic(input)).rejects.toMatchObject({code:'SPECIALIST_UNAVAILABLE'});expect(mocks.db.mock.calls.some(c=>c[0].includes('rpc/'))).toBe(false);});
it('uses the atomic budget-enforced enqueue when the worker is ready',async()=>{mocks.db.mockImplementation(async(p:string)=>p.includes('settings')?[{enabled:true}]:p.includes('runner')?[{ready:true,last_seen:new Date().toISOString()}]:p.includes('rpc/')?id:[]);expect(await queueMusic(input)).toEqual({id});expect(mocks.db.mock.calls.at(-1)?.[0]).toBe('rpc/astra_queue_music');});
it('keeps one sample, fixed seed and bounded work in the ACE request',()=>{expect(acePayload(input)).toMatchObject({batch_size:1,seed:42,use_random_seed:false,inference_steps:8,thinking:false,audio_format:'mp3'});expect(musicInput.safeParse({...input,seconds:121}).success).toBe(false);});
it('runs the actual asynchronous ACE protocol and downloads the returned MP3',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json({code:200,data:{task_id:'task'}})).mockResolvedValueOnce(Response.json({code:200,data:[{task_id:'task',status:0}]})).mockResolvedValueOnce(Response.json({code:200,data:[{task_id:'task',status:1,result:JSON.stringify([{file:'/v1/audio?path=track.mp3'}])}]})).mockResolvedValueOnce(new Response('ID3test-audio'));
 const ace=new AceStep('http://127.0.0.1:8001','',fetcher,async()=>{});
 expect((await ace.generate(input,new AbortController().signal)).toString()).toBe('ID3test-audio');expect(fetcher).toHaveBeenCalledTimes(4);expect(fetcher.mock.calls[0][0]).toContain('/release_task');expect(fetcher.mock.calls[1][1].body).toBe(JSON.stringify({task_id_list:['task']}));
});
it('does not forward credentials to a result URL outside ACE-Step',async()=>{const f=vi.fn().mockResolvedValueOnce(Response.json({code:200,data:{task_id:'t'}})).mockResolvedValueOnce(Response.json({code:200,data:[{task_id:'t',status:1,result:JSON.stringify([{file:'https://other.test/v1/audio?path=x'}])}]}));await expect(new AceStep('http://127.0.0.1:8001','secret',f).generate(input,new AbortController().signal)).rejects.toThrow('unauthorized');expect(f).toHaveBeenCalledTimes(2);});
it('never retries an uncertain generation submission',async()=>{const f=vi.fn().mockRejectedValue(Error('lost response'));await expect(new AceStep('http://127.0.0.1:8001','',f).generate(input,new AbortController().signal)).rejects.toThrow();expect(f).toHaveBeenCalledOnce();});
it('rejects cancelled signals before submitting to ACE',async()=>{const f=vi.fn();await expect(new AceStep('http://127.0.0.1:8001','',f).generate(input,AbortSignal.abort())).rejects.toThrow();expect(f).not.toHaveBeenCalled();});
it('rejects invalid worker credentials',async()=>{vi.stubEnv('WORKER_SECRET','test');expect((await POST(request({action:'claim',ready:true},'wrong'))).status).toBe(403);expect(mocks.db).not.toHaveBeenCalled();});
it('enforces same-origin on owner mutations',async()=>{owner();const r=request({action:'toggle',enabled:true});r.headers.set('Origin','https://other.test');expect((await POST(r)).status).toBe(403);expect(mocks.db).not.toHaveBeenCalled();});
it('rejects expired or cancelled worker leases',async()=>{vi.stubEnv('WORKER_SECRET','test');mocks.db.mockResolvedValue([]);expect((await POST(request({action:'heartbeat',id,claim:id},'test'))).status).toBe(409);expect(mocks.db.mock.calls[0][0]).toContain('status=eq.running&heartbeat_at=gt.');});
it('cancels only active jobs',async()=>{owner();mocks.db.mockResolvedValue([]);expect((await POST(request({action:'cancel',id}))).status).toBe(200);expect(mocks.db.mock.calls[0][0]).toContain('status=in.(queued,running)');});
it('does not expose a saved artifact without an authenticated session',async()=>{vi.stubEnv('APP_PASSWORD','sixteen-character-test-password');expect((await download(new Request('https://app.test/api/specialists/audio?id='+id))).status).toBe(401);expect(mocks.db).not.toHaveBeenCalled();});
it('uploads private MP3 data and marks completion only under the current claim',async()=>{
 vi.stubEnv('WORKER_SECRET','test');mocks.db.mockResolvedValueOnce([{id,input}]).mockResolvedValueOnce([{id}]);const f=vi.fn().mockResolvedValue(new Response('{}'));vi.stubGlobal('fetch',f);
 const r=await upload(new Request(`https://app.test/api/specialists/audio?id=${id}&claim=${id}`,{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'audio/mpeg'},body:'ID3test-audio'}));expect(r.status).toBe(200);expect(f.mock.calls[0][0]).toContain('/specialist-assets/');const update=JSON.parse(mocks.db.mock.calls[1][1].body);expect(update.status).toBe('completed');expect(update.artifact_sha256).toHaveLength(64);expect(update.provenance.measurements).toContain('not been measured');
});
it('rejects fake audio without writing to storage',async()=>{vi.stubEnv('WORKER_SECRET','test');mocks.db.mockResolvedValue([{id,input}]);const f=vi.fn();vi.stubGlobal('fetch',f);expect((await upload(new Request(`https://app.test/api/specialists/audio?id=${id}&claim=${id}`,{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'audio/mpeg'},body:'<html>not audio</html>'}))).status).toBe(400);expect(f).not.toHaveBeenCalled();});
