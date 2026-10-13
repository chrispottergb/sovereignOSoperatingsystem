import {cloudBuildConfigured} from '@/lib/server/cloud-builds';
import {after} from "next/server";
import {auth,assertSameOrigin,readJsonLimited} from "@/lib/server/auth";
import {db,readArtifact} from "@/lib/server/astra-store";
import {AppError,errorResponse} from "@/lib/server/errors";
import {workerTick} from "@/lib/server/bot-worker";
import {hierarchy,orchestraInput,orchestraPlan} from "@/lib/orchestra/plan";
import {z} from "zod";
export const maxDuration=300;
export async function GET(request:Request){try{
 await auth.resolve(request);const id=new URL(request.url).searchParams.get("run");
 if(id){if(!z.string().uuid().safeParse(id).success)throw new AppError("VALIDATION","Invalid run.",400);
 const [run]=await db<Record<string,unknown>[]>(`astra_runs?id=eq.${id}`);const steps=await db<{id:string;spec:unknown;status:string;output_path:string|null;error_code:string|null}[]>(`astra_steps?run_id=eq.${id}&order=ordinal`);
 const final=steps.find(s=>s.id==="final"),build=steps.find(s=>s.id==="build");
 return Response.json({run,steps,answer:final?.output_path?await readArtifact(final.output_path):null,build:build?.output_path?await readArtifact(build.output_path):null},{headers:{"Cache-Control":"no-store"}});}
 const runs=await db("astra_runs?orchestration_version=eq.1&select=id,prompt,status,created_at,lane,calls_started,reported_tokens&order=created_at.desc&limit=50");
 const connectors=await db("astra_connectors?enabled=eq.true&select=id,label");
 return Response.json({hierarchy,runs,connectors,cloudBuildsReady:cloudBuildConfigured()},{headers:{"Cache-Control":"no-store"}});
}catch(e){return errorResponse(e);}}
export async function POST(request:Request){try{
 assertSameOrigin(request);await auth.resolve(request);
 const body=await readJsonLimited(request,30000);const wrapper=z.object({action:z.enum(["preview","launch","stop"]),input:z.unknown().optional(),id:z.string().uuid().optional()}).parse(body);
 if(wrapper.action==="stop"){if(!wrapper.id)throw new AppError("VALIDATION","Missing run.",400);await db(`astra_runs?id=eq.${wrapper.id}&status=in.(queued,running,paused)`,{method:"PATCH",body:JSON.stringify({status:"cancelled"})});return Response.json({ok:true});}
 const parsed=orchestraInput.safeParse(wrapper.input);if(!parsed.success)throw new AppError("VALIDATION",parsed.error.issues[0]?.message||"Check the project brief.",400);
 const input=parsed.data,plan=orchestraPlan(input);
 if(wrapper.action==="preview")return Response.json({...plan,hierarchy,modelCalls:plan.steps.filter(s=>!s.executor).length,buildCalls:plan.steps.filter(s=>s.executor).length});
 if(plan.intent==="build")throw new AppError("RUNNER_SETUP_REQUIRED",input.environment==="cloud"?"Cloud execution is disabled by your choice.":"Use the local build queue to run this with your selected coding engine.",409);
 const id=await db("rpc/astra_launch_orchestra",{method:"POST",body:JSON.stringify({p_request:input.requestId,p_prompt:input.prompt,p_context:input,p_steps:plan.steps,p_intent:plan.intent})});
 after(async()=>{try{await workerTick();}catch{console.error("Orchestra kick failed; saved run remains queued.");}});
 return Response.json({id});
}catch(e){return errorResponse(e);}}
