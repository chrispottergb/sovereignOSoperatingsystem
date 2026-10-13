import {after} from "next/server";
import {createHash,randomUUID} from "node:crypto";
import {z} from "zod";
import {auth,assertSameOrigin,readJsonLimited} from "@/lib/server/auth";
import {db,readArtifact,storageReady} from "@/lib/server/astra-store";
import {botConfig,botPlan,type BotRow,type ConnectorRow,type StepRow} from "@/lib/bots";
import {saveConnector,sendTelegram} from "@/lib/server/connector-hub";
import {workerTick} from "@/lib/server/bot-worker";
import {AppError,errorResponse} from "@/lib/server/errors";
import {limiter} from "@/lib/server/limits";
export const maxDuration=300;
const uuid=z.string().uuid();
const bodySchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("saveBot"),id:uuid.optional(),config:botConfig}),
 z.object({action:z.literal("toggleBot"),id:uuid,enabled:z.boolean()}),
 z.object({action:z.literal("launch"),id:uuid,requestId:uuid}),
 z.object({action:z.literal("stop"),id:uuid}),
 z.object({action:z.literal("retry"),id:uuid}),
 z.object({action:z.literal("saveConnector"),connector:z.unknown()}),
 z.object({action:z.literal("toggleConnector"),id:uuid,enabled:z.boolean()}),
 z.object({action:z.literal("draftApproval"),connectorId:uuid,text:z.string().trim().min(1).max(4096)}),
 z.object({action:z.literal("approve"),id:uuid,hash:z.string().regex(/^[a-f0-9]{64}$/)}),
 z.object({action:z.literal("reject"),id:uuid}),
]);
type Approval={id:string;connector_id:string;payload:{text:string;destination:string};payload_sha256:string;status:string;expires_at:string};
function kick(){after(async()=>{try{await workerTick();}catch{console.error("Worker kick failed; queue preserved.");}});}
export async function GET(request:Request){try{
 await auth.resolve(request);
 if(!storageReady())return Response.json({configured:false},{headers:{"Cache-Control":"no-store"}});
 const id=new URL(request.url).searchParams.get("run");
 if(id){if(!uuid.safeParse(id).success)throw new AppError("VALIDATION","Invalid run.",400);const steps=await db<StepRow[]>(`astra_steps?run_id=eq.${id}&order=ordinal`);const final=steps.find(s=>s.id==="final");return Response.json({steps,answer:final?.output_path?await readArtifact(final.output_path):null},{headers:{"Cache-Control":"no-store"}});}
 const [bots,runs,connectors,approvals,health]=await Promise.all([
 db("astra_bots?select=*&order=created_at.desc"),db("astra_runs?select=id,bot_id,status,prompt,created_at,calls_started,reported_tokens&order=created_at.desc&limit=50"),db("astra_connectors?select=id,provider,label,enabled,config,permissions&order=created_at.desc"),db("astra_approvals?select=id,connector_id,payload,payload_sha256,status,expires_at,created_at,result&order=created_at.desc&limit=50"),db("astra_worker_health?select=last_seen&id=eq."+(process.env.CLOUD_WORKER_SECRET?"cloud":"main"))]);
 return Response.json({configured:true,bots,runs,connectors,approvals,health},{headers:{"Cache-Control":"no-store"}});
}catch(e){return errorResponse(e);}}
export async function POST(request:Request){try{
 assertSameOrigin(request);const user=await auth.resolve(request);limiter.take(`studio:${user.id}`,30,60000);
 const parsed=bodySchema.safeParse(await readJsonLimited(request,40000));if(!parsed.success)throw new AppError("VALIDATION","Check the submitted fields and limits.",400);const v=parsed.data;
 if(v.action==="saveBot"){
  const config={...v.config,steps:botPlan()};
  if(v.id)await db(`astra_bots?id=eq.${v.id}`,{method:"PATCH",body:JSON.stringify({name:v.config.name,config})});
  else {const projects=await db<{id:string}[]>("astra_projects?name=eq.Grokbot%20Studio&limit=1");const project=projects[0]||(await db<{id:string}[]>("astra_projects",{method:"POST",body:JSON.stringify({name:"Grokbot Studio"})}))[0];await db("astra_bots",{method:"POST",body:JSON.stringify({name:v.config.name,project_id:project.id,config,enabled:false})});}
 }else if(v.action==="toggleBot"){
  const b=(await db<BotRow[]>(`astra_bots?id=eq.${v.id}`))[0];if(!b)throw new AppError("NOT_FOUND","Bot not found.",404);
  await db(`astra_bots?id=eq.${v.id}`,{method:"PATCH",body:JSON.stringify({enabled:v.enabled,next_run_at:v.enabled?new Date(Date.now()+b.config.intervalHours*3600000).toISOString():null})});
 }else if(v.action==="launch"){
  const id=await db("rpc/astra_launch_bot",{method:"POST",body:JSON.stringify({p_bot:v.id,p_request:v.requestId})});kick();return Response.json({id});
 }else if(v.action==="retry"){const ok=await db("rpc/astra_retry_run",{method:"POST",body:JSON.stringify({p_run:v.id})});if(!ok)throw new AppError("RETRY_UNAVAILABLE","This run cannot be retried or has reached its retry limit.",409);kick();
 }else if(v.action==="stop")await db(`astra_runs?id=eq.${v.id}&status=in.(queued,running,paused)`,{method:"PATCH",body:JSON.stringify({status:"cancelled"})});
 else if(v.action==="saveConnector")await saveConnector(v.connector);
 else if(v.action==="toggleConnector")await db(`astra_connectors?id=eq.${v.id}`,{method:"PATCH",body:JSON.stringify({enabled:v.enabled,models:["openai","claude","perplexity","grok"]})});
 else if(v.action==="draftApproval"){
  const c=(await db<ConnectorRow[]>(`astra_connectors?id=eq.${v.connectorId}`))[0];if(!c||!c.enabled||c.provider!=="telegram")throw new AppError("CONNECTOR_REQUIRED","Select an enabled Telegram connector.",400);
  const payload={text:v.text,destination:c.config.accountId!};const hash=createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  await db("astra_approvals",{method:"POST",body:JSON.stringify({id:randomUUID(),connector_id:c.id,payload,payload_sha256:hash,expires_at:new Date(Date.now()+86400000).toISOString()})});
 }else if(v.action==="reject")await db(`astra_approvals?id=eq.${v.id}&status=eq.pending`,{method:"PATCH",body:JSON.stringify({status:"rejected"})});
 else if(v.action==="approve"){
  const a=(await db<Approval[]>(`astra_approvals?id=eq.${v.id}`))[0];if(!a||a.status!=="pending"||a.payload_sha256!==v.hash||Date.parse(a.expires_at)<Date.now())throw new AppError("APPROVAL_EXPIRED","This approval is unavailable or expired.",409);
  const c=(await db<ConnectorRow[]>(`astra_connectors?id=eq.${a.connector_id}`))[0];if(!c?.enabled||c.config.accountId!==a.payload.destination)throw new AppError("CONNECTOR_CHANGED","The destination is unavailable. Create a fresh approval.",409);
  const claimed=await db<Approval[]>(`astra_approvals?id=eq.${v.id}&status=eq.pending`,{method:"PATCH",body:JSON.stringify({status:"executing",approved_at:new Date().toISOString()})});if(!claimed.length)throw new AppError("ALREADY_CLAIMED","This action was already handled.",409);
  try{const result=await sendTelegram(c,a.payload.text);await db(`astra_approvals?id=eq.${a.id}`,{method:"PATCH",body:JSON.stringify({status:"completed",result})});}
  catch{await db(`astra_approvals?id=eq.${a.id}`,{method:"PATCH",body:JSON.stringify({status:"uncertain",result:{message:"Delivery was not confirmed. Check Telegram before creating another send request."}})});throw new AppError("DELIVERY_UNCERTAIN","Delivery was not confirmed. Check Telegram before retrying.",502);}
 }
 return Response.json({ok:true});
}catch(e){return errorResponse(e);}}
