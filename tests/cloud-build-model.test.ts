import {it,expect,vi,afterEach} from 'vitest';
const mocks=vi.hoisted(()=>({db:vi.fn()}));vi.mock('../src/lib/server/astra-store',()=>({db:mocks.db}));
import {POST} from '../src/app/api/cloud-build/model/[id]/[...path]/route';
const id='12345678-1234-4234-9234-123456789abc',token='a'.repeat(64);
function request(model='gpt-6.1-sol'){return new Request('https://test/api/cloud-build/model/'+id+'/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({model,input:'build',max_output_tokens:20000,store:true})});}
const params=Promise.resolve({id,path:['v1','responses']});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.resetAllMocks();});
it('denies expired job access before sending a provider request',async()=>{mocks.db.mockResolvedValue([]);const fetch=vi.fn();vi.stubGlobal('fetch',fetch);expect((await POST(request(),{params})).status).toBe(403);expect(fetch).not.toHaveBeenCalled();});
it('restricts a job to its selected provider and configured model',async()=>{mocks.db.mockResolvedValue([{input:{builder:'claude-code'}}]);expect((await POST(request(),{params})).status).toBe(403);expect(mocks.db).toHaveBeenCalledTimes(1);});
it('honors the atomic call limit and does not retry a denied request',async()=>{mocks.db.mockResolvedValueOnce([{input:{builder:'codex'}}]).mockResolvedValueOnce([]);const fetch=vi.fn();vi.stubGlobal('fetch',fetch);expect((await POST(request(),{params})).status).toBe(429);expect(fetch).not.toHaveBeenCalled();});
it('keeps the real API key upstream, clamps output, and disables storage',async()=>{
 vi.stubEnv('OPENAI_API_KEY','private-provider-key');mocks.db.mockResolvedValueOnce([{input:{builder:'codex'}}]).mockResolvedValueOnce([{}]);const fetch=vi.fn().mockResolvedValue(new Response('result'));vi.stubGlobal('fetch',fetch);
 const r=await POST(request(),{params});expect(await r.text()).toBe('result');expect(fetch).toHaveBeenCalledTimes(1);const args=fetch.mock.calls[0];expect(args[0]).toBe('https://api.openai.com/v1/responses');expect(args[1].headers.Authorization).toBe('Bearer private-provider-key');expect(JSON.parse(args[1].body)).toMatchObject({max_output_tokens:4096,store:false});expect(r.headers.get('authorization')).toBeNull();
});
