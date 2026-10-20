import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({resolve:vi.fn(),origin:vi.fn(),complete:vi.fn(),release:vi.fn()}));
vi.mock('../src/lib/server/auth',()=>({auth:{resolve:m.resolve},assertSameOrigin:m.origin,readJsonLimited:(r:Request)=>r.json()}));
vi.mock('../src/lib/server/model-completion',()=>({completion:()=>m.complete}));
vi.mock('../src/lib/server/limits',()=>({limiter:{take:vi.fn()},acquireStream:()=>m.release}));
import {POST} from '../src/app/api/huggingface/route';
import {hfModelIds} from '../src/lib/huggingface';
const req=(extra={})=>new Request('https://test/api/huggingface',{method:'POST',body:JSON.stringify({phase:'report',model:hfModelIds[0],prompt:'Review this',...extra})});
beforeEach(()=>{vi.resetAllMocks();m.resolve.mockResolvedValue({id:'owner'});vi.stubEnv('HF_TOKEN','fixture');vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>Response.json({model:'reported',choices:[{finish_reason:'stop',message:{content:'Complete report'}}],usage:{prompt_tokens:10,completion_tokens:20}})));});
it('routes all five allowlisted models through one secret with bounded output',async()=>{for(const model of hfModelIds){expect((await POST(req({model}))).status).toBe(200);}expect(fetch).toHaveBeenCalledTimes(5);const [url,init]=vi.mocked(fetch).mock.calls[0];expect(url).toBe('https://router.huggingface.co/v1/chat/completions');expect(JSON.parse(init!.body as string).max_tokens).toBe(4096);expect(JSON.parse(init!.body as string).model).toBe(hfModelIds[0]+':cheapest');expect(m.complete).not.toHaveBeenCalled();});
it('missing token and invalid model cannot cause network calls',async()=>{vi.stubEnv('HF_TOKEN','');expect((await POST(req())).status).toBe(503);expect((await POST(req({model:'unknown/model'}))).status).toBe(400);expect(fetch).not.toHaveBeenCalled();});
it('rejects truncated reports and never automatically retries',async()=>{vi.mocked(fetch).mockResolvedValue(Response.json({choices:[{finish_reason:'length',message:{content:'Partial'}}]}));expect((await POST(req())).status).toBe(502);expect(fetch).toHaveBeenCalledOnce();expect(m.complete).not.toHaveBeenCalled();});
it('Boss reviews the saved report without another HF call',async()=>{m.complete.mockResolvedValue({response:'Final outcome',tokens:{},model:'boss'});const r=await POST(req({phase:'boss',report:{model:hfModelIds[0],reportedModel:'test',text:'Report',completedAt:1}}));expect(r.status).toBe(200);expect(fetch).not.toHaveBeenCalled();expect(m.complete).toHaveBeenCalledOnce();});
it('rejects unauthenticated requests before inference',async()=>{m.resolve.mockRejectedValue(Error('auth'));expect((await POST(req())).ok).toBe(false);expect(fetch).not.toHaveBeenCalled();});

