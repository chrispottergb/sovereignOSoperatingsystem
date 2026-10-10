import "server-only";
import {createHash} from "node:crypto";
import {db,readArtifact,storeArtifact} from "./astra-store";
import {adapters,type TaskInput} from "./providers";
import {connectorSnapshot} from "./connector-hub";
import {publicError} from "./errors";
import {orchestraInput} from "../orchestra/plan";
import type {Answer} from "../contracts";
import {botConfig,type RunRow,type StepRow} from "../bots";
export async function workRun(run:RunRow & {context:unknown}) {
 const claims=await db<StepRow[]>("rpc/astra_claim_step",{method:"POST",body:JSON.stringify({p_run_id:run.id})});
 const step=claims[0];if(!step)return;
 const answer:Answer={provider:step.spec.provider,status:"streaming",text:"",citations:[]};
 let path:string|null=null,error:string|null=null;
 try {
  const orchestra=orchestraInput.safeParse(run.context);
  const config=orchestra.success?{...orchestra.data,voice:"Clear, evidence-based, and directly useful"}:botConfig.parse(run.context);
  let snapshot=run.connector_snapshot;
  if(step.id==="evidence") {snapshot=await connectorSnapshot(config.connectorIds);await db(`astra_runs?id=eq.${run.id}`,{method:"PATCH",body:JSON.stringify({connector_snapshot:snapshot})});}
  const steps=await db<StepRow[]>(`astra_steps?run_id=eq.${run.id}&order=ordinal`);
  const artifacts=[];
  for(const id of step.spec.depends){const parent=steps.find(s=>s.id===id);artifacts.push({id,status:parent?.status||"missing",result:parent?.output_path?await readArtifact(parent.output_path):null});}
  const input:TaskInput={provider:step.spec.provider,kind:"response",mode:"live",prompt:run.prompt,history:[],context:{projectName:"Grokbot Studio",notes:`Voice: ${config.voice}`},spendingMode:"economy",reviewPhase:step.spec.search?"research":"resolve",task:{instruction:step.spec.instruction,artifacts:{accountData:snapshot,priorSteps:artifacts},astra:step.id==="resolution",deepResearch:step.id==="evidence"}};
  for await(const event of adapters[step.spec.provider].stream(input,AbortSignal.timeout(150000))){
   if(event.type==="start")answer.model=event.model;
   else if(event.type==="delta")answer.text+=event.text;
   else if(event.type==="usage")answer.usage=event.usage;
   else if(event.type==="citations")answer.citations=[...new Map([...answer.citations,...event.citations].map(c=>[c.url,c])).values()];
   else if(event.type==="done"){answer.finishReason=event.finishReason;answer.status=["stop","end_turn","stop_sequence"].includes(event.finishReason)?"complete":"error";if(answer.status==="error")error="OUTPUT_INCOMPLETE";}
   else if(event.type==="error"){answer.status="error";error=event.code;}
  }
  if(answer.status!=="complete")error||="INCOMPLETE";
 } catch(e){answer.status="error";error=publicError(e).code;answer.error=publicError(e).message;}
 // Preserve complete and partial outputs before marking a stage terminal. If storage fails,
 // the lease becomes uncertain and is never automatically billed again.
 path=`${run.project_id}/${run.id}/${step.id}-${step.attempt}.json`;
 const serialized=JSON.stringify(answer);await storeArtifact(path,serialized);
 await db("astra_assets",{method:"POST",body:JSON.stringify({project_id:run.project_id,run_id:run.id,path,title:step.spec.title,media_type:"application/json",sha256:createHash("sha256").update(serialized).digest("hex")})});
 await db("rpc/astra_finish_step",{method:"POST",body:JSON.stringify({p_run_id:run.id,p_step_id:step.id,p_claim:step.claim_token,p_status:error?"failed":"completed",p_path:path,p_usage:answer.usage||{},p_error:error})});
 if(step.id==="final"&&error)await db(`astra_runs?id=eq.${run.id}&status=neq.cancelled`,{method:"PATCH",body:JSON.stringify({status:"failed"})});
}
export async function workerTick(){
 await db("astra_worker_health?on_conflict=id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates"},body:JSON.stringify({id:"main",last_seen:new Date().toISOString()})});
 await db("rpc/astra_schedule_bots",{method:"POST",body:"{}"});
 const runs=await db<(RunRow&{context:unknown})[]>("astra_runs?status=in.(queued,running)&order=created_at&limit=2");
 await Promise.allSettled(runs.map(workRun));
}

