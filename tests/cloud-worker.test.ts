import {it,expect,vi,afterEach} from 'vitest';
const mocks=vi.hoisted(()=>({db:vi.fn(),work:vi.fn(),engine:vi.fn()}));
vi.mock('../src/lib/server/engine-store',()=>({engineTick:mocks.engine}));
vi.mock('../src/lib/server/astra-store',()=>({db:mocks.db}));
vi.mock('../src/lib/server/bot-worker',()=>({workRun:mocks.work}));
import {POST,GET} from '../src/app/api/cloud-worker/route';
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});
function worker(action:string,secret='scoped-test-key'){vi.stubEnv('CLOUD_WORKER_SECRET','scoped-test-key');return new Request('https://test/api/cloud-worker',{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify({action})});}
it('does not accept the general worker key or expose status without owner authentication',async()=>{
 vi.stubEnv('WORKER_SECRET','general-test-key');expect((await POST(worker('tick','general-test-key'))).status).toBe(403);
 vi.stubEnv('APP_PASSWORD','long-enough-test-password');expect((await GET(new Request('https://test/api/cloud-worker'))).status).toBe(401);expect(mocks.db).not.toHaveBeenCalled();
});
it('verifies a cloud heartbeat without claiming or billing a model stage',async()=>{
 mocks.db.mockResolvedValue([]);const r=await POST(worker('probe'));expect(r.status).toBe(200);expect(await r.json()).toEqual({ok:true,probe:true,modelCalls:0});expect(mocks.db).toHaveBeenCalledTimes(1);expect(mocks.work).not.toHaveBeenCalled();
});
it('advances a shared engine stage without dispatching a second legacy job',async()=>{mocks.db.mockResolvedValue([]);mocks.engine.mockResolvedValue(true);const r=await POST(worker('tick'));expect(await r.json()).toMatchObject({kind:'unified_engine'});expect(mocks.engine).toHaveBeenCalledOnce();expect(mocks.work).not.toHaveBeenCalled();});
it('obeys the database reservation decision for paused, duplicate or exhausted dispatches',async()=>{
 mocks.db.mockResolvedValue([]);expect((await POST(worker('tick'))).status).toBe(200);expect(mocks.db).toHaveBeenCalledTimes(2);expect(mocks.work).not.toHaveBeenCalled();
});
it('runs exactly the reserved saved job and records completion',async()=>{
 mocks.db.mockResolvedValueOnce([]).mockResolvedValueOnce([{dispatch_id:'dispatch',run_id:'run'}]).mockResolvedValueOnce([{id:'run',context:{}}]).mockResolvedValueOnce([]);
 const r=await POST(worker('tick'));expect(r.status).toBe(200);expect(mocks.work).toHaveBeenCalledExactlyOnceWith({id:'run',context:{}});expect(mocks.db.mock.calls[3][0]).toBe('astra_cloud_dispatches?id=eq.dispatch');expect(JSON.parse(mocks.db.mock.calls[3][1].body).status).toBe('finished');
});
it('records an interrupted stage as uncertain without retrying it',async()=>{
 mocks.db.mockResolvedValueOnce([]).mockResolvedValueOnce([{dispatch_id:'dispatch',run_id:'run'}]).mockResolvedValueOnce([{id:'run'}]).mockResolvedValueOnce([]);mocks.work.mockRejectedValue(Error('private diagnostic'));
 const r=await POST(worker('tick'));expect(r.status).toBe(502);expect(mocks.work).toHaveBeenCalledTimes(1);expect(JSON.parse(mocks.db.mock.calls[3][1].body).status).toBe('uncertain');expect(await r.text()).not.toContain('private diagnostic');
});
it('worker credentials cannot enable settings or submit arbitrary actions',async()=>{
 expect((await POST(worker('enable'))).status).toBeGreaterThanOrEqual(400);expect(mocks.db).not.toHaveBeenCalled();
});
it('owner pause requires same-origin authentication and changes only dispatcher settings',async()=>{
 vi.stubEnv('APP_LOCAL_ONLY','true');vi.stubEnv('APP_PASSWORD','');vi.stubEnv('APP_ORIGIN','http://127.0.0.1:3100');mocks.db.mockResolvedValueOnce([{enabled_at:'2026-10-13T00:00:00.000Z'}]).mockResolvedValueOnce([]);
 const r=await POST(new Request('http://127.0.0.1:3100/api/cloud-worker',{method:'POST',headers:{Origin:'http://127.0.0.1:3100','Content-Type':'application/json'},body:'{"enabled":false}'}));expect(r.status).toBe(200);expect(JSON.parse(mocks.db.mock.calls[1][1].body)).toEqual({enabled:false,enabled_at:'2026-10-13T00:00:00.000Z'});
});
