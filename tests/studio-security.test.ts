import {beforeEach,it,expect,vi} from "vitest";
const mocks=vi.hoisted(()=>({db:vi.fn(),send:vi.fn()}));
vi.mock("next/server",()=>({after:vi.fn()}));
vi.mock("../src/lib/server/astra-store",()=>({db:mocks.db,storageReady:()=>true,readArtifact:vi.fn()}));
vi.mock("../src/lib/server/connector-hub",()=>({sendTelegram:mocks.send,saveConnector:vi.fn()}));
vi.mock("../src/lib/server/bot-worker",()=>({workerTick:vi.fn()}));
import {POST,GET} from "../src/app/api/studio/route";
import {createSession} from "../src/lib/server/auth";
const id="00000000-0000-4000-8000-000000000001",hash="a".repeat(64);
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("APP_PASSWORD","test-password-at-least-16");vi.stubEnv("APP_ORIGIN","https://workspace.example.com");vi.stubEnv("APP_LOCAL_ONLY","false");});
function req(body:unknown,origin="https://workspace.example.com") {return new Request("https://workspace.example.com/api/studio",{method:"POST",headers:{origin,"Content-Type":"application/json",cookie:`sovereign_session=${createSession()}`},body:JSON.stringify(body)});}
it("rejects unauthenticated reads before touching storage",async()=>{expect((await GET(new Request("https://workspace.example.com/api/studio"))).status).toBe(401);expect(mocks.db).not.toHaveBeenCalled();});
it("rejects cross-site changes before touching storage",async()=>{expect((await POST(req({action:"stop",id},"https://evil.example"))).status).toBe(403);expect(mocks.db).not.toHaveBeenCalled();});
it("does not send when an approval was already claimed",async()=>{
 mocks.db.mockResolvedValueOnce([{id,status:"pending",payload_sha256:hash,expires_at:new Date(Date.now()+60000).toISOString(),connector_id:id,payload:{text:"Exact text",destination:"123"}}]).mockResolvedValueOnce([{id,enabled:true,config:{accountId:"123"}}]).mockResolvedValueOnce([]);
 expect((await POST(req({action:"approve",id,hash}))).status).toBe(409);expect(mocks.send).not.toHaveBeenCalled();
});
it("requires the exact preview hash before sending",async()=>{
 mocks.db.mockResolvedValueOnce([{id,status:"pending",payload_sha256:"b".repeat(64),expires_at:new Date(Date.now()+60000).toISOString()}]);
 expect((await POST(req({action:"approve",id,hash}))).status).toBe(409);expect(mocks.send).not.toHaveBeenCalled();
});
