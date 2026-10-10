import {it,expect,vi,afterEach} from 'vitest';
const mocks=vi.hoisted(()=>({db:vi.fn(),snapshot:vi.fn(),ready:vi.fn(()=>true)}));
vi.mock('../src/lib/server/astra-store',()=>({db:mocks.db,storageReady:mocks.ready}));
vi.mock('../src/lib/server/connector-hub',()=>({connectorSnapshot:mocks.snapshot}));
import {GET} from '../src/app/api/council-context/route';
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
function local(){vi.stubEnv('APP_PASSWORD','');vi.stubEnv('APP_LOCAL_ONLY','true');return new Request('http://127.0.0.1:3100/api/council-context');}
it('freezes only enabled readable connector snapshots without requesting credential columns',async()=>{mocks.db.mockResolvedValue([{id:'c'}]);mocks.snapshot.mockResolvedValue({c:{data:'Reference'}});const r=await GET(local());expect(r.status).toBe(200);expect(mocks.db.mock.calls[0][0]).toContain('enabled=eq.true&permissions=cs.%7Bread%7D&select=id');expect(mocks.snapshot).toHaveBeenCalledOnce();expect(await r.json()).toEqual({evidence:'{"c":{"data":"Reference"}}'});});
it('fails clearly instead of silently truncating shared evidence',async()=>{mocks.db.mockResolvedValue([{id:'c'}]);mocks.snapshot.mockResolvedValue({text:'a'.repeat(30000)});expect((await GET(local())).status).toBe(413);});
